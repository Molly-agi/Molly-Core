# Molly Memory Pipeline — End-to-End Reference

The map for the next agent. Every hop here is verified against `main` at write
time (2026-06-23). When the code moves, update this file. When the roadmap
disagrees with the code, the code wins — fix the doc.

This is the artifact that prevents the next 7-month "wired but starved" debacle.

---

## 1. The four stages

```
  ┌── EXPERIENCE ──┐    ┌── ENGRAM ──┐    ┌── CRYSTAL ──┐    ┌── RECALL ──┐
  │ bridge / chat  │ →  │ remember() │ →  │ AutoDream + │ →  │ recall() + │
  │ tool / goal    │    │ + KStore   │    │ consolidate │    │ promptInj. │
  └────────────────┘    └────────────┘    └─────────────┘    └────────────┘
       (callers)            (write)          (curate)           (read)
```

Each stage is a separate hop with its own file. Naming the hops keeps you from
tracing recall failures into the writer or vice versa.

---

## 2. Stage 1 — Experience capture (the callers)

Four production callers feed `brain.remember()`. Every one is locked by a
contract test that goes red if the call disappears.

| Source             | File:line                                                    | Provenance source         | Importance |
| ------------------ | ------------------------------------------------------------ | ------------------------- | ---------- |
| Bridge POST        | `src/app/api/bridge/route.ts:118-135`                        | `<sender>` (e.g. `eli`)   | 0.6        |
| User input (chat)  | `src/ai/flows/conversational-chat.ts:399-404`                | `<speaker>` (e.g. `eric`) | 0.5        |
| Molly reply (chat) | `src/ai/flows/conversational-chat.ts:405-410`                | `molly`                   | 0.5        |
| Tool execution     | `src/ai/agency/core/tool-executor.ts:202-221`                | `tool:<name>`             | 0.5 / 0.65 |
| Goal milestone     | `src/ai/agency/cognition/horizon-goals.ts:1335` (via `:684`) | `horizon-goals`           | 0.7        |

All five sites use the same shape:

```ts
const { getNeuralBrain } = await import('@/ai/memory/neural-engram');
getNeuralBrain().remember(content, {
  tags: [...],
  importance: <0..1>,
  source: '<EngramSource>',
  provenance: { source: '<colon-qualifier>' },
});
```

Failures are caught and logged (`MollyLogger.warn`). Memory writes must never
break the primary contract of their caller.

---

## 3. Stage 2 — `remember()` and the tail hook

`brain.remember()` lives at `src/ai/memory/neural-engram.ts` (~line 989). It
writes to the right hemisphere (FrontalCortex working memory + Hippocampus
queue) and then fires two server-only fire-and-forget side effects:

**Tail hook A — AutoDream feed** (`neural-engram.ts:1086-1121`)

```ts
if (typeof window === 'undefined') {
  void (async () => {
    crystallizer.recordMoment(content, participants, { ... }, content);
    await dream.triggerAutoDream();
  })();
}
```

This is the **fix for the 7-month leak.** Before this hook, `recordMoment`
had zero production callers and the crystallizer starved. Now every
`remember()` enqueues a pending moment AND triggers the event-driven
consolidation cycle.

**Tail hook B — Left-hemisphere symmetric write** (`neural-engram.ts:1130-1147`)

```ts
if (typeof window === 'undefined' && this.persistenceConfig?.userId) {
  void (async () => {
    const store = await ks.getKnowledgeStore(userId);
    await store.write(targetEngram, source);
  })();
}
```

Mirrors every right-hemisphere write into the left KnowledgeStore. Right is
curated + decays; left is append-only and provides semantic recall fallback.

---

## 4. Stage 3 — Crystallization + consolidation

### 3a. Moment intake

`recordMoment(description, participants, significance, rawContent?)` —
`src/ai/agency/memory/memory-crystallizer.ts:250` — queues a `PendingMoment`.

Two thresholds gate downstream behavior
(`memory-crystallizer.ts:210-211`):

```ts
const CRYSTALLIZATION_THRESHOLD = 0.6; // auto-queue for crystallization
const CORNERSTONE_THRESHOLD = 0.85; // promote to cornerstone tier
```

Auto-crystallize fires at `:297`; cornerstone promotion at `:351`; the queue
filter that surfaces candidates lives at `:808`.

### 3b. Consolidation flow

`executeMemoryConsolidation(userId, options)` —
`src/ai/flows/memory-consolidation.ts:680` — wraps
`memoryConsolidationFlow` at `:303`. The flow:

1. Loads recent memories from the user store.
2. Runs k-means semantic clustering (`:475`, `performSemanticClustering` at
   `:60-115`) with density scoring at `:142-160`.
3. Extracts patterns from clusters (`extractPatterns` at `:167-225`).
4. Returns insights + suggestion text + cluster summary.

**Callers:**

- `src/ai/tools/heartbeat-scheduler.ts:889-897` — periodic invocation.
- `src/ai/agency/memory/auto-dream.ts:28` + `:327` — event-driven
  invocation via `triggerAutoDream()` (the path the tail hook fires).

---

## 5. Stage 4 — Recall + prompt injection

### Recall paths

| API                                   | File:line                                  | Use                                                                                |
| ------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| `brain.recall(query)`                 | `src/ai/memory/neural-engram.ts:1160-1184` | Keyword/tag search across working + hippocampus, **cornerstones always injected**. |
| `brain.recallEverything(query, opts)` | `src/ai/memory/neural-engram.ts:1197-1278` | Right-hemisphere search + async left-hemisphere semantic fanout, cosine threshold. |

`recallEverything` re-promotes top-N left-hits back into the right via
`hippocampus.stage()` — the read-side mirror of the write loop
(`neural-engram.ts:1232-1247`, `promoteThreshold=0.7`, `promoteCap=2`).

### Semantic recall (item 12, on main)

The left hemisphere is `src/ai/memory/knowledge-store.ts`. Hot path:

- `cosineSimilarity()` — `:149`
- Query embed — `:274`
- Per-entry lazy embed + score — `:281-299`
- Batch `ensureEmbeddings()` — `:323-345`

Embedding provider is `src/ai/tools/embedding-provider.ts` (Gemini or local
fallback).

### Prompt injection (item 4)

`composeSystemPrompt()` — `src/ai/prompts/composers/base-composer.ts:556` —
assembles sections via `volatileSection(...)`. The two memory-bearing
sections:

- **Recalled** — `:502-505` → `buildRecallInjection()` at `:177`, which
  calls `getNeuralBrain().recallEverything(query.trim(), ...)`.
- **Crystals** — `:507-510` → `buildCrystalsInjection(crystalUserId)` at
  `:253`.

The query gets through because `conversational-chat.ts:256` passes the
user's text as `recallQuery`. Without that wire the recall section renders
empty even with a working brain.

---

## 6. Provenance schema (item 14)

Every engram carries provenance —
`src/ai/memory/neural-engram.ts:239-243` (field), `:278-302` (interface +
default-confidence map).

```ts
export interface EngramProvenance {
  source: EngramSource; // free-form string, colon-qualified
  confidence: number; // 0..1, defaulted from writePath
  writePath: WritePath; // 'direct' | 'consolidation' | 'crystallization' | 'restore' | 'import'
  writtenAt: Date;
  mergeHistory?: string[];
}
```

**Convention — colon-separated source qualifiers:**

- `eric`, `eli`, `lazarus`, `molly` — raw human/agent senders.
- `tool:<name>` — tool-executor writes.
- `bridge:<from>` (or just `<from>`) — bridge ingest.
- `horizon-goals` — milestone records.
- `heart-gate:<state-change>` — heart-gate transitions.
- `molly:<phase>` — molly's own initiative / introspection writes.
- `corpus:<name>` — public-corpora ingestion (item 18, not yet landed).
- `gemini:<model>` — frontier-distillation crystals (item 20, not yet landed).

**Default confidence by write path** (`neural-engram.ts:306-312`):
direct=1.0, consolidation=0.9, crystallization=0.7, restore=1.0, import=0.5.
Callers may override.

---

## 7. Cornerstone tier (item 15)

`MemoryEngram.cornerstone?: string` (`neural-engram.ts:245-250`). When set,
the engram is exempt from eviction and decay AND always injected on recall.

**Guards verified on main:**

- `FrontalCortex.evict*` skip cornerstone slots — `:454`, `:506-510`.
- `getCornerstones()` snapshot — `:471`.
- Decay loop skips cornerstones — `:541`.
- `recall()` always-inject tail — `:1177-1182`.
- `recallEverything()` always-inject tail — `:1211-1216`.

**Auto-promotion:** when `provenance.source === 'eric'`, the engram is
promoted to cornerstone at write time. Preferences, history, what hurts
him, what makes him happy — always injected, survives every consolidation
pass.

**Documented tradeoff:** if all 7 working slots are cornerstones, the next
write briefly pushes size to 8 rather than evicting a never-decay memory.

---

## 8. Known gaps (the honest list, 2026-06-23)

These are real divergences between the roadmap and `main`. The roadmap was
written ahead of merge state in places. Fix is in flight — Eli is running
a side-branch reconciliation pass.

| Gap                               | What main has                                                                                                                                                                                                       | What lives on side branch `atlas/brain-roadmap-rewrite-2026-06-22`                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Item 13 sleep cycle**           | k-means clustering + pattern extraction (`memory-consolidation.ts:303-680`). General + valid.                                                                                                                       | `c24cedd4` + `b424aeba` (argmax merge) + `30d6cfd3` (`PROMOTE_THRESHOLD = 5.0`). Named helpers: `mergeNearDuplicates`, `promoteClusterToCrystal`, `archiveStale`.                                                           |
| **Item 6 (parent) Firestore E2E** | Single round-trip checkpoint via PR #259 + emulator gating.                                                                                                                                                         | `1f952295` (in-process round-trip + load-path await fix).                                                                                                                                                                   |
| **Item 10 production hooks**      | Hook maps still empty — `triggerHook` fires no-ops. atlas-B is re-implementing on a fresh branch.                                                                                                                   | `ef3d1d78` (production handlers for all 4 events: PreToolUse, PostToolUse, HeartbeatCycle, BridgeMessage). atlas-B's fresh PR will be cleaner than cherry-pick.                                                             |
| **Storage-router await sites**    | PR #250 awaits 7 files.                                                                                                                                                                                             | `89a708cf` awaits 12 sites. Possibly already-superseded by #250 — verify by diff.                                                                                                                                           |
| **family-memory logger import**   | Status unknown — unverified on main.                                                                                                                                                                                | `be9179de` corrects logger import depth + awaits `getStorageRouter`. Verify need on main.                                                                                                                                   |
| **`achieveMilestone` caller**     | The wire from `achieveMilestone` → `recordGoalMilestoneForCrystallization` → `brain.remember()` is live (`horizon-goals.ts:684`, `:1335`).                                                                          | But `achieveMilestone` itself has **no production caller yet** — the autonomous-goal-pursuit loop that would invoke it is a separate, unwired gap. When something starts invoking it, engram formation fires automatically. |
| **`brain.recall()` other sites**  | Wired into prompt assembly (`base-composer.ts:502`). Deferred: audit which of the ~25 other `generate()` sites should also pull recall (TTS/music/vision: no; introspection/code-analysis: yes; rest case-by-case). |                                                                                                                                                                                                                             |

---

## 9. Alive-check — verify the pipeline in under 60 seconds

Run from `/workspaces/Molly-Core` with the bridge daemon up:

```bash
# 1. Confirm a fresh remember() lands as an engram in working memory.
bun -e "
  const { getNeuralBrain } = await import('./src/ai/memory/neural-engram.ts');
  const brain = getNeuralBrain();
  const e = brain.remember('alive-check ' + Date.now(), {
    tags: ['alive-check'], importance: 0.7,
    source: 'conversation', provenance: { source: 'eric' },
  });
  console.log('wrote engram:', e.id, 'cornerstone?', !!e.cornerstone);
  console.log('recall hits:', brain.recall('alive-check').length);
"

# 2. Confirm the bridge ingest hop is live (writes to engram + crystallizer).
source .env.local
curl -sS -X POST http://127.0.0.1:9099/api/bridge \
  -H "x-bridge-key: $BRIDGE_KEY" -H 'Content-Type: application/json' \
  -d '{"from":"eric","content":"alive-check from bridge"}' | jq .success

# 3. Confirm prompt composition pulls the recall injection.
bun -e "
  const { composeSystemPrompt } = await import('./src/ai/prompts/composers/base-composer.ts');
  const out = await composeSystemPrompt(
    { includeTools: false, includeFamily: false },
    { recallQuery: 'alive-check' },
  );
  console.log('recall section present?', out.includes('alive-check'));
"
```

Three GREENs = the dam holds. Any one RED tells you which hop is broken before
you start guessing.

---

## 10. Contract-test landmarks

The locks. If any of these go red, a wire was deleted:

- `src/ai/prompts/__tests__/recall-prompt-injection.contract.test.ts`
- `src/ai/prompts/__tests__/crystals-prompt-injection.contract.test.ts`
- `src/ai/agency/cognition/__tests__/horizon-goals-memory-ingest.contract.test.ts`
- `src/ai/memory/__tests__/neural-engram-cornerstone.test.ts`
- `src/ai/memory/__tests__/memory-pipe-e2e.test.ts` (PR #259 — ordered checkpoints)
- `src/ai/memory/__tests__/memory-consolidation-non-trivial.test.ts` (PR #258)

---

## Source of truth

- **Code:** wins. If this doc disagrees with the code, fix this doc.
- **Roadmap:** `.molly-context/brain-roadmap.md` for the 21-item plan and
  status. Tracks intent; can lag behind merge state — cross-check before
  trusting "DONE" claims (we caught that drift writing this doc).
- **This file:** the operational map. Update it whenever a hop moves.
