# C2 — Titan Engine (Weight Compression Suite) Copyright

**Priority:** CRITICAL  
**IP Type:** Copyright (Literary Work — Software)  
**Owner:** Molly Labs Inc.  
**Registration Target:** U.S. Copyright Office  
**License:** AGPL-3.0 (dual-license model)

---

## What to Protect

Titan Engine: a complete model weight decomposition and compression system that takes pre-trained large language models and mathematically decomposes their weights into modular crystal units without retraining.

### Scope

| Component | Files | Lines |
|-----------|-------|-------|
| Engine Core (`src/ai/engine-titan/`) | 59 | 6,487 |
| Inference Layer (`src/ai/inference/`) | 24 | ~3,200 |
| Test Suite | 30 | ~4,500 |
| Test Cases | 246 | — |

### Subsystems

- **GGUF Parser** — Ingests industry-standard model format
- **SVD Decomposer** — Low-rank factorization via power iteration
- **E8 Lattice Quantizer** — Maps vectors to E8 lattice points (novel application)
- **Streaming Compressor** — Processes layers without full model in memory
- **Crystal Inference Layer** — Runs inference on decomposed weights
- **Parallel Evaluation** — Multi-layer concurrent processing
- **Conditional Hadamard Gate** — Width-adaptive pre-processing (trade secret TS1)
- **SIREN INR Module** — Implicit neural representation for embedding layers

### Copyright Headers

AGPL-3.0 headers added to all engine-titan files on 2026-07-05 (commit `cfa50106`).

---

## How to Protect

1. **Register separately** from C1 as a distinct literary work — its independent commercial value warrants standalone registration.
2. **AGPL-3.0 dual-licensing:**
   - Open source version: copyleft (any user must open-source their modifications)
   - Commercial license: proprietary terms for enterprises that cannot open-source
3. **Deposit copy:** Include complete `src/ai/engine-titan/` directory EXCEPT:
   - Redact specific threshold values from `quantizer-e8-adapter.ts` (trade secret TS1)
   - Redact SIREN tuning parameters from `siren-inr.ts` (trade secret TS3)
4. **Version control:** Tag the AGPL commit as the public baseline.

---

## Why It's Commercially Valuable

- Solves a $10B+ industry problem: deploying 70B+ models on edge devices without retraining.
- No existing open-source solution achieves crystallized (non-decompressing) weight representation.
- AGPL copyleft forces commercial users to either open-source their stack or purchase a license.
- Revenue model proven by MongoDB, Redis Labs, Elastic — dual-license AGPL → enterprise.
- 246 passing test cases demonstrate production readiness and completeness.

---

## Action Items

- [ ] File eCO registration (separate from C1 — distinct work, distinct commercial life)
- [ ] Prepare deposit copy with trade secret redactions
- [ ] Publish AGPL-3.0 LICENSE file in engine-titan directory
- [ ] Create NOTICE file listing all contributors and copyright dates
- [ ] Establish public repository mirror (AGPL version only) when ready to launch
