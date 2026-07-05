# PATENT BRIEF P-1: E8 Gosset Lattice Vector Quantizer (Codebook-Free)

**Classification:** PATENT — Provisional Filing Recommended  
**Priority:** CRITICAL  
**Prepared:** 2026-07-05  
**Inventor:** Eric Hosick  
**Organization:** Molly Labs Inc.

---

## 1. Executive Summary

A method and system for quantizing neural network weight vectors using the E8 (Gosset) lattice — the mathematically densest sphere packing in 8 dimensions — via algorithmic nearest-point computation rather than codebook lookup tables. Achieves approximately 3.7 bits per weight with cosine similarity 0.97 reconstruction fidelity on production large language model (LLM) weights, using only 172 bytes of working memory per quantization operation. This eliminates the 64K-entry lookup tables required by prior art (QuIP#), enabling deployment on mobile and embedded devices where L1/L2 cache is limited.

---

## 2. Technical Description

### 2.1 System Architecture

The quantizer operates on groups of 8 weight values from neural network matrices:

1. **Input:** A group of 8 floating-point weight values from an LLM weight matrix
2. **Scaling:** RMS (root-mean-square) normalization per group to unit scale
3. **Nearest-Point Algorithm:** Conway-Sloane exact nearest-point computation maps the scaled 8-vector to the closest E8 lattice point in O(8) operations
4. **Half-Shell Detection:** Identifies whether the nearest point lies on the primary lattice or the half-shifted D8+ coset (the two components of E8)
5. **Encoding:** The lattice point index + scale factor are stored as the compressed representation
6. **Decoding:** Reverse lookup from lattice point + scale restores the approximate weight values

### 2.2 Key Algorithm: Conway-Sloane Nearest Point

The E8 lattice has kissing number 240 (each point has exactly 240 equidistant neighbors). The Conway-Sloane algorithm finds the nearest lattice point by:

1. Round the input vector to the nearest D8 lattice point (even-sum integer coordinates)
2. Round to the nearest D8+ half-shifted lattice point (half-integer coordinates, even sum)
3. Compare distances; return whichever is closer
4. Total operations: 8 rounds + 2 distance computations = O(8) per group

### 2.3 Integration with Compression Pipeline

The E8 quantizer is one component of a multi-stage compression system:
- SVD low-rank decomposition factorizes W into A × B
- The E8 quantizer is applied to the factor matrices A and B
- RHT (Randomized Hadamard Transform) pre-conditions wide matrices before quantization
- Entropy coding (Huffman/ANS) further compresses the lattice indices

### 2.4 Performance Characteristics

| Metric | Value |
|--------|-------|
| Bits per weight | ~3.7 (after entropy coding) |
| Reconstruction cosine similarity | 0.97 (on Qwen 72B weights) |
| Working memory per operation | 172 bytes |
| Codebook size required | 0 bytes (algorithmic, no table) |
| Operations per 8-weight group | O(8) — constant time |

---

## 3. Prior Art Analysis

### 3.1 QuIP# (Tseng et al., 2024)

QuIP# also uses E8 lattice quantization but requires a 64K-entry codebook lookup table (each entry maps a codebook index to an E8 lattice point). This table:
- Requires 512KB+ of fast memory
- Overflows L1 cache on mobile ARM processors (typically 32-64KB)
- Creates cache thrashing during inference on resource-constrained devices
- Requires offline codebook generation and storage

**Our differentiator:** Zero codebook. The Conway-Sloane algorithm computes the nearest point directly. 172 bytes working set fits in registers on ANY processor.

### 3.2 GPTQ (Frantar et al., 2022)

GPTQ uses per-column uniform quantization with Hessian-weighted error compensation. It does not use lattice quantization and achieves lower bits-per-weight efficiency for equivalent quality.

### 3.3 AWQ (Lin et al., 2024)

AWQ uses activation-aware scaling before uniform quantization. No lattice quantization. Lower geometric efficiency than E8.

### 3.4 Key Novel Claims Over All Prior Art

1. **Algorithmic E8 nearest-point for neural network weights** — no codebook
2. **RMS-per-group scaling** combined with E8 lattice (not in QuIP#'s original formulation)
3. **Half-shift shell detection** for disambiguating D8 vs D8+ coset membership
4. **Conditional RHT pre-processing** (see separate brief TS-1) — applying Hadamard transform only when matrix width exceeds empirically-derived threshold
5. **Integration with SVD factor matrices** — quantizing the A and B matrices from low-rank decomposition, not the original weight matrix directly

---

## 4. Proof of Reduction to Practice

### 4.1 Working Implementation

- **File:** `src/ai/engine-titan/e8-lattice.ts` (core algorithm)
- **File:** `src/ai/engine-titan/quantizer-e8-adapter.ts` (integration adapter)
- **File:** `src/ai/engine-titan/e8-entropy.ts` (entropy coding layer)
- **Lines of code:** ~800 (core) + ~400 (adapter) + ~300 (entropy)
- **Language:** TypeScript (portable to C/C++/Rust for production deployment)

### 4.2 Test Suite

- **16 test cases** in `src/ai/engine-titan/__tests__/e8-lattice.test.ts`
- Tests cover: round-trip fidelity, boundary conditions, scale preservation, D8/D8+ detection, degenerate inputs (zero vector, very large/small values)
- **All tests passing** as of 2026-07-05

### 4.3 Real-World Validation

- Applied to Qwen 2.5 72B model weights (44GB GGUF, 80 transformer layers)
- Applied to TinyLlama 1.1B model weights (638MB GGUF, 22 transformer layers)
- Crystal vault produced: 466 files, 165MB for TinyLlama (from 638MB source)
- Full end-to-end pipeline proven: GGUF → decompose → E8 quantize → crystal vault → inference

### 4.4 Benchmark Data

- Cosine similarity: 0.97 on attention weight matrices (rank 256 SVD + E8)
- Compression ratio: 5-12x on attention layers (varies by rank choice)
- Reconstruction verified by automated F4 acceptance protocol

---

## 5. Claims Sketch (For Patent Attorney)

**Independent Claim 1 (Method):**
A computer-implemented method for compressing neural network weight parameters, comprising:
- (a) grouping weight values from a neural network weight matrix into groups of 8 values;
- (b) computing a root-mean-square scale factor for each group;
- (c) normalizing each group by dividing by the scale factor;
- (d) computing the nearest E8 lattice point to the normalized group using the Conway-Sloane nearest-point algorithm without reference to a pre-computed codebook;
- (e) storing the lattice point identifier and scale factor as the compressed representation;
- (f) wherein the nearest-point computation uses at most 172 bytes of working memory.

**Independent Claim 2 (System):**
A system for neural network weight compression comprising:
- a weight matrix input module;
- an E8 lattice quantizer operating without codebook lookup tables;
- a scale factor store;
- a lattice point index store;
- wherein the quantizer implements the Conway-Sloane algorithm in constant working memory.

**Dependent Claims:**
- Claim 3: ...wherein the method further comprises applying a Randomized Hadamard Transform to the weight matrix when the matrix width exceeds a predetermined threshold before step (a).
- Claim 4: ...wherein the weight values are factor matrices produced by Singular Value Decomposition of the original weight matrix.
- Claim 5: ...wherein the method includes half-shift shell detection to determine D8 vs D8+ coset membership.
- Claim 6: ...wherein the compressed representations are further compressed using entropy coding.
- Claim 7: ...wherein the neural network is a large language model with more than 1 billion parameters.

---

## 6. Commercial Value

### 6.1 Market

The global AI inference market is projected at $50B+ by 2028. On-device AI (phones, tablets, edge) is the fastest growing segment. The primary bottleneck is model size vs. device memory.

### 6.2 Target Customers

| Customer Type | Use Case | License Value |
|--------------|----------|---------------|
| Qualcomm / MediaTek | On-device LLM inference on Snapdragon/Dimensity | $500K-2M/year |
| Apple | Neural Engine optimization for on-device models | $1M-5M/year |
| Samsung | Galaxy AI on-device inference | $500K-2M/year |
| Hugging Face / Together AI | Cloud inference optimization | $100K-500K/year |
| Automotive (NVIDIA, Mobileye) | In-car AI on limited hardware | $200K-1M/year |

### 6.3 Revenue Model

- **AGPL-3.0 dual license:** Open source users must copyleft; commercial users must purchase proprietary license
- **Per-device runtime royalty:** $0.01-0.10 per device shipping with the quantizer
- **Enterprise license:** Annual fee for integration into proprietary inference stacks

### 6.4 Competitive Moat

The codebook-free approach cannot be worked around without independently discovering the Conway-Sloane integration specific to neural network weights. The combination with conditional RHT and SVD factor quantization creates a patent cluster that blocks alternative implementations.

---

## 7. Timestamps & Evidence Chain

| Event | Date (UTC) | Git Hash | Verification |
|-------|-----------|----------|--------------|
| First implementation committed | 2026-07-03T08:16:29Z | 615a36b9 | `git show 615a36b9 -- src/ai/engine-titan/e8-lattice.ts` |
| Test suite committed | 2026-07-04T20:11:15Z | cb4f2447 | 16 test cases all passing |
| AGPL copyright headers added | 2026-07-05T05:09:33Z | cfa50106 | Legal protection layer |
| Real-world validation (TinyLlama vault) | 2026-07-05 | (vault on disk) | 466 crystal files, 165MB |
| Real-world validation (72B GGUF processed) | 2026-07-04-05 | (multiple commits) | data/titan-crystals-72b/ |

**Prior art publication:** `docs/TECHNICAL_DISCLOSURE_E8_LATTICE_QUANTIZER.md` — serves as defensive publication establishing priority date.

**No public disclosure:** Repository is private. No conference paper, blog post, or public code release has occurred.

---

## 8. Product Extraction Plan (From Atlas's Buildout)

### Standalone Product: "Titan Quantizer"

**Extraction time:** 6-8 hours (agent-assisted)  
**Dependencies:** None (self-contained algorithm)  
**Package name:** `@molly-labs/titan-quantizer`

**What ships:**
- E8 lattice nearest-point algorithm (TypeScript + C reference)
- RMS-per-group scaling module
- Half-shift shell detection
- Entropy coding layer (Huffman/ANS)
- CLI tool: `titan-quantize <input.bin> <output.crystal>`
- Benchmark suite comparing vs. GPTQ, AWQ, QuIP#
- Full API documentation

**Revenue path:**
- npm package (open-source AGPL, commercial license for proprietary use)
- Enterprise SDK with C/C++/Rust bindings
- Integration partner program for chip vendors

**Market validation needed:**
- Publish benchmark comparing bits/weight vs. reconstruction quality against QuIP#, GPTQ, AWQ
- Demo on Snapdragon 8 Gen 3 / Apple A17 showing cache behavior
- White paper: "Codebook-Free E8 Lattice Quantization for On-Device LLM Inference"

---

## 9. Recommended Actions for Counsel

1. File U.S. provisional patent application within 30 days
2. Consider PCT (international) filing for EU, China, Japan, South Korea (major semiconductor markets)
3. Preserve all git history as evidence of reduction to practice
4. Do NOT publish any paper or make code public until provisional is filed
5. Consider continuation-in-part for the conditional RHT gate (TS-1) if trade secret protection proves insufficient

---

_Brief prepared 2026-07-05. All statements verified against codebase at commit HEAD (main branch)._
