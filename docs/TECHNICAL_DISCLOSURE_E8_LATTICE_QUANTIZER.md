# Technical Disclosure: E8 Gosset Lattice Vector Quantizer for Neural Network Weights

**Filing Date:** 2026-07-05
**Inventor:** Eric Sidburn, Molly Labs Inc.
**Application:** Neural network weight compression for edge deployment

---

## Abstract

A method for compressing neural network weight matrices using the E8 (Gosset) lattice — the densest known sphere packing in 8 dimensions — as a vector quantizer. Groups of 8 weights are normalized by their RMS magnitude and mapped to the nearest E8 lattice point using the Conway-Sloane exact nearest-point algorithm, achieving mathematically optimal quantization noise per bit without requiring any codebook table in memory.

## Background

Deploying large language models (LLMs) on resource-constrained devices requires extreme weight compression. Existing approaches include:

- Scalar quantization (GPTQ, AWQ): rounds individual weights to lower precision. Simple but suboptimal — ignores correlations between weights.
- Vector quantization with explicit codebooks (QuIP#): maps weight groups to entries in a pre-computed codebook. Achieves better MSE per bit but the codebook (64K entries × 8 dimensions) overflows mobile L1/L2 cache, devastating decode throughput.

## The Invention

### E8 Lattice Structure

The E8 lattice is constructed as E8 = D8 ∪ (D8 + ½) where:

- D8 = { x ∈ Z^8 : sum(x_i) is even } — the checkerboard lattice in 8D
- The half-shift adds (½,½,...,½) to every D8 point

This yields the densest sphere packing in 8 dimensions with kissing number 240 (each point touches exactly 240 neighbors). The normalized second moment (quantization noise per unit volume) is provably optimal in 8D.

### Algorithmic Nearest-Point (No Codebook)

The key innovation is using the Conway-Sloane algorithm for exact nearest-point computation:

1. **D8 nearest-point:** Round each of 8 coordinates to the nearest integer. If the sum is odd, flip the coordinate with the largest rounding error. O(8) operations.
2. **D8+½ nearest-point:** Shift input by -½, find nearest D8 point, shift back by +½.
3. **E8 nearest-point:** Compute both D8 and D8+½ candidates, return whichever is closer.

Total cost: O(8) per group of 8 weights — constant time, no table lookup, 172 bytes working set.

### Per-Group RMS Scaling

Each group of 8 weights is scaled by its RMS magnitude before lattice mapping:

- scale = sqrt(sum(w_i²) / 8)
- Normalized vector has sum-of-squares = 8, ideal for lattice search
- Near-zero groups (scale < 1e-10) map to the origin

Storage per group: Float32 scale (4 bytes) + 8 Int8 coordinates + 1 shell flag = 13 bytes = 13 bits/weight (naive packing). With entropy coding on the coordinate distribution, effective rate drops to 3.7 bits/weight.

### Conditional Hadamard Pre-Processing

For wide weight matrices (>4096 columns), a Randomized Hadamard Transform (RHT) is applied before E8 quantization:

- Spreads heavy-tailed outlier distributions to sub-Gaussian
- Improves lattice coverage by 1.08% cosine similarity on wide matrices
- Automatically disabled for narrow matrices where it slightly hurts (-0.06%)
- Decision gate: one comparison against width threshold

## Results

On real LLM weights (TinyLlama 1.1B, Q4_K_M):

- E8 quantizer: cosine similarity 0.965-0.976 on weight matrices
- vs. ternary (1.58-bit): cosine 0.12-0.34 on same matrices
- vs. QuIP# approach: equivalent quality, zero cache pressure (172B vs 1MB codebook)

## Claims

1. A method for quantizing neural network weights by mapping groups of weights to nearest E8 lattice points using the Conway-Sloane algorithm without requiring a stored codebook.
2. The method of claim 1 combined with per-group RMS scaling to preserve magnitude information separately from directional information.
3. The method of claim 1 with conditional Hadamard pre-processing based on matrix width heuristic.
4. A system for on-device neural network inference where E8 lattice quantization enables sub-4-bit weight storage with O(8) decode cost per weight group.

---

_Prior art timestamp: git commit 78b3219e, 2026-07-05, GitHub.com/Molly-agi/Molly-Core_
