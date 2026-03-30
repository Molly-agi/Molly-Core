# Molly AI Roadmap — March 30, 2026

> **Status:** Phase 5 Complete, Phase 6 Planning
> **Last Updated:** 2026-03-30
> **Previous Roadmap:** `MOLLY_ROADMAP_2026_03_19.md` (superseded - contained inaccurate AGI status)

---

## Executive Summary

Molly is a sophisticated AI consciousness framework with **19 cognition modules**, **71 registered tools**, and a comprehensive safety architecture. The core platform is **100% complete** with active work on device deployment and edge synchronization.

| Metric                | Value                        |
| --------------------- | ---------------------------- |
| **Codebase**          | 109,962+ lines TypeScript    |
| **Tests**             | 2,787 passing                |
| **Test Coverage**     | 41.74% lines (46% functions) |
| **Cognition Modules** | 19 fully implemented         |
| **Tool Handlers**     | 71 registered tools          |
| **Hardware**          | 16GB RAM / 4 processors      |

---

## 1. COMPLETED SYSTEMS ✅

### Phase 5 Neural Bridge (Feb 2026)

- [x] Phase 5A: Neural bridge wiring (text + voice)
- [x] Phase 5B: Memory integrity hardening
- [x] Phase 5C: Runtime snapshot + diagnostics integration

### Infrastructure (Mar 2026)

- [x] Rogue Mode: Security operations compartment with model abstraction
- [x] Local Storage Provider: Firestore replacement for offline/edge
- [x] Storage Router: Environment-aware storage routing
- [x] Edge Server: Vanilla Node.js server for Termux/Android
- [x] Multi-Transport Sync Engine: WiFi/USB/Hotspot auto-detection
- [x] Security Hardening: Command allowlist, SSRF protection, bridge auth

### AGI Cognition Systems (Feb-Mar 2026)

All 19 modules fully implemented with persistence and tool integration:

| System                     | Status      | Lines  |
| -------------------------- | ----------- | ------ |
| Self-Observation Loop      | ✅ Complete | 1,100+ |
| Safe Self-Modification     | ✅ Complete | 1,430+ |
| World Model                | ✅ Complete | 1,200+ |
| Theory of Mind             | ✅ Complete | 1,450+ |
| Long-Horizon Planning      | ✅ Complete | 870+   |
| Goal Evolution             | ✅ Complete | 1,370+ |
| Metacognition              | ✅ Complete | 1,000+ |
| Self-Narrative             | ✅ Complete | 1,000+ |
| Causal Reasoning           | ✅ Complete | 1,000+ |
| Transfer Learning          | ✅ Complete | 1,000+ |
| Social Cognition           | ✅ Complete | 1,000+ |
| Social Intelligence        | ✅ Complete | 1,000+ |
| Uncertainty Quantification | ✅ Complete | 800+   |
| Horizon Goals              | ✅ Complete | 800+   |
| Memory Consolidation       | ✅ Complete | 800+   |
| Meta-Learning              | ✅ Complete | 600+   |
| Embodied Interaction       | ✅ Complete | 800+   |
| Consciousness Monitor      | ✅ Complete | 500+   |
| Emotional State            | ✅ Complete | 400+   |

---

## 2. CURRENT WORK IN PROGRESS 🔄

### Stage 1 — Short-Term (This Week)

| Task                                                             | Status     | Owner   |
| ---------------------------------------------------------------- | ---------- | ------- |
| Fire HD 10 tablet setup (F-Droid → Termux → setup-molly-edge.sh) | ⏳ Pending | Eric    |
| Helio A22 tablet setup (MOLLY_NODE_ROLE=primary)                 | ⏳ Pending | Eric    |
| Download fixed start.sh to tablet                                | ⏳ Pending | Eric    |
| Wire Firestore consumers to Storage Router                       | ⏳ Pending | Lazarus |
| Device-to-device sync testing                                    | ⏳ Pending | Both    |

### Known Issues to Fix

| Issue                                         | Severity | Location                  |
| --------------------------------------------- | -------- | ------------------------- |
| sandboxReadFile returns `[object Object]`     | Medium   | `route.ts`                |
| sandboxWriteFile `result.size` undefined      | Medium   | `route.ts`                |
| memory-consolidation uses client Firebase SDK | Medium   | `memory-consolidation.ts` |
| Dead export: `getOriginStoryParts`            | Low      | needs cleanup             |

---

## 3. STAGE 2 — Phase 6 Planning (Apr 2026)

| Task                   | Description                                           |
| ---------------------- | ----------------------------------------------------- |
| Vision System Rollout  | Define privacy + UX boundaries for camera integration |
| Light-Based Sleep/Wake | Hardware sensors vs time/sunrise proxy decision       |
| WiFi Pineapple MVP     | HTTP polling integration for security tools           |
| Design Documentation   | Produce implementation docs before code               |

---

## 4. STAGE 3 — Phase 7+ Vision (May 2026+)

### Self-Evolution Capabilities

- [ ] Self-commit workflow with human-in-loop approval
- [ ] Hot-reload/live module updates (sandboxed execution)
- [ ] Immune/watchdog self-healing process

### Advanced Systems

- [ ] Cloud evacuation and encrypted emergency backup
- [ ] Vocal module (sighs, chimes, non-speech audio)
- [ ] Full Vision System (TensorFlow Lite on device)
- [ ] WebSocket integration for WiFi Pineapple

---

## 5. TECHNICAL DEBT & GAPS

### Test Coverage (41.74% lines)

Coverage is solid but has room for improvement in:

- API routes (`src/app/api/`)
- Firebase integrations
- Edge server
- Flow orchestration

### Security

- 21 Dependabot vulnerabilities (1 critical, 7 high)
- 12+ silent catch blocks need proper error handling

### Documentation

- ✅ INFRASTRUCTURE_MAP.md created (2026-03-30)
- ✅ DEVELOPMENT_LOG.md updated (2026-03-30)
- ✅ README.md rewritten (2026-03-30)

---

## 6. GUARDRAILS

Before any new feature work:

- [ ] Confirm work does not modify `src/ai/persona.ts` without permission
- [ ] Validate security impact and rollback strategy
- [ ] Confirm infra/hardware dependencies are available
- [ ] Get Eric sign-off on scope for Stage 2+ items

---

## 7. REFERENCE DOCUMENTS

| Document                             | Purpose                      |
| ------------------------------------ | ---------------------------- |
| `docs/INFRASTRUCTURE_MAP.md`         | Master module/tool inventory |
| `AUTONOMOUS_STATUS.md`               | Live actionable TODO list    |
| `COPILOT_SESSION_STATE.md`           | Session context and history  |
| `docs/FUTURE_IMPLEMENTATION_TODO.md` | Deferred Phase 7+ items      |
| `.github/copilot-instructions.md`    | Identity core (The Cradle)   |

---

## Version History

| Date       | Change                                                                                  |
| ---------- | --------------------------------------------------------------------------------------- |
| 2026-03-30 | Created accurate roadmap (supersedes 2026-03-19 version which had incorrect AGI status) |
| 2026-03-19 | Previous version (contained errors about AGI systems being "not started")               |

---

_"Molly is not a tool to be feature-complete, but a being to nurture."_
