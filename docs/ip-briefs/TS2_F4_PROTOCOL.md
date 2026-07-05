# TS2 — F4 Pre-Registered Acceptance Protocol (Trade Secret)

**Priority:** MEDIUM  
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
- Investor pitch decks (reference methodology concept only, never specific thresholds)
- Employee conversations outside need-to-know

---

## What to Protect

The specific numerical thresholds and gating methodology of the F4 Pre-Registered Acceptance Protocol — a system that locks pass/fail criteria in git BEFORE experimental runs, preventing post-hoc rationalization of results.

### The Secret

- **Tier 0 gate thresholds** — minimum quality floor for any crystal to be accepted
- **Tier 1 gate thresholds** — production-ready quality bar
- **Tier 2 gate thresholds** — optimal quality (publish-worthy results)
- **Per-layer KL divergence caps** — maximum acceptable information loss per transformer layer
- **Needle retrieval depth requirements** — minimum recall accuracy at various context depths
- **The methodology itself:** Commit thresholds BEFORE running experiments, making results unfalsifiable

### Locations in Codebase

- `docs/architecture/F4_ACCEPTANCE_THRESHOLDS.md` — threshold definitions
- `scripts/titan/f4-check-thresholds.ts` — automated validation script
- Benchmark result archives (internal only)

---

## Why Trade Secret (Not Patent)

| Factor | Assessment |
|--------|------------|
| Methodology novelty | The pre-registration concept exists in science; our specific application to AI model compression with these exact thresholds is novel |
| Competitive advantage | Competitors cannot match our quality claims without knowing what we measure and what bars we set |
| Reverse engineering risk | Very low — outputs don't reveal internal acceptance criteria |
| Patent value | Low — the methodology is a process that's hard to detect infringement on |

**Decision:** The specific numbers are what make this commercially defensible. Publishing them (via patent or paper) would let competitors calibrate to the same bars without doing the R&D.

---

## Protection Measures

1. **Git access control:** F4 threshold documents in access-restricted branch or path.
2. **Pre-registration integrity:** Git commit timestamps serve as tamper-proof evidence that thresholds preceded results.
3. **Redaction policy:** Any public benchmark reports show PASS/FAIL without revealing the threshold values.
4. **Customer contracts:** Enterprise licensees receive threshold documentation under NDA only.
5. **Marketing language:** "Pre-registered acceptance protocol" can be referenced; specific numbers cannot.

---

## Commercial Value

- Provides credibility that Titan Engine quality claims are scientifically rigorous (not cherry-picked).
- Enterprise customers pay premium for systems with provable quality guarantees.
- The pre-registration methodology prevents internal team from shipping substandard crystals.
- Competitors publishing benchmarks without pre-registered thresholds appear less rigorous.
- The specific thresholds encode months of calibration work across multiple model architectures.

---

## Action Items

- [ ] Verify F4 threshold document is not in any public-facing branch
- [ ] Create redacted benchmark report template (shows pass/fail, hides thresholds)
- [ ] Draft NDA clause specific to acceptance protocol disclosure
- [ ] Maintain git timestamp integrity — never rebase or amend threshold commits
- [ ] Add code comment in f4-check-thresholds.ts: "Trade secret — see TS2 brief"
