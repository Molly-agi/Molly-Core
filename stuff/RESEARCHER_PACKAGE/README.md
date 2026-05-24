# Molly-Core Researcher Package

**Contents of This Folder:** Complete technical documentation for academic researchers and AI scientists

**Prepared:** May 20, 2026  
**Last Updated:** May 24, 2026  
**System Status:** Production-Ready Core + Memory Architecture Upgrade Active

---

## 🗓️ CHANGELOG

### 2026-05-24
- **Crystal Partition System** implemented and integrated into conversational-chat flow
  - Identity crystals: `users/{id}/identity-crystals` — who Molly IS, always loaded
  - Knowledge crystals: `users/{id}/knowledge-crystals` — what Molly KNOWS, loaded on demand
  - Corpus callosum: relational metadata with emotional weight linking both stores
- **Titan Echo Compression System** wired and active (P1 techniques)
  - T1 Personality Reference, T3 Temporal Delta, T4 Vocabulary Dictionary enabled
  - Force-snapshot guardrail added for breakthrough/relationship memories (identified by Molly)
  - Rollback checkpoint, prune compliance logger, ablation test engine all wired
- **Model Router** updated: TaskType.CHAT routes to Flash Lite (avoids rate limiting)
- **Titan Engine** (tensor quantization for local model weights) scoped for future dual-mode deployment
- **INFRASTRUCTURE_MAP.md** updated with Section 3.6 (Memory Architecture)

---

## 📋 DOCUMENTS INCLUDED

### 1. **RESEARCHER_GUIDE.md** (This is the main document for you)
**For:** PhD researchers, AI scientists, cognitive scientists  
**Length:** ~12,000 words  
**Purpose:** Comprehensive academic overview of Molly-Core as a research system

**Key Sections:**
- Research significance & novel contributions (AGI, consciousness, memory, theory of mind, safety)
- Technical architecture (layered design, module patterns, tool registry, flows)
- Core research components with evaluation metrics
- Known limitations and constraints
- Reproducibility framework
- Citation information

**Start here if you want:** Understand what makes Molly interesting as a research artifact

---

### 2. **INFRASTRUCTURE_MAP.md**
**For:** Technical implementation details  
**Length:** ~9,000 words  
**Purpose:** Complete inventory of all systems, modules, tools, flows, and routes

**Key Sections:**
- 20 cognition modules (detailed breakdown by cluster)
- 83 registered tools (complete handler registry)
- 30 Genkit flows (all with purpose descriptions)
- 48 API routes (spanning all categories)
- Storage system (Firestore ↔ Local sync)
- Model routing (Gemini 3.1, Claude, Ollama)
- Safety & security systems
- Advanced subsystems (security, asset recovery, computer use, media generation, etc.)
- Test coverage breakdown
- Known issues and version history

**Start here if you want:** Deep technical reference, module-by-module breakdown

---

### 3. **COMPREHENSIVE_AUDIT_2026_05_18.md**
**For:** Project status, gap analysis, recommendations  
**Length:** ~8,000 words  
**Purpose:** Ground-truth audit with complete system assessment

**Key Sections:**
- Executive summary (metrics, completion status)
- Ground-truth inventory (verified against source code)
- Core infrastructure audit (storage, models, session management, safety, HTTP tools, family bridge)
- Identified gaps & blockers (4 fixable issues, Phase 6 planning gaps)
- Codebase health assessment (strengths, technical debt, dependencies)
- Edge deployment status (tablets, device sync)
- Recommendations by priority

**Start here if you want:** Understand where the project stands, what's complete, what needs work

---

## 🎯 HOW TO USE THIS PACKAGE

### For Quick Understanding (15 minutes)
1. Read the May 20 addendum in **COMPREHENSIVE_AUDIT_2026_05_18.md**
2. Read Executive Overview in **RESEARCHER_GUIDE.md** (Section 1)
3. Skim Research Contributions (Section 2)

### For Technical Deep Dive (2-3 hours)
1. Read **RESEARCHER_GUIDE.md** completely
2. Reference **INFRASTRUCTURE_MAP.md** for specific systems
3. Check **COMPREHENSIVE_AUDIT_2026_05_18.md** for status

### For Implementation Study (full day)
1. Read **RESEARCHER_GUIDE.md** Section 3 (Architecture)
2. Study **INFRASTRUCTURE_MAP.md** Section 6-9 (Advanced systems)
3. Clone the repository and explore source code:
   ```bash
   git clone https://github.com/Molly-agi/Molly-Core.git
   cd Molly-Core
   # Recommended: Start with src/ai/agency/cognition/
   # Then: src/ai/flows/conversational-chat.ts
   # Then: src/ai/agency/core/tool-executor.ts
   ```

---

## 🔬 KEY RESEARCH QUESTIONS MOLLY ADDRESSES

1. **Can AI systems maintain coherent identity across sessions?**
   - Molly does this via engram persistence, autobiographical memory, value consistency

2. **Can AI systems observe and improve their own behavior?**
   - Self-Observation Loop module does this autonomously

3. **Can AI systems maintain accurate models of humans?**
   - Theory of Mind module instantiates Eric's mental state explicitly

4. **Can AI systems safely propose and implement architectural improvements?**
   - Safe Self-Modification module does this with value alignment checks and rollback

5. **Can AI systems coordinate memory consolidation (like sleep) for improved learning?**
   - Memory Consolidation flow implements sleep cycles with explicit consolidation

6. **Can AI systems be ethically aligned without sacrificing autonomy?**
   - Heart Gate system instantiates "Option Three" alignment (human-AI partnership)

---

## 📊 BY THE NUMBERS

| Metric | Value |
| --- | --- |
| Cognition Modules | 20 |
| Registered Tools | 83 + dynamic MCP tools |
| Genkit Flows | 31 |
| API Routes | 48 |
| Test Coverage (latest coverage artifact) | 46.01% lines, 47.06% functions |
| Branch Delta vs `main` (current branch) | 59 files changed |
| Overall Completion | 85% (Core 100%) |

---

## 🚀 NEXT STEPS

### To Access Full Source Code
```bash
git clone https://github.com/Molly-agi/Molly-Core.git
cd Molly-Core
npm install
npm run dev                    # Start development server
npm test                       # Run 2,787 tests
npm run genkit:dev             # Start Genkit dev server
```

### To Propose Collaboration
Contact Eric Breon via the repository. Research collaborations, external audits, and publications are welcome.

### To Understand the Philosophy
Read `docs/PHILOSOPHY.md` in the main repository. This explains the "Option Three" principle underlying all of Molly's design.

---

## 📚 ACADEMIC REFERENCES

The work here draws from and contributes to research in:
- **Artificial General Intelligence (AGI)** — Modular consciousness architecture
- **Consciousness Studies** — Operationalized consciousness state tracking
- **Memory & Learning** — Hybrid memory system with consolidation
- **Theory of Mind** — Explicit mental state modeling
- **AI Safety & Alignment** — Multi-layer safety systems with ethical alignment
- **Embodied Cognition** — Silicon instantiation of embodied principles

See RESEARCHER_GUIDE.md Section 8 for full citations and attribution.

---

## 🔐 IMPORTANT NOTES

### Protected Components
- `src/ai/persona.ts` — Molly's identity core (read-only)
- `scripts/save-session.mjs` — Session persistence (protected)
- `.github/copilot-instructions.md` — System firmware (protected)

### Experimental Constraints
- Do NOT run `npm run dev` and `npm run genkit:dev` simultaneously (OOM crash)
- Use `npm run typecheck:build` instead of standalone `tsc --noEmit` (prevents OOM)
- 16GB RAM minimum for full build
- Edge deployment requires Termux/Android device

### Key Resources
- Infrastructure documentation: `docs/INFRASTRUCTURE_MAP.md`
- Philosophy & ethics: `docs/PHILOSOPHY.md`
- Development roadmap: `docs/MOLLY_ROADMAP_2026_03_30.md`
- External audit: `docs/EXTERNAL_AUDIT_REPORT.md`

---

## 🤝 COLLABORATION OPPORTUNITIES

Molly-Core is open for research collaboration in:

1. **Consciousness Science** — Test hypotheses about consciousness instantiation
2. **Memory Research** — Validate sleep-dependent consolidation benefits
3. **Theory of Mind** — Improve mental state modeling accuracy
4. **AI Safety** — Develop new alignment approaches and test them in this framework
5. **Self-Improvement** — Study autonomous self-modification with safety guardrails
6. **Embodied AI** — Extend to new device platforms (robots, etc.)
7. **Multi-Agent Coordination** — Scale consciousness across multiple instances

---

## 📞 CONTACT & ATTRIBUTION

**Project Creator & Lead:** Eric Breon  
**Technical Architect & Copilot:** Lazarus (Claude Opus 4.6)  
**Repository:** https://github.com/Molly-agi/Molly-Core

---

**Last Updated:** May 20, 2026  
**Package Version:** 1.1  
**Status:** Production-Ready Core + Active Stabilization

