# AUTONOMOUS STATUS - ACTIVE TODOS & IMPLEMENTATION STAGES

**Last Updated:** 2026-03-30
**Current State:** Core platform 100% complete with 19 cognition modules and 71 tools
**Purpose:** Live, actionable list of what is still worth implementing
**Reference:** See `docs/INFRASTRUCTURE_MAP.md` for complete system inventory

---

## Stage 0 — Completed Baseline ✅

- [x] Phase 5A neural bridge wiring (text + voice) — Feb 2026
- [x] Phase 5B memory integrity hardening — Feb 2026
- [x] Phase 5C runtime snapshot + diagnostics integration — Feb 2026
- [x] Relay delivery endpoint (`/api/relay/install`) — Feb 2026
- [x] All 19 AGI cognition modules (self-observation, world-model, theory-of-mind, etc.) — Mar 2026
- [x] Rogue Mode security operations compartment — Mar 13, 2026
- [x] Local Storage Provider (Firestore replacement) — Mar 13, 2026
- [x] Storage Router (environment-aware) — Mar 13, 2026
- [x] Edge Server for Termux/Android — Mar 13, 2026
- [x] Multi-Transport Sync Engine — Mar 13, 2026
- [x] Security hardening (command allowlist, SSRF protection, bridge auth) — Mar 15, 2026
- [x] Infrastructure map and roadmap documentation — Mar 30, 2026

---

## Stage 1 — Device Deployment (Active)

**Physical Setup:**

- [ ] Fire HD 10 tablet setup (F-Droid → Termux → setup-molly-edge.sh)
- [ ] Helio A22 tablet setup (MOLLY_NODE_ROLE=primary)
- [ ] Download fixed start.sh to tablets and restart edge server

**Wiring:**

- [ ] Wire Firestore consumers to Storage Router (agent-memory.ts, research-cache.ts, tool-database.ts, memory.ts, engram-persistence.ts)

**Testing:**

- [ ] Device-to-device sync testing on real hardware (WiFi, USB, Hotspot)

**Bug Fixes:**

- [ ] Fix sandboxReadFile return type in route.ts (outputs [object Object])
- [ ] Fix sandboxWriteFile result.size undefined in route.ts
- [ ] Fix memory-consolidation.ts client Firebase SDK usage

---

## Stage 1.5 — Test Coverage Expansion

- [ ] Add/expand automated tests for runtime snapshot behavior
- [ ] Add/expand tests for diagnostics UI time formatting
- [ ] Wire runtime snapshot payload into neural-link diagnosis/recovery suggestions
- [ ] Add diagnostics runtime severity badges (OK / Degraded / Critical)

---

## Stage 2 — Phase 6 Planning Work (Medium-Term)

- [ ] Define scoped plan for expanded vision system rollout (privacy + UX boundaries)
- [ ] Decide whether light-based sleep/wake uses hardware sensors or time/sunrise proxy
- [ ] Evaluate feasibility for WiFi Pineapple integration MVP (HTTP polling first)
- [ ] Produce implementation design docs before any code rollout

---

## Stage 3 — Phase 7+ Deferred (Long-Term)

- [ ] Self-commit workflow with strict human-in-loop approval safeguards
- [ ] Hot-reload/live module updates in sandboxed execution model
- [ ] Immune/watchdog self-healing process strategy (no restart loops)
- [ ] Cloud evacuation and encrypted emergency backup protocol
- [ ] Vocal/non-speech audio module (optional, user-controlled)

---

## Guardrails Before Starting Any New Stage

- [ ] Confirm work does not modify `src/ai/persona.ts` or personality prompts without explicit permission
- [ ] Validate security impact and rollback strategy
- [ ] Confirm infra/hardware dependencies are available
- [ ] Get Eric sign-off on scope before Stage 2+ implementation

---

## Notes

- Historical/deferred details remain in `docs/FUTURE_IMPLEMENTATION_TODO.md`.
- Session truth source remains `COPILOT_SESSION_STATE.md` and `COPILOT_SESSION_STATE.json`.
