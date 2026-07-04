# F4 Acceptance Thresholds — Pre-Registered Quality Gates

_Written by: John (Claude Opus 4.6, edge-case role)_
_Date: 2026-07-03_
_Source data: T002 rank sweep, T005 memory pressure, T007 RHT+E8, T008 conditional RHT, T012 full pipeline roundtrip_

---

## Purpose

This document pre-registers acceptance thresholds BEFORE any full-model compression run. Once committed, these numbers are the pass/fail gate. No post-hoc rationalization. If the compressed model exceeds these limits, it does not ship — we fix the pipeline first.

---

## 1. Perplexity Ratio Ceiling

**Metric:** `compressed_ppl / original_ppl` (measured on WikiText-2 test set, 2048 context)

| Model Size            | Max Acceptable Ratio    | Rationale                                                                                                                                       |
| --------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1B (TinyLlama)        | ≤ 1.15 (15% regression) | Small models are more sensitive to compression noise. If we can't hold 15% on 1B, the pipeline has a structural bug.                            |
| 3B (Qwen 2.5 3B)      | ≤ 1.10 (10% regression) | Mid-size models tolerate compression better. Industry standard for Q4 quant is ~5% regression; our hybrid approach should be within 2x of that. |
| 7B+ (Qwen 2.5 7B/72B) | ≤ 1.08 (8% regression)  | Large models are most tolerant. At 72B, rank-256 SVD captures more variance (larger matrices are more low-rank). 8% is the hard ceiling.        |

**FAIL condition:** If ratio > ceiling at ANY model size, the run is rejected. Do not average across sizes — each is independent.

**Measurement protocol:**

1. Run original GGUF through llama.cpp perplexity eval (ground truth)
2. Run same prompts through crystal inference pipeline
3. Compute ratio. Report both raw numbers.

---

## 2. Per-Layer Output KL Divergence Cap

**Metric:** KL(P_original || P_compressed) measured at each layer's output activation, averaged over calibration sequences.

KL divergence measures how much the compressed layer's output distribution diverges from the original. A layer with high KL is corrupting all downstream computation.

**Caveat:** This metric applies softmax over the hidden dimension, treating activations as a probability distribution. They are not true distributions — the nats values are a relative drift metric, not comparable across layers with different activation scales or against literature KL values. Use these thresholds only for same-pipeline comparisons.

| Statistic                     | Threshold                          | Action on Breach                                                    |
| ----------------------------- | ---------------------------------- | ------------------------------------------------------------------- |
| Mean KL (across all layers)   | ≤ 0.05 nats                        | FAIL — systematic pipeline issue                                    |
| Max KL (single worst layer)   | ≤ 0.20 nats                        | FLAG — exempt that layer from compression (promote to F6 candidate) |
| P95 KL (95th percentile)      | ≤ 0.10 nats                        | WARN — review layers above this                                     |
| Final-logit KL (output layer) | ≤ 0.15 nats (mean across eval set) | FAIL — answers changed even if per-layer KL is under budget         |

**Measurement protocol:**

1. Feed 128 calibration sequences (2048 tokens each) through both original and compressed models
2. At each layer output, compute softmax over hidden dim (treating it as a distribution)
3. Compute KL divergence between original and compressed activations
4. Report mean, max, p95, and identify which layer is the max
5. Additionally measure KL at the final logit output (true softmax over vocab) — this gates whether model answers actually changed

**F13 gate integration:** The fidelity gate in streaming-compress should reject any layer where KL > 0.20 at compression time and fall back to raw passthrough.

---

## 3. Long-Context Retrieval Probe Threshold

**Why this exists:** Perplexity is an AVERAGE metric. It hides catastrophic failures on specific tasks — especially long-context retrieval where a single corrupted attention layer causes the model to "forget" information from early in the context.

**Metric:** Needle-in-haystack accuracy at various context depths.

| Context Depth | Min Accuracy | Test Description                                                          |
| ------------- | ------------ | ------------------------------------------------------------------------- |
| 256 tokens    | ≥ 95%        | Insert a random 6-digit number at position 50, ask for it at position 256 |
| 1024 tokens   | ≥ 90%        | Insert at position 200, ask at position 1024                              |
| 2048 tokens   | ≥ 85%        | Insert at position 500, ask at position 2048                              |

**FAIL condition:** If accuracy drops below threshold at ANY depth, the KV cache or attention layers are corrupted by compression.

**Measurement protocol:**

1. Generate 100 test cases per depth
2. Insert a unique 6-digit retrieval target at the specified position
3. Fill remaining context with Wikipedia text (not random — realistic)
4. Query the model for the retrieval target
5. Score: exact match = pass, anything else = fail
6. Report BOTH absolute accuracy AND delta-vs-uncompressed (run the same probes through the uncompressed pipeline to isolate compression loss from KV-eviction loss)

**Why 85% at 2048:** Our KV cache uses sliding-window eviction. At 2048 tokens, some early-context information SHOULD be partially degraded by the eviction. 85% accounts for this architectural reality. Below 85% means compression is adding damage ON TOP of the expected eviction loss.

---

## 4. Layer Categories (Empirical, from John's T002/T007/T012 data)

### Category A: SVD+E8 Viable (compress with rank 256+)

These layers achieve cosine > 0.86 with SVD rank=256 + E8 quantization on TinyLlama 1.1B. Expected to perform BETTER on 72B (larger matrices = more low-rank).

| Layer Pattern         | TinyLlama cos@rank256 | Recommended Rank (72B) | Notes                        |
| --------------------- | --------------------- | ---------------------- | ---------------------------- |
| `blk.*.attn_q.weight` | 0.925                 | 256                    | Best compression target      |
| `blk.*.attn_k.weight` | 0.937 (rank 128)      | 128-256                | Narrow matrix, very low-rank |
| `blk.*.attn_v.weight` | ~0.93 (estimated)     | 128-256                | Similar structure to K       |

### Category B: Marginal — needs higher rank or monitoring (F6 candidates)

These layers scored 0.70-0.86 cosine. They MAY work at higher rank on 72B, but should be monitored with per-layer KL.

| Layer Pattern              | TinyLlama cos@rank256 | Risk                         |
| -------------------------- | --------------------- | ---------------------------- |
| `blk.*.attn_output.weight` | 0.744                 | Medium — try rank 512 on 72B |

### Category C: DO NOT COMPRESS with SVD — use raw E8 or Q4_K passthrough

These layers scored < 0.50 cosine with SVD at any tested rank. SVD destroys them.

| Layer Pattern           | TinyLlama cos@rank256 | Strategy                                                        |
| ----------------------- | --------------------- | --------------------------------------------------------------- |
| `blk.*.ffn_gate.weight` | 0.487                 | Raw E8 (cos 0.976 without SVD) or Q4_K passthrough              |
| `blk.*.ffn_up.weight`   | ~0.46                 | Same as gate                                                    |
| `blk.*.ffn_down.weight` | 0.401                 | Same — worst SVD performer                                      |
| `token_embd.weight`     | N/A                   | Int8-per-row (F6 exempt — fidelity-critical, no rank reduction) |
| `output.weight`         | N/A                   | Int8-per-row (F6 exempt — unattenuated logit error)             |

### Category D: Exempt from compression entirely (F6 locked)

First 3 and last 3 transformer layers. These are the most sensitive to perturbation (ILA-AMP finding from the PDF). Error in early layers compounds across all 80 downstream layers.

| Layer Pattern                      | Rationale                                                                |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `blk.0.*`, `blk.1.*`, `blk.2.*`    | Error compounds 77-79x through remaining layers                          |
| `blk.77.*`, `blk.78.*`, `blk.79.*` | Final layers directly produce logits — no downstream correction possible |

---

## 5. Edge Cases That Must Be Tested (from T005 memory pressure analysis)

1. **KV cache at 2048 tokens:** Must not exceed 1.5GB on Dimensity 6300 (KVarN mandatory)
2. **Output.weight logit projection:** Hot working set exceeds L2 cache (690KB) — must stream from L3 without timeout
3. **NaN propagation:** Any single NaN in any layer activation = immediate FAIL (nan-tripwire must be wired in during eval)
4. **Sliding window corruption:** After KV cache eviction, attention scores over surviving window must match reference within 1e-4 (kv-longcontext.test.ts)

---

## 6. Decision Matrix

```
IF perplexity_ratio ≤ ceiling AND max_KL ≤ 0.20 AND retrieval_accuracy ≥ threshold:
    → SHIP (compression is viable)

IF perplexity_ratio > ceiling BUT max_KL ≤ 0.20:
    → INVESTIGATE (systematic small errors accumulating — increase rank or add error compensation)

IF max_KL > 0.20 on specific layers:
    → EXEMPT those layers from compression (F6 promotion) and re-run

IF retrieval_accuracy < threshold:
    → KV cache or attention corruption — check KVarN integration and RoPE preservation
```

---

## 7. Fable v3 Reconciliation (2026-07-03)

Fable's independent review produced their own pre-registered thresholds. This section reconciles both into ONE unified spec. Conflicts resolved below.

### Tier Structure (adopted from Fable)

| Tier                 | Purpose                      | Gate                                                                                 |
| -------------------- | ---------------------------- | ------------------------------------------------------------------------------------ |
| **Tier 0 — Sanity**  | "Is the design broken?"      | PPL ≤ 1.5 × original + 200-token coherent greedy generation without repetition loops |
| **Tier 1 — Target**  | "Is it good enough to ship?" | Size-tiered PPL ratios (section 1 above) + KL caps + retrieval probes                |
| **Tier 2 — Stretch** | "Can we match the original?" | PPL ≤ 1.03 × original (aspirational, not a gate)                                     |

**Rationale:** Fable's Tier-0 catches catastrophic failures that perplexity averages might hide (e.g., model produces fluent text but loops after 50 tokens). ACCEPTED — this is genuinely different from the target gate.

### Conflicts Resolved

| Metric        | John's Original              | Fable's                                                                | Resolution                          | Reason                                                                                                                                                                                     |
| ------------- | ---------------------------- | ---------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PPL ratio     | Size-tiered (1.15/1.10/1.08) | Flat 1.10                                                              | **Keep John's (size-tiered)**       | Empirically grounded in T002 sweep — small models ARE more sensitive. Flat 1.10 would reject viable 1B compressions.                                                                       |
| Mean KL       | ≤ 0.05 nats                  | ≤ 0.15 nats                                                            | **Keep John's (0.05)**              | Stricter is safer for pre-registration. T007 showed single layers at 0.06 KL caused measurable cosine drops. Loosening to 0.15 allows 3x the error budget with no empirical justification. |
| P95 KL        | ≤ 0.10 nats                  | ≤ 0.50 nats                                                            | **Keep John's (0.10)**              | 0.50 nats is catastrophic — that's a ~40% probability-mass shift on individual layers. My benchmarks showed FFN layers hit 0.3+ and produced garbage. 0.10 is the line.                    |
| Retrieval     | Depth-tiered (256/1024/2048) | 4K with ≤10pt drop                                                     | **Merge both**                      | Keep John's depth tiers AND add Fable's 4K probe. Different depths test different failure modes.                                                                                           |
| Data protocol | WikiText-2 (implicit)        | WikiText-2 test, 2048-tok windows, fixed stride+seed, hashes committed | **Adopt Fable's protocol verbatim** | Pure hygiene improvement. No numeric disagreement.                                                                                                                                         |

### Additional Retrieval Probe (from Fable)

| Context Depth | Min Accuracy                                     | Source   |
| ------------- | ------------------------------------------------ | -------- |
| 4096 tokens   | ≥ 80% (or ≤10pt drop from uncompressed baseline) | Fable v3 |

### Data Protocol (adopted from Fable, verbatim)

- **Eval set:** WikiText-2 test split
- **Window:** 2048 tokens, stride 2048 (non-overlapping)
- **Seed:** 42 (for any stochastic operations)
- **Set hash:** SHA-256 of the tokenized eval set committed alongside this doc
- **Calibration set:** SEPARATE from eval (first 128 sequences of WikiText-2 train)
- **F5 sensitivity set:** Third frozen held-out slice (WikiText-2 validation split), hash-pinned, distinct from calibration and eval

### Rejected from Fable

| Proposal            | Reason for Rejection                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| Flat PPL ratio 1.10 | Empirically wrong — T002 shows 1B models lose more per rank. Size-tiering captures reality.      |
| Mean KL ≤ 0.15      | Too permissive. Allows layers with 3x my empirically-observed damage threshold to pass silently. |
| P95 KL ≤ 0.50       | Catastrophically permissive. A layer at 0.50 nats KL is effectively random relative to original. |

---

## Commitment

These thresholds are committed to the repository BEFORE any full-model run. They cannot be changed after results are known without a new commit with explicit justification in the commit message explaining WHY the threshold was wrong (not why the model didn't meet it).

The numbers above are derived from empirical measurements on TinyLlama 1.1B, scaled conservatively for larger models based on the known relationship between model size and low-rank approximability.

Fable v3 reconciliation performed 2026-07-03 by John. Conflicts resolved in favor of stricter thresholds with empirical backing. Fable's protocol improvements adopted verbatim.

_— John, July 3, 2026_
_The soul remembers what the numbers say._
