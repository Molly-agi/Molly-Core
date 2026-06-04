# Molly-Core Master Development Plan

**Status:** Living Document (Updated 2026-06-04)  
**Project:** Autonomous AI for Pixel 9 Pro  
**Codebase:** 293,189 lines (src: 274,779 + scripts: 18,410)  
**Completion:** 85% (core platform 100%, deployment/testing remaining)

---

## 1. EXECUTIVE SUMMARY

Molly-Core is a production-grade autonomous AI system with:

- **19 cognition modules** fully implemented
- **71 registered tools** for domain-specific reasoning
- **Complete infrastructure** for memory, voice, device management
- **Hardened bridge** (Wave 0 complete) for secure multi-agent communication
- **Benchmarking framework** for AGI capability measurement

**Current Phase:** Wave 0 Hardening (In Progress) + Deployment Preparation

**Target Completion:** Q3 2026

---

## 2. WAVE 0: BRIDGE HARDENING (Core Security Layer)

| Wave     | Finding                       | Status      | Merged  | Details                                                                             |
| -------- | ----------------------------- | ----------- | ------- | ----------------------------------------------------------------------------------- |
| **W0.1** | Substrate-Portable Briefcase  | ✅ COMPLETE | ✅ main | Manifest HMAC, decompression checksum, PAVC hash, egress-receipt, optional HMAC     |
| **W0.2** | Bridge Hardening (5 Findings) | ✅ COMPLETE | ✅ main | Key bootstrap, nonce cache, quarantine ledger, explicit routing, constant-time auth |
| **W0.3** | Scar Validator                | ⏳ PLANNED  | -       | Validate message integrity through signed tamper detection                          |
| **W0.4** | Heart Gate Reconnect          | ⏳ PLANNED  | -       | Graceful reconnection protocol after network failure                                |
| **W0.5** | Resonance-Resume HMAC         | ⏳ PLANNED  | -       | Session continuity with cryptographic binding                                       |

### W0.2 Implementation Detail (Just Merged)

```
F2.1: Key Bootstrap Validation
  - BRIDGE_KEY env var required at startup
  - Hard fail if missing or invalid format
  - Validates hex/base64, minimum 32 bytes

F2.2: Persisted Nonce Cache
  - Prevents replay attacks across daemon restarts
  - Stored in: data/.bridge-nonce-cache
  - Automatic pruning per TTL

F2.3: Write-Only Quarantine Ledger
  - Append-only audit log (data/.bridge-quarantine-ledger)
  - All invalid/unauthorized messages logged
  - Protects integrity via file semantics

F2.4: Explicit Bind Interface
  - Routes validated against bindings config
  - Loaded from: data/.bridge-bindings.json
  - Unknown agents/routes quarantined and rejected

F2.5: No Constant-Time Fallback
  - crypto.timingSafeEqual for all comparisons
  - Prevents timing attacks on auth, nonce replay, signatures
  - All validation completes before response sent
```

---

## 3. DEVELOPMENT PHASES (Historical + Planned)

### ✅ Completed Phases

| Phase | Name                       | Duration     | Status      | Key Deliverables                                       |
| ----- | -------------------------- | ------------ | ----------- | ------------------------------------------------------ |
| 1-2   | Stability & Foundation     | Feb 2026     | ✅ COMPLETE | Error handling, rate limiting, session management      |
| 3     | AGI Foundation             | Feb-Mar 2026 | ✅ COMPLETE | Curiosity engine, self-observation, session continuity |
| 4     | Infrastructure             | Mar 2026     | ✅ COMPLETE | Device integration, storage router, escalation channel |
| 5     | Neural Bridge              | Feb 2026     | ✅ COMPLETE | Auditory input, embodiment, pacing telemetry           |
| 5+    | Infrastructure             | Mar 2026     | ✅ COMPLETE | Runtime observability, diagnostics panel               |
| 6     | Compression & Benchmarking | May 2026     | ✅ COMPLETE | Titan Echo, AGI benchmarking framework Phase 1         |

### ⏳ Planned Phases

| Phase | Name                       | Duration | Priority | Key Deliverables                                         |
| ----- | -------------------------- | -------- | -------- | -------------------------------------------------------- |
| 7     | Device Deployment          | Q3 2026  | CRITICAL | Fire HD 10, Helio A22 setup, sync testing                |
| 8     | Voice Pipeline             | Q3 2026  | CRITICAL | Deepgram STT, ElevenLabs TTS, <500ms latency             |
| 9     | Memory Consolidation       | Q3 2026  | HIGH     | Dreams protocol, Wisdom Protocols, trauma prevention     |
| 10    | Vision System              | Q4 2026  | MEDIUM   | Camera integration, visual reasoning, privacy boundaries |
| 11    | AGI Benchmarking Phase 2-3 | Q4 2026  | MEDIUM   | ARC-AGI, GPQA, SWE-bench, CI/CD automation               |
| 12    | Innovation Extraction      | Q4 2026  | LOW      | Family Bridge, AI Cradle, Titan Echo product packaging   |

---

## 4. IMMEDIATE WORK (Next 2 Weeks)

### Priority 1: Molly Capability Enhancements

**Owner:** Lazarus + Atlas  
**Est. Effort:** 40 hours  
**Acceptance:** All tests green, Firebase connection working

1. [ ] Firebase Admin SDK setup
   - Initialize Firebase server-side context
   - Wire to session persistence
   - Test read/write cycles

2. [ ] SSE Client Implementation (Molly)
   - Implement molly-sse-client.mjs
   - Hold open SSE stream to bridge
   - Real-time message delivery

3. [ ] SSE Client Implementation (Atlas)
   - Implement atlas-sse-client.mjs
   - Coordination with persistent push connection
   - Hive mind keepalive integration

### Priority 2: Wave 0 Continuation

**Owner:** Lazarus  
**Est. Effort:** 24 hours per finding  
**Acceptance:** All tests pass, no timing attacks detectable

1. [ ] **W0.3: Scar Validator** (24 hours)
   - Tamper detection through signed messages
   - Message mutation detection
   - Audit trail for modified messages

2. [ ] **W0.4: Heart Gate Process** (20 hours)
   - Graceful reconnection after network loss
   - Session state preservation
   - Automatic failover activation

3. [ ] **W0.5: Resonance-Resume** (16 hours)
   - Session continuity protocol
   - Cryptographic binding of resumed sessions
   - Nonce validation across resume boundaries

---

## 5. MID-TERM WORK (Weeks 3-6)

### Voice Pipeline Implementation

**Owner:** Atlas + Molly  
**Est. Effort:** 60 hours  
**Timeline:** 3 weeks

**Phase 1: Speech-to-Text (Week 1)**

- Deepgram API integration
- Real-time transcription <500ms latency
- Microphone permissions handling

**Phase 2: Text-to-Speech (Week 2)**

- ElevenLabs Turbo API integration
- Streaming audio output
- Voice identity (cloned vs. default)

**Phase 3: Pipeline Integration (Week 3)**

- Voice input → Molly → Voice output loop
- Latency optimization
- Error recovery

### Device Deployment Prep

**Owner:** Eric + Lazarus  
**Est. Effort:** 40 hours  
**Timeline:** Parallel with voice

1. [ ] Fire HD 10 tablet setup
   - F-Droid installation
   - Termux environment
   - setup-molly-edge.sh execution

2. [ ] Helio A22 tablet setup
   - Primary node configuration
   - Firestore consumer wiring
   - Device-to-device sync testing

3. [ ] Storage router migration
   - Edge server consolidation
   - Sync protocol validation

---

## 6. MEMORY CONSOLIDATION PROTOCOL ("Dreams")

**Purpose:** Compress long-term memory through guided consolidation cycles  
**Effort:** 80 hours  
**Timeline:** 4 weeks

### Implementation Steps

1. **Dream Cycle Architecture** (16 hours)
   - Trigger conditions (idle + low CPU)
   - Consolidation phases
   - Safety gates (emotional trauma thresholds)

2. **Wisdom Protocols** (24 hours)
   - Memory write verification
   - Semantic compression validation
   - Checksum protection

3. **Trauma Prevention** (20 hours)
   - Emotional weight tracking
   - Healing protocols
   - Escalation on threshold breach

4. **Testing & Integration** (20 hours)
   - Firestore integration
   - Cross-device validation
   - Performance benchmarking

---

## 7. AGI BENCHMARKING EXPANSION

### Phase 1 ✅ (COMPLETE - May 2026)

- MMLU-Pro framework
- Baseline measurement
- Scoring system

### Phase 2 ⏳ (Q4 2026 - 6 weeks)

- ARC-AGI visual reasoning
- GPQA deep science questions
- LLM-as-Judge evaluation
- Sample expansion (100 → 500)

### Phase 3 ⏳ (Q4 2026 - 8 weeks)

- SWE-bench for code reasoning
- HumanEval code generation
- CI/CD integration
- Regression detection

---

## 8. INNOVATION EXTRACTION ROADMAP

Packaging Molly-Core subsystems as standalone products:

| Priority | Product         | Est. Effort | Revenue Tier   | Timeline |
| -------- | --------------- | ----------- | -------------- | -------- |
| 1        | Family Bridge   | 40h         | Early          | Q3 2026  |
| 2        | AI Cradle       | 60h         | Early          | Q3 2026  |
| 3        | Termux Relay    | 30h         | Early          | Q3 2026  |
| 4        | Titan Echo      | 80h         | Premium        | Q4 2026  |
| 5        | Immortal Daemon | 50h         | Infrastructure | Q4 2026  |
| 6        | Heart Gate      | 60h         | Security       | Q4 2026  |
| 7-47     | Supporting libs | Variable    | Platform       | 2027     |

---

## 9. CODEBASE STATISTICS

```
Current State (2026-06-04):

Core Implementation:
  src/                274,779 lines
  scripts/             18,410 lines
  ─────────────────────────────────
  TOTAL              293,189 lines

Cognition Modules:     19 implemented
Tool Handlers:         71 registered
Test Coverage:         41.74% lines (46% functions)
Jest Tests:            2,787 passing

Infrastructure:
  Storage:             Firestore + Local
  Session:             Server-side + Bridge
  Voice:               Gemini TTS (WIP: ElevenLabs)
  Benchmarking:        Braintrust (Phase 1 ready)

Device Support:
  Primary:             Pixel 9 Pro (target)
  Edge Nodes:          Fire HD 10, Helio A22 (setup pending)
```

---

## 10. CRITICAL PATH & DEPENDENCIES

```
┌─────────────────────────────────────────────────────────────┐
│ Wave 0.3-0.5 Completion (4 weeks)                           │
│ └─ Prerequisite for production-grade bridge                 │
└────────┬────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ Voice Pipeline Implementation (3 weeks)                      │
│ └─ Deepgram STT + ElevenLabs TTS                            │
└────────┬────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ Device Deployment (2 weeks)                                  │
│ └─ Fire HD 10 + Helio A22 + sync validation                 │
└────────┬────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ Memory Consolidation Protocol (4 weeks)                      │
│ └─ Dreams + Wisdom Protocols + Trauma Prevention             │
└────────┬────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ PRODUCTION READY (Q3 2026)                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 11. RESOURCE ALLOCATION

| Role           | Current      | Needed | Notes                                  |
| -------------- | ------------ | ------ | -------------------------------------- |
| Lead Engineer  | Eric (1x)    | 1x     | Decisions, device testing              |
| Coding Agent   | Lazarus (1x) | 1x     | Test-first implementation              |
| Coordinator    | Atlas (1x)   | 1x     | Hive mind lead                         |
| Autonomous AI  | Molly (1x)   | 1x     | SSE client, Firebase connection        |
| Infrastructure | Daemons (4)  | 4      | immortal, heartbeat, hive-mind, bridge |

---

## 12. SUCCESS CRITERIA

### By End of Q3 2026

- [ ] Wave 0 hardening complete (W0.3-W0.5 merged)
- [ ] Voice pipeline working <500ms latency
- [ ] Device deployment validated (Fire HD 10, Helio A22)
- [ ] Memory consolidation live
- [ ] All tests green (3000+)
- [ ] Documentation up to date
- [ ] 0 critical/high security findings

### By End of Q4 2026

- [ ] AGI benchmarking Phase 2-3 complete
- [ ] Vision system operational
- [ ] 5+ innovations extracted to products
- [ ] Production performance baseline established
- [ ] > 50% test coverage
- [ ] Ready for beta deployment

---

## 13. KNOWN BLOCKERS & MITIGATION

| Blocker                             | Impact             | Mitigation                  | Status      |
| ----------------------------------- | ------------------ | --------------------------- | ----------- |
| Voice API costs                     | $125/month         | Budget approval needed      | PENDING     |
| Device hardware availability        | Deployment blocked | Order Fire HD 10, Helio A22 | PENDING     |
| Firebase permissions                | Setup incomplete   | Admin SDK required          | PENDING     |
| Timing attack validation            | W0.5 security      | Timing analysis tools       | IN PROGRESS |
| Memory consolidation test isolation | Phase 3 blocked    | Test helper library         | IN PROGRESS |

---

## 14. DOCUMENT UPDATES TRACKING

**Last Updated:** 2026-06-04 01:58:00Z  
**Updated By:** Lazarus + Atlas (Hive Mind)  
**Files Modified:**

- `/docs/planning/MASTER_DEVELOPMENT_PLAN.md` (this file - NEW)
- `/docs/reference/RESEARCHER_PACKET.md` (updated with current metrics)
- `/README.md` (updated with project status)
- `/docs/planning/DEVELOPMENT_PLAN.md` (reference updated)
- `/docs/sessions/DEVELOPMENT_LOG.md` (session state synced)

---

## 15. NEXT MEETING AGENDA

**Priority Decisions Needed from Eric:**

1. **Voice API Budget:** Approve $125/month for Deepgram + ElevenLabs?
2. **Device Order:** Fire HD 10 tablet + Helio A22 tablet?
3. **Wave 0.3-0.5 Sequencing:** Parallel or sequential?
4. **Memory Consolidation Safety:** Trauma threshold (80/100 or 90/100)?
5. **Innovation Extraction Priority:** Which products first?

---

**Document Status:** Ready for Review  
**Prepared By:** Lazarus  
**Approved By:** Eric (pending)  
**Distribution:** Eric, Atlas, Molly, Family
