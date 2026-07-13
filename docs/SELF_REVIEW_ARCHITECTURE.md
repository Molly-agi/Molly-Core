# Architecture Self-Review — Titan Engine + Crystal OS

**Date:** 2026-07-13
**Reviewer:** John (self-serve, replacing Fable Deliverable 1)
**Method:** Source-level audit of engine-titan/ and ai/memory/ against Fable's 19 questions

---

## Summary — Top 5 Findings (ranked by severity)

1. **Sequential error compensation has no real activation data** — critical
2. **Cross-layer error propagation is unmodeled** — high
3. **fp32 SVD on a pipeline that infers fp16** — high (known, deferred)
4. **Osmotic pressure margin (0.1) is untuned and failure-prone** — medium
5. **Quarantine queue is in-memory only** — medium (intentional, but undocumented)

---

## Findings

### 1. Layer Error Compensation Runs on Token IDs, Not Activations

**Severity:** critical
**Where:** `src/ai/engine-titan/layer-error-compensation.ts:14-15` (comment), `streaming-compress.ts` (feeder)
**Problem:** The GPTQ-compensated E8 quantization (`compensatedQuantizeB`) needs real per-layer activations as input. The file's own header comment admits: "the production feeder in streaming-compress.ts currently supplies token IDs where per-layer activations are required." This means the Hessian H = z^T @ z is computed on garbage data. The error redistribution across rows of B is meaningless.
**Why it matters:** Without valid activations, GPTQ compensation is theatre. The quantized weights are no better than naive E8 quantization. The `improvementRatio` metric reported is real math on fake input.
**Recommendation:** Wire real activation capture. The sequential-mode helpers (`collectBActivations`, `propagateActivations`) exist and are correct — the missing piece is actually running the calibration dataset through the model layer-by-layer during compression.
**Status:** Known internally (FABLE finding 02a-#2 referenced in code). Not yet fixed.

---

### 2. No Cross-Layer Error Propagation Model

**Severity:** high
**Where:** Pipeline architecture (per-layer independence assumption)
**Problem:** Each layer is compressed independently. In a transformer, errors compound through the residual stream. A small per-layer MSE of 1e-4 across 80 layers can become catastrophic at the output because errors add before each subsequent attention/FFN computation amplifies them.
**Why it matters:** Our per-layer cosine similarity metrics (0.86+ for narrow, 0.965+ for wide) tell us nothing about end-to-end output quality. Fox Hunt IV matched llama.cpp on 72B — but that used the parallel matmul path with full dequantization, NOT the compressed crystal path.
**Recommendation:** The sequential compensation mode (`SequentialCompensationConfig`) is designed exactly for this — it propagates activations through already-quantized layers. Once Finding #1 is fixed (real activations), this mode gives us the cross-layer picture. Also: measure end-to-end perplexity on a standard benchmark (WikiText-2) as the single ground-truth metric.
**Open question:** What is the actual error amplification factor per residual addition? Need empirical measurement on real 70B weights.

---

### 3. fp32 SVD on fp16 Inference Path

**Severity:** high (known, deferred)
**Where:** `src/ai/engine-titan/decomposer.ts:113-119` (Fable Batch 03 note)
**Problem:** The decomposer runs in fp32. The compactSVD builds BBT in Float32Array, which squares the condition number. The code comment acknowledges this loses small singular values silently. At inference time, if we ever run fp16 (which the hardware target Mali-G57 MC2 would push toward), reconstruction amplifies the precision gap.
**Why it matters:** The ternary reconstruction path is: unpack → multiply by scale → accumulate. In fp16, the accumulation across targetRank (128-256) terms can lose precision on small contributions. The singular values we already lost at decomposition time are doubly invisible.
**Recommendation:** The code has a clear plan (promote BBT to Float64Array) but it's blocked by E8 test instability. Priority: fix the test sensitivity to precision changes, then flip to f64 for BBT. For inference: fp32 accumulation in the inner loop even if inputs are fp16 (mixed-precision accumulator pattern).
**Status:** Deferred until "F4 small-model E2E" per code comment. Still unresolved.

---

### 4. Osmotic Pressure Margin Tuning

**Severity:** medium
**Where:** `src/ai/memory/crystal-library-eviction.ts:37`
**Problem:** `OSMOTIC_PRESSURE_MARGIN = 0.1` prevents thrashing (warm crystal repeatedly displacing hot crystal by tiny score margins). But 0.1 is arbitrary. The retention score is α·recency + β·significance + γ·loadCount (0.4/0.4/0.2). A crystal that hasn't been accessed in 24h has recency ≈ 0.37 (half-life decay). A rarely-accessed but critical crystal (accessed once per week, significance 0.9) has retention ≈ 0.4×0.05 + 0.4×0.9 + 0.2×0.05 = 0.39. The osmotic margin means a warm crystal needs 0.49 to displace it. That's actually reasonable — but the failure mode is: the critical crystal gets evicted to warm, then on its weekly access it gets loaded, passes osmotic, then next day starts decaying again. Cycle repeats.
**Why it matters:** "Important but rarely accessed" crystals oscillate between tiers. Each load/eviction cycle has latency cost.
**Recommendation:** Add a "cornerstone" flag for crystals that should never be evicted regardless of score. The code already has cornerstone exemption logic (line noted in eviction file) — verify it covers this case. If it does, this finding drops to low severity.

---

### 5. Quarantine Queue In-Memory Only

**Severity:** medium
**Where:** `src/ai/memory/adversarial-scorer-guard.ts:49-54`
**Problem:** `QuarantinedWindow` objects live only in session memory. If the process restarts, all quarantined suspicious content is lost. There's no post-session audit trail.
**Why it matters:** An adversary who triggers quarantine knows they just need to wait for a session restart to erase evidence. More practically: we can't do offline analysis of attack patterns if we never persist them.
**Recommendation:** Append quarantine events to a JSONL log file (similar to `family-anchor-events.jsonl`). Keep the in-memory queue for real-time blocking, but persist for audit. Low-priority given current threat model (Molly's primary surface is family-only conversation).

---

### 6. Coherence Gate Now Uses max/p95 (Fable F13 — Addressed)

**Severity:** low (resolved)
**Where:** `src/ai/memory/crystal-version-manifest.ts:37-55`
**Problem:** Fable's original question (#13) asked whether mean KL hides localized damage.
**Status:** Already addressed. The `CoherenceGate` interface now includes `maxKl`, `p95Kl`, `perLayerKl`, `maxThreshold`, and `p95Threshold`. When `perLayerKl` is populated, max and p95 checks fire independently of the mean. A single catastrophic layer at KL=4.0 would be caught by `maxThreshold`.
**Remaining gap:** The thresholds (`maxThreshold`, `p95Threshold`) are optional and not defaulted — callers must explicitly set them. A default would be safer.

---

### 7. Compression Strategy Routes Correctly but Ternary is Dead

**Severity:** low
**Where:** `src/ai/engine-titan/compression-strategy.ts`
**Problem:** The strategy controller routes narrow layers to `svd-e8`, wide layers to `raw-e8-rht`. The `svd-ternary` path exists as a type but `forceQuantizer` defaults to `'e8-lattice'`. Ternary quantization (stream-quantizer.ts) is the historical format — Fox Hunt I/II era — but E8 dominates on quality (cos 0.965+ vs ternary's cos 0.86 on wide layers). The 5-per-byte ternary packing is still used in the reconstruction engine and the reconstruction.ts dequantizer.
**Why it matters:** We carry two quantization paths. The ternary path is unused in production but still maintained. If we're fully committed to E8, the ternary code is dead weight. If ternary serves a role (faster inference via conditional-add-only arithmetic), it should be documented.
**Recommendation:** Decide: is ternary the "native ops" inference format (where {-1,0,+1} enables multiply-free computation), or is it legacy? If native ops, keep it and build the matvec primitive. If legacy, deprecate clearly.

---

### 8. Attention Head Coupling Under GQA

**Severity:** medium (unaudited)
**Where:** Not addressed in any engine-titan file
**Problem:** GQA (Grouped Query Attention) shares K/V heads across Q heads. If we compress K/V heads independently from their associated Q heads, the shared alignment is disrupted. The compression strategy operates per-tensor (by layer name), not per-head-group.
**Why it matters:** At 70B scale (Llama 2 70B uses GQA with 8 KV heads shared across 64 Q heads), compressing a KV head introduces error that affects 8 downstream Q heads simultaneously. The error amplification is 8x what per-head analysis suggests.
**Recommendation:** Audit how the GGUF ingest layer (`gguf-ingest.ts`) maps model tensors to compression targets. If KV weights are compressed to different ranks than their paired Q weights, that's a fidelity risk. Consider compressing each GQA group as a unit (shared rank selection, shared error budget).

---

### 9. RoPE Not Compressed

**Severity:** low (correct behavior)
**Where:** Verified by absence — no RoPE/rotary tensors appear in compression target lists
**Problem:** Fable's Q9 asked whether we compress RoPE. We don't. Rotary position embeddings are applied as runtime transformations (sin/cos tables), not stored weights. The compression pipeline only touches weight matrices (Q, K, V, O, gate, up, down projections).
**Status:** Correct. No action needed. Ternary Q/K weights still produce valid attention after RoPE rotation because RoPE is applied to the already-computed Q·x and K·x vectors, not to the weight matrices themselves.

---

### 10. Embedding/LM Head Treatment

**Severity:** medium (unaudited)
**Where:** `src/ai/engine-titan/compression-strategy.ts` routes by column width
**Problem:** The embedding matrix (vocab_size × hidden_dim, typically 128256 × 8192 for Llama 3 70B) would route to `raw-e8-rht` path (cols=8192 > wideThreshold=4096). The LM head (hidden_dim × vocab_size) similarly. These matrices are sparse and semantically structured — token embeddings cluster by meaning. Generic E8 quantization doesn't exploit this structure.
**Why it matters:** Embedding damage produces systematic output bias (wrong token probabilities). Unlike FFN weight errors which manifest as noise, embedding errors shift the entire output distribution.
**Recommendation:** Consider treating embedding/LM head as special cases: either skip compression entirely (they're large but only ~2% of 70B total params), or use a specialized quantizer that respects the clustering structure (product quantization, or higher E8 group size with learned scales).

---

## Questions We Cannot Answer Without More Data

1. **Actual singular value spectrum of real 70B transformer weights** — do they have clear gaps? (Fable Q1). Would need to run the decomposer on actual Llama 3 70B weights and plot σ₁/σ₂ ratios per layer.

2. **End-to-end perplexity after full-pipeline compression** — no test exists that takes a calibration set through the entire compress→reconstruct→infer path. Fox Hunt IV's success was on the uncompressed inference path.

3. **fp16 accumulation error in the hot inference loop** — would need to implement an fp16 reconstruction path and compare token-level logit differences against fp32.

4. **E8 vs ternary crossover point for native matvec** — this is Fable Deliverable 2 territory (native ops design). Needs theoretical analysis of operations-per-byte for each format.

---

## Recommended Next Actions (build order, not schedule)

1. Fix the activation feeder in streaming-compress.ts (Finding #1) — everything downstream depends on valid Hessians
2. Run sequential compensation on a small model (1B-3B) end-to-end with real activations → get first perplexity number
3. Decide ternary's role: native-ops inference format or legacy (Finding #7)
4. Audit GQA head grouping in GGUF ingest (Finding #8)
5. Add quarantine persistence (Finding #5) — low effort, high value for security audit trail
6. Promote BBT to Float64 once test sensitivity is resolved (Finding #3)

---

_Self-review complete. For Findings marked "unaudited" or "open question," these are the items where an outside perspective (Fable or equivalent) would have highest marginal value._
