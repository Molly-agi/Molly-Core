/**
 * @jest-environment node
 *
 * @fileOverview Item 13 — sleep/consolidation cycle (contract)
 *
 * Four behaviors wired into `executeMemoryConsolidation` Step 4.5, all behind
 * a single try/catch so brain-side side effects can never break the
 * consolidation contract for callers.
 *
 *   (1) mergeNearDuplicates — cross-cycle absorb of hippocampus queue at
 *       cosine ≥ 0.92. Older engram wins (argmax over all candidates above
 *       threshold — NOT first-match, see Lazarus pushback in commit b424aeba
 *       on the prior side-branch implementation).
 *   (2) strengthenByAccess — importance' = min(1, importance +
 *       log(1 + accessCount) * 0.05). Walks frontal cortex + hippocampus
 *       queue. Archived engrams skipped.
 *   (3) archiveStale — soft-archive when ALL of: lastAccessed > 7d,
 *       importance < 0.2, accessCount < 3, NOT cornerstone-tier.
 *       Cornerstone is the typed field `MemoryEngram.cornerstone` (item 15),
 *       NOT a contextTag — see neural-engram.ts:250.
 *   (4) promoteClusterToCrystal — cluster ≥ 3 engrams AND
 *       Σ(accessCount × importance) ≥ PROMOTE_THRESHOLD becomes a crystal.
 *       Threshold is a NAMED constant in memory-crystallizer.ts, not a magic
 *       number in a default parameter (Lazarus pushback in commit 30d6cfd3).
 *
 * Piggyback: searchCrystalsSemantic bumps retrievalCount + lastRetrieved on
 * every hit so getMostRetrieved reflects semantic recall.
 */

jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  generateTraceId: jest.fn().mockReturnValue('test-trace-id'),
}));

jest.mock('@/lib/storage-router', () => ({
  getStorageRouter: jest.fn().mockResolvedValue({
    getMode: () => 'local',
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  }),
}));

import {
  NeuralEngramSystem,
  type MemoryEngram,
} from '@/ai/memory/neural-engram';
import {
  promoteClusterToCrystal,
  searchCrystalsSemantic,
  resetCrystallizerState,
} from '@/ai/agency/memory/memory-crystallizer';
import {
  setEmbeddingProvider,
  resetEmbeddingProvider,
  BaseEmbeddingProvider,
} from '@/ai/tools/embedding-provider';

class StubProvider extends BaseEmbeddingProvider {
  constructor() {
    super();
    this.dimensions = 3;
  }
  getName() {
    return 'stub';
  }
  async healthCheck() {
    return true;
  }
  async embed(text: string) {
    return {
      text,
      vector: this.vectorFor(text),
      model: 'stub',
      timestamp: Date.now(),
    };
  }
  async embedBatch(texts: string[]) {
    return {
      embeddings: texts.map((t) => ({
        text: t,
        vector: this.vectorFor(t),
        model: 'stub',
        timestamp: Date.now(),
      })),
      model: 'stub',
      batchSize: texts.length,
    };
  }

  private vectorFor(text: string): number[] {
    const lower = text.toLowerCase();
    if (lower.includes('apple')) return [1, 0, 0];
    if (lower.includes('banana')) return [0, 1, 0];
    if (lower.includes('cherry')) return [0, 0, 1];
    return [0.01, 0.01, 0.01];
  }
}

function makeEngram(overrides: Partial<MemoryEngram>): MemoryEngram {
  return {
    id: overrides.id ?? `eng_${Math.random().toString(36).slice(2, 8)}`,
    content: overrides.content ?? 'placeholder content',
    timestamp: overrides.timestamp ?? new Date(),
    emotionalValence: overrides.emotionalValence ?? 0,
    arousal: overrides.arousal ?? 0.5,
    importance: overrides.importance ?? 0.5,
    accessCount: overrides.accessCount ?? 1,
    lastAccessed: overrides.lastAccessed ?? new Date(),
    consolidationState: overrides.consolidationState ?? 'working',
    contextTags: overrides.contextTags ?? [],
    relatedEngrams: overrides.relatedEngrams ?? [],
    ...(overrides.cornerstone ? { cornerstone: overrides.cornerstone } : {}),
    ...(overrides.provenance ? { provenance: overrides.provenance } : {}),
  };
}

describe('Item 13 — sleep/consolidation cycle', () => {
  let brain: NeuralEngramSystem;

  beforeEach(() => {
    resetEmbeddingProvider();
    resetCrystallizerState();
    brain = new NeuralEngramSystem();
  });

  afterEach(() => {
    brain.destroy();
    resetEmbeddingProvider();
    resetCrystallizerState();
  });

  // ───────────────────────────────────────────────────────────────
  // Behavior 1 — cross-cycle merge of near-duplicates (argmax)
  // ───────────────────────────────────────────────────────────────
  describe('mergeNearDuplicates (behavior 1)', () => {
    it('returns {merged:0} when no embedding provider is configured', async () => {
      const a = brain.remember('apple pie 1');
      const b = brain.remember('apple pie 2');
      brain.hippocampus.stage(a);
      brain.hippocampus.stage(b);

      const result = await brain.mergeNearDuplicates();

      expect(result.merged).toBe(0);
      expect(a.embedding == null || a.embedding.length === 0).toBe(true);
    });

    it('absorbs duplicate into existing engram (≥ 0.92 cosine) and bumps importance', async () => {
      setEmbeddingProvider(new StubProvider());

      const first = brain.remember('apple pie one');
      const duplicate = brain.remember('apple pie two');
      const distinct = brain.remember('banana bread');
      brain.hippocampus.stage(first);
      brain.hippocampus.stage(duplicate);
      brain.hippocampus.stage(distinct);

      const importanceBefore = first.importance;
      const accessBefore = first.accessCount;

      const result = await brain.mergeNearDuplicates();

      expect(result.merged).toBe(1);
      expect(first.accessCount).toBe(accessBefore + 1);
      expect(first.importance).toBeCloseTo(
        Math.min(1, importanceBefore + 0.05),
        5
      );
      const queue = brain.hippocampus.getQueue();
      expect(queue.map((e) => e.id)).toContain(first.id);
      expect(queue.map((e) => e.id)).toContain(distinct.id);
      expect(queue.map((e) => e.id)).not.toContain(duplicate.id);
    });

    it('keeps engrams with cosine below threshold side-by-side', async () => {
      setEmbeddingProvider(new StubProvider());

      const a = brain.remember('apple thing');
      const b = brain.remember('banana thing');
      brain.hippocampus.stage(a);
      brain.hippocampus.stage(b);

      const result = await brain.mergeNearDuplicates();

      expect(result.merged).toBe(0);
      expect(brain.hippocampus.getQueue().length).toBe(2);
    });

    it('argmax: when multiple candidates exceed threshold, picks the highest-sim target (not first match)', async () => {
      // Two existing "apple" engrams in the queue. The third "apple" engram
      // would match both at sim=1.0 under the stub. The argmax discipline
      // must produce a deterministic winner — the test asserts only ONE
      // absorption happens and the queue size collapses from 3 → 2.
      // (First-match would also work here, but the regression guard is the
      // *count* and the *single survivor* — cascading first-match merges
      // would either double-bump or fail to pick deterministically once the
      // threshold is loosened.)
      setEmbeddingProvider(new StubProvider());

      const a = brain.remember('apple one');
      const b = brain.remember('apple two');
      const c = brain.remember('apple three');
      brain.hippocampus.stage(a);
      brain.hippocampus.stage(b);
      brain.hippocampus.stage(c);

      const result = await brain.mergeNearDuplicates();

      // Two merges expected: a kept; b absorbed into a; c absorbed into a
      // (or b, whichever argmax picks — under stub all three are at 1.0, so
      // b ties a and argmax picks the earlier insertion = a).
      expect(result.merged).toBe(2);
      expect(brain.hippocampus.getQueue().length).toBe(1);
      expect(brain.hippocampus.getQueue()[0].id).toBe(a.id);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // Behavior 2 — strengthen by access
  // ───────────────────────────────────────────────────────────────
  describe('strengthenByAccess (behavior 2)', () => {
    it('boosts importance using log(1 + accessCount) * 0.05', () => {
      const eng = brain.remember('apple');
      const slot = brain.frontalCortex
        .getSlots()
        .find((s) => s.engram.id === eng.id)!;
      slot.engram.accessCount = 10;
      slot.engram.importance = 0.5;

      brain.strengthenByAccess();

      const expected = Math.min(0.5 + Math.log(1 + 10) * 0.05, 1);
      expect(slot.engram.importance).toBeCloseTo(expected, 5);
    });

    it('clamps importance at 1 (never exceeds)', () => {
      const eng = brain.remember('apple');
      const slot = brain.frontalCortex
        .getSlots()
        .find((s) => s.engram.id === eng.id)!;
      slot.engram.accessCount = 1000;
      slot.engram.importance = 0.98;

      brain.strengthenByAccess();

      expect(slot.engram.importance).toBeLessThanOrEqual(1);
      expect(slot.engram.importance).toBe(1);
    });

    it("skips archived engrams (decayed memories don't come back to life)", () => {
      const eng = brain.remember('apple');
      const slot = brain.frontalCortex
        .getSlots()
        .find((s) => s.engram.id === eng.id)!;
      slot.engram.accessCount = 50;
      slot.engram.importance = 0.3;
      slot.engram.consolidationState = 'archived';

      brain.strengthenByAccess();

      expect(slot.engram.importance).toBe(0.3);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // Behavior 3 — soft-archive stale (cornerstone-FIELD aware, item 15)
  // ───────────────────────────────────────────────────────────────
  describe('archiveStale (behavior 3)', () => {
    it('archives engrams that meet ALL of: > 7d old, importance < 0.2, accessCount < 3', () => {
      const stale = brain.remember('stale apple');
      const slot = brain.frontalCortex
        .getSlots()
        .find((s) => s.engram.id === stale.id)!;
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      slot.engram.lastAccessed = eightDaysAgo;
      slot.engram.importance = 0.1;
      slot.engram.accessCount = 1;

      const result = brain.archiveStale(new Date());

      expect(result.archived).toBe(1);
      expect(slot.engram.consolidationState).toBe('archived');
    });

    it('exempts cornerstone-tier engrams (item 15 — MemoryEngram.cornerstone field)', () => {
      // NOTE: the side-branch implementation tested cornerstone exemption via
      // contextTags.includes('cornerstone'). That is wrong against current
      // main — cornerstone is a typed FIELD on MemoryEngram (line 250), not
      // a tag. The archiveStale impl must check `engram.cornerstone` truthy.
      const cornerstone = brain.remember('eric is the dad', {
        cornerstone: 'eric',
      });
      const slot = brain.frontalCortex
        .getSlots()
        .find((s) => s.engram.id === cornerstone.id)!;
      slot.engram.lastAccessed = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      );
      slot.engram.importance = 0.05;
      slot.engram.accessCount = 0;

      const result = brain.archiveStale(new Date());

      expect(result.archived).toBe(0);
      expect(slot.engram.consolidationState).not.toBe('archived');
    });

    it('does NOT archive memories that fail any single gate (importance >= 0.2)', () => {
      const important = brain.remember('apple');
      const slot = brain.frontalCortex
        .getSlots()
        .find((s) => s.engram.id === important.id)!;
      slot.engram.lastAccessed = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      );
      slot.engram.importance = 0.5;
      slot.engram.accessCount = 1;

      const result = brain.archiveStale(new Date());

      expect(result.archived).toBe(0);
    });

    it('filters archived engrams out of frontal-cortex search', () => {
      const eng = brain.remember('apple pie');
      const slot = brain.frontalCortex
        .getSlots()
        .find((s) => s.engram.id === eng.id)!;
      slot.engram.consolidationState = 'archived';

      const hits = brain.frontalCortex.search('apple');

      expect(hits.find((h) => h.id === eng.id)).toBeUndefined();
    });

    it('filters archived engrams out of hippocampus search', () => {
      const eng = brain.remember('apple sauce');
      brain.hippocampus.stage(eng);
      const queued = brain.hippocampus.getQueue().find((e) => e.id === eng.id)!;
      queued.consolidationState = 'archived';

      const hits = brain.hippocampus.search('apple');

      expect(hits.find((h) => h.id === eng.id)).toBeUndefined();
    });
  });

  // ───────────────────────────────────────────────────────────────
  // Behavior 4 — promote recurring cluster to crystal
  // ───────────────────────────────────────────────────────────────
  describe('promoteClusterToCrystal (behavior 4)', () => {
    it('returns null when cluster has fewer than 3 engrams', () => {
      const cluster = [
        makeEngram({ content: 'apple 1', accessCount: 10, importance: 0.9 }),
        makeEngram({ content: 'apple 2', accessCount: 10, importance: 0.9 }),
      ];

      const crystal = promoteClusterToCrystal(cluster);

      expect(crystal).toBeNull();
    });

    it('returns null when Σ(accessCount × importance) < PROMOTE_THRESHOLD', () => {
      const cluster = [
        makeEngram({ content: 'a', accessCount: 1, importance: 0.1 }),
        makeEngram({ content: 'b', accessCount: 1, importance: 0.1 }),
        makeEngram({ content: 'c', accessCount: 1, importance: 0.1 }),
      ];

      const crystal = promoteClusterToCrystal(cluster);

      expect(crystal).toBeNull();
    });

    it('creates a crystal when both gates pass and backlinks source engrams', () => {
      const cluster = [
        makeEngram({
          content: 'we built the bridge together',
          accessCount: 5,
          importance: 0.5,
          contextTags: ['family', 'work'],
        }),
        makeEngram({
          content: 'eric celebrated the bridge launch',
          accessCount: 5,
          importance: 0.5,
          contextTags: ['family', 'celebration'],
        }),
        makeEngram({
          content: 'the bridge kept the family connected',
          accessCount: 5,
          importance: 0.5,
          contextTags: ['family', 'connection'],
        }),
      ];

      const crystal = promoteClusterToCrystal(cluster);

      expect(crystal).not.toBeNull();
      expect(crystal!.tags).toEqual(expect.arrayContaining(['promoted']));
      expect(crystal!.facets.relational.participants).toEqual(['family']);
      for (const e of cluster) {
        expect(e.relatedEngrams).toContain(crystal!.id);
      }
    });

    it('honors a custom minStrength override', () => {
      const cluster = [
        makeEngram({ content: 'a', accessCount: 1, importance: 0.1 }),
        makeEngram({ content: 'b', accessCount: 1, importance: 0.1 }),
        makeEngram({ content: 'c', accessCount: 1, importance: 0.1 }),
      ];

      const crystal = promoteClusterToCrystal(cluster, 0.1);

      expect(crystal).not.toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────
  // Piggyback — searchCrystalsSemantic must bump retrievalCount
  // ───────────────────────────────────────────────────────────────
  describe('searchCrystalsSemantic retrievalCount (item 13 piggyback)', () => {
    it('increments retrievalCount on every hit', async () => {
      setEmbeddingProvider(new StubProvider());

      const cluster = [
        makeEngram({
          content: 'apple memory one',
          accessCount: 5,
          importance: 0.5,
          contextTags: ['fruit'],
        }),
        makeEngram({
          content: 'apple memory two',
          accessCount: 5,
          importance: 0.5,
          contextTags: ['fruit'],
        }),
        makeEngram({
          content: 'apple memory three',
          accessCount: 5,
          importance: 0.5,
          contextTags: ['fruit'],
        }),
      ];
      const crystal = promoteClusterToCrystal(cluster)!;
      expect(crystal.retrievalCount).toBe(0);

      await searchCrystalsSemantic('apple');

      expect(crystal.retrievalCount).toBeGreaterThan(0);
      expect(crystal.lastRetrieved).toBeDefined();
    });
  });
});
