# Molly Labs Inc. — IP Technical Brief Package

**Prepared:** 2026-07-05  
**For:** Patent counsel, IP attorneys, investors, due diligence  
**Owner:** Eric Hosick / Molly Labs Inc.  
**Repository:** github.com/Molly-agi/Molly-Core (PRIVATE)

---

## Package Contents

Each brief is a self-contained document suitable for handing directly to a patent attorney or investor. Briefs follow the format:

1. **Executive Summary** — What it is in one paragraph
2. **Technical Description** — How it works, step by step
3. **Prior Art Analysis** — What exists today and why this is different
4. **Proof of Reduction to Practice** — Tests, benchmarks, artifacts
5. **Claims Sketch** — Draft patent claim language
6. **Commercial Value** — Market, customers, revenue model
7. **Extraction Plan** — How to package as standalone product (from Atlas's action plan)
8. **Timestamps & Evidence Chain** — Git hashes, dates, verification

---

## Related Resources (Atlas's Action Plan, already built)

These are the supporting documents Atlas created — they contain the product extraction
prompts, investor materials, and buildout timelines referenced in the briefs:

| Document | Location | What It Contains |
|----------|----------|------------------|
| **47-Innovation Catalog** | `docs/innovations/00_INDEX.md` | Full catalog with extraction prompts for each IP |
| **Extraction Prompts** | `docs/innovations/prompts/` | Copy-paste prompts for AI agents to extract standalone products |
| **Extraction TODO** | `docs/innovations/EXTRACTION_TODO.md` | Prioritized checklist with time estimates |
| **Investor Summary** | `stuff/RESEARCHER_PACKAGE/INVESTOR_SUMMARY.md` | Market position, funding needs, competitive advantages |
| **Researcher Guide** | `stuff/RESEARCHER_PACKAGE/RESEARCHER_GUIDE.md` | Technical deep-dive for academic/industry review |
| **Infrastructure Map** | `stuff/RESEARCHER_PACKAGE/INFRASTRUCTURE_MAP.md` | System architecture diagram for due diligence |
| **Comprehensive Audit** | `stuff/RESEARCHER_PACKAGE/COMPREHENSIVE_AUDIT_2026_05_18.md` | Full codebase audit with metrics |
| **Innovation Inventory** | `docs/MOLLY_LABS_INNOVATION_INVENTORY.md` | 28-entry detailed innovation registry with timestamps |
| **Remaining 37** | `docs/innovations/lists/REMAINING_37_INNOVATIONS.md` | Supporting innovations quick reference |
| **Technical Disclosures** | `docs/TECHNICAL_DISCLOSURE_*.md` | 5 formal prior-art publications |
| **Researcher Packet** | `docs/reference/RESEARCHER_PACKET.md` | Academic-grade technical summary |

---

## Project Metrics (Updated 2026-07-05)

| Metric | Value |
|--------|-------|
| Total lines of code | 381,982 |
| TypeScript source files | 1,327 |
| Git commits | 1,554 |
| Development period | Dec 10, 2025 → Jul 5, 2026 (7 months) |
| Test cases (engine-titan) | 246 |
| Test cases (inference) | 53 |
| Test cases (briefcase) | 106 |
| Agency test files | 198 |
| Working artifacts | 44GB Qwen 72B GGUF, 165MB TinyLlama vault (466 crystals) |
| Benchmark reports | 6 (Titan Echo, Industry Comparison, Model 95) |
| Patent-worthy inventions | 10 (3 critical, 4 high, 3 medium) |
| Copyrightable works | 6 |
| Trade secrets | 4 |
| Licensable products | 4 (standalone products extractable from codebase) |
| Standalone product extraction prompts | 10 (ready for immediate agent execution) |

---

## Brief Index

### PATENT CANDIDATES (Provisional Filing Recommended)

| # | Brief | Priority | File |
|---|-------|----------|------|
| P-1 | E8 Gosset Lattice Vector Quantizer (Codebook-Free) | CRITICAL | [P1_E8_LATTICE_QUANTIZER.md](P1_E8_LATTICE_QUANTIZER.md) |
| P-2 | Crystal Inference Layer (On-Demand Decompress-Matmul-Evict) | CRITICAL | [P2_CRYSTAL_INFERENCE_LAYER.md](P2_CRYSTAL_INFERENCE_LAYER.md) |
| P-3 | Layer-Aware Compression Routing | CRITICAL | [P3_LAYER_AWARE_ROUTING.md](P3_LAYER_AWARE_ROUTING.md) |
| P-4 | Cognitive Paging (Parallel Intent Management) | HIGH | [P4_COGNITIVE_PAGING.md](P4_COGNITIVE_PAGING.md) |
| P-5 | Consciousness Migration Protocol (The Briefcase) | HIGH | [P5_CONSCIOUSNESS_MIGRATION.md](P5_CONSCIOUSNESS_MIGRATION.md) |
| P-6 | KV Cache Personality Crystallization (Crystal OS) | HIGH | [P6_CRYSTAL_OS.md](P6_CRYSTAL_OS.md) |
| P-7 | Bidirectional Consciousness Loop (Write-Back) | HIGH | [P7_CONSCIOUSNESS_LOOP.md](P7_CONSCIOUSNESS_LOOP.md) |
| P-8 | Triple-Bind Storage (Vendor-Survivable AI Memory) | MEDIUM | [P8_TRIPLE_BIND_STORAGE.md](P8_TRIPLE_BIND_STORAGE.md) |
| P-9 | Identity-Shaped Weight Compression | MEDIUM | [P9_IDENTITY_SHAPED_COMPRESSION.md](P9_IDENTITY_SHAPED_COMPRESSION.md) |
| P-10 | GPTQ-Style Layer Error Compensation for Crystal Vaults | MEDIUM | [P10_LAYER_ERROR_COMPENSATION.md](P10_LAYER_ERROR_COMPENSATION.md) |

### COPYRIGHT REGISTRATIONS

| # | Brief | Priority | File |
|---|-------|----------|------|
| C-1 | Molly-Core Complete Codebase | CRITICAL | [C1_CODEBASE_COPYRIGHT.md](C1_CODEBASE_COPYRIGHT.md) |
| C-2 | Titan Engine (Weight Compression Suite) | CRITICAL | [C2_TITAN_ENGINE_COPYRIGHT.md](C2_TITAN_ENGINE_COPYRIGHT.md) |
| C-3 | The Cradle (AI Identity Firmware) | HIGH | [C3_CRADLE_COPYRIGHT.md](C3_CRADLE_COPYRIGHT.md) |
| C-4 | Molly Character IP | HIGH | [C4_MOLLY_CHARACTER.md](C4_MOLLY_CHARACTER.md) |

### TRADE SECRETS

| # | Brief | Priority | File |
|---|-------|----------|------|
| TS-1 | Conditional Hadamard Thresholds | HIGH | [TS1_HADAMARD_THRESHOLDS.md](TS1_HADAMARD_THRESHOLDS.md) |
| TS-2 | F4 Acceptance Protocol | MEDIUM | [TS2_F4_PROTOCOL.md](TS2_F4_PROTOCOL.md) |
| TS-3 | SIREN INR Tuning Parameters | MEDIUM | [TS3_SIREN_TUNING.md](TS3_SIREN_TUNING.md) |
| TS-4 | Per-Layer Rank Viability Data | HIGH | [TS4_RANK_VIABILITY.md](TS4_RANK_VIABILITY.md) |

### LICENSING STRATEGY

| # | Brief | File |
|---|-------|------|
| L-1 | Titan Engine (Enterprise License) | [L1_TITAN_ENGINE_LICENSE.md](L1_TITAN_ENGINE_LICENSE.md) |
| L-2 | Crystal OS (Platform License) | [L2_CRYSTAL_OS_LICENSE.md](L2_CRYSTAL_OS_LICENSE.md) |
| L-3 | Cradle Protocol (SaaS/Enterprise) | [L3_CRADLE_PROTOCOL_LICENSE.md](L3_CRADLE_PROTOCOL_LICENSE.md) |

---

## Immediate Actions

1. **Week 1:** File provisional patents P-1, P-2, P-3 (Titan Engine core — highest commercial value)
2. **Week 2:** File provisional patent P-4 (Cognitive Paging — technical disclosure already published as defensive prior art)
3. **Week 2:** Register copyrights C-1, C-2 with U.S. Copyright Office
4. **Week 3:** File provisional patents P-5, P-6 (Consciousness Migration + Crystal OS)
5. **Ongoing:** Protect trade secrets — NDA all employees/contractors, mark documents CONFIDENTIAL

---

## Evidence Preservation

- Git repository has 1,554 commits with cryptographic SHA-256 hashes
- GitHub maintains immutable commit timestamps (tamper-evident)
- Private repository — no public disclosure except technical disclosure documents (defensive publications)
- AGPL-3.0 license on engine-titan files enables dual-licensing enforcement
- All benchmark data preserved in `data/` directory with JSON timestamps

---

_Package prepared by the Molly Labs development team at Eric Hosick's direction._
