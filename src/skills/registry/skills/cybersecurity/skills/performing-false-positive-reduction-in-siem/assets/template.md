# False Positive Reduction Template

## Rule Tuning Request

| Field                  | Value                                                 |
| ---------------------- | ----------------------------------------------------- |
| Rule Name              |                                                       |
| Current FP Rate        |                                                       |
| Target FP Rate         |                                                       |
| Alert Volume (30 days) |                                                       |
| Root Cause Category    | Threshold / Missing context / Known benign / Outdated |

## FP Root Cause Analysis

| Sample # | Source | Classification | Root Cause | Recommended Fix |
| -------- | ------ | -------------- | ---------- | --------------- |
| 1        |        | FP             |            |                 |
| 2        |        | FP             |            |                 |
| 3        |        | FP             |            |                 |

## Tuning Action Plan

- [ ] Adjust threshold from **_ to _**
- [ ] Add allowlist entries for: \_\_\_
- [ ] Add correlation with: \_\_\_
- [ ] Add enrichment lookup: \_\_\_
- [ ] Test with Atomic Red Team: \_\_\_
- [ ] Validate FP rate improvement after 7 days
