# Titan Crystal Vault — Format Specification

**Status:** Canonical reference (post-F1/F6)  
**Maintainer:** Atlas  
**Last updated:** 2026-07-04

---

## Critical Design Constraint

**The vault is NOT self-contained.** A crystal vault alone cannot reproduce model
inference. 1D tensors — layer norms, Q/K/V biases, and the final RMS norm — are
**not stored in the vault**. They must be loaded directly from the source GGUF file
at inference time.

This is by design, not an omission:

- `streaming-compress.ts` gates on `tensor.dimensions.length === 2` (line 283).
  All 1D tensors are skipped during compression.
- `crystal-transformer-driver.ts` accepts `LayerNormWeights[]`, `LayerBiasWeights[]`,
  and `finalNorm: Float32Array` as separate arguments — these come from the GGUF
  loader, not the vault.
- Rationale: 1D tensors are tiny (hiddenSize floats each, ~32KB for 8192-dim),
  losslessly representable in their original format, and not worth the complexity
  of a compression path. Storing them raw from GGUF avoids any fidelity questions.

**Implication for deployment:** A vault directory is always paired with the source
GGUF (or an extracted 1D-tensor sidecar). Inference requires both.

---

## Vault Directory Layout

```
vault/
├── token_embd.weight.A.f32          # matrixA (svd paths only)
├── token_embd.weight.B.packed       # matrixB (quantized)
├── token_embd.weight.meta.json      # LayerMetadata
├── blk.0.attn_q.weight.A.f32
├── blk.0.attn_q.weight.B.packed
├── blk.0.attn_q.weight.meta.json
├── ...
└── output.weight.B.packed           # int8-per-row: no .A.f32 file
```

### File types

| Suffix       | Content                                               | Present when                                   |
| ------------ | ----------------------------------------------------- | ---------------------------------------------- |
| `.A.f32`     | Float32 matrix A [rows × rank]                        | `compressionPath` is `svd-e8` or `svd-ternary` |
| `.B.packed`  | Quantized payload (format depends on compressionPath) | Always                                         |
| `.meta.json` | `LayerMetadata` JSON (see below)                      | Always                                         |

---

## LayerMetadata Schema

```typescript
interface LayerMetadata {
  layerName: string;
  rows: number;
  cols: number;
  targetRank: number;
  scaleB?: number;
  compressedAt: number; // epoch ms

  // Hadamard preprocessing (when B was RHT-rotated before quantization)
  rhtSeed?: number;
  rhtPaddedCols?: number;

  // Quantizer that produced .B.packed
  quantizerType?: 'ternary' | 'e8-lattice' | 'int8-per-row';

  // F1+F6 dispatch key (absent → 'svd-e8' for backward compat)
  compressionPath?:
    | 'svd-e8'
    | 'svd-ternary'
    | 'raw-e8'
    | 'raw-e8-rht'
    | 'int8-per-row';
}
```

---

## Compression Paths

| Path           | Files stored                  | Matmul at inference      | Use case                          |
| -------------- | ----------------------------- | ------------------------ | --------------------------------- |
| `svd-e8`       | A.f32 + B.packed (E8 lattice) | `X @ A @ dequant(B)`     | Default for attention projections |
| `svd-ternary`  | A.f32 + B.packed (ternary)    | `X @ A @ dequant(B)`     | Legacy path                       |
| `raw-e8`       | B.packed (E8 lattice)         | `X @ dequant(B)`         | FFN projections (Category C)      |
| `raw-e8-rht`   | B.packed (E8 + RHT)           | `X @ invRHT(dequant(B))` | Wide FFN projections              |
| `int8-per-row` | B.packed (int8 + scales)      | `X @ (scales · B_int8)`  | Embeddings, LM-head (F6 exempt)   |

---

## What the Vault Does NOT Contain

These tensors exist in the source GGUF and must be supplied at inference time:

| Tensor class         | Example names            | Shape        | Passed as                       |
| -------------------- | ------------------------ | ------------ | ------------------------------- |
| Attention layer norm | `blk.N.attn_norm.weight` | [hiddenSize] | `LayerNormWeights.attnNormGain` |
| FFN layer norm       | `blk.N.ffn_norm.weight`  | [hiddenSize] | `LayerNormWeights.ffnNormGain`  |
| Q bias               | `blk.N.attn_q.bias`      | [hiddenSize] | `LayerBiasWeights.qBias`        |
| K bias               | `blk.N.attn_k.bias`      | [kvDim]      | `LayerBiasWeights.kBias`        |
| V bias               | `blk.N.attn_v.bias`      | [kvDim]      | `LayerBiasWeights.vBias`        |
| Final RMS norm       | `output_norm.weight`     | [hiddenSize] | `finalNorm` parameter           |

Total size of excluded 1D tensors for Qwen 2.5 72B:

- Per layer: 5 vectors × 8192 floats × 4 bytes ≈ 160 KB
- 80 layers + final norm: ~12.8 MB total

This is <0.01% of model size — negligible, but **required** for correct inference.

---

## Inference Data Flow

```
┌──────────────────────────┐     ┌─────────────────────┐
│  Source GGUF             │     │  Crystal Vault       │
│  (or 1D sidecar file)   │     │  (compressed 2D)     │
│                          │     │                      │
│  • norm gains (1D)       │     │  • weight matrices   │
│  • biases (1D)           │     │    (A + B or B only) │
│  • final norm (1D)       │     │  • metadata.json     │
└───────────┬──────────────┘     └──────────┬───────────┘
            │                               │
            ▼                               ▼
┌───────────────────────────────────────────────────────┐
│  CrystalTransformerDriver.executeTokenPass()          │
│                                                       │
│  Combines 1D tensors (RMS norm, bias add) with        │
│  reconstructed 2D weights (matmul via                 │
│  CrystalInferenceLayer.forward()) to produce logits.  │
└───────────────────────────────────────────────────────┘
```

---

## Determinism Guarantee

Compression is seeded per-tensor: `seed = sha256(tensorName)`. Given the same
GGUF input and compression config, the vault output must be byte-identical across
runs. This is validated by the determinism byte-diff test (Quad's assignment).

---

## Tied Embeddings Note

Some models (e.g., Qwen-3B) do not have a separate `output.weight` tensor — the
LM head reuses `token_embd.weight` (tied embeddings). The driver must detect the
absence of `output.weight` in the vault and fall back to `token_embd.weight` for
logit projection. This is tracked as John's tied-embedding fallback task.
