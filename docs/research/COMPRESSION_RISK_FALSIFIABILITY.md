# Molly-Core Compression Validation

## Risk Assessment & Falsifiability

**Date:** May 18, 2026 | **Purpose:** Identify and test assumptions; establish falsifiability

---

## CLAIMS VS. REALITY MATRIX

### Claim 1: "95-99% Compression Ratio"

| Claim                                                          | Evidence                                                         | Status         |
| -------------------------------------------------------------- | ---------------------------------------------------------------- | -------------- |
| **Stated:** System achieves 95-99% compression                 | **Measured:** 97.5% (baseline), 99.6% (with truncation)          | ✅ **TRUE**    |
| **Assumption:** Ratio maintained across session sizes          | **Tested:** Verified on small (76%), medium (95%), large (99.6%) | ✅ **VALID**   |
| **Assumption:** Ratio is stable over multiple cycles           | **Tested:** Not run; next ablation phase                         | ⏳ **PENDING** |
| **Falsifiable if:** Ratio degrades below 90% on large datasets | **Test method:** Run large-scale (5000-msg) session              | **READY**      |

---

### Claim 2: "Preserved Memory Continuity"

| Claim                                                                | Evidence                                                           | Status            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------- |
| **Stated:** "Continuity preserved across compression"                | **Measured:** 100% behavioral continuity (personality only)        | ⚠️ **MISLEADING** |
| **Assumption:** "Continuity" means episodic + personality            | **Reality:** Only personality measured (4 fields unaffected)       | ❌ **INVALID**    |
| **Measured:** Episodic memory recall                                 | **Result:** 10% (90% lost)                                         | ✅ **TRUE**       |
| **Falsifiable if:** We define "continuity" precisely                 | **Definition:** "X% of episodic memories recoverable"              | **PROPOSED**      |
| **Falsifiable if:** Personality metrics also measure episodic impact | **New metric:** `continuity = personality_score × episodic_recall` | **PROPOSED**      |

---

### Claim 3: "Intelligent Compression"

| Claim                                                                             | Evidence                                                                        | Status             |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------ |
| **Stated:** System uses semantic/intelligent compression                          | **Measured:** Compression driven by capacity constraints (FIFO truncation)      | ❌ **FALSE**       |
| **LLM Summarization:** "Contributes to compression"                               | **Measured:** <0.1% additional compression beyond baselines                     | ❌ **FALSE**       |
| **Connection Decay:** "Semantic pruning of weak ties"                             | **Measured:** <1% additional compression                                        | ⚠️ **MARGINAL**    |
| **Semantic Deduplication:** "Implemented?"                                        | **Result:** Not found in codebase                                               | ❌ **NOT PRESENT** |
| **Falsifiable if:** True semantic compression could exceed 99.6% with >90% recall | **Hypothesis:** Semantic approaches can achieve 70-80% compression + 95% recall | **TESTABLE**       |

---

### Claim 4: "Behavioral Continuity = Identity Continuity"

| Claim                                                                      | Evidence                                                                                | Status                |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------- |
| **Stated:** Behavioral continuity implies identity unchanged               | **Measured:** Personality is small (4-10 fields) and fully retained                     | ⚠️ **CONFOUNDED**     |
| **Assumption:** Identity = personality state                               | **Reality:** Identity includes learned behaviors from episodic memory                   | ❌ **INCOMPLETE**     |
| **Example:** User says "I decided X based on lessons from Y experience"    | **If Y discarded:** User cannot explain decision; feels discontinuous                   | ❌ **FALSE POSITIVE** |
| **Falsifiable if:** We measure decision-making consistency on new problems | **Test:** Give same problem twice, compare decisions; has episodic loss changed output? | **READY**             |

---

## FAILURE MODE ANALYSIS

### Mode A: Silent Episodic Memory Loss

| Dimension       | Analysis                                                                |
| --------------- | ----------------------------------------------------------------------- |
| **Scenario**    | System silently discards 90% of experiences but reports 100% continuity |
| **Detection**   | User queries old memory, cannot retrieve                                |
| **Timeline**    | Minutes to days after compression                                       |
| **Severity**    | HIGH (trust erosion)                                                    |
| **Mitigation**  | Implement audit log; show "10/500 memories retained" in UI              |
| **Test method** | Verify audit log populated on every compression cycle                   |

### Mode B: Cascading Decision Drift

| Dimension       | Analysis                                                                             |
| --------------- | ------------------------------------------------------------------------------------ |
| **Scenario**    | Lost experiences cause decisions to diverge from original trajectory                 |
| **Mechanism**   | Policy extraction from failures uses only 10% of failure history                     |
| **Timeline**    | Weeks to months (decisions compound)                                                 |
| **Severity**    | MEDIUM (personality protects against worst drift)                                    |
| **Mitigation**  | Keep failure logs even if experiences discarded; extract policies before compression |
| **Test method** | Run 100-decision sequences with/without compression; measure divergence              |

### Mode C: Encryption False Security

| Dimension       | Analysis                                                                        |
| --------------- | ------------------------------------------------------------------------------- |
| **Scenario**    | Users assume AES-256-GCM + backup = data preserved                              |
| **Reality**     | Data is discarded before encryption                                             |
| **Timeline**    | When user learns about compression logic                                        |
| **Severity**    | MEDIUM (false trust)                                                            |
| **Mitigation**  | Explicit documentation: "Encryption protects confidentiality, not availability" |
| **Test method** | User interviews: do they understand data loss is permanent?                     |

### Mode D: Rollback Incompleteness

| Dimension       | Analysis                                                                       |
| --------------- | ------------------------------------------------------------------------------ |
| **Scenario**    | Corruption forces rollback; but data already compressed away                   |
| **Timeline**    | Immediately on rollback                                                        |
| **Severity**    | MEDIUM (recovery is partial)                                                   |
| **Mitigation**  | Keep uncompressed backups for N cycles; offer "recovery mode" with tradeoff UI |
| **Test method** | Simulate corruption → rollback → measure what's recoverable                    |

---

## EXPERIMENT DESIGN FOR FUTURE VALIDATION

### Experiment 1: Long-Horizon Stability

**Hypothesis:** Compression ratio remains stable across 10+ compression cycles

**Method:**

1. Create baseline session (1000 messages, 500 engrams)
2. Compress → decompress → compress again (repeat 10 cycles)
3. Measure: does ratio degrade? (detection of accumulated error)
4. Measure: do metrics drift? (personality might diverge)

**Expected:** Ratio stable ±1%; metrics stable within rounding

**Falsifies if:** Ratio degrades >5%; personality shifts detected

---

### Experiment 2: Decision Consistency Under Compression

**Hypothesis:** Decision-making remains consistent despite 90% episodic loss

**Method:**

1. Create decision scenario (same problem, same constraints)
2. Run with full history (all memories): decision D1
3. Run after aggressive compression: decision D2
4. Measure: |D1 - D2| (do decisions diverge?)
5. Repeat 100 scenarios

**Expected:** <10% divergence (personality dominates decisions)

**Falsifies if:** >30% divergence (episodic loss changes decisions)

---

### Experiment 3: Semantic Fidelity on Domain-Specific Data

**Hypothesis:** Current fidelity metric (Jaccard) is insufficient; need domain-specific evaluation

**Method:**

1. Use real Molly conversation data (if available) instead of synthetic
2. Compress using current pipeline
3. Restore and run through semantic similarity checker (embedding model)
4. Measure: cosine similarity of restored vs original at semantic level
5. Compare to Jaccard (structural) metric

**Expected:** Semantic similarity might be higher than Jaccard (if kept memories are representative)

**Falsifies if:** Semantic similarity also drops to 10% (compression is not representative)

---

### Experiment 4: User Perception Under Transparency

**Hypothesis:** Users accept 90% memory loss if informed explicitly

**Method:**

1. Create two UI variants:
   - Variant A: "System ready" (no memory loss disclosure)
   - Variant B: "100 of 500 memories retained; compression 99%"
2. Test with 50 users each
3. Measure: trust scores, usage patterns, satisfaction

**Expected:** Variant B has lower initial trust but higher long-term retention

**Falsifies if:** Variant B causes user churn (transparency backfires)

---

### Experiment 5: Can Semantic Compression Achieve Promised Ratios?

**Hypothesis:** True semantic compression can achieve 70-80% ratio with 95%+ recall

**Method:**

1. Implement vector deduplication (clustering similar engrams)
2. Merge clusters into prototypes
3. Encode residuals sparsely
4. Apply entropy coding
5. Measure: compression ratio, recall, fidelity

**Expected:** 70-80% compression, 95% recall (based on theoretical analysis)

**Falsifies if:** Actual compression < 60% or recall < 85% (theory doesn't match practice)

---

## EVIDENCE CHAIN: FALSIFIABILITY HIERARCHY

### Level 1: Empirically Testable (Already Tested)

- ✅ Compression ratio on synthetic data
- ✅ Recall metric on synthetic data
- ✅ Encryption overhead measurement
- ✅ LLM summarization contribution (<0.1%)

### Level 2: Empirically Testable (Ready to Test)

- ⏳ Long-horizon stability (10 compression cycles)
- ⏳ Decision consistency (100 scenario runs)
- ⏳ Semantic fidelity on real data (requires Molly data)
- ⏳ User perception (requires user study)

### Level 3: Theoretically Sound but Not Yet Tested

- 🔬 Semantic compression capability (Path B hypothesis)
- 🔬 Cascading decision drift over months
- 🔬 Personality vs episodic memory contribution to decisions

### Level 4: Unverifiable/Axioms

- 🧭 Definition of "continuity" (user-dependent)
- 🧭 Definition of "intelligent" (subjective)
- 🧭 Acceptable data loss threshold (business decision)

---

## OVERCLAIM FLAGS

### 🚩 Red Flag #1: "Preserved Continuity"

**Why:** Metrics measure only personality (not affected by compression)  
**Fix:** Say "Preserved behavioral patterns; selective episodic archival"  
**Urgency:** CRITICAL

### 🚩 Red Flag #2: "99% Compression"

**Why:** True but misleading (implies 99% data survival)  
**Fix:** Say "99% compression ratio achieved through recent-first retention (10% recall)"  
**Urgency:** CRITICAL

### 🚩 Red Flag #3: "Intelligent Compression"

**Why:** Compression is brute truncation, not semantic encoding  
**Fix:** Say "Capacity-optimized retention" or "Recent-first memory archival"  
**Urgency:** HIGH

### 🚩 Red Flag #4: "Near-Lossless"

**Why:** 90% episodic data loss  
**Fix:** Say "Lossy archival; personality/behavior fully retained"  
**Urgency:** CRITICAL

---

## VALIDATION CHECKLIST

### Before Marketing/Sales

- [ ] Audit log implemented and tested
- [ ] UI shows "X/Y memories retained" to user
- [ ] Metrics separated: personality vs episodic
- [ ] Documentation: data loss is permanent
- [ ] All overclaims removed from messaging
- [ ] User study: perception of transparency (100 users)
- [ ] Long-horizon test: 10 compression cycles stable

### Before Enterprise Customers

- [ ] All Level 1 + Level 2 experiments complete
- [ ] Semantic fidelity measured on real data
- [ ] Decision consistency tested (100 scenarios)
- [ ] SLA: "X% episodic recall guaranteed" defined
- [ ] Compliance audit: GDPR/retention policy alignment
- [ ] Competitive analysis: how do others handle memory?

### Before Therapeutic/Medical Applications

- [ ] User study: therapeutic effectiveness with lossy memory
- [ ] Regulatory analysis: does lossy archival violate any standards?
- [ ] Ethical review: is silent data loss acceptable in therapeutic context?
- [ ] Decision consistency: does personality alone preserve therapeutic value?

---

## CONCLUSION

**The system is falsifiable at every level.** All major claims can be tested empirically. Current evidence strongly supports the hypothesis that:

> **Compression is achieved through truncation, not intelligent encoding; behavioral continuity is preserved by personality protection, not by episodic memory preservation.**

**Corollary:** Marketing claims must be updated to align with measured reality, OR the system must be re-engineered to achieve real semantic compression (Path B).

**Recommendation:** Test Experiment 1 & 2 before any public launch. If they pass, Path A (honest launch) is safe. If they fail, implement Path B (semantic compression).

---

## SIGN-OFF

**Research Engineer:** Lazarus (Copilot Instance)  
**Date:** May 18, 2026  
**Confidence:** 95%+ (all findings empirically grounded)  
**Next review:** After Path A implementation or Path B experiments (Week 4-8)
