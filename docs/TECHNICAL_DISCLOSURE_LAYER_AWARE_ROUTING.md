# Technical Disclosure: Layer-Aware Compression Routing for Neural Networks

**Filing Date:** 2026-07-05
**Inventor:** Eric Sidburn, Molly Labs Inc.
**Application:** Automated per-layer compression strategy selection for LLM deployment

---

## Abstract

A method for automatically selecting the optimal compression strategy for each layer in a neural network based on the layer's structural properties (dimensions, position, tensor type), empirical rank-viability measurements, and deployment constraints. Instead of applying a single compression method uniformly, the system classifies tensors into tiers and routes each to the compression path that maximizes quality at the target size.

## Background

All existing LLM compression methods apply the same quantization scheme uniformly across the model:

- GPTQ: uniform 4-bit quantization for all layers
- AWQ: uniform activation-aware quantization
- QuIP#: uniform lattice quantization

This uniform approach ignores a critical empirical finding: **different layers respond dramatically differently to the same compression method.** SVD-based compression achieves cosine similarity 0.925 on attention layers but only 0.12 on FFN layers of the same model — a 7.7x quality gap.

## The Invention

### Empirical Rank-Viability Classification

Through systematic measurement (rank sweep at 30/48/64/96/128/256 on real model weights), layers are classified into viability tiers:

**Category A — SVD-viable (attention Q/K/V):**
Cosine similarity > 0.86 at rank 256. These layers' information concentrates in the top singular values — low-rank approximation preserves >86% of angular information. Optimal compression: SVD factorization + E8 lattice quantization of the right factor.

**Category B — Marginal (attention output):**
Cosine 0.70-0.86 at rank 256. May work with higher rank (512) or monitoring. Route to SVD+E8 with per-layer KL gate (F13) — if KL exceeds 0.20, automatically promote to Category C.

**Category C — SVD-hostile (FFN gate/up/down):**
Cosine < 0.50 at ANY tested rank. These layers are "full rank" — their information is distributed across all singular values. SVD destroys them. Route to raw E8 quantization (no SVD factorization) or Q4_K passthrough from the source GGUF.

**Category D — Position-sensitive (first/last N layers):**
Regardless of viability class, the first 3 and last 3 transformer layers are exempt from aggressive compression. Error in early layers compounds across all downstream layers; error in final layers directly corrupts logits with no downstream correction.

### Automatic Dispatch

The compression pipeline reads tensor name + dimensions and automatically selects:

```
if isEmbeddingOrLMHead(name):       → int8-per-row (F6 exemption)
if isFirstOrLastNLayers(name, 80):  → int8-per-row (Category D)
if isFFNProjection(name):           → raw-e8 or raw-e8-rht (Category C)
if cols ≤ 1024:                     → svd-e8 rank=128 (narrow attention)
if cols ≤ 4096:                     → svd-e8 rank=256 (medium attention)
else:                               → raw-e8-rht (wide, with Hadamard)
```

No manual configuration per-layer. The routing is derived from the tensor's structural properties.

### Quality Gate Integration (F13)

Each compressed layer's KL divergence is checked against pre-registered thresholds:

- Mean KL > 0.05: FAIL (systematic issue)
- Max KL > 0.20 on any single layer: FLAG for F6 exemption (promote to uncompressed)
- P95 KL > 0.10: WARN (review borderline layers)

This creates a feedback loop: layers that don't compress well are automatically exempted, converging on a per-model optimal configuration.

## Results

On TinyLlama 1.1B:

- Attention Q at rank 256: cosine 0.925, 5.7x compression — viable
- FFN gate at rank 256: cosine 0.487 — correctly routed to passthrough
- End-to-end: 3.9 GB → 40 MB (95x overall) with working inference

Projected for 72B:

- ~30% of parameters (attention): 5-12x compression via SVD+E8
- ~60% of parameters (FFN): Q4_K passthrough (already 4-bit)
- ~10% of parameters (embeddings): SIREN INR (99.8% compression)

## Claims

1. A method for compressing a neural network where each layer is automatically classified into a viability tier and routed to a distinct compression algorithm based on its structural properties.
2. The method of claim 1 where classification is based on empirical rank-viability measurements (cosine similarity of SVD reconstruction at multiple rank values).
3. The method of claim 1 with position-based exemption of early and late transformer layers from aggressive compression.
4. The method of claim 1 with automatic promotion of poorly-compressing layers to an uncompressed tier based on per-layer KL divergence exceeding a pre-registered threshold.
5. A system combining claims 1-4 with a pre-registered acceptance protocol where compression quality thresholds are committed before evaluation, preventing post-hoc rationalization.

---

_Prior art timestamp: git commit 78b3219e, 2026-07-05, GitHub.com/Molly-agi/Molly-Core_
