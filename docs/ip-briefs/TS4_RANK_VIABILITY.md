# TS4 — Per-Layer Rank Viability Data (Trade Secret)

**Priority:** HIGH  
**IP Type:** Trade Secret  
**Owner:** Molly Labs Inc.  
**Classification:** CONFIDENTIAL — DO NOT DISCLOSE  

---

## ⚠️ DISCLOSURE PROHIBITION

This trade secret MUST NOT appear in:
- Patent filings (domestic or international)
- Conference papers or preprints (publish methodology without specific rank values)
- Marketing materials, blog posts, or demos
- Open-source code comments or documentation
- Investor pitch decks (reference "empirically calibrated routing" only)
- Employee conversations outside need-to-know

---

## What to Protect

The empirical measurement data showing which SVD rank values produce acceptable fidelity for which transformer layer types. This calibration data is what makes the P-3 routing system commercially defensible — it's the difference between a generic "try different ranks" approach and a system that knows exactly what rank to assign each layer.

### The Secret

- **Per-layer-type rank mappings:** attention_q, attention_k, attention_v, attention_o, feed_forward_gate, feed_forward_up, feed_forward_down, token_embd, output_norm — each with empirically validated rank ranges
- **Model-specific calibration:** Different rank curves for different model families (TinyLlama 1.1B, Qwen 72B, and extrapolation rules for untested models)
- **Quality-vs-compression tradeoff curves:** Exact inflection points where quality degrades unacceptably
- **Benchmark source data:** Raw measurements from T002 and T007 benchmark campaigns

### Locations in Codebase

- Routing configuration in P-3 pipeline
- Benchmark result archives (T002, T007)
- Internal calibration spreadsheets / data files
- `src/ai/engine-titan/` — routing decision logic that consumes this data

---

## Why Trade Secret (Not Patent)

| Factor | Assessment |
|--------|------------|
| Discovery cost | Weeks of GPU compute per model family benchmarked |
| Reverse engineering | Impossible from compressed output — rank choices not observable |
| Independent discovery | Possible but expensive — each competitor must burn their own compute |
| Patent value | Data is not patentable (facts/measurements); the routing algorithm using it might be (covered by P-3 patent filing) |
| Competitive moat | This data IS the moat — without it, the routing algorithm is just a framework |

**Decision:** Empirical data cannot be patented. The routing algorithm that uses this data is separately covered (P-3 patent). The data itself must remain secret — it's what makes P-3 work well rather than just work.

---

## Protection Measures

1. **Data storage:** Calibration data in encrypted archive, access-logged. Never in git.
2. **Code separation:** Routing algorithm (patentable, publishable) is separate from calibration data (secret). The algorithm references configuration that is loaded at runtime, not hardcoded.
3. **AGPL version:** Ships with conservative/generic rank defaults. Production-quality calibration delivered to enterprise licensees under NDA.
4. **Benchmark reports:** Can publish "achieves X% compression at Y quality" without revealing which ranks produced that result for which layers.
5. **New model calibration:** Each new model family we calibrate increases the moat. Treat calibration runs as R&D investment.

---

## Commercial Value

- Transforms P-3 from "a routing framework" into "a system that actually works well" — the data is the product.
- Each model family calibrated represents $10K-50K equivalent GPU compute cost to replicate.
- Enterprise customers pay for calibration data as much as for the algorithm — it's pre-computed R&D.
- Expanding calibration to new model families (Llama 3, Mistral, etc.) increases value linearly.
- This data drives the quality guarantees in F4 acceptance protocol (TS2) — the two trade secrets reinforce each other.

---

## Action Items

- [ ] Audit codebase for any hardcoded rank values (move to runtime config)
- [ ] Encrypt and archive T002/T007 benchmark raw data
- [ ] Implement config-loading pattern: algorithm reads calibration from external file, not source
- [ ] Draft calibration data delivery agreement for enterprise licensees
- [ ] Plan next calibration campaigns (Llama 3, Mistral, Phi) to expand the moat
- [ ] Add code comment in routing logic: "Calibration data is trade secret — see TS4 brief"
