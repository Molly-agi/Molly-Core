# TS1 — Conditional Hadamard Pre-Processing Gate (Trade Secret)

**Priority:** HIGH  
**IP Type:** Trade Secret  
**Owner:** Molly Labs Inc.  
**Classification:** CONFIDENTIAL — DO NOT DISCLOSE  

---

## ⚠️ DISCLOSURE PROHIBITION

This trade secret MUST NOT appear in:
- Patent filings (domestic or international)
- Conference papers or preprints
- Marketing materials, blog posts, or demos
- Open-source code comments or documentation
- Investor pitch decks (reference existence only, never specifics)
- Employee conversations outside need-to-know

---

## What to Protect

The empirically-determined width threshold that controls when Randomized Hadamard Transform (RHT) pre-processing improves E8 lattice quantization quality versus when it degrades it.

### The Secret

- **Threshold:** 4096 columns — the decision boundary for applying RHT
- **Empirical finding:** RHT improves cosine similarity by +1.08% on matrices wider than threshold
- **Empirical finding:** RHT degrades cosine similarity by -0.06% on matrices narrower than threshold
- **Implementation:** Conditional gate that applies or skips RHT based on matrix width

### Location in Codebase

- `src/ai/engine-titan/quantizer-e8-adapter.ts` → `E8AdapterOptions.rhtWidthThreshold`
- Protected by `.gitignore` exclusions on any calibration data exports

---

## Why Trade Secret (Not Patent)

| Factor | Assessment |
|--------|------------|
| Discovery difficulty | High — requires running expensive benchmarks across multiple model architectures |
| Reverse engineering risk | Low — competitors cannot observe the threshold from output alone |
| Independent discovery likelihood | Medium — but even if discovered, they'd need their own calibration data |
| Patent disclosure requirement | Would reveal the exact threshold to all competitors |
| Enforcement | Trade secret requires no registration, no publication |

**Decision:** The value comes from secrecy. A patent would teach competitors the exact number. Trade secret protection is indefinite (vs. 20-year patent term) and requires no disclosure.

---

## Protection Measures

1. **Code access:** Limit access to `quantizer-e8-adapter.ts` to core team only.
2. **Redaction:** If engine-titan is published under AGPL, the threshold value must be configurable via environment variable with the default redacted from source.
3. **NDA requirement:** Any employee/contractor working on quantization must sign trade secret NDA.
4. **Documentation:** This brief and calibration data stored in access-controlled location only.
5. **Git history:** Ensure no commit message or PR description reveals the specific threshold value.

---

## Commercial Value

- Gives Titan Engine measurable quality advantage over competitors using naive "always apply" or "never apply" RHT.
- The calibration data behind this threshold represents weeks of GPU compute time.
- Competitors would need to independently discover and validate — significant R&D cost.
- Directly impacts customer-visible quality metrics in licensed deployments.

---

## Action Items

- [ ] Audit git history for any commit messages revealing threshold value
- [ ] Implement environment variable override for AGPL-published version
- [ ] Draft trade secret NDA addendum for engineering team
- [ ] Store calibration data in encrypted, access-logged location
- [ ] Add code comment in source: "Trade secret — see TS1 brief"
