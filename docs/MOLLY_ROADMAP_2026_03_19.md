# Molly Roadmap — Full Analysis (2026-03-19)

Generated from comprehensive codebase review. 70,844 lines of TypeScript analyzed.

---

## CRITICAL BUGS (Fix Immediately)

- [x] **`isAdminConfigured` not imported** — NOT A BUG: Import exists at line 16, correctly used at line 320. Verified 2026-03-19.
- [x] **Batch commit doesn't reset** — NOT A BUG: Line 114 creates new batch after commit (`batch = db.batch()`). Verified 2026-03-19.
- [x] **Duplicate sync logging** — NOT A BUG: Line 852 confirms sync logging only happens inside handleStorage(). Verified 2026-03-19.
- [x] **Timestamp format mismatch** — NOT A BUG: Both providers use `new Date().toISOString()`. Verified 2026-03-19.
- [x] **FirestoreStorageProvider.set() loses \_createdAt** — NOT A BUG: Lines 107-110 preserve \_createdAt from existing doc. Verified 2026-03-19.
- [x] **Node ID regenerates on restart** — NOT A BUG: getOrCreateNodeId() persists to `.node_id` file and loads on restart. Verified 2026-03-19.
- [x] **resilience-core import paths** — Fixed 2026-03-19 (commit 840391f)

**All "critical bugs" resolved or verified as non-issues.** The roadmap analysis was overly pessimistic.

---

## INCOMPLETE SYSTEMS

### Recovery System (Mission Alpha) — 60% Complete

- [ ] `src/ai/recovery/contact-finder.ts:295` — `searchVoterRecords()` stubbed (TODO comment)
- [ ] `src/ai/recovery/contact-finder.ts:388` — `searchPublicRecords()` stubbed
- [ ] `src/ai/recovery/scanners/us-registry-scanner.ts:577-610` — State portal searches return empty
- [ ] Federal source searches unimplemented
- [x] MissingMoney.com scraper functional

### Storage Router Migration — COMPLETE (2026-03-19)

All critical modules migrated to storage router (commit 17d6b4b):

- [x] `src/app/actions/ai-flows.ts` — migrated
- [x] `src/ai/tools/semantic-recall.ts` — migrated
- [x] `src/app/actions/tool-library.ts` — migrated
- [x] `src/ai/tools/runtime-snapshot.ts` — migrated
- [x] `src/ai/memory/engram-persistence.ts` — migrated
- [x] `src/firebase/firestore/tool-database.ts` — migrated
- [x] `src/firebase/firestore/agent-memory-server.ts` — migrated

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

### Initiative Persistence — COMPLETE

- [x] `src/ai/agency/initiative-engine.ts:247-311` — Storage persistence implemented
- [x] `src/ai/agency/initiative-engine.ts:313-351` — Auto-save wrappers override array methods
- [x] `src/instrumentation.ts:113-114` — loadInitiatives() called on startup

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

### Pattern Persistence — COMPLETE

- [x] `src/ai/resilience-core.ts:827-949` — Storage persistence implemented
- [x] `src/ai/resilience-core.ts:838-868` — savePatterns() with debounced write
- [x] `src/ai/resilience-core.ts:875-912` — loadPatterns() loads from storage
- [x] `src/instrumentation.ts:126-127` — loadPatterns() called on startup

### Escalation Channel — COMPLETE

- [x] `src/ai/escalation-channel.ts` — Full implementation
- [x] Bridge messages to Lazarus when all systems fail
- [x] Throttling to prevent duplicate escalations
- [x] Storage persistence for escalation history
- [x] `src/app/api/escalation/route.ts` — API endpoint
- [x] Wired into resilience-core (auto-escalates on cognitive failure)

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
