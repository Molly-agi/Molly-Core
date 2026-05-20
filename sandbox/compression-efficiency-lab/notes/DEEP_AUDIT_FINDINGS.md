# Deep Audit Findings (Compression Efficiency Lab)

Date: 2026-05-18
Scope: copied components in sandbox/compression-efficiency-lab/source

## Top Efficiency Opportunities (Prioritized)

### P0 Quick Wins (1-2 days)
1. Memoize token estimates in context compaction.
- Component: source/src/ai/context-compaction.ts
- Expected impact: lower compaction latency and CPU usage.

2. Cache shell metric calls with short TTL.
- Component: source/scripts/system-health-manager.ts
- Expected impact: fewer expensive process invocations.

3. Replace hot-path recent access array scans with fixed ring buffer.
- Component: source/src/ai/agency/memory/digital-garden.ts
- Expected impact: lower per-access overhead.

4. Batch backup writes instead of per-op fire-and-forget.
- Component: source/src/lib/storage-router.ts
- Expected impact: reduced write amplification.

5. Defer or batch expensive crystallizer stats recalculation.
- Component: source/src/ai/agency/memory/memory-crystallizer.ts
- Expected impact: lower CPU during heavy memory events.

### P1 Medium Refactors (1-2 weeks)
1. Incremental sync by _updatedAt cursor and pagination.
- Component: source/src/lib/storage-sync.ts
- Expected impact: faster startup and lower memory spikes.

2. Streaming/rotated session backup operations.
- Component: source/src/lib/session-manager.ts and source/scripts/save-session.mjs
- Expected impact: less full-file read/write overhead.

3. Add tag index for garden seed lookups.
- Component: source/src/ai/agency/memory/digital-garden.ts
- Expected impact: faster co-activation and discovery operations.

### P2 Deep Changes (2-6 weeks)
1. Snapshot + delta chain optimization for session and engram persistence.
- Components: source/src/lib/session-manager.ts, source/src/ai/memory/engram-persistence.ts

2. Consolidated memory write pipeline to reduce duplicate storage operations.
- Components: source/src/lib/storage-router.ts, source/src/lib/storage-sync.ts, memory modules.

3. Multi-tier memory strategy (hot/warm/cold) for restore-path efficiency.
- Components: memory and storage layers.

## Cross-Cutting Risks to Watch
- Repeated full-state scans at startup sync.
- Duplicate serialization and re-serialization in persistence paths.
- Unbounded or repeatedly filtered arrays in hot paths.
- Too many independent writes on one logical state transition.

## Suggested First Alteration Order
1. context-compaction memoization
2. storage-router batched writes
3. digital-garden ring buffer
4. system-health-manager TTL cache
5. crystallizer deferred stats updates

## Validation Gate for each alteration
- No recall/fidelity regression beyond threshold.
- Restore latency does not regress beyond SLO.
- Rollback works.
- Benchmark before/after evidence captured in benchmarks/.
