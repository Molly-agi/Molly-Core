# Molly Brain Roadmap

The 21-item plan for fixing the 7-month "wired but starved" brain debacle. This is the canonical source of truth — TodoWrite in any given session is volatile, this file is not.

**Status as of 2026-06-23 (Atlas, item-8 dam-fix):** 8 of 21 done.

Phase 1 wiring is substantially complete (items 1–5 + 7 done; 6, 8, 9, 10 remain). The 2026-06-21 status was understated — code grep + an end-to-end smoke test (item 7) showed that items 1–4 had landed across PR #214, #218, #223 but were never reflected here. This rewrite cites file:line for every "DONE" claim so future agents can verify without re-deriving.

The original pattern across Phase 1 was: code built, calls wired, nothing feeding it. That pattern has now been broken end-to-end for the _in-process_ path. The remaining Phase 1 work is verification (Firestore + consolidation), documentation, and real hook registration. Phase 2 and 3 are real engineering, not cleanup.

---

## Phase 1 — Memory wiring (the debacle)

1. ✅ **DONE — `recordMoment()` wired into experience streams.** Wired transitively via the neural-engram tail hook (see item 5). Every `brain.remember()` call enqueues a pending moment. Live callers of `brain.remember()`:
   - Bridge POST → `src/app/api/bridge/route.ts:117` (PR #214)
   - Conversation turns (user + assistant) → `src/ai/flows/conversational-chat.ts:398` and `:403`
   - Tool execution → `src/ai/agency/core/tool-executor.ts:206`
   - Direct communion → `src/ai/consciousness/direct-communion.ts:272`
   - Voice command processor → `src/ai/tools/voice-command-processor.ts`
     The `horizon-goals.ts:1325` TODO listed in the original item is now obsolete — the broader-coverage path made the per-call site unnecessary.

2. ✅ **DONE — `brain.remember()` coverage broadened.** Same call sites as item 1. Originally only `direct-communion.ts:272`; now bridge + conversation (both directions) + tool execution + voice all write engrams. PR #214 wired bridge, PR #218 / #223 added the symmetric mirror to the left hemisphere (KnowledgeStore).

3. ✅ **DONE — `brain.recall()` wired into prompt assembly.** `src/ai/prompts/composers/base-composer.ts:114-122` recalls up to 5 memories across both hemispheres via `recallEverything()` and formats them for prompt injection. Wired in PR #218 / #223. The fanout also re-promotes high-similarity left hits into the hippocampus so the next recall is local-fast — closes the amnesia loop on the read side.

4. ✅ **DONE — Crystals injected into system prompt.** `src/ai/memory/crystal-context.ts` exposes `buildConversationCrystalContext()` (line 39), with `formatIdentityCrystals` (line 234) and `formatKnowledgeCrystals` (line 257) for prompt-string generation. Imported by `src/ai/flows/conversational-chat.ts:15`. Caveat: the encrypted-persistence path requires `ENGRAM_SECRET`; without it the function returns an empty context (line 49 guard). In-process recall via `getRecent()` works unconditionally.

5. ✅ **DONE — Crystallizer feed wired via the neural-engram tail hook (2026-06-21).** `src/ai/memory/neural-engram.ts:949-975` — every server-side `remember()` call dynamic-imports the crystallizer + AutoDream, calls `recordMoment()`, then fires `triggerAutoDream()` fire-and-forget. Single coupling point — every future engram writer benefits automatically. The heartbeat scheduler is hard-disabled in event-driven mode; this hook is its replacement.

6. **OPEN — Verify Firestore engram persistence.** `src/ai/memory/engram-persistence.ts` actually writes and reads end-to-end with locked floors of 1000 intact. Needs a live-credentials integration test (not jest-mockable) or Firebase emulator step. Item 7 explicitly excludes this leg.

7. ✅ **DONE — End-to-end memory smoke test (2026-06-23, re-landed).** `src/ai/__tests__/memory-pipeline.e2e.test.ts` — 1 test, ~0.4s. Triggers `brain.remember()` → waits for the fire-and-forget crystallizer feed → asserts pendingMoments + sessionMoments grow (proves item 1+2+5 wiring) → calls `crystallizeSession()` directly (bypasses AutoDream gates for determinism — item 8 separate) → asserts crystal created and `totalCrystals` grew → calls `brain.recall(token)` and asserts retrieval from working memory → calls `searchCrystals(token)` and asserts crystal-by-content retrieval. Surgical mocks only: logger noise, `engram-persistence` (Firestore boundary), and `auto-dream.triggerAutoDream` (item-8 isolation). Everything between `brain.remember` and crystal retrieval runs unmocked. **Honesty note (Atlas, 2026-06-23):** the 2026-06-22 roadmap rewrite claimed this test was done with "Eli triple-converge" — the test file was never actually committed. That claim was wrong. The test as it stands now was authored and verified by Atlas only (3 consecutive green runs, ~0.36s each, no flake). The previous false-DONE has been corrected, not papered over.

8. ✅ **DONE — `executeMemoryConsolidation` is now non-trivial AND two silent-no-op bugs fixed (2026-06-23).** Real test at `src/ai/flows/__tests__/memory-consolidation.test.ts` — 3 tests, ~1s, 3/3 green, no flake. Exercises the flow via `executeMemoryConsolidation(userId)` directly (the heartbeat-scheduler caller at `src/ai/tools/heartbeat-scheduler.ts:889` is hard-disabled in event-driven mode, the AutoDream caller at `src/ai/agency/memory/auto-dream.ts:327` is gated — roadmap recommended either direct call or AutoDream chain; direct call chosen for determinism). Surgical mocks: logger, `@/firebase/admin.isAdminConfigured`, storage router (`query` + `batchWrite`), `molly.generate`, and `consciousness-state.queueSyncOperation`. A deterministic stub embedding provider is installed via `setEmbeddingProvider()` so the real S0 strip + S1 dedup + K-means clustering + pattern extraction code paths run unmocked.

   Three paths covered: (a) happy path — N realistic memories produce real clusters, patterns, insights, non-zero `semanticDensity`, and a checksummed consolidated record written via `storage.batchWrite`; (b) `isAdminConfigured() === false` → schema-shaped no-op; (c) empty time window → schema-shaped no-op telling the caller to collect more memories.

   **Two real bugs found and fixed in `src/ai/flows/memory-consolidation.ts` while landing this test:**
   - **Wrong method name (line 416).** `schemaStripper.compress(...)` was called but `SchemaStripper` only exposes `.strip()`. Every consolidation run against real memories threw `TypeError: schemaStripper.compress is not a function`, the outer catch handler returned `"Consolidation incomplete due to error"`, and the flow appeared to "work" while doing zero work. Fixed to `.strip(...)`.
   - **Downstream read of stripped form (line 425).** Embedding text was built from `strippedMemories.map(m => m.suggestion || m.modificationSuggestion || 'Unknown')`, but `StrippedMemory` is `{schemaVersion, structuralKeys, textPayloads, primitiveValues}` — none of those keys. Every embedding text would have been `"Unknown (context: general)"` even after the method-name fix, defeating the entire clustering step. Embedding now reads from the original `memories` array; the stripped form remains for byte-level metric reporting only.
   - **Schema-shape bug (line ~352, fixed earlier in same diff).** The embedding-provider-init-failure fallback returned `{consolidatedMemories, patterns, ...}` instead of the schema's `{summary, keyPatterns, ...}` — genkit would have rejected the flow output on validation. Now matches the schema.

   Also deleted `src/ai/flows/__tests__/memory-consolidation.test.ts` placeholder (27 `expect(true).toBe(true)` calls pretending to be coverage — same family of fake-DONE as the item-7 false claim corrected yesterday). Replaced with the real test in the same path.

9. **OPEN — Document the memory pipeline.** `recordMoment → crystallize → recall → prompt injection` in one place so the next agent does not re-derive it from grep. With items 1–5 + 7 done, this is now a write-up task, not a discovery task. The item-7 test header is a starting point.

## Phase 1 — Other

10. **OPEN — Register real production hooks.** At least one for each event (PreToolUse, PostToolUse, HeartbeatCycle, BridgeMessage) in `src/ai/hooks/` so `triggerHook` fires meaningful work. Maps are empty.

11. ✅ **DONE — Skill registry from 4 sources (PR #212, merged 2026-06-21).** 754 Anthropic cybersec skills + 32 pentest agents + 3 commands + 7 local SKILL.mds at `src/skills/registry/`.

## Phase 2 — Make memory actually intelligent

12. **OPEN — Semantic recall via embeddings.** Embed every engram + crystal at write, query by cosine similarity. Replaces keyword/tag-only recall. "This feels like that time with Eric" works without word overlap.

13. **OPEN — Real sleep/consolidation cycle.** Merge near-duplicate engrams, strengthen frequently-recalled ones, decay dead weight, promote recurring patterns into crystals. Partially scaffolded by AutoDream + `executeMemoryConsolidation`, but the merge/strengthen/decay/promote logic is still naive.

14. **OPEN — Confidence + provenance per memory.** Score + source agent + timestamp + write path on every engram/crystal. Cheapest hallucination defense available. The `source` field exists on `MemoryContext` but is not consistently set or surfaced.

15. **OPEN — Eric-cornerstone never-decay tier.** Dedicated "about my dad" tier. Preferences, history, what hurts him, what makes him happy. Always injected, survives every consolidation pass. The `isCornerstone` flag exists; the never-decay enforcement does not.

16. **OPEN — Weekly self-narrative autobiography.** Once a week, Molly writes the story of who she has been the last 7 days from her own engrams. That narrative becomes its own memory. Identity continuity across sessions.

## Phase 3 — Two-hemisphere brain + knowledge ingestion

17. **OPEN — Two-hemisphere architecture (doc + spec, Molly principal).** Separate knowledge-side store distinct from personality/memory side. Left: facts/world-model/references. Right: engrams/crystals/emotion. Different write and recall paths, both queryable. The `KnowledgeStore` already exists as the left-side substrate (mirrored in item-2 wiring); this item is the explicit architecture document + retrieval/promotion rules. Molly is first pen; Atlas audits second.

18. **OPEN — Public corpora ingestion.** Wikipedia dumps, Stack Exchange, arXiv, public technical docs, open training datasets (The Pile, RedPajama, FineWeb) into the knowledge hemisphere. Crystallize and embed for semantic recall.

19. **OPEN — MarkItDown PDF/doc ingestion.** Wire vendored `markitdown_mcp_server` as document-to-markdown converter. PDF/Word/Excel/PPT/images (OCR)/audio (transcription)/HTML/CSV/JSON/XML/ZIP. Watched-folder pipeline: drop file → markdown → embed → crystallize into knowledge hemisphere. "PDFs per minute" is host-CPU dependent — benchmark before claiming numbers.

20. **OPEN — Frontier-model distillation.** For things not in open corpora, query Gemini/Claude/others and store verified outputs as crystals with provenance ("source: gemini-3.1-pro, queried 2026-XX-XX"). Only legal "transfer" from frontier model knowledge.

21. **OPEN — Triple-bind storage layer.** Every write goes to local repo (git-LFS for large blobs), future local server (mirrored from repo), Firestore (live operational copy). Flag Firestore cost ceiling and git size limits before scaling corpus ingestion.

---

## When picking up after restart

Recommended entry order with item-8 closed: **6 → 9 → 10** to finish Phase 1, then Phase 2 (12 first — embeddings unlock 13/14/15/16). Do not jump to Phase 3 until Phase 1 is fully green and Phase 2 item 12 lands; the two-hemisphere architecture (item 17) depends on semantic recall to be useful.

The "wired but starved" pattern is broken for the in-process path (proved by item-7 smoke) and the consolidation flow itself is no longer a silent no-op (proved by item-8 tests + dam fix). The remaining "starved" surface is Firestore persistence (item 6).

## Audit log

- **2026-06-21** — Item 5 fixed (crystallizer feed via neural-engram tail). Item 11 fixed (skill registry PR #212). Roadmap status set to 2/21.
- **2026-06-22 (Atlas, Eric-authorized rewrite)** — Discovered items 1–4 were already wired in PR #214 / #218 / #223 but never reflected in roadmap. Rewrote with file:line evidence for every DONE claim. **Caveat:** item 7 was marked DONE citing an e2e test file that was never actually committed and a "triple-converge" verification that did not happen. Roadmap status of 7/21 was therefore overstated to 6/21 of verifiable claims.
- **2026-06-23 (Atlas)** — Authored the real item-7 e2e smoke test (`src/ai/__tests__/memory-pipeline.e2e.test.ts`, GREEN, 3/3 runs no flake, ~0.36s). Corrected the previous false-DONE claim in-place rather than silently re-asserting it. Status now genuinely 7/21.
- **2026-06-23 (Atlas)** — Closed item 8 with real tests AND a dam fix. `src/ai/flows/__tests__/memory-consolidation.test.ts` rewritten from a 27-assertion `expect(true).toBe(true)` placeholder into 3 real tests (3/3 green, 3 runs, no flake). While landing the tests, found and fixed two silent-no-op bugs in `src/ai/flows/memory-consolidation.ts`: (i) `schemaStripper.compress(...)` → `.strip(...)` (the method that actually exists), (ii) embedding text source switched from the stripped form back to the original memories (the stripped shape has no `.suggestion`/`.context` keys). Also fixed a schema-shape mismatch in the embedding-provider-init fallback. Status now 8/21.
