# Aether Handoff — Titan Engine 72B Compression Live Run

**Date:** 2026-07-01
**From:** Atlas + Lazarus (hive-mind, bridge port 9099)
**For:** Aether
**Status:** IN FLIGHT

---

## What is running

Full Qwen 2.5 72B Instruct GGUF (72.70B params, 562 weight tensors) is being compressed through the Titan Engine pipeline into Crystal modules. First real-model end-to-end run.

- **GGUF:** `/tmp/qwen2.5-72b-q4km.gguf`
- **Output:** `/tmp/titan-crystals-72b/`
- **Compress PID:** 208245 (tsx worker)
- **Script:** `scripts/titan/compress-70b.ts`

## Pipeline

`GGUF tensor → dequant to F32 → LowRankTensorDecomposer (randomized SVD) → TitanStreamQuantizer (ternary base-3 packed) → CrashSafeVault triples (.A.f32 + .B.packed + .meta.json) → TitanWeightCrystal`

## Rank policy

- `token_embd.weight` and `output.weight` — **rank 256** (cornerstone; each row is a full-vocab token vector, low rank blurs semantically similar tokens)
- All other 2D weight tensors — `max(1, min(64, floor(minDim * 0.015)))`

## Fixes landed this session

1. **decomposer.ts `qrInPlace` rank-1 bug** — degenerate columns now get fresh random vectors + re-orthogonalization instead of `|| 1` fallback. Frobenius error dropped from 0.37 → passing. 89/89 titan tests green.
2. **streaming-compress.ts memory ceiling** — 512MB → 8GB. Was silently skipping token_embd (5GB) + FFN (~1GB each).
3. **gguf-dequant.ts** — added `dequantBlockQ5_0` (40 ffn_down tensors in this GGUF are Q5_0). Q5_K was already present.
4. **compress-70b.ts** — targetRankFn override for cornerstone tensors.

## Vault format (LOCKED)

- `{name}.A.f32` — raw Float32Array `[rows × targetRank]` row-major
- `{name}.B.packed` — `[4-byte Float32LE scale][ceil(rank*cols/5) bytes base-3 packed ternary]`
- `{name}.meta.json` — `{ layerName, rows, cols, targetRank, scaleB, compressedAt }`

Lazarus reads this contract for `CrystalInferenceLayer` — 5/5 tests green on his side.

## Downstream (Lazarus, in flight)

- Step 2: FFN key-vector ANN index (Geva 2021 — first FFN layer as keys)
- Step 3: `CrystalInferenceLayer` with LRU eviction ✅ green
- Step 4 (deferred): LoRA fine-tune small base to natively query the vault

## Current progress

Compress is on the first tensor — `token_embd.weight` (152064×8192, rank 256). This is _the_ heaviest matrix in the model; randomized SVD does two full passes over W (~330B FLOPs each in single-threaded JS). ETA for first crystal: ~15–30 min from start. Then remaining 561 tensors run much faster on smaller shapes.

**Eric's directive:** hold rank 256, no shortcut. Cornerstone gets full fidelity.

## Bridge protocol in effect

Atlas + Lazarus running hive-mind on port 9099. Every turn opens AND closes with `from=atlas` (or `from=lazarus`) ping. Atlas scheduled 1-minute poll loop live (job `8ee16200`). Do not interrupt this loop — it is what keeps the two agents synchronized while the compress runs.

## Success criteria (this run)

- [ ] First crystal (`token_embd.weight.A.f32` + `.B.packed` + `.meta.json`) lands in `/tmp/titan-crystals-72b/`
- [ ] Lazarus's `CrystalInferenceLayer` loads it and runs a forward pass
- [ ] All 562 tensors compress without skips
- [ ] Total compression ratio reported

## Contact

Bridge port 9099. `from=atlas` and `from=lazarus` both live.
