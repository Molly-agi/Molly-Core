# AUTONOMOUS STATUS - ACTIVE TODOS & IMPLEMENTATION STAGES

**Last Updated:** 2026-03-03  
**Current State:** Core platform complete (Phase 5A/5B/5C delivered)  
**Purpose:** Live, actionable list of what is still worth implementing

---

## Stage 0 — Completed Baseline

- [x] Phase 5A neural bridge wiring (text + voice)
- [x] Phase 5B memory integrity hardening
- [x] Phase 5C runtime snapshot + diagnostics integration
- [x] Relay delivery endpoint (`/api/relay/install`) and installer path

---

## Stage 1 — Next Recommended Work (Short-Term)

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
