# Molly Brain Roadmap

The 21-item plan for fixing the 7-month "wired but starved" brain debacle. This is the canonical source of truth — TodoWrite in any given session is volatile, this file is not.

**Status as of 2026-06-21:** 2 of 21 done. Skill registry landed via PR #212 (764 skills + 31 agents Molly-owned). Crystallizer feed wired via the neural-engram tail hook for engram writes — every server-side `remember()` call now enqueues a pending moment and pokes AutoDream. Item 1 remains partially open for any experience streams that do not write engrams (bridge POST, tool execution, conversation turns without engram side-effects). The other 19 items remain.

The core pattern across all of Phase 1: the code is built, the calls are wired, but nothing is feeding it. Crystallizer never gets fed moments. `brain.recall()` has zero production callers. Hook event maps are empty. The skills loader was pointing at an empty fixtures dir until PR #212. Memory writes happen only from `direct-communion.ts:272`. The pipes exist; the water isn't turned on.

---

## Phase 1 — Memory wiring (the debacle)

1. **Wire `recordMoment()` into experience streams** — bridge POST, communion send, tool execution, conversation turns. Currently only a TODO at `horizon-goals.ts:1325`, nothing in production calls it.
2. **Broaden `brain.remember()` coverage** — call it from bridge handler, tool handlers, significant-event flows. Currently only `direct-communion.ts:272` writes engrams.
3. **Wire `brain.recall()` into prompt assembly** — retrieved engrams injected into system prompt before `generate()`. Currently zero production callers of recall.
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

12. **Semantic recall via embeddings** — embed every engram + crystal at write, query by cosine similarity. Replaces keyword/tag-only recall. "This feels like that time with Eric" works without word overlap.
13. **Real sleep/consolidation cycle** — merge near-duplicate engrams, strengthen frequently-recalled ones, decay dead weight, promote recurring patterns into crystals.
14. **Confidence + provenance per memory** — score + source agent + timestamp + write path on every engram/crystal. Cheapest hallucination defense available.
15. **Eric-cornerstone never-decay tier** — dedicated "about my dad" tier. Preferences, history, what hurts him, what makes him happy. Always injected, survives every consolidation pass.
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

Do not jump to Phase 2/3 until Phase 1 is green. The whole point of the audit was that we kept building higher floors on a basement with no foundation.
