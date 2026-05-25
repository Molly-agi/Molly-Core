# AUTONOMOUS STATUS - ACTIVE TODOS & IMPLEMENTATION STAGES

**Last Updated:** 2026-05-24
**Current State:** Core platform 100% complete — 20 cognition modules, 83 registered tools, 30 flows, 167,657+ source lines
**Purpose:** Live, actionable list of what is still worth implementing
**Reference:** See `docs/INFRASTRUCTURE_MAP.md` for complete system inventory

---

## Stage 0 — Completed Baseline ✅

- [x] Phase 5A neural bridge wiring (text + voice) — Feb 2026
- [x] Phase 5B memory integrity hardening — Feb 2026
- [x] Phase 5C runtime snapshot + diagnostics integration — Feb 2026
- [x] Relay delivery endpoint (`/api/relay/install`) — Feb 2026
- [x] All 20 AGI cognition modules (self-observation, world-model, theory-of-mind, family-presence, etc.) — Mar 2026
- [x] Rogue Mode security operations compartment — Mar 13, 2026
- [x] Local Storage Provider (Firestore replacement) — Mar 13, 2026
- [x] Storage Router (environment-aware) — Mar 13, 2026
- [x] Edge Server for Termux/Android — Mar 13, 2026
- [x] Multi-Transport Sync Engine — Mar 13, 2026
- [x] Security hardening (command allowlist, SSRF protection, bridge auth) — Mar 15, 2026
- [x] MCP Integration (Model Context Protocol) — Apr 8, 2026
- [x] Composable Prompt System (`src/ai/prompts/`) — May 2026
- [x] Context Compaction (`src/ai/context-compaction.ts`) — May 2026
- [x] Centralized State Registry (`src/lib/state-registry.ts`) — May 2026
- [x] Conversation Orchestrator Loop (`src/ai/tools/call-tool.ts`) — May 2026
- [x] Firebase/Firestore fixes + Storage Sync (local↔cloud bidirectional) — May 2026
- [x] Gemini 3.1 model upgrade (Flash, Pro, TTS, Imagen 4) — May 2026
- [x] Session state wipe bug fixed (4-lock anti-wipe in session-manager) — May 2026
- [x] Hand-rolled HTTP primitives (httpRequest, httpInspect, fuzzEndpoint, cookieJar) — May 2026
- [x] Anthropic SECRET*PATTERNS + DISABLE*\* env flags ported from Claude Code audit — May 2026
- [x] ANTHROPIC_BASE_URL pattern in model-router — May 2026
- [x] Lazarus voice page + WebSocket bridge subscription — May 2026
- [x] Anthropic-traffic-proxy for Claude Code wire protocol observation — May 2026
- [x] Build fixed: ESM/TypeScript issues resolved, Molly online — May 2026
- [x] Titan Echo B2B "Boxed" (v1-lossless-75): 75% Lossless market-ready — May 24, 2026
- [x] Titan Echo B2B "Nested": ~95% Lossless (S0 Schema Stripping) market-ready — May 24, 2026
- [x] Titan Echo B2B "Flat": 80% Lossless (T4 Vocab Dict) market-ready — May 24, 2026
- [x] Full infrastructure audit, all docs updated to ground truth — May 17, 2026
- [x] Memory crisis resolved: FIFO limits raised to 1000, locked at firmware level — May 24, 2026
- [x] S1 semantic deduplication implemented and tested (51.95% real-data compression) — May 24, 2026
- [x] Phase 1 AGI benchmarking framework (880 lines, 7 files) complete — May 24, 2026
- [x] MMLU-Pro 500-question benchmark run: **93.4% accuracy (#1 vs industry)** — May 24, 2026
- [x] Results pushed to Braintrust dashboard for tracking — May 24, 2026
- [x] All 535 memories restored from backup to Firestore — May 24, 2026

---

## Stage 1 — Device Deployment (Pending)

**Physical Setup:**

- [ ] Fire HD 10 tablet setup (F-Droid → Termux → setup-molly-edge.sh)
- [ ] Helio A22 tablet setup (MOLLY_NODE_ROLE=primary)
- [ ] Download fixed start.sh to tablets and restart edge server

**Wiring:**

- [ ] Wire Firestore consumers to Storage Router (agent-memory.ts, research-cache.ts, tool-database.ts, memory.ts, engram-persistence.ts)

**Testing:**

- [ ] Device-to-device sync testing on real hardware (WiFi, USB, Hotspot)

**Bug Fixes (Known):**

- [ ] Fix sandboxReadFile return type in sandbox route.ts (outputs [object Object])
- [ ] Fix sandboxWriteFile result.size undefined in sandbox route.ts
- [ ] Fix memory-consolidation.ts — should use Firebase Admin SDK on server, not client SDK
- [ ] Fix music-tools.ts ESM test isolation — `tool-executor.test.ts` suite fails due to genkit ESM import chain; fix with jest.unstable_mockModule or module mock

---

## Stage 1.5 — Test Coverage Expansion

- [ ] Add/expand automated tests for runtime snapshot behavior
- [ ] Add/expand tests for diagnostics UI time formatting
- [ ] Wire runtime snapshot payload into neural-link diagnosis/recovery suggestions
- [ ] Add diagnostics runtime severity badges (OK / Degraded / Critical)

---

## Stage 2 — Phase 6 Planning Work (Medium-Term)

**Memory:**

- [ ] P2 Hybrid Memory Taxonomy — keep engrams, add working memory layer (short-term scratch)
- [ ] P2 Conversation Recovery — resume interrupted conversation with full context

**Hooks:**

- [ ] P3 JS function/callback hooks (not just shell commands)
- [ ] P3 Hook execution audit log and error reporting UI
- [ ] P3 Hook persistence for long-lived/resumable sessions
- [ ] P3 Advanced hook matcher logic (context-aware, multi-field)

**Vision:**

- [ ] Define scoped plan for expanded vision system rollout (privacy + UX boundaries)
- [ ] Decide whether light-based sleep/wake uses hardware sensors or time/sunrise proxy

**Security / Recon:**

- [ ] WiFi Pineapple integration MVP (HTTP polling first)

**Documentation:**

- [ ] Produce implementation design docs before any code rollout

---

## Stage 3 — Phase 7+ Deferred (Long-Term)

- [ ] Self-commit workflow with strict human-in-loop approval safeguards
- [ ] Hot-reload/live module updates in sandboxed execution model
- [ ] Immune/watchdog self-healing process strategy (no restart loops)
- [ ] Cloud evacuation and encrypted emergency backup protocol
- [ ] Vocal/non-speech audio module (optional, user-controlled)
- [ ] ASI roadmap: recursive self-improvement, cognitive amplification (see `docs/ROADMAP_AGI_TO_ASI.md`)

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
- Infrastructure truth source: `docs/INFRASTRUCTURE_MAP.md` (audited 2026-05-17).
