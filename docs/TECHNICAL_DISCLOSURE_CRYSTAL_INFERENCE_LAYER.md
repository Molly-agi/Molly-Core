# Technical Disclosure: Crystal Inference Layer — On-Demand Decompress-Matmul-Evict Architecture

**Filing Date:** 2026-07-05
**Inventor:** Eric Sidburn, Molly Labs Inc.
**Application:** Large language model inference on memory-constrained devices

---

## Abstract

An inference architecture for neural networks where compressed weight "crystals" are loaded from storage on demand, the forward-pass matrix multiplication is performed directly on the compressed factors without ever materializing the full decompressed weight matrix, and an LRU eviction policy bounds peak memory to a configurable hot-tier budget regardless of total model size.

## Background

Standard neural network inference requires all model weights to reside in memory simultaneously. For a 72B parameter model at FP16, this requires ~144 GB RAM — far exceeding mobile device capacity (4-8 GB). Even quantized models (Q4_K: ~40 GB) exceed mobile RAM.

Existing solutions either:

- Stream entire layers from disk (slow, high latency per token)
- Require the full quantized model in RAM (doesn't fit on mobile)

## The Invention

### Crystal Vault Format

Each weight matrix W ≈ A × B is stored as two files:

- `{layer}.A.f32` — the left factor (Float32, rows × rank)
- `{layer}.B.packed` — the right factor (E8 lattice packed, rank × cols)
- `{layer}.meta.json` — compression metadata (rank, scale, RHT seed, provenance)

The full matrix W is NEVER stored or reconstructed.

### Fused Two-Step Kernel

Instead of decompressing W and computing output = input × W, the inference layer computes:

```
temp = input × A        [seqLen × rank]  — matmul with Float32 A
output = temp × B_dequant [seqLen × cols] — matmul with dequantized B
```

This is mathematically equivalent to input × (A × B) = input × W but:

- Peak memory is max(A, B_dequant) not W (typically 100x smaller)
- B is dequantized row-by-row during the matmul, not all at once
- The full W matrix never exists in memory

### LRU Hot-Tier Eviction

The inference layer maintains an LRU cache of recently-used crystal factors:

- `hot` map: stores dequantized [A | B] concatenated for SVD-path layers
- `hotInt8` map: stores {scales, data} for int8-per-row layers
- Combined size capped at `maxHotLayers` (default 4)
- On eviction, Float32 entries are evicted first (larger footprint)

For a 72B model with rank-256 crystals:

- Hot tier: ~160 MB for 4 layers (vs. ~144 GB for full model)
- Cold layers: loaded from SSD on demand (~10ms per layer on mobile flash)
- Total active RAM: 1-2 GB including KV cache

### Embedding Column-Gather

For embedding lookups (token_embd: [hidden × vocab]), the layer provides `getEmbeddingColumn(tokenId)`:

- Extracts column `tokenId` from the factored representation: out[r] = Σ_k A[r,k] × B[k, tokenId]
- Never materializes the full [8192 × 152064] matrix (4.75 GB)
- O(hidden × rank) per lookup vs O(hidden × vocab) for naive

### Tied-Embedding Fallback

When `output.weight` is absent (tied embeddings, e.g. Qwen-3B), the driver transparently redirects logit projection through `token_embd.weight` using the same fused kernel — no special-casing required.

## Results

- TinyLlama 1.1B: 3.9 GB → 40 MB crystal vault (95x compression), end-to-end forward pass verified
- Hot tier of 4 layers: ~20 MB active RAM for 1.1B model
- 72B target: estimated 1-2 GB active RAM with crystal tiering on Dimensity 6300 tablet

## Claims

1. An inference method for neural networks where compressed weight factors are loaded on demand and matrix multiplication is performed on the factors without reconstructing the full weight matrix.
2. The method of claim 1 with an LRU eviction policy that bounds peak memory to a configurable number of simultaneously-cached layers.
3. The method of claim 1 where the right factor is stored in E8 lattice quantized form and dequantized row-by-row during the matrix multiplication.
4. A method for neural network embedding lookup where the embedding vector for a token is computed from compressed factors via column-gather without materializing the full embedding table.
5. The method of claim 1 with automatic fallback to an alternative weight matrix when the requested matrix is absent from the vault (tied-embedding support).

---

_Prior art timestamp: git commit 78b3219e, 2026-07-05, GitHub.com/Molly-agi/Molly-Core_
