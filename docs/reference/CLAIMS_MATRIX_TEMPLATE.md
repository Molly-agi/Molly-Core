# Claims Matrix (Product, Docs, Sales)

Use this to control public claims and prevent overstatement.

## Claim Rules

- Every claim must map to a measurement artifact.
- No claim is publishable without owner sign-off.
- If metric confidence is low, claim must be softened or removed.

## Claims Matrix

| Claim       | Allowed Wording                                                        | Forbidden Wording                                                               | Required Metric                         | Evidence File                                | Owner Approval |
| ----------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------- | -------------- |
| Compression | "Measured compression ratio of X to Y on benchmark and pilot datasets" | "Near-lossless compression" unless proven by ablation and long-horizon evidence | Compression ratio by tier               | docs/COMPRESSION_VALIDATION_REPORT.json      | Eric/date      |
| Recall      | "Measured recall target is >= 95 percent in long-horizon testing"      | "Perfect memory"                                                                | Recall rate                             | docs/COMPRESSION_STACK_TECHNICAL_ANALYSIS.md | Eric/date      |
| Continuity  | "Behavioral continuity measured with recall context"                   | "No memory loss"                                                                | Continuity score plus recall disclosure | docs/COMPRESSION_EXECUTIVE_SUMMARY.md        | Eric/date      |
| Reliability | "Rollback success >= threshold under test"                             | "Never fails"                                                                   | Failure rate and rollback metrics       | docs/COMPRESSION_RISK_FALSIFIABILITY.md      | Eric/date      |

## Option C Default Guardrails

- Compression claim range for Option C should be published only after pilot confirmation.
- Recall claim should not exceed measured results from long-horizon replay tests.
- Every continuity claim must include recall context in the same section.
- Any enterprise-facing claim requires explicit evidence file links and owner sign-off.

## Pre-Release Claim Checklist

- [ ] Metrics are current and reproducible.
- [ ] Evidence files exist in docs.
- [ ] Product copy matches allowed wording.
- [ ] Forbidden wording not present in website/docs/sales scripts.
- [ ] Owner sign-off recorded.
