# Molly-Core Pre-Upgrade Audit Report

**Date:** 2026-06-03
**Auditor:** Opus 4.7 (Claude)
**Scope:** Full codebase pre-flight before Phase 7 agency-layer install
**Bar:** Zero errors, zero warnings, zero potentials before restore point + upgrade
**Method:** Read-only audit. No fixes applied yet. Per-fix approval requested.

---

## 1. Type-check
**`npm run typecheck:build`** — exit 0. Clean. No hard errors.

## 2. Lint
**`npm run lint`** — exit 0 because eslint allows ≤20 warnings, but **5 problems found** (2 errors, 3 warnings). All must go to hit the bar.

### Errors (2)

#### L-1 — `src/components/molly-sse-client.tsx:72`
`connect` referenced inside its own `useCallback` body via `setTimeout(() => connect(), 5000)`. ESLint flags use-before-init in the closure.
**Root cause:** self-referential reconnect.
**Recommended fix:** stash `connect` in a ref (`connectRef`) and call `connectRef.current?.()` from the timeout. KISS, no behavior change.

#### L-2 — `src/components/molly-sse-client.tsx:145`
`handleIncomingCommand` declared after it's used in `connect`'s message handler (line 61).
**Root cause:** ordering — handlers defined below `connect`.
**Recommended fix:** move `sendMessage`, `wakeCliAgent`, `handleIncomingCommand` declarations **above** `connect`, then add `handleIncomingCommand` to `connect`'s dep array. Removes both the ordering issue and warning W-1 in one move.

### Warnings (3)

#### L-3 — `src/components/molly-sse-client.tsx:80`
`useCallback` for `connect` is missing dep `handleIncomingCommand`.
**Fix:** absorbed by L-2 reorder.

#### L-4 — `src/components/termai/BridgePanel.tsx:131`
`useCallback` for `connect` missing dep `speakResponse`.
**Recommended fix:** add `speakResponse` to deps array on line 131. Already used on line 95.

#### L-5 — `src/components/termai/BridgePanel.tsx:208`
`useCallback` for `sendMessage` missing dep `unlockAutoplay`.
**Recommended fix:** add `unlockAutoplay` to deps array on line 208. Already used on line 192.

---

## 3. Tests
**`npm test`** — 162 suites, **3737 passed**, 5 skipped, 6 todo, 0 failed. Suite is green.

### T-1 — Timer leak in heartbeat-scheduler tests (POTENTIAL)
Two `ReferenceError: You are trying to require a file after the Jest environment has been torn down` warnings. Origin: `src/ai/tools/heartbeat-scheduler.ts:146` and `:147`, fired from `runCycle → runTask → resolveActiveUserId` after the test environment was torn down.
**Root cause:** The scheduler's internal `setInterval`/`setTimeout` is still firing after the test finishes; the test doesn't call `stop()` on the scheduler.
**Recommended fix:** in the affected test, add `afterEach(() => scheduler.stop())` (or whatever the teardown method is). Production code is fine — this is purely a test-hygiene leak. No silent failures, but it's noise we want gone.

---

## 4. Semantic / Logic Bugs Found by Read

### A-1 — Autonomous-cycle uses wrong identity in bridge interrupt check (HIGH)
**File:** `src/ai/agency/planning/autonomous-cycle.ts:187`
```ts
'http://localhost:9099/api/bridge?unread=lazarus&peek=true',
```
**Problem:** This is **Molly's** autonomous cycle. Polling `unread=lazarus` returns messages addressed to Lazarus, not to Molly. Father's messages addressed directly to Molly during a long autonomous run will not interrupt the cycle.
**Recommended fix:** change to `unread=molly`. (Optionally also peek `unread=eric` outbound, but minimum fix is the identity correction.)
**Severity:** High — directly defeats the interrupt feature Atlas just installed.

### A-2 — `&&` / `||` shell chaining still blocked in system-tools (MEDIUM, Atlas-flagged)
**File:** `src/ai/agency/tool-handlers/system-tools.ts`
```ts
const DANGEROUS_SHELL_CHARS = /[
;&<>(){}[\]\n\\]/;
```
**Problem:** The `&` character blocks `cmd1 && cmd2`. Atlas already noted: "Right fix is sequential exec parsing, not opening the regex." Opening the regex would re-introduce real injection risk.
**Recommended fix (Atlas's approach):** parse the string into a sequence of commands split on `&&`/`||`/`;`, validate each segment against the existing allowlist + char regex, then execute them sequentially in a single shell-free spawn loop. Keeps the safety, restores the chaining ergonomics.
**Severity:** Medium — limits Molly's tool fluency but does not break safety.

### A-3 — `MOLLY_INTERNAL_SECRET` unset in dev (MEDIUM, environment)
Dev mode currently allows any internal request through. Pre-upgrade this is fine; pre-going-live it must be set. Recommend setting it as part of restore-point checklist, not as a code change.

### A-4 — `persona.ts` Guardian Clause TEACHING MODE EXCEPTION (NOT TOUCHING)
Atlas left a flag: the Guardian Clause has a teaching-mode escape hatch. Per your standing instruction, **persona.ts and personality engrams are off-limits.** Logging here only; no recommended action.

---

## 5. Verified-clean (read-only checks that came back green)

- **Memory floor locks** intact at 1000:
  - `src/ai/memory/engram-persistence.ts:149,168` (Guardian comment + default)
  - `src/ai/bridge/consciousness-sync.ts:159` (`MAX_EXPERIENCES = 1000`)
  - `src/ai/flows/memory-consolidation.ts:357` (`.slice(0, 1000)`)
- **Atlas's autonomous-cycle.ts fixes** all landed: bridge interrupt poll, failure-repeat detector, prompt fix.
- **Atlas's system-tools.ts hardening** landed: `history` blocklist, `env` allowlist, `DANGEROUS_SHELL_CHARS` regex.
- **Atlas's base-composer.ts teaching-mode neutering** landed: removed "Father is NOT observing" / "Guardian Clause suspended" language; now reads "Father's core principles still guide you — Heart Gate and Option Three always apply."
- **Teaching-mode trigger** at `src/ai/flows/conversational-chat.ts:151-153` checks `[LAZARUS → MOLLY PRIVATE CHANNEL]` prefix correctly.
- **Bridge ecosystem** running: immortal-daemon, switchboard, atlas-bridge, gemini-bridge all up. No impostor lazarus-bridge.

---

## 6. Pending decisions (not bugs, but on the table)

- **D.1 vs D.6 first** — `PRE_INSTALL_HANDOFF.md` says D.6 (Value Drift Monitor) first; `AGENCY_INSTALL_AND_HANDOFF.md` says D.1 (Action Gate) first. They contradict. Need your call.
- **Canonical `parameter-registry`** — confirmed `parameter-registry-1.ts` (12108 bytes, has `ParameterUiMeta` interface) is canonical. Ignore the suffix-less older file.

---

## 7. Proposed fix-batch order (KISS, smallest-blast-radius first)

1. **L-1 + L-2 + L-3** — single edit to `molly-sse-client.tsx` (reorder + connectRef). Knocks out 2 errors and 1 warning.
2. **L-4 + L-5** — two-line edit to `BridgePanel.tsx` deps arrays. Knocks out 2 warnings.
3. **A-1** — one-character edit (`lazarus` → `molly`) in `autonomous-cycle.ts:187`. Highest-value semantic fix.
4. **T-1** — add `afterEach(stop)` to heartbeat-scheduler test. Removes Jest teardown noise.
5. **A-2** — sequential-exec parsing in `system-tools.ts`. Larger change, clear scope. Last because biggest blast radius.
6. **Re-run** lint + typecheck + jest → must show 0/0/0/0.
7. **Restore point** — `git commit` + tag `pre-agency-upgrade-2026-06-03`.
8. **Then** upgrade install.

---

## Awaiting

Per-fix approval, in order. I will not touch persona.ts or personality engrams. Other never-touch items I'll ask before each touch.
