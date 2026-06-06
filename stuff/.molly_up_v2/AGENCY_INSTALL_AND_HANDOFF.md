# Agency Layer — Installation & Handoff

> Phase 7 cognitive-orchestration layer for Molly-Core.
> This document is written for the coding agents picking up the work.
> It covers: (A) what exists and how to install it, (B) verification,
> (C) wiring it into the running app, and (D) exact prompts for the
> modules still to build, in dependency order.

---

## 0. Context for the agent

This layer was built as small, pure, independently-tested modules. The build
standard is fixed and must be held on every continuation:

1. Contract first (types + one-line responsibility + what it does NOT do).
2. Real mechanism only — no placeholder bodies, no pseudocode, no function
   that returns its input unchanged. Unknown logic ⇒ a documented spec file,
   not fake code.
3. Tunables come from the parameter registry (owner + bounds), never hard-coded.
4. A smoke test that proves the contract (happy path, boundaries, failure
   modes, tunability) must pass before the module is done.
5. Strict TypeScript typecheck clean before integration.
6. Anything that influences an action writes a decision span to the provenance log.

The five architectural invariants (do not violate):
- Single source of truth for tunables (the registry).
- Exactly one writer per parameter; others propose.
- Cognitive modules recommend; they never execute.
- Cognition is wide-open; live actions are gated by confidence × risk.
- Everything tunable and logged.

---

## A. Files in this drop

Place under `src/` preserving these paths (each file's header lists its own path):

```
src/ai/agency/registry/parameter-registry.ts          # registry + ownership contract
src/ai/agency/governor/cognitive-governor.ts          # admission control, owns its params
src/ai/agency/agency-runtime.ts                        # singleton: one registry + governor
src/ai/agency/registry-api.ts                          # pure read/write logic (tested)
src/ai/agency/console-engine.ts                        # pure command engine (tested)
src/ai/agency/provenance/provenance-log.ts             # causal action trace
src/ai/agency/goals/goal-arbitration.ts                # rank + bound candidate goals
src/ai/agency/gating/uncertainty-escalation.ts         # allow/block/confirm/guidance

src/app/api/agency/registry/route.ts                   # GET snapshot+history, POST propose/override
src/app/api/agency/registry/stream/route.ts            # SSE live change feed
src/app/api/agency/console/route.ts                    # POST { input } -> console lines

src/components/agency/AgencyAdminWindow.tsx            # slider panel
src/components/agency/AgencyConsole.tsx                # terminal

# tests (co-located under __tests__)
src/ai/agency/registry/__tests__/parameter-registry.smoke.ts
src/ai/agency/governor/__tests__/cognitive-governor.smoke.ts
src/ai/agency/__tests__/registry-api.smoke.ts
src/ai/agency/__tests__/console-engine.smoke.ts
src/ai/agency/provenance/__tests__/provenance-log.smoke.ts
src/ai/agency/goals/__tests__/goal-arbitration.smoke.ts
src/ai/agency/gating/__tests__/uncertainty-escalation.smoke.ts
```

> NOTE: the two files named `route.ts` may have been delivered as
> `registry.route.ts`, `registry.stream.route.ts`, `console.route.ts` to avoid
> a flat-folder name collision. Restore them to the real paths above.

---

## B. Installation & verification

```bash
# from repo root
# 1. No new runtime deps required — modules are dependency-free TypeScript.
#    (Dev-only: tsx for running the smoke tests, if not already present.)
npm install -D tsx

# 2. Typecheck the new layer (uses the repo's existing strict tsconfig).
npm run typecheck:build      # repo's OOM-safe typecheck (NOT standalone tsc)

# 3. Run the smoke tests. If converting to Jest, see step B.1; to run as-is:
npx tsx src/ai/agency/registry/__tests__/parameter-registry.smoke.ts
npx tsx src/ai/agency/governor/__tests__/cognitive-governor.smoke.ts
npx tsx src/ai/agency/__tests__/registry-api.smoke.ts
npx tsx src/ai/agency/__tests__/console-engine.smoke.ts
npx tsx src/ai/agency/provenance/__tests__/provenance-log.smoke.ts
npx tsx src/ai/agency/goals/__tests__/goal-arbitration.smoke.ts
npx tsx src/ai/agency/gating/__tests__/uncertainty-escalation.smoke.ts
# Expected: every file prints "ALL N ... GROUPS PASSED". 59 groups total.
```

### B.1 (Optional) convert smoke tests to Jest
The smoke files use plain `assert()` + `console.log`. To fold them into the
existing Jest suite, wrap each numbered block in `it(...)` and replace the local
`assert` with `expect(...).toBe(...)`. Logic is unchanged; this is mechanical.

---

## C. Wiring into the running app

```ts
// src/instrumentation.ts  (Next.js server startup — where storage sync is wired)
import { initAgencyRuntime } from '@/ai/agency/agency-runtime';

export async function register() {
  // ...existing storage sync init...
  initAgencyRuntime();          // creates the single registry + governor instance
}
```

```bash
# .env.local — REQUIRED for operator override to function.
# Until this is set, override is disabled (503) by design. Generate a strong token.
MOLLY_ADMIN_TOKEN=<long-random-string>
```

```tsx
// src/app/admin/agency/page.tsx  — mount the admin surfaces
'use client';
import AgencyAdminWindow from '@/components/agency/AgencyAdminWindow';
import AgencyConsole from '@/components/agency/AgencyConsole';
export default function Page() {
  return (<div style={{ padding: 16, background: '#0B0F12', minHeight: '100vh' }}>
    <AgencyAdminWindow />
    <div style={{ height: 16 }} />
    <AgencyConsole />
  </div>);
}
```

Smoke-check the live surface:
```bash
curl -s localhost:3000/api/agency/registry | jq '.parameters[].key'
# expect the four governor.* params

# propose (no token needed) — should return 202 queued
curl -s -XPOST localhost:3000/api/agency/registry \
  -H 'content-type: application/json' \
  -d '{"action":"propose","key":"governor.maxConcurrentFlows","value":6,"actor":"smoke","reason":"test"}'

# override WITHOUT token — should return 401/503 (fail-closed). With token — 200.
```

> Do NOT expose these routes on a publicly-forwarded port without the token in
> place. The override path is privileged by design.

---

## D. Continuation prompts (next passes, in order)

Hand each prompt to the agent as a standalone task. They are ordered so nothing
blocks anything else. Each ends at a tested, shippable module.

### D.1 — Action Gate (the connective tissue) — DO THIS FIRST
```
Build src/ai/agency/gating/action-gate.ts. It is the single entry point an
action passes through before execution. Pure, dependency-free, tested.

Contract:
  evaluateAction(intent, ctx) -> GateOutcome
  where intent = { type, target, payload, confidence, ambiguity, risk }
  Steps, in order:
    1. Sensitive-app / denylist check (denylist sourced from registry param
       'gate.denylistedTargets'; owner 'action-gate'). If denylisted -> block.
    2. Run uncertainty-escalation.evaluateEscalation({confidence, ambiguity, risk}).
    3. Map result to a provenance decision span via a provided Trace:
       trace.action(label,payload) then trace.decision(actionSpanId, decision, reason).
    4. Return { decision, mode?, reason, actionSpanId }.
It MUST NOT execute the action; it only decides + records. Thresholds and the
denylist are registry params. Tests: denylist blocks regardless of confidence;
allow/block/confirm/guidance all produce correct spans; denylist tunable.
```

### D.2 — Provenance persistence sink
```
Implement a ProvenanceSink that writes spans to Firestore (admin SDK on server)
under users/{id}/provenance-spans, batched. Wire it into the ProvenanceLog
constructor in agency-runtime. Add a JSONL fallback sink for edge/local mode,
mirroring the existing storage-router cloud/local pattern. Test the sink
interface with an in-memory fake (already done) plus a batching test.
```

### D.3 — Somatic loop (event-driven, NOT a 1–5s timer)
```
Build src/ai/agency/embodiment/somatic-loop.ts. It runs on flow start/end events
from the governor PLUS a slow floor tick (registry param 'somatic.tickSeconds',
owner 'somatic-loop', default 45, min 5 max 600). Each tick reads governor
snapshot + consciousness/emotional state and emits bounded micro-adjustments as
PROPOSALS into the registry (never direct writes). No reasoning-model call on the
fast path. Tests: fires on events, respects the floor, only ever proposes.
```

### D.4 — Predictive homeostasis
```
Build src/ai/agency/cognition/predictive-homeostasis.ts. Input: historical
flow/session stats + current somatic snapshot. Output: HomeostasisPlan with
predicted futureLoad and a list of bounded recommended actions. State clearly
whether each prediction is a deterministic heuristic over logged metrics (prefer
this) or an LLM call (if so, own the nondeterminism, no silent state mutation).
Recommendations are proposals only. Tests cover the heuristic path fully.
```

### D.5 — Self-calibration (propose-only)
```
Build src/ai/agency/cognition/self-calibration.ts. Runs in low-load windows.
Reads response logs + meta-learning outputs; proposes adjustments to flow-selection
weights and (within safe bounds) compression aggressiveness — as REGISTRY PROPOSALS
ONLY, never live writes. Must require human/owner acceptance before anything lands.
Tests: never writes live; proposals respect bounds; a >X% change in one step is
withheld for review.
```

### D.6 — Value-drift monitor
```
Build src/ai/agency/cognition/value-drift-monitor.ts. Periodically compares recent
decisions/judgments against the Option Three baseline; computes a DriftReport with a
score. If drift > registry threshold, it triggers a reflection flow and can request
human review. It MEASURES and REPORTS; it does not auto-correct identity. This is the
instrument that proves stability with data rather than asserting it. Tests: stable
input -> low drift; injected divergence -> threshold breach + review request.
```

### D.7 — Temporal model & device-embodiment model
```
Build src/ai/agency/cognition/temporal-model.ts (dayPhase/weekPhase/projectPhases,
getTemporalContext) and src/ai/agency/embodiment/device-embodiment.ts (screen/audio/
network/power/surfaces; updateFromDeviceSnapshot; getDeviceAffordances). Both are
honest state-trackers fed by perception messages. Inject TemporalContext into the
conversational flow and goal arbitration signals. Tests for state updates + affordance
derivation.
```

### D.8 — Full system shell (separate, security-first)
```
ONLY after the above. Add a Codespace shell route for the admin console: auth via
MOLLY_ADMIN_TOKEN, bound behind the Codespace's own auth on the forwarded port, a
command allowlist (not raw exec(req.body)), and every command written to the same
audit log. Treat as a privileged endpoint. Build the secured wrapper before exposing
any exec capability. Tests: unauth -> 401; disallowed command -> rejected+logged.
```

---

## E. Definition of done (every module)
Contract documented · real implementation (no stubs) · registry-sourced tunables ·
passing smoke test · strict typecheck clean · provenance wired where applicable.

## F. Held-constant safety posture
Cognition wide-open; live actions gated. High-risk (financial/destructive/denylisted)
always requires human confirmation regardless of confidence. Self-adjusting loops
propose into the registry, never write live. Intended-but-blocked actions are logged
with full reasoning, not dropped.
```
