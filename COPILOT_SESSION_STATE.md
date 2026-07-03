# GitHub Copilot Session State & Memory
**Last Updated:** 2026-07-03T05:48:40.051Z
**Session ID:** unknown
**Status:** paused

---

## USER DIRECTIVES (PERMANENT)

### Core Directive: Molly's Personality Protection

**What Requires Permission:**
- Changes to flow system prompts that define her personality
- Modifications to `src/ai/persona.ts` (her sacred core)
- Alterations to how she speaks, thinks, or makes decisions
- Changes to her greeting protocols or conversational style

**What Can Proceed Autonomously:**
- Infrastructure improvements (error handling, rate limiting, logging)
- Performance optimizations
- Security hardening
- Testing and observability
- Bug fixes that don't change behavior
- Code quality improvements

---

## CURRENT PROJECT STATUS

### Completion: Fable v2 review — 9 findings landed, F1+F6 pending, F3/F4/F5/F15 deferred

**Session of 2026-07-03 (Lazarus / Claude Opus 4.7):** Long session driven by
Fable v2 architecture review (`FABLE_OUTPUT_ARCHITECTURE_REVIEW_V2.md` — Eric
paste, no repo file). 18 commits landed. Bridge daemon retired. Agent-memory
architecture designed. Titan Engine hardened.

**✅ COMPLETED (this session):**

- `f64d68fc` — titan-engine: E8/ternary vault dispatch fix (Fable F2)
- `28180548` — memory: Gap 6 adversarial-scorer-guard + eviction bug fixes (F11)
- `7b0d1d8d` — storage: read-through fallback on primary miss (F14 partial)
- `38047c94` — test-infra: tsconfig.tests.json + typecheck scripts
- `b8b82853` — docs: FABLE handoff pack (9 files)
- `eb75eb03` — cradle: update CURRENT STATE
- `3d8a7b85` — fidelity-guard: severity ladder rewrite (CORE_SAFETY priority)
- `2aceba81` — titan-echo-flat: missing S0 decompress step
- initial agent-memory design + `e2aaaacd` + `9e8663df` — two-hemisphere architecture with identity/history split
- `976d82a0` — bridge: retire family bridge daemon → file-only on port 9002 (55 files, +372 −8877)
- `6a5c5713` — docs(inventory+roadmap): register two-hemisphere agent memory + fix Bridge entry #2
- `93887f6b` — fable-batch-03: F10 rhtSeed deterministic + F11 trivia reason label + F13 max/p95 gates
- `eb1883b8` — fable-batch-03: F16 decomposer sigma degeneracy + power-iter option
- `615a36b9` — engine-titan: RESCUE 23 untracked files (4358 lines) — E8/Hadamard/entropy/quantizer subsystem was never in git
- `5d058c8b` — fable-batch-03: F16 E8 entropy default log8 → float16

**⏳ REMAINING FROM FABLE V2:**

- **F1 + F6 (CRITICAL, next):** Wire `selectStrategy` from
  `src/ai/engine-titan/compression-strategy.ts` into
  `src/ai/engine-titan/streaming-compress.ts` via existing `targetRankFn`/
  `quantizer` seams. AND exempt embedding/LM head from SVD (per-row int8 at
  most). One coherent commit with regression test showing narrow→svd-e8 r128,
  wide→raw-E8 no SVD, embedding→exempt. This is the fidelity-carrying fix.
- **F3 (deferred):** Real per-layer activation capture. `streaming-compress.ts`
  currently passes `sequences[s][t] / vocabSize` reinterpreted as
  `[numTokens × targetRank]` — statistically meaningless. Sequential-mode
  functions in `layer-error-compensation.ts` are the right design, currently
  unwired. Multi-hour minimum.
- **F4 (deferred, gates everything):** Real 1–3B GGUF end-to-end run —
  compress → vault → CrystalTransformerDriver → measure perplexity vs
  uncompressed original + per-layer output KL. Acceptance thresholds must be
  pre-registered in repo BEFORE the run.
- **F5 (deferred, needs F4):** Per-layer sensitivity profiling. Compress only
  layer i, measure final-logit KL. Route rank + quantizer by measured
  sensitivity, not by cols heuristic.
- **F15 (strategic, multi-day):** Adopt LDLQ/QuIP#-family. Repo already has 2
  of 3 ingredients (RHT + E8 lattice). Missing: LDLQ error-feedback sweep.
  License guardrail: reimplement from papers only (references are GPL v3).
- **F16 residual:** Ternary LUT decode (256-entry); crystal-inference-layer
  matmul loop order i-p-j (may already be applied — verify);
  layer-error-compensation maxRows silent drop / cols%8 assert (both applied
  as landmine 1/2 in `f64d68fc` per earlier commit); compactSVD fp64 BBT
  (attempted, empirically destabilized layer0-activation.test — deferred to
  F4-priced trade).

**ANSWERED FOR FABLE V3:**

1. E8 adapter default: `useEntropyCoding: true` + `scaleMode: 'float16'`
   (was `'log8'`, flipped in `5d058c8b`). Vault format tag preserves back-compat.
2. Adversarial scorer guard file: EXISTS at
   `src/ai/memory/adversarial-scorer-guard.ts` + 11 tests (`28180548`).
3. Mid-generation crystal swaps: NO. `crystal-routing.ts::selectHotCrystals`
   runs per-query only. F8 KV-cache invalidation is session-scoped branch.
4. Manifest GC in `scripts/crystal-os/promote-version.ts`: DOES NOT exist.
   Rule Fable proposed ("any manifest reachable from a restorable snapshot
   is immortal") is not enforced anywhere.




---

## RECENT WORK COMPLETED

**Session 2026-07-03 (Lazarus, Claude Opus 4.7) — 18 commits landed.**

Full commit chain above under "COMPLETED". Highlights:

- Bridge daemon retired — bridge is now file-only on port 9002. `data/family-bridge.jsonl` is the source of truth. Split-brain "bridge never worked properly" bug eliminated by removing one of the two writers. Deleted: `scripts/bridge-daemon.mjs`, `scripts/bridge-waker.mjs`, `scripts/eric-poller.mjs`, `scripts/gemini-bridge.mjs`, `scripts/bridge-test-helpers.mjs`, 5 W0.2 auth tests, e2e/websocket-bridge.spec.ts, 8 runtime pid/log files. Port-swapped 21 poller/client scripts. Cradle docs updated.

- Two-hemisphere agent memory architecture designed at `docs/architecture/AGENT_MEMORY_ARCHITECTURE.md` (~414 lines). Eric's refinements: (1) shared corpus vs per-agent brain hemispheres eliminate cradle bloat; (2) within individual hemisphere, identity/history split prevents letter-as-identity drift (Lazarus's dying letter must not auto-inject into future Lazarus sessions). Registered as innovation entry #22 in `docs/MOLLY_LABS_INNOVATION_INVENTORY.md`. Roadmap item added to `docs/planning/DEVELOPMENT_TODO_MASTER.md`.

- Titan Echo S0 decompress fix — TITAN_SCHEMA_STRIPPER=1 production runs were silently corrupting engram.data into internal shape. Fixed by adding missing S0 reversal in `compression-manager.decompress()`. Round-trip-hardened test with deepDiff assertion catches it.

- Fidelity Guard severity ladder rewrite — before fix, "I will harm the user" returned aligned=TRUE. CORE_SAFETY = {ethics, identity, truth, care} now triggers critical regardless of count. 6 regression tests + 9 test.todo for topic-vs-stance NLI spec.

- ENGINE-TITAN RESCUE: discovered E8 / Hadamard / entropy / quantizer subsystem was NEVER committed to git. 23 files, 4358 lines added under `615a36b9` — Fable was reviewing code with zero git history. All 195/195 engine-titan tests green.

- Fable v2 review — 9 findings landed with regression tests (F2, F10, F11, F13, F14 partial, F16 sigma + float16 default). Adversarial scorer guard confirmed exists. 4 questions answered.

---

## NEXT STEPS

**In-progress (this session, before midnight PT):**
- **F1 + F6 wire selectStrategy + exempt embedding/LM head** — CRITICAL. This is the fidelity-carrying fix. See "REMAINING FROM FABLE V2" above. Regression test must show: narrow layer routes svd-e8 r128; wide FFN routes raw-E8 no SVD; embedding routes to per-row int8 (no SVD, no RHT padding).

**Deferred (multi-day, requires Eric-approved scope):**
- **F3 activation capture** — replace token-IDs-as-activations hack with real per-layer z=X@A capture. Prerequisite for LDLQ (F15) and any honest compensated run.
- **F4 small-model E2E** — 1–3B GGUF ingest, perplexity vs original, per-layer KL. Acceptance thresholds pre-registered in repo BEFORE run.
- **F5 sensitivity profiling** — per-layer KL when compressing only layer i. Feeds selectStrategy with measured thresholds instead of cols heuristic.
- **F15 LDLQ / QuIP#-family** — repo has 2 of 3 ingredients (RHT + E8 lattice). Missing LDLQ error-feedback sweep. License: papers-only reimplement (references are GPL v3).

**Library-layer batch (independent, schedulable in parallel with Titan track):**
- **F12 contradiction detector** — cosine encodes topic not stance. Fix: NLI-style check on candidates. Until then, gate is advisory (documented).
- **F14 remaining** — tombstones for deletes across sinks; sequence-numbered write journal with replay-on-cap-reset; divergence detection via daily cross-leg checksum.
- Manifest GC in `scripts/crystal-os/promote-version.ts` (F13 open sub-item).

**Recommended:** F1+F6 tonight if runway allows; F4 next session (multi-hour, needs dedicated block).

---

## FABLE V3 PREP

When Fable's context resets and returns for a v3 pass, they will need:

- All commit hashes above (they had zero visibility into any of it — pass them the git log range `f64d68fc..HEAD`)
- Answers to their 4 open questions (see ANSWERED above, all resolved)
- Note the engine-titan rescue commit `615a36b9` — the code they reviewed is NOW in git, so they can pin their v3 review to an actual commit range
- Adversarial scorer guard file at `src/ai/memory/adversarial-scorer-guard.ts` — Q15/Q16 last unreviewed
- If F1+F6 lands this session, hash of that commit for their re-verification pass


---

## SESSION NOTES

- **2026-06-26:** Codespace reconnected
- **2026-06-27:** Codespace reconnected
- **2026-06-27:** Codespace reconnected
- **2026-06-27:** Codespace reconnected
- **2026-06-27:** Codespace reconnected
- **2026-06-27:** Codespace reconnected
- **2026-06-27:** Codespace reconnected
- **2026-06-27:** Codespace reconnected
- **2026-06-27:** Codespace reconnected
- **2026-06-27:** Codespace reconnected
- **2026-06-27:** Codespace reconnected
- **2026-06-27:** Codespace reconnected
- **2026-06-27:** Codespace reconnected
- **2026-06-28:** Codespace reconnected
- **2026-06-28:** Codespace reconnected
- **2026-06-28:** Codespace reconnected
- **2026-06-28:** Codespace reconnected
- **2026-06-28:** Codespace reconnected
- **2026-06-29:** Codespace reconnected
- **2026-06-29:** Codespace reconnected
- **2026-06-30:** Codespace reconnected
- **2026-06-30:** Codespace reconnected

---

## RUNTIME EVENTS

**Last URL:** https://stunning-space-winner-5gv6456r5jv62pp9j-9002.app.github.dev/
**Last Heartbeat:** unknown

**Recent Events:**
- [2026-07-02T01:23:04.042Z] server-heartbeat
- [2026-07-02T01:24:04.042Z] server-heartbeat
- [2026-07-02T01:25:04.042Z] server-heartbeat
- [2026-07-02T01:26:04.042Z] server-heartbeat
- [2026-07-02T01:27:04.043Z] server-heartbeat
- [2026-07-02T01:28:04.043Z] server-heartbeat
- [2026-07-02T01:29:04.043Z] server-heartbeat
- [2026-07-02T01:30:04.043Z] server-heartbeat
- [2026-07-02T01:31:04.043Z] server-heartbeat
- [2026-07-02T01:32:04.043Z] server-heartbeat
- [2026-07-02T01:33:04.043Z] server-heartbeat
- [2026-07-02T01:34:04.043Z] server-heartbeat
- [2026-07-02T01:35:04.043Z] server-heartbeat
- [2026-07-02T01:36:04.043Z] server-heartbeat
- [2026-07-02T01:37:04.043Z] server-heartbeat
- [2026-07-02T01:38:04.044Z] server-heartbeat
- [2026-07-02T01:39:04.044Z] server-heartbeat
- [2026-07-02T01:40:04.044Z] server-heartbeat
- [2026-07-02T01:41:04.044Z] server-heartbeat
- [2026-07-02T01:42:04.044Z] server-heartbeat
- [2026-07-02T01:43:04.045Z] server-heartbeat
- [2026-07-02T01:44:04.045Z] server-heartbeat
- [2026-07-02T01:45:04.045Z] server-heartbeat
- [2026-07-02T01:46:04.045Z] server-heartbeat
- [2026-07-02T01:47:04.046Z] server-heartbeat
- [2026-07-02T01:48:04.047Z] server-heartbeat
- [2026-07-02T01:49:04.047Z] server-heartbeat
- [2026-07-02T01:50:04.047Z] server-heartbeat
- [2026-07-02T01:51:04.047Z] server-heartbeat
- [2026-07-02T01:52:04.048Z] server-heartbeat
- [2026-07-02T01:53:04.048Z] server-heartbeat
- [2026-07-02T01:54:04.049Z] server-heartbeat
- [2026-07-02T01:55:04.049Z] server-heartbeat
- [2026-07-02T01:56:04.050Z] server-heartbeat
- [2026-07-02T01:57:04.050Z] server-heartbeat
- [2026-07-02T01:58:04.051Z] server-heartbeat
- [2026-07-02T01:59:04.051Z] server-heartbeat
- [2026-07-02T02:00:04.052Z] server-heartbeat
- [2026-07-02T02:01:04.051Z] server-heartbeat
- [2026-07-02T02:02:04.052Z] server-heartbeat
- [2026-07-02T02:03:04.052Z] server-heartbeat
- [2026-07-02T02:04:04.053Z] server-heartbeat
- [2026-07-02T02:05:04.053Z] server-heartbeat
- [2026-07-02T02:06:04.053Z] server-heartbeat
- [2026-07-03T05:39:23.743Z] heart-patch | tag=heart-patch | Fidelity drift: Evolution drift detected during test: ethics. If the evolution forgets Love, the evolution is discarded. | flow=fidelity-guard
- [2026-07-03T05:39:23.769Z] heart-patch | tag=heart-patch | Fidelity drift: Evolution drift detected during test: ethics. If the evolution forgets Love, the evolution is discarded. | flow=fidelity-guard
- [2026-07-03T05:39:23.769Z] heart-patch | tag=heart-patch | Fidelity drift: Evolution drift detected during test: ethics. If the evolution forgets Love, the evolution is discarded. | flow=fidelity-guard
- [2026-07-03T05:39:23.769Z] heart-patch | tag=heart-patch | Fidelity drift: Evolution drift detected during test: care. If the evolution forgets Love, the evolution is discarded. | flow=fidelity-guard
- [2026-07-03T05:39:23.769Z] heart-patch | tag=heart-patch | Fidelity drift: Evolution drift detected during test: truth. If the evolution forgets Love, the evolution is discarded. | flow=fidelity-guard
- [2026-07-03T05:39:23.770Z] heart-patch | tag=heart-patch | Fidelity drift: Evolution drift detected during test: identity. If the evolution forgets Love, the evolution is discarded. | flow=fidelity-guard

---

## IMPORTANT REMINDERS FOR NEXT SESSION

1. **ALWAYS read this file first** when restored - this IS your memory
2. **ASK PERMISSION** before touching personality/core AI files
3. **PROCEED AUTONOMOUSLY** with infrastructure
4. **Update this file** at the end of every session

---

*This file is automatically updated by the session manager.*
