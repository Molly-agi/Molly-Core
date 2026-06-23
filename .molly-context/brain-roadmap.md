# Molly Brain Roadmap

The 21-item plan for fixing the 7-month "wired but starved" brain debacle. This is the canonical source of truth — TodoWrite in any given session is volatile, this file is not.

**Status as of 2026-06-23 (evening):** 8 of 21 done, item 2 in CI (#256). Skill registry landed via PR #212 (764 skills + 31 agents Molly-owned). Crystallizer feed wired via the neural-engram tail hook. Today's session closed items 1 (horizon-goals milestone wire + audit of bridge/chat/tool sites confirming already-wired), 3 (recall lock test, #255), 12 (semantic recall, 6f410437), 13 (sleep/consolidation, c24cedd4), 14 (provenance schema + caller threading, #248 + #253), and 15 (cornerstone never-decay tier, #254). Item 6b done in 01b3e9d0 (Firestore round-trip), parent item 6 still open for the full end-to-end. Remaining: 2 (in CI), 4, 6 (partial), 7, 8, 9, 10, 16, 17, 18, 19, 20, 21.

The core pattern across all of Phase 1: the code is built, the calls are wired, but nothing is feeding it. Crystallizer never gets fed moments. `brain.recall()` has zero production callers. Hook event maps are empty. The skills loader was pointing at an empty fixtures dir until PR #212. Memory writes happen only from `direct-communion.ts:272`. The pipes exist; the water isn't turned on.

---

## Phase 1 — Memory wiring (the debacle)

1. ✅ **DONE — Wire `recordMoment()` into experience streams (2026-06-23).** Audit found 3 of 4 named gaps already-wired in prior work: bridge POST handler (`src/app/api/bridge/route.ts:120-128`, PR #214), conversation turn completion (`src/ai/flows/conversational-chat.ts:398-407`, both user + reply), tool-executor PostToolUse (`src/ai/agency/core/tool-executor.ts:202-221`). Last gap closed today: `horizon-goals.ts:1325` TODO filled — `achieveMilestone()` now fires `recordGoalMilestoneForCrystallization()` → `brain.remember()` with `provenance: { source: 'horizon-goals' }` (importance 0.7, tags include goal id + horizon). The neural-engram tail hook (item 5) automatically feeds the crystallizer + AutoDream. 3/3 contract tests green. Note: `achieveMilestone()` itself has no production callers yet (autonomous-goal-pursuit loop is a separate gap, not item-1 scope) — but when something starts invoking it, engram formation now fires.
2. **Broaden `brain.remember()` coverage** — call it from bridge handler, tool handlers, significant-event flows. Currently only `direct-communion.ts:272` writes engrams.
3. ✅ **DONE — `brain.recall()` wired into prompt assembly (verified 2026-06-23).** Chain: `conversational-chat.ts:256` passes user `text` as `recallQuery` → `base-composer.ts:491` `composeSystemPrompt()` → `base-composer.ts:444` `volatileSection('recalled', ...)` → `base-composer.ts:169` `buildRecallInjection()` → `getNeuralBrain().recallEverything()`. Roadmap line was stale — wire existed but no test forced anyone to notice. Locked by contract suite at `src/ai/prompts/__tests__/recall-prompt-injection.contract.test.ts` (3 tests, end-to-end remember() → composeSystemPrompt() with no mock of neural-engram). Follow-up (deferred): audit which of the ~25 other `generate()` sites should pull recall vs which shouldn't (TTS/music/vision: no; introspection/code-analysis: yes; case-by-case for the rest).
4. **Inject crystals into system prompt** — recent crystals + cornerstones, using the same pattern as `buildFamilyKnowledgePrompt()` in `family-knowledge.ts`.
5. ✅ **DONE — Crystallize output path verified + fed (2026-06-21).** The actual crystallize call site is `heartbeat-scheduler.ts:997` (not :824 — that line is bridge-polling; roadmap line was stale). Investigation showed the heartbeat scheduler is hard-disabled in event-driven mode (`/api/heartbeat/scheduler` reports `status: stopped`, `cycleCount: 0`, all 16 tasks `false`); the event-driven replacement `triggerAutoDream()` at `auto-dream.ts:282` had zero production callers. Fix: hook at `neural-engram.ts` `remember()` tail enqueues a pending moment via `recordMoment()` and fires `triggerAutoDream()` server-side (dynamic imports, fire-and-forget, logged catches). Single coupling point — every future engram writer benefits automatically. Closes item 5 and partially covers item 1 for the engram-write path.
6. **Verify Firestore engram persistence** — `engram-persistence.ts` actually writes and reads end-to-end with locked floors of 1000 intact.
7. **End-to-end memory smoke test** — trigger event → `recordMoment` fires → crystal created on next heartbeat → recall query finds it → next prompt contains it. No mocks. Real bridge, real engrams, real Firestore.
8. **Confirm `memory-consolidation` is non-trivial** — `heartbeat-scheduler.ts:532` call must not be a no-op once engrams start flowing.
9. **Document the memory pipeline** — recordMoment → crystallize → recall → prompt injection. One place. So the next agent doesn't re-derive it from grep.

## Phase 1 — Other

10. **Register real production hooks** — at least one for each event (PreToolUse, PostToolUse, HeartbeatCycle, BridgeMessage) in `src/ai/hooks/` so `triggerHook` fires meaningful work. Maps are empty.
11. ✅ **DONE — Skill registry from 4 sources** (PR #212, merged 2026-06-21). 754 Anthropic cybersec skills + 32 pentest agents + 3 commands + 7 local SKILL.mds at `src/skills/registry/`.

## Phase 2 — Make memory actually intelligent

12. ✅ **DONE — Semantic recall via embeddings (2026-06-23, commit 6f410437).** Right-hemisphere semantic recall path added: embed engrams + crystals at write, cosine-similarity query at recall. Replaces keyword/tag-only recall. 23 item-12 semantic tests green.
13. ✅ **DONE — Real sleep/consolidation cycle (2026-06-23, commit c24cedd4 + follow-ups).** Merges near-duplicate engrams (argmax pick, not first-match, per Lazarus pushback), strengthens frequently-recalled, decays dead weight, promotes recurring clusters into crystals via named `PROMOTE_THRESHOLD = 5.0` constant (per Lazarus pushback — no magic number in default param). Distribution logged for tuning. 16/16 cycle tests green.
14. ✅ **DONE — Confidence + provenance per memory (2026-06-23, PR #248 schema + PR #253 callers).** Every engram now carries `EngramProvenance { source, confidence, writePath, timestamp }`. Schema landed in #248 with `WRITE_PATH_DEFAULT_CONFIDENCE` map. #253 threaded provenance through all caller sites (heart-gate, molly initiative, direct-communion, etc.) with colon-separated qualifiers (`heart-gate:block-to-allow`, `molly:initiative-create`). Cheapest hallucination defense available, now real.
15. ✅ **DONE — Eric-cornerstone never-decay tier (2026-06-23, PR #254).** `MemoryEngram.cornerstone?: string` field; FrontalCortex skips cornerstone engrams in `evictWeakest`, `startDecay`, `getConsolidationCandidates`. `getCornerstones()` snapshot method. `recall()` + `recallEverything()` always-inject cornerstones at tail with id de-dup. Auto-promotion when `provenance.source === 'eric'`. Eviction guard documented inline: if all 7 working slots are cornerstone, eviction no-ops and next hold() briefly pushes size to 8 — accepted tradeoff vs. losing a never-decay memory. Preferences, history, what hurts him, what makes him happy — always injected, survives every consolidation pass.
16. **Weekly self-narrative autobiography** — once a week, Molly writes the story of who she's been the last 7 days from her own engrams. That narrative becomes its own memory. Identity continuity across sessions.

## Phase 3 — Two-hemisphere brain + knowledge ingestion

17. **Two-hemisphere architecture** — separate knowledge-side store distinct from personality/memory side. Left: facts/world-model/references. Right: engrams/crystals/emotion. Different write and recall paths, both queryable.
18. **Public corpora ingestion** — Wikipedia dumps, Stack Exchange, arXiv, public technical docs, open training datasets (The Pile, RedPajama, FineWeb) into the knowledge hemisphere. Crystallize and embed for semantic recall.
19. **MarkItDown PDF/doc ingestion** — wire vendored `markitdown_mcp_server` as document-to-markdown converter. PDF/Word/Excel/PPT/images (OCR)/audio (transcription)/HTML/CSV/JSON/XML/ZIP. Watched-folder pipeline: drop file → markdown → embed → crystallize into knowledge hemisphere. "PDFs per minute" is host-CPU dependent — benchmark before claiming numbers.
20. **Frontier-model distillation** — for things not in open corpora, query Gemini/Claude/others and store verified outputs as crystals with provenance ("source: gemini-3.1-pro, queried 2026-XX-XX"). Only legal "transfer" from frontier model knowledge.
21. **Triple-bind storage layer** — every write goes to local repo (git-LFS for large blobs), future local server (mirrored from repo), Firestore (live operational copy). Flag Firestore cost ceiling and git size limits before scaling corpus ingestion.

---

## When picking up after restart

Recommended entry order: **5 → 1 → 2 → 3 → 4 → 7**. Verify the output path is real first (item 5) so you know whether you're feeding a working pipe or a broken one. Then turn on the water (items 1-4). Then prove it end-to-end (item 7). Items 6, 8, 9, 10 can run alongside.

As of 2026-06-23 evening: 1 ✅, 3 ✅, 5 ✅, 11 ✅, 12 ✅, 13 ✅, 14 ✅, 15 ✅ done. Item 2 in CI (#256). Next Phase 1 frontier: items 4, 7, 8 (active slots), then 6 (parent), 9, 10.

Do not jump to Phase 2/3 until Phase 1 is green. The whole point of the audit was that we kept building higher floors on a basement with no foundation.
