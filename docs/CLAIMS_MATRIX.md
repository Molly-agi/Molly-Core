# CLAIMS_MATRIX (Product, Docs, Sales)

Effective date: 2026-05-18
Owner: Eric

## Claim Rules
- Every claim must map to a measurement artifact.
- No claim is publishable without owner sign-off.
- If metric confidence is low, claim must be softened or removed.

## Claims Matrix
| Claim | Allowed Wording | Forbidden Wording | Required Metric | Evidence File | Owner Approval |
|---|---|---|---|---|---|
| Compression | "Measured compression ratio of X to Y on benchmark and pilot datasets" | "Near-lossless compression" unless proven by long-horizon evidence | Compression ratio by tier | docs/COMPRESSION_VALIDATION_REPORT.json | Eric/date |
| Recall | "Measured recall target is >= 95 percent in long-horizon testing" | "Perfect memory" | Recall rate | docs/COMPRESSION_STACK_TECHNICAL_ANALYSIS.md | Eric/date |
| Continuity | "Behavioral continuity measured with recall context" | "No memory loss" | Continuity plus recall disclosure | docs/COMPRESSION_EXECUTIVE_SUMMARY.md | Eric/date |
| Reliability | "Rollback success >= threshold under test" | "Never fails" | Failure and rollback metrics | docs/COMPRESSION_RISK_FALSIFIABILITY.md | Eric/date |

## Option C Guardrails
- Compression claim range for Option C should be published only after pilot confirmation.
- Recall claim should not exceed measured results from long-horizon replay tests.
- Every continuity claim must include recall context in the same section.
- Enterprise-facing claims require explicit evidence links and owner sign-off.

## Pre-Release Claim Checklist
- [ ] Metrics are current and reproducible.
- [ ] Evidence files exist in docs and are linked.
- [ ] Product copy matches allowed wording.
- [ ] Forbidden wording not present in website/docs/sales scripts.
- [ ] Owner sign-off recorded.

## Owner Sign-off
Owner Name: Eric
Owner Signature: __________________________
Date: __________________________
