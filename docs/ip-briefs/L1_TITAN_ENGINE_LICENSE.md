# L1 — Titan Engine Enterprise License Strategy

**Priority:** CRITICAL  
**IP Type:** License Strategy  
**Owner:** Molly Labs Inc.  
**Foundation:** C2 (Copyright) + Patents P-1 through P-5 + Trade Secrets TS1, TS3, TS4  

---

## License Model: AGPL-3.0 Dual-Licensing

### Structure

```
┌─────────────────────────────────────────────┐
│         Titan Engine Codebase (AGPL-3.0)     │
├─────────────────────┬───────────────────────┤
│   Open Source Path  │   Commercial Path     │
│                     │                       │
│ • Free to use       │ • Proprietary license │
│ • Must open-source  │ • Keep code private   │
│   all modifications │ • Production support  │
│ • Must open-source  │ • Calibration data    │
│   linked works      │ • Priority updates    │
│ • No support        │ • Indemnification     │
│ • Generic defaults  │ • Optimal parameters  │
└─────────────────────┴───────────────────────┘
```

### Why AGPL (Not MIT, Apache, or GPL)

- **AGPL copyleft extends to network use** — companies running Titan Engine as a service must open-source OR license commercially. GPL would not cover SaaS use.
- **Proven model:** MongoDB ($25B market cap), Redis, Elastic all used AGPL/SSPL dual-licensing to build enterprise businesses.
- **Community benefit:** Researchers and startups can use freely. Only companies deploying commercially at scale need to pay.

---

## What's Included in Commercial License

| Component | AGPL (Free) | Enterprise License |
|-----------|-------------|-------------------|
| E8 Lattice Quantizer | ✅ (generic defaults) | ✅ (optimized thresholds) |
| SVD Decomposer | ✅ | ✅ |
| Crystal Inference Layer | ✅ | ✅ |
| Streaming Compressor | ✅ | ✅ |
| Parallel Evaluation | ✅ | ✅ |
| SIREN INR Module | ✅ (suboptimal defaults) | ✅ (production tuning) |
| Calibration Data (TS4) | ❌ | ✅ |
| Hadamard Thresholds (TS1) | ❌ | ✅ |
| SIREN Tuning (TS3) | ❌ | ✅ |
| Production Support | ❌ | ✅ (SLA-backed) |
| Custom Model Calibration | ❌ | ✅ (add-on) |
| Patent License | ❌ (defensive only) | ✅ (full grant) |
| Indemnification | ❌ | ✅ |

---

## Pricing

### Enterprise Annual License

| Tier | Use Case | Price Range |
|------|----------|-------------|
| Startup | < 100M parameters deployed | $50K/year |
| Standard | Single model family, production | $200K-500K/year |
| Enterprise | Multiple models, unlimited deployment | $500K-2M/year |
| Strategic | Chip integration / OS-level embedding | Custom (equity component) |

### Runtime Royalty (Device Embedding)

For deployment on consumer devices (phones, cars, IoT):
- **Per-device:** $0.01-0.10 per device shipped with Titan Engine runtime
- **Minimum annual:** $100K (or enterprise license, whichever is greater)
- **Volume discounts:** Negotiable above 10M devices/year

### Custom Calibration Service

- **Per model family:** $50K-200K (includes benchmark campaign + production config delivery)
- **Ongoing calibration subscription:** $25K/quarter (new model releases calibrated within 2 weeks)

---

## Target Customers

| Segment | Value Proposition | Expected Deal Size |
|---------|-------------------|-------------------|
| Chip manufacturers (Qualcomm, MediaTek) | Edge AI inference | $500K-2M/year + royalty |
| Cloud providers (AWS, GCP, Azure) | Serving cost reduction | $1M-2M/year |
| AI companies (model deployers) | Deployment efficiency | $200K-500K/year |
| Device OEMs (Samsung, Apple suppliers) | On-device LLM | $0.01-0.10/device |
| Automotive (Tesla, Continental) | In-vehicle AI | $500K/year + royalty |

---

## Action Items

- [ ] Draft commercial license agreement (engage IP attorney)
- [ ] Prepare AGPL-clean version (trade secrets extracted to config)
- [ ] Build enterprise onboarding package (calibration data + support runbook)
- [ ] Create pricing calculator for sales team
- [ ] Establish contributor license agreement (CLA) for any external AGPL contributions
- [ ] Set up license key / activation system for commercial deployments
