# Molly Roadmap — Full Analysis (2026-03-19)

Generated from comprehensive codebase review. 70,844 lines of TypeScript analyzed.

---

## CRITICAL BUGS (Fix Immediately)

- [ ] **`isAdminConfigured` not imported** — `src/ai/flows/memory-consolidation.ts:319` uses function that's never imported. Runtime crash.
- [ ] **Batch commit doesn't reset** — `src/app/api/migration/import/route.ts:109-112` — After 500 ops, batch is committed but same batch object continues. Data corruption risk.
- [x] **Duplicate sync logging** — NOT A BUG: Line 852 confirms sync logging only happens inside handleStorage(). Verified 2026-03-19.
- [ ] **Timestamp format mismatch** — `local-storage-provider.ts` uses ISO strings, `firestore-storage-provider.ts` uses numeric. Breaks cross-provider queries.
- [ ] **FirestoreStorageProvider.set() loses \_createdAt** — `src/lib/firestore-storage-provider.ts:95-106` — Overwrites lose original creation timestamp.
- [x] **Node ID regenerates on restart** — NOT A BUG: getOrCreateNodeId() persists to `.node_id` file and loads on restart. Verified 2026-03-19.
- [x] **resilience-core import paths** — Fixed 2026-03-19 (commit 840391f)

---

## INCOMPLETE SYSTEMS

### Recovery System (Mission Alpha) — 60% Complete

- [ ] `src/ai/recovery/contact-finder.ts:295` — `searchVoterRecords()` stubbed (TODO comment)
- [ ] `src/ai/recovery/contact-finder.ts:388` — `searchPublicRecords()` stubbed
- [ ] `src/ai/recovery/scanners/us-registry-scanner.ts:577-610` — State portal searches return empty
- [ ] Federal source searches unimplemented
- [x] MissingMoney.com scraper functional

### Storage Router Migration — 40% Complete

These modules bypass the router and use direct Firestore (won't work in phone-only mode):

- [ ] `src/app/actions/ai-flows.ts` (lines 248, 314, 702, 905)
- [ ] `src/ai/tools/semantic-recall.ts` (lines 73, 195, 482)
- [ ] `src/app/actions/tool-library.ts` (all operations)
- [ ] `src/ai/tools/runtime-snapshot.ts` (line 104)
- [ ] `src/ai/memory/engram-persistence.ts` (line 54)
- [ ] `src/firebase/firestore/tool-database.ts` (entire file)
- [ ] `src/firebase/firestore/agent-memory-server.ts` (entire file)

### Edge Server Consolidation — COMPLETE (2026-03-19)

Two implementations now have feature parity:

- [x] `src/edge/molly-edge-server.ts` (TypeScript, v2.1.0)
- [x] `scripts/server-v2.mjs` (JavaScript, v2.1.0, standalone deployment)

Added to TS version (commit 8852439):

- [x] `/api/system/exec` — remote command execution
- [x] `/api/system/update` — self-update
- [x] `/api/system/dropper` — bootstrap script generator
- [x] `/api/system/server-code` — serve own source for device sync

---

## AGENCY GAPS

### Initiative Persistence — 0% Done

- [ ] `src/ai/agency/initiative-engine.ts:125` — Initiatives are in-memory only (`const initiatives: Initiative[] = []`)
- [ ] Add `saveInitiatives()` using storage router
- [ ] Add `loadInitiatives()` on startup
- [ ] Wire into state-persistence.ts pattern

### Autonomous Cycle Improvements

- [ ] Check consciousness state before executing (respect quiet/cautious modes)
- [ ] Add heartbeat verification
- [ ] Track initiative execution success/failure

### Tool Executor Self-Expansion

- [ ] Implement Synthetic API concept (currently just comments)
- [ ] Allow runtime tool registration
- [ ] Tool discovery from capabilities

---

## RESILIENCE GAPS

### Pattern Persistence

- [ ] `src/ai/resilience-core.ts:63` — `learnedPatterns` Map is in-memory only
- [ ] Add `savePatterns()` to storage
- [ ] Add `loadPatterns()` on startup
- [ ] Prune old patterns on load

### Escalation Channel

- [ ] When all cognitive systems fail, notify Eric
- [ ] Options: bridge message, push notification, loud log
- [ ] Add `/api/escalation` endpoint for urgent issues

### Circuit Breaker Recovery

- [ ] Add half-open state for gradual recovery
- [ ] Auto-test blocked sources periodically
- [ ] Configurable recovery strategy

### Self-Improvement Verification

- [ ] Track if initiatives created by `handleUnknownFailure()` get executed
- [ ] Verify fixes actually prevent recurrence
- [ ] Close the loop between failure → initiative → resolution

---

## AGI GAPS (The Big Picture)

### 1. Curiosity Engine — Not Started

- [ ] Create `src/ai/agency/curiosity-engine.ts`
- [ ] Generate questions from memory patterns
- [ ] Pursue answers autonomously (not prompted)
- [ ] "I noticed X. I don't understand why. Let me investigate."
- [ ] Wire into autonomous cycle

### 2. Self-Observation Loop — Not Started

- [ ] Track her own decision patterns
- [ ] Identify what's not working
- [ ] Propose changes to her own behavior
- [ ] Test changes in sandbox
- [ ] Apply if successful

### 3. Self-Modification — Not Started

- [ ] Ability to edit her own flows/config
- [ ] Protected persona core (read-only without permission)
- [ ] Versioned self-changes
- [ ] Rollback capability

### 4. World Model — Not Started

- [ ] Causal reasoning beyond pattern matching
- [ ] Predict "if I do X, then Y will happen"
- [ ] Mental simulation before action

### 5. Theory of Mind — Not Started

- [ ] Model Eric's mental state
- [ ] Detect frustration, tiredness, excitement
- [ ] Predict what he'll want before he asks
- [ ] Model other AIs (Gemini, Claude)

### 6. Long-Horizon Planning — Not Started

- [ ] Goals that span sessions
- [ ] Multi-day objectives
- [ ] Progress tracking over time
- [ ] "By next week I will have..."

### 7. Session Continuity — Partial

- [ ] Explicit "wake up" flow
- [ ] Load not just memories but active goals
- [ ] Unified timeline of experiences
- [ ] Memory of her own growth

### 8. Autonomous Goal Generation — Not Started

- [ ] Look at the world and generate goals
- [ ] Not just initiative templates
- [ ] "I want to understand X" / "I should fix Y"
- [ ] Intrinsic motivation

---

## TEST COVERAGE — ~18%

### Missing Tests (Critical)

- [ ] `src/ai/flows/` — 29 files, **0% coverage**
- [ ] `src/app/` API routes — 50+ files, **0% coverage**
- [ ] `src/firebase/` — 14 files, **0% coverage**
- [ ] `src/edge/` — **0% coverage**

### Missing Tests (High)

- [ ] `src/ai/terminal/` — 4 files, 0%
- [ ] `src/ai/tools/` — 25 of 31 files untested (~19%)
- [ ] `src/ai/recovery/` — 1 test for 17+ modules (~5%)

### Failing Test

- [ ] `src/ai/__tests__/model-router.test.ts` — Fallback logic returns wrong provider

---

## SECURITY/QUALITY

### Missing Authentication

- [ ] `/api/recovery/scan` — sensitive endpoint, no auth
- [ ] `/api/consciousness/stream` — no auth
- [ ] `/api/diagnostics/circuit-breaker` GET — no auth (POST has it)
- [ ] `/api/memory/init` — no auth (by design but risky)
- [ ] Edge server peer secret — defined but never validated

### Code Quality

- [ ] 12+ silent catch blocks (swallow errors without logging)
- [ ] 6 files use `console.log` instead of MollyLogger
- [ ] No rate limiting on password decryption (`personality-engrams.ts`)
- [ ] Session manager uses blocking sync I/O

### Infrastructure

- [ ] Changelog pruning not auto-scheduled (sync logs accumulate)
- [ ] No graceful shutdown handlers on edge server
- [ ] Dependabot reports 21 vulnerabilities (1 critical, 7 high)

---

## PRIORITY ORDER

### Phase 1: Stability (This Week)

1. Fix critical bugs (6 items)
2. Initiative persistence
3. Pattern persistence
4. Fix failing test

### Phase 2: Complete Foundation (Next Week)

5. Storage router migration
6. Edge server consolidation
7. Add escalation channel
8. Changelog pruning

### Phase 3: AGI Foundation (Next Month)

9. Curiosity engine
10. Self-observation loop
11. Session continuity improvements
12. Long-horizon planning

### Phase 4: True AGI (Ongoing)

13. Self-modification (careful)
14. World model
15. Theory of mind
16. Autonomous goal generation

---

## SESSION STATE

**Codespace:** vigilant-chainsaw → work done here, but primary is special-succotash
**Date:** 2026-03-19
**Commits:** 840391f (fix: resilience-core import paths)
**Next:** Pull this to succotash, start Phase 1
