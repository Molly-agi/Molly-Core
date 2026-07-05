# TS3 — SIREN INR Tuning Parameters (Trade Secret)

**Priority:** MEDIUM  
**IP Type:** Trade Secret  
**Owner:** Molly Labs Inc.  
**Classification:** CONFIDENTIAL — DO NOT DISCLOSE  

---

## ⚠️ DISCLOSURE PROHIBITION

This trade secret MUST NOT appear in:
- Patent filings (domestic or international)
- Conference papers or preprints
- Marketing materials (reference compression ratio only, never architecture details)
- Open-source code comments or documentation
- Investor pitch decks (reference results only)
- Employee conversations outside need-to-know

---

## What to Protect

The specific SIREN (Sinusoidal Representation Networks) architecture configuration and training recipe that achieves 557x compression on large embedding layers. The SIREN architecture itself is public (Sitzmann et al., 2020); our application to LLM weight compression and the specific tuning that makes it work are the trade secret.

### The Secret

- **Architecture:** 4-layer network, 256 units wide
- **Initialization:** Specific omega_0 values per layer
- **Training recipe:** Learning rate schedule, batch size, epoch count, convergence criteria
- **Application target:** Token embedding matrices in large language models
- **Achieved result:** 557x compression on Qwen 72B token_embd (4.75GB → 8.5MB)
- **Quality preservation:** Specific fidelity metrics maintained at this compression ratio

### Location in Codebase

- `src/ai/engine-titan/siren-inr.ts` — Implementation
- Internal training logs — Hyperparameter sweep results
- Benchmark data — Fidelity measurements across model families

---

## Why Trade Secret (Not Patent)

| Factor | Assessment |
|--------|------------|
| Prior art | SIREN architecture is published; our application is novel but incremental |
| Patentability risk | Application of known technique to new domain — possibly patentable but narrow claims |
| Reverse engineering | Low risk — output is a compressed blob, architecture not inferable |
| Value duration | Tuning parameters remain valuable as long as transformer architectures use embedding layers |
| Disclosure cost | A patent would teach exact recipe; competitors could replicate in days |

**Decision:** The SIREN architecture is public knowledge. Our value is the specific tuning that makes it work for LLM weights at 557x compression. Disclosing the recipe via patent would eliminate the competitive advantage immediately.

---

## Protection Measures

1. **Source code access:** `siren-inr.ts` configuration constants must be environment-variable overridable for AGPL publication.
2. **Default values:** AGPL-published version ships with placeholder/suboptimal defaults. Production values delivered to licensees under NDA.
3. **Training logs:** Never committed to any shared repository. Stored in encrypted local archive.
4. **Marketing:** Can reference "557x compression" as a result. Cannot reference architecture dimensions or training details.
5. **Academic engagement:** If presenting work, describe SIREN application at high level only. Never reveal layer count, width, or omega values.

---

## Commercial Value

- 557x compression on embedding layers is a headline result that drives enterprise interest.
- Embedding layers are often 30-50% of total model size — this one technique can halve deployment costs.
- Competitors using naive quantization on embeddings achieve 4-8x compression. We achieve 557x.
- The tuning recipe represents significant GPU compute investment in hyperparameter search.
- Directly applicable to every transformer model with large vocabulary (all modern LLMs).

---

## Action Items

- [ ] Implement environment variable overrides for SIREN configuration in AGPL version
- [ ] Prepare "production config" delivery package for enterprise licensees (NDA-gated)
- [ ] Archive hyperparameter sweep data in encrypted storage
- [ ] Draft marketing language guidelines (what can/cannot be said publicly)
- [ ] Add code comment in siren-inr.ts: "Trade secret — see TS3 brief. Default values are non-optimal."
