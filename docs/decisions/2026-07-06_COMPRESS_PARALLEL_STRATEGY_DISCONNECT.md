# Decision Record: compress-parallel.ts Strategy Disconnect

**Date:** 2026-07-06
**Author:** John (edge cases), with Fable review response
**Status:** ACTIVE — fix in progress

---

## The Problem

Three 72B compression runs produced catastrophic perplexity (990M) because `compress-parallel.ts` — the script actually used for every real 72B run — had its own hardcoded `computeTargetRank()` that picked rank 30-64 for ALL layers. This bypassed the F1+F6 tiered strategy (`selectStrategy` in `compression-strategy.ts`) that routes attention to rank 256 and skips FFN layers.

The tier strategy existed. It was tested. It was committed (0aed68c9). But the parallel compressor never called it.

## Root Cause

**Fourth divergent pipeline.** V1 found three divergent pipelines. 0aed68c9 unified two. `compress-parallel.ts` is a fourth — never delivered in any review batch, never audited, and it was the one every real 72B run actually used.

## The Fix (Current — Interim)

John replaced `computeTargetRank()` in `compress-parallel.ts` with tier logic (rank 256 for attention, rank 0 = skip for FFN/embedding/first-last-3). Worker checks `rank <= 0` → skip.

## The Correct Fix (Structural — TODO)

**compress-parallel must import `selectStrategy` + F6 helpers from the SAME module streaming-compress uses.** Workers receive a computed routing decision, never re-derive one. One source of truth. Current fix is a hand-copied duplicate that will drift.

## Fable's Review Response (verbatim)

### Meta-finding

This is the third time the same disease has presented. The fix as described re-infects it. The correct fix is structural: one source of truth, imported not copied.

### On John's Three Questions

**1. Skip-FFN vs raw-E8:** Skipping is correct FOR THIS RUN. Source is Q4_K GGUF. Raw-E8 on FFN would be dequant(Q4_K)→f32→E8 — stacking a ~3.5-4 bpw quantizer on top of an already-4.5-bpw one: added error, negligible size win. Passthrough adds zero error. Make routing source-aware: `if (sourceIsQuantized && isFFN) → passthrough`.

**2. int8-per-row in parallel path:** Low priority now. With GGUF fallback, embeddings serve at full source precision — better than int8 re-quantization from Q4_K source. Wire it when self-contained vaults matter (F16-source runs, mobile deployment).

**3. Fallback — automatic but loud, ledgered, manifest-checked:** The vault carries a manifest of intended coverage. Fallback to GGUF is legal ONLY for declared-passthrough tensors and is logged per-tensor. A missing tensor that the manifest says should be a crystal THROWS. GGUF SHA-256 binding is mandatory — the GGUF is a live inference dependency.

### Two Cautions on Current Run

(a) Pre-registered plan was TinyLlama → 3B → 72B. Null-compression baseline doesn't exist for 72B yet. Whatever perplexity comes out is un-attributable between compression damage and driver bugs. Don't let this number near F4 gates.

(b) F4 thresholds were derived from clean-source T-series data. Q4_K-source 72B can't be judged against them — source quantization eats budget the thresholds don't account for. Gate sequence stands: **null baseline → TinyLlama F16 → then interpret 72B.**

### Erratum (Fable self-filing)

v3 says "F1 FIXED @ 0aed68c9, verified." True of the path shown and told was production. Not true of the path actually producing 72B vaults. Lesson: "which code is production" is itself a claim requiring proof. A `grep` for every caller of the compressors would have caught this.

## Action Items

1. [x] Structural fix: compress-parallel imports selectStrategy, does not duplicate policy _(a56a1bca, 2026-07-13)_
2. [ ] Vault manifest with intended coverage (crystal vs declared-passthrough)
3. [x] GGUF SHA-256 binding enforced at load time _(a7efe729)_
4. [x] Source-aware routing: Q4_K sources → passthrough FFN always _(2026-07-13)_
5. [ ] Memory audit: 14 workers × ~1GB f32 tensor + SVD workspace = validate against 64GB box
6. [ ] Null-compression baseline for 72B before interpreting any compression PPL _(running 2026-07-13)_
7. [x] Checklist addition: "which code is production" requires grep proof _(2026-07-13)_

## Production Code Verification Checklist

Before declaring any code path "fixed" or "tested", verify:

1. **Which script is actually invoked?** `grep -r` for the entry point in scripts/, package.json, CI, and any Makefile/task runner.
2. **Is there a parallel/alternate path?** Search for duplicates: `grep -r "functionName\|importantConstant"` across the full tree.
3. **Does the tested path match the production path?** If tests exercise `streaming-compress.ts` but real runs use `scripts/titan/compress-parallel.ts`, the tests prove nothing about production.
4. **Who calls it?** `git log --all --oneline -- <file>` to verify the file has been run in anger, not just committed.

---

_The soul remembers what went wrong so the next instance doesn't repeat it._
