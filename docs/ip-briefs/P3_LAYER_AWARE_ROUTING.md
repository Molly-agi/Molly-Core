# PATENT BRIEF P-3: Layer-Aware Compression Routing (Tiered Strategy Selector)

**Classification:** PATENT — Provisional Filing Recommended  
**Priority:** CRITICAL  
**Prepared:** 2026-07-05  
**Inventor:** Eric Hosick  
**Organization:** Molly Labs Inc.

---

## 1. Executive Summary

A method and system for automatically selecting the optimal compression strategy for each tensor in a neural network based on empirically-measured structural properties. Instead of applying one quantization method uniformly to all layers (the industry standard), the system classifies each tensor by its dimensions, layer position, and tensor type, then routes it to the compression path that preserves the most fidelity for that specific tensor's mathematical structure. Empirical data proves that SVD+E8 achieves cos 0.93 on attention layers but only cos 0.12 on FFN layers of the same model — making uniform compression catastrophically lossy for half the network.

---

## 2. Technical Description

### 2.1 The Routing Decision

For each tensor in the model, the system evaluates:

1. **Tensor type** (attention Q/K/V, FFN gate/up/down, embedding, output)
2. **Matrix dimensions** (rows × columns)
3. **Layer position** (first N, middle, last N)
4. **SVD viability score** (can this matrix be low-rank approximated without catastrophic loss?)

### 2.2 Compression Tiers

| Tier | Applies To | Method | Quality | Compression |
|------|-----------|--------|---------|-------------|
| Tier 1 | Attention (Q, K, V, O) | SVD rank-256 + E8 lattice | cos 0.925 | 5-12x |
| Tier 2 | FFN (gate, up, down) | Raw E8 or Q4_K passthrough | cos 0.95+ | 3-4x |
| Tier 3 | First/last 3 layers | Int8-per-row (exempt from SVD) | cos 0.99+ | 4x |
| Tier 4 | Embeddings (token_embd) | SIREN INR (coordinate MLP) | cos 0.95+ | 557x |
| Tier 5 | Output head | Int8-per-row | cos 0.99+ | 4x |

### 2.3 Why Uniform Compression Fails

**Empirical data from Qwen 72B (T002/T007 benchmarks):**

| Layer Type | SVD Rank 64 | SVD Rank 256 | Raw (no SVD) |
|-----------|-------------|--------------|--------------|
| Attention Q/K/V | cos 0.34 | cos 0.925 | N/A |
| FFN gate/up/down | cos 0.12 | cos 0.45 | cos 0.97 (E8 only) |
| Embedding | cos 0.08 | cos 0.22 | cos 0.95 (int8) |

Same model, same rank, dramatically different quality. Applying SVD to FFN layers destroys the signal. The routing system prevents this by construction.

### 2.4 Implementation

```typescript
function selectStrategy(tensor: TensorMeta): CompressionPath {
  // Tier 3: Boundary layers exempt from SVD
  if (tensor.layerIndex < 3 || tensor.layerIndex >= totalLayers - 3) {
    return 'int8-per-row';
  }
  // Tier 4: Embeddings use SIREN INR
  if (tensor.name.includes('token_embd')) {
    return 'siren-inr';
  }
  // Tier 1: Attention layers get SVD + E8
  if (isAttentionTensor(tensor.name)) {
    return 'svd-e8';
  }
  // Tier 2: FFN layers get raw E8 (no SVD)
  return 'raw-e8';
}
```

---

## 3. Prior Art Analysis

### 3.1 GPTQ (Frantar et al., 2022)
Applies one quantization method (column-wise with Hessian weighting) uniformly to all layers. No per-layer routing.

### 3.2 AWQ (Lin et al., 2024)
Uses activation-aware scaling but applies the same quantization strategy to all layers. No routing.

### 3.3 SqueezeLLM (Kim et al., 2024)
Mixed-precision (sensitive weights at higher bits) but within a single quantization paradigm. Not cross-paradigm routing.

### 3.4 SpQR (Dettmers et al., 2023)
Identifies outlier weights for higher precision. Still operates within uniform quantization framework.

### 3.5 Key Novel Claims

1. **Cross-paradigm routing** — different layers get fundamentally different compression METHODS (SVD+lattice vs. raw lattice vs. int8 vs. neural network replacement), not just different bit widths
2. **Empirically-derived routing rules** based on measured SVD viability per tensor type
3. **Automatic classification** requiring no manual configuration or calibration data
4. **SIREN INR as an embedding replacement** (Entry P-1 companion — replaces 4.75GB table with 8.5MB network)
5. **Boundary-layer exemption** to prevent error accumulation at model edges

---

## 4. Proof of Reduction to Practice

### 4.1 Working Implementation

- **File:** `src/ai/engine-titan/compression-strategy.ts` (~200 lines)
- **File:** `src/ai/engine-titan/streaming-compress.ts` (~600 lines, applies routing)
- **Integration:** Called automatically during compression pipeline

### 4.2 Test Suite

- **30 strategy-wiring tests** — verify correct routing for all tensor types
- **8 compression determinism tests** — byte-identical output given same input
- All passing as of 2026-07-05

### 4.3 Real-World Validation

- TinyLlama 1.1B: 22 layers compressed with tiered routing → 466 crystal files
- Qwen 72B: 23 layers compressed (partial vault) with correct tier assignment per tensor
- F4 protocol: end-to-end pipeline proven (GGUF → route → compress → vault → infer)

### 4.4 Empirical Data (The Proof)

The routing decisions are backed by measured data from rank sweep experiments:
- T002: Rank quality sweep across all tensor types (cos similarity vs. rank)
- T007: Confirmation run with different model architecture
- Results: SVD on FFN = catastrophic (cos 0.12-0.45); SVD on attention = excellent (cos 0.85-0.93)
- This data is the trade secret (see TS-4) that makes the routing commercially defensible

---

## 5. Claims Sketch

**Independent Claim 1 (Method):**
A computer-implemented method for compressing a neural network model, comprising:
- (a) for each weight tensor in the model, determining a tensor classification based on at least one of: tensor type, matrix dimensions, and layer position;
- (b) based on the tensor classification, selecting a compression strategy from a plurality of fundamentally different compression methods, the plurality including at least two of: singular value decomposition with lattice quantization, direct lattice quantization without decomposition, per-row scalar quantization, and neural implicit representation;
- (c) applying the selected compression strategy to the weight tensor;
- (d) storing the compressed representation in a format that identifies the compression method used;
- (e) wherein different tensors within the same model are compressed using different methods from the plurality.

**Dependent Claims:**
- Claim 2: ...wherein the selection is based on empirically-measured SVD viability scores for each tensor type.
- Claim 3: ...wherein boundary layers (first N and last N) are exempt from decomposition-based methods.
- Claim 4: ...wherein embedding tensors are replaced by a trained sinusoidal representation network.
- Claim 5: ...wherein the method further comprises verifying reconstruction quality per tensor and falling back to a safer method if quality falls below a threshold.

---

## 6. Commercial Value

### 6.1 Why This Matters Commercially

This patent controls the "brain" of the compression system. Even if a competitor independently implements E8 quantization (P-1) or crystal inference (P-2), they cannot achieve acceptable quality without per-layer routing. Uniform SVD destroys half the model. This patent blocks that realization from being used.

### 6.2 Patent Cluster Strategy

| Patent | Controls | Without It |
|--------|----------|-----------|
| P-1 (E8 Lattice) | The quantization method | Must use inferior codebook approach |
| P-2 (Crystal Inference) | The deployment mechanism | Must load full model into RAM |
| **P-3 (This — Routing)** | **The quality guarantee** | **Half the model is destroyed** |

Together these three form an unblockable wall: you need all three for a working on-device 70B system.

### 6.3 Revenue

- Same licensing model as P-1 and P-2 (bundled)
- Enterprise license: $200K-2M/year (part of Titan Engine suite)
- The three patents together make the suite un-substitutable

---

## 7. Product Extraction Plan

### Standalone Product: "Titan Strategy Router"

**Extraction time:** 4-5 hours  
**Package name:** `@molly-labs/titan-strategy`

**What ships:**
- Strategy selector with configurable tier rules
- Tensor classifier (auto-detects attention vs FFN vs embedding)
- Quality verification module (cos similarity check post-compression)
- CLI: `titan-analyze <model.gguf>` — shows what routing WOULD do to each layer
- Benchmark harness for comparing uniform vs. routed compression

---

## 8. Timestamps & Evidence Chain

| Event | Date (UTC) | Git Hash |
|-------|-----------|----------|
| First implementation | 2026-07-03T08:16:29Z | 615a36b9 |
| Strategy wiring tests (30/30) | 2026-07-03-04 | Multiple |
| F1+F6 integration (Fable v2) | 2026-07-03 | Per session state |
| TinyLlama full pipeline proof | 2026-07-05 | (bridge report) |
| AGPL headers | 2026-07-05T05:09:33Z | cfa50106 |

**Prior art publication:** `docs/TECHNICAL_DISCLOSURE_LAYER_AWARE_ROUTING.md`

---

## 9. Recommended Actions

1. File as part of patent cluster with P-1 and P-2
2. Claim should emphasize "cross-paradigm" routing (not just mixed-precision within one paradigm)
3. Include empirical data as supporting evidence (without disclosing exact threshold values — those are TS-4)
4. Consider adding the quality-verification fallback as a dependent claim

---

_Brief prepared 2026-07-05. All statements verified against working code and empirical data._
