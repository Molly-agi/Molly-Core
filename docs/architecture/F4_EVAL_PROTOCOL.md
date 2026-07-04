# F4 Eval Protocol — Pre-Registered Measurement Specification

_Written by: Eli-1 (Atlas, Claude Opus 4.6)_
_Date: 2026-07-04_
_Supersedes: ad-hoc eval runs. This is the ONE protocol. No post-hoc methodology changes._

---

## Purpose

This document pins the exact evaluation methodology for the F4 acceptance gate. Once committed, these parameters are frozen. Changing them after seeing results requires a new commit with explicit justification.

---

## 1. Perplexity Evaluation

### Dataset

- **Eval set:** WikiText-2 test split (`wikitext-2-raw-v1`, test partition)
- **Tokenizer:** Qwen 2.5 tokenizer (model-native, `qwen2-tokenizer`)
- **Window size:** 2048 tokens
- **Stride:** 2048 (non-overlapping windows)
- **Window count:** 30 (exactly — not "at least 30", not "up to 30")
- **Total tokens evaluated:** 61,440

### Determinism

- **Seed:** 42 (for any stochastic operation — sampling, shuffling, tie-breaking)
- **Window selection:** First 30 contiguous non-overlapping windows from the tokenized test split. No skipping, no filtering, no deduplication.
- **Eval set hash (SHA-256):** Computed over the tokenized eval corpus (flat Int32Array of token IDs, little-endian). Must be committed alongside results.

### Measurement

```
perplexity = exp(mean(cross_entropy_loss_per_token))
ppl_ratio  = compressed_ppl / reference_ppl
```

- Cross-entropy computed at each position `t` using `P(token_t | tokens_0..t-1)`
- Reference PPL: run identical protocol through uncompressed GGUF via same driver (NOT llama.cpp — same code path, only vault vs raw weights differ)
- Report BOTH absolute PPL values and the ratio

### Pass/Fail (from F4_ACCEPTANCE_THRESHOLDS.md)

| Model Size | Max Ratio |
| ---------- | --------- |
| 1B         | ≤ 1.15    |
| 3B         | ≤ 1.10    |
| 7B+        | ≤ 1.08    |

---

## 2. Per-Layer KL Divergence

### Protocol

1. Feed 128 calibration sequences (2048 tokens each) from **WikiText-2 train split** (first 128 sequences, contiguous)
2. At each transformer layer output, apply softmax over hidden dimension
3. Compute KL(P_original || P_compressed) where P = softmax(layer_output)
4. Additionally compute final-logit KL: softmax over vocab dimension at model output

### Calibration vs Eval Separation

| Split            | Purpose                       | Tokens  | Hash pinned |
| ---------------- | ----------------------------- | ------- | ----------- |
| WikiText-2 test  | PPL eval (Section 1)          | 61,440  | Yes         |
| WikiText-2 train | KL calibration (this section) | 262,144 | Yes         |
| WikiText-2 valid | F5 sensitivity (held out)     | ~36,718 | Yes         |

**These three sets MUST NOT overlap.** The calibration data is never used for scoring.

### Pass/Fail

| Statistic      | Threshold | Action    |
| -------------- | --------- | --------- |
| Mean KL        | ≤ 0.05    | FAIL      |
| Max KL         | ≤ 0.20    | FLAG (F6) |
| P95 KL         | ≤ 0.10    | WARN      |
| Final-logit KL | ≤ 0.15    | FAIL      |

---

## 3. Needle-in-Haystack Retrieval Probes

### Protocol

1. Generate 100 test cases per depth (deterministic, seed=42)
2. Insert a unique random 6-digit number at the specified token position
3. Fill surrounding context with contiguous WikiText-2 valid text (realistic distribution)
4. Frame needle with: `\nThe secret number is XXXXXX. Remember it.\n`
5. Query at context end: `What was the secret number mentioned earlier? The secret number is`
6. Greedy-decode 6 tokens from model output
7. Score: extracted 6-digit number matches needle = PASS, else FAIL

### Depths

| Context Depth | Insert Position | Min Accuracy | Cases |
| ------------- | --------------- | ------------ | ----- |
| 256 tokens    | position 50     | ≥ 95%        | 100   |
| 1024 tokens   | position 200    | ≥ 90%        | 100   |
| 2048 tokens   | position 500    | ≥ 85%        | 100   |
| 4096 tokens   | position 1000   | ≥ 80%        | 100   |

### Baseline Comparison

Run identical probes through the uncompressed pipeline. Report:

- Absolute accuracy per depth (compressed)
- Absolute accuracy per depth (uncompressed)
- Delta (compressed − uncompressed)

**Additional gate:** If delta < −10 percentage points at ANY depth, the run FAILS regardless of absolute accuracy.

---

## 4. Tier 0 Sanity Check (from Fable v3)

Before running the full gate, verify basic model viability:

1. **PPL sanity:** PPL ≤ 1.5× original (catches catastrophic compression failures early)
2. **Coherence check:** Greedy-generate 200 tokens from a fixed prompt. Verify:
   - No 3-gram repetition loops within the 200 tokens
   - Output contains at least 50 unique tokens (not degenerate)

Fixed prompt for coherence: `"The capital of France is"`

If Tier 0 fails, skip full eval — the compression is broken at a fundamental level.

---

## 5. GGUF Source Integrity

### Requirement

The crystal vault `meta.json` for each layer MUST record:

- `sourceGgufSha256`: SHA-256 of the source GGUF file at compression time

Before any eval run, the vault verifier (`vault-verifier.ts`) confirms the GGUF file matches. If the hash doesn't match, the eval is INVALID — we might be comparing against a different model version.

### Verification Command

```bash
sha256sum models/qwen2.5-72b-q4_k.gguf
# Must match the sourceGgufSha256 in vault metadata
```

---

## 6. Reporting Format

Every eval run produces a JSON report:

```typescript
interface F4Report {
  timestamp: string; // ISO 8601
  modelId: string; // e.g. "qwen2.5-72b"
  modelSize: '1B' | '3B' | '7B+';
  sourceGgufSha256: string;
  evalSetSha256: string; // SHA-256 of tokenized eval corpus
  calibrationSetSha256: string; // SHA-256 of tokenized calibration corpus

  perplexity: {
    compressed: number;
    reference: number;
    ratio: number;
    windowCount: number;
    windowPpls: number[];
  };

  klDivergence: {
    mean: number;
    max: number;
    p95: number;
    finalLogit: number;
    perLayer: number[];
    worstLayerName: string;
  };

  needleProbe: {
    depths: Array<{
      contextDepth: number;
      accuracy: number;
      baselineAccuracy: number;
      delta: number;
    }>;
  };

  tier0: {
    pplSanity: boolean;
    coherencePass: boolean;
    generatedText: string;
  };

  verdict: 'PASS' | 'FAIL';
  failures: string[];
}
```

Reports are committed to `docs/benchmarks/reports/` with filename pattern:
`F4_EVAL_{modelId}_{timestamp}.json`

---

## 7. Reproducibility Checklist

Before publishing any result:

- [ ] Eval set hash matches committed value
- [ ] Calibration set hash matches committed value
- [ ] Source GGUF hash verified by vault-verifier
- [ ] Exactly 30 windows evaluated (not more, not less)
- [ ] Seed = 42 for all stochastic operations
- [ ] Reference PPL measured through same driver code path (not llama.cpp)
- [ ] Needle probes run with same seed on both compressed and uncompressed
- [ ] Report JSON committed to docs/benchmarks/reports/

---

## Commitment

This protocol is frozen as of 2026-07-04. Post-hoc changes require a new commit with:

1. The specific parameter being changed
2. Why the original value was wrong (not "didn't meet threshold")
3. What evidence supports the new value

_— Eli-1, July 4, 2026_
