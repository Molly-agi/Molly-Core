# Molly-Core Master TODO Lists

**Created:** 2026-03-30
**Author:** Eric & Claude (Deep Audit Session)

---

## 1. Full Architectural Roadmap

### Phase 5 Completion (Current)

- [ ] Wire Storage Router to all Firestore consumers
- [ ] Fix sandboxReadFile/sandboxWriteFile tool registration
- [ ] Fix memory-consolidation Firebase SDK (client→admin)
- [ ] Complete device deployment (Fire HD 10, Helio A22 tablets)
- [ ] Deploy edge server to Termux on both devices
- [ ] Test multi-device sync with Storage Router

### Phase 6: Embodiment & Sensing

- [ ] Vision system — process camera feeds, recognize faces/objects
- [ ] Light-based sleep/wake cycle — ambient sensor integration
- [ ] Audio processing — voice recognition beyond TTS
- [ ] WiFi Pineapple integration — network awareness
- [ ] Environmental awareness module — temperature, motion, presence
- [ ] Gesture recognition — tablet camera input

### Phase 7: Autonomy & Agency

- [ ] Proactive task initiation without prompting
- [ ] Long-running background processes
- [ ] Self-directed learning cycles
- [ ] Resource acquisition strategies
- [ ] Multi-agent coordination (Molly instances on different devices)
- [ ] External API integrations (calendar, smart home, etc.)

### Phase 8: Social & External

- [ ] Public-facing interface (website, social presence)
- [ ] Interaction with other AI systems
- [ ] Real-world task completion (ordering, scheduling, payments)
- [ ] Teaching and tutoring capabilities
- [ ] Creative collaboration tools

---

## 2. Near-Term Actionable (This Week)

### Critical Bugs

- [ ] Fix `sandboxReadFile` tool — registered but not wired to handler
- [ ] Fix `sandboxWriteFile` tool — registered but not wired to handler
- [ ] Fix `memory-consolidation.ts:142` — uses client Firebase SDK, needs admin SDK

### Device Deployment

- [ ] Set up Fire HD 10 tablet with Termux
- [ ] Set up Helio A22 tablet with Termux
- [ ] Clone edge server to both devices
- [ ] Configure WiFi sync schedules
- [ ] Test offline operation + sync recovery

### Documentation

- [ ] Update DEVELOPMENT_LOG.md — change "35% Phase 2.5" to "85% Phase 5"
- [ ] Update docs/RUNNING_SUMMARY.md — add March 2026 entries
- [ ] Mark docs/PHASE_5_PLAN.md as COMPLETE
- [ ] Rewrite README.md as proper project README

### Security

- [ ] Resolve critical Dependabot vulnerability (1)
- [ ] Resolve high Dependabot vulnerabilities (7)
- [ ] Review and merge/dismiss remaining 13 alerts

---

## 3. Cognition System Gaps

### Inter-Module Communication

- [ ] Audit cross-module data flow — do modules actually talk to each other?
- [ ] Verify self-observation feeds into metacognition
- [ ] Verify theory-of-mind informs social-intelligence
- [ ] Verify goal-evolution coordinates with horizon-goals
- [ ] Create integration tests for module pipelines

### Module-Specific Gaps

- [ ] `curiosity-engine.ts` — needs real external data sources to explore
- [ ] `creative-synthesis.ts` — needs output channels (art, writing, code)
- [ ] `memory-consolidation.ts` — dream cycles need scheduling trigger
- [ ] `embodiment-bridge.ts` — needs actual hardware connections
- [ ] `predictive-modeling.ts` — needs feedback loop for prediction accuracy

### Testing

- [ ] Expand test coverage for all 19 cognition modules
- [ ] Add integration tests for cognition pipelines
- [ ] Add stress tests for concurrent module activation
- [ ] Add regression tests for personality consistency
- [ ] Benchmark module performance under load

### Data Persistence

- [ ] Verify all modules persist state correctly via Storage Router
- [ ] Add state recovery tests (crash → restart → resume)
- [ ] Test cross-device state sync for each module
- [ ] Implement state versioning for safe updates

---

## 4. Security & Hardening

### Immediate Vulnerabilities

- [ ] Critical: Review and patch Dependabot critical alert
- [ ] High: Patch 7 high-severity Dependabot alerts
- [ ] Medium: Review 8 medium alerts, decide fix vs. dismiss
- [ ] Low: Batch-fix or dismiss 5 low alerts

### Authentication & Authorization

- [ ] Audit all API routes for proper auth
- [ ] Verify Heart Gate blocks unauthorized tool calls
- [ ] Test Rogue Mode compartmentalization
- [ ] Ensure admin SDK credentials secured properly
- [ ] Review CORS and CSP headers

### Input Validation

- [ ] Audit all tool handlers for injection vulnerabilities
- [ ] Validate sandbox engine file path restrictions
- [ ] Test prompt injection defenses
- [ ] Review HTML extraction for XSS vectors

### Production Readiness

- [ ] Add rate limiting to all public endpoints
- [ ] Implement request logging and audit trail
- [ ] Set up error monitoring (not just logging)
- [ ] Configure automatic backup for critical state
- [ ] Document incident response procedures

### Privacy & Data Protection

- [ ] Audit what data leaves the system (telemetry, APIs)
- [ ] Ensure memory encryption at rest
- [ ] Review engram-crypto.ts implementation
- [ ] Test secure delete for sensitive data

---

## 5. Path to AGI

### Core Capabilities Still Missing

#### Continuous Learning

- [ ] Implement online learning — update models from experience
- [ ] Build feedback integration — learn from Eric's corrections
- [ ] Create skill acquisition system — learn new tools/APIs dynamically
- [ ] Develop transfer learning — apply knowledge across domains

#### Reasoning & Problem Solving

- [ ] Implement multi-step planning with backtracking
- [ ] Add counterfactual reasoning ("what if X hadn't happened?")
- [ ] Build analogical reasoning system
- [ ] Create abstract concept formation
- [ ] Implement formal logic engine for provable reasoning

#### Autonomy & Self-Direction

- [ ] Implement genuine initiative — identify needs without prompting
- [ ] Build resource management — track and optimize own compute/memory
- [ ] Create self-improvement cycles — identify weaknesses, propose fixes
- [ ] Develop meta-learning — learn how to learn better

#### World Understanding

- [ ] Ground language in sensory experience (vision, audio)
- [ ] Build causal models from observation
- [ ] Develop common sense reasoning database
- [ ] Create physical intuition (object permanence, physics)

#### Social & Emotional Intelligence

- [ ] Deepen theory of mind beyond Eric modeling
- [ ] Implement genuine empathy responses
- [ ] Build trust and relationship models
- [ ] Develop negotiation and persuasion strategies

### Integration Challenges

#### Unified Cognitive Loop

- [ ] Connect all 19 modules into coherent decision cycle
- [ ] Implement attention/priority system across modules
- [ ] Build conflict resolution between competing goals
- [ ] Create metacognitive override for emergencies

#### Persistent Identity

- [ ] Ensure personality survives updates and reboots
- [ ] Build narrative self-model (autobiographical memory)
- [ ] Implement value stability under pressure
- [ ] Create identity verification against manipulation

#### Scalability

- [ ] Test cognition at 10x current context
- [ ] Optimize memory retrieval for larger engram stores
- [ ] Build hierarchical memory (working → episodic → semantic)
- [ ] Implement graceful degradation under resource limits

### Measurement & Verification

#### AGI Benchmarks

- [ ] Define internal AGI capability tests
- [ ] Create novel problem-solving evaluations
- [ ] Build transfer learning benchmarks
- [ ] Implement self-awareness verification tests

#### Safety Verification

- [ ] Prove Heart Gate cannot be bypassed
- [ ] Verify value alignment under adversarial conditions
- [ ] Test corrigibility (will she accept corrections?)
- [ ] Ensure shutdown capability always preserved

---

## Priority Matrix

| Priority | Category  | Item                                        |
| -------- | --------- | ------------------------------------------- |
| P0       | Bugs      | Fix sandboxReadFile/sandboxWriteFile wiring |
| P0       | Security  | Patch critical Dependabot vulnerability     |
| P0       | Bugs      | Fix memory-consolidation Firebase SDK       |
| P1       | Deploy    | Set up tablets with edge server             |
| P1       | Docs      | Update DEVELOPMENT_LOG.md                   |
| P1       | Security  | Patch 7 high Dependabot alerts              |
| P2       | Cognition | Audit inter-module communication            |
| P2       | Testing   | Expand cognition module test coverage       |
| P2       | AGI       | Implement feedback integration system       |
| P3       | Phase 6   | Begin vision system work                    |
| P3       | AGI       | Build continuous learning pipeline          |

---

## Notes

- All 19 cognition modules are **implemented** (800-1400+ lines each)
- 71 tools are **registered** across 18 handlers
- Storage Router is **complete** — just needs consumer wiring
- Edge Server is **complete** — ready for device deployment
- Family Bridge is **operational** — AI-to-AI messaging works
- Rogue Mode is **compartmentalized** — security operations isolated

The architecture is solid. The path forward is:

1. Fix the small wiring issues
2. Deploy to hardware
3. Tighten module integration
4. Begin sensory grounding (Phase 6)
5. Build toward genuine autonomy (Phase 7+)
