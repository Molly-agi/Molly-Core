/**
 * @jest-environment node
 *
 * Item 13 (real sleep/consolidation cycle) coverage.
 *
 * Four behaviors under test — all wired into `executeMemoryConsolidation`
 * Step 4.5 but exercised here against the underlying helpers because the
 * helpers are where the logic lives. The flow-level glue is intentionally
 * thin (try/catch wrappers, record→engram conversion).
 *
 *   (1) NeuralEngramSystem.mergeNearDuplicates — cross-cycle dedup of the
 *       hippocampus consolidation queue at cosine ≥ 0.92.
 *   (2) NeuralEngramSystem.strengthenByAccess — importance' =
 *       min(1, importance + log(1 + accessCount) * 0.05).
 *   (3) NeuralEngramSystem.archiveStale — soft-archive when lastAccessed
 *       > 7d AND importance < 0.2 AND accessCount < 3 AND NOT cornerstone-
 *       tagged. Archived engrams must be filtered from search/recall.
 *   (4) memory-crystallizer.promoteClusterToCrystal — cluster of ≥ 3 with
 *       Σ(accessCount × importance) ≥ minStrength becomes a crystal; source
 *       engrams get the crystal id backlinked into `relatedEngrams`.
 *
 * Plus the searchCrystalsSemantic retrievalCount bump (item 13 piggyback
 * change to memory-crystallizer.ts).
 */

jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  generateTraceId: jest.fn(() => 'test-trace'),
}));

jest.mock('@/ai/memory/engram-persistence', () => ({
  persistEngramBatch: jest
    .fn()
    .mockResolvedValue({ saved: 0, failed: 0, errors: [] }),
  loadConsolidatedEngrams: jest
    .fn()
    .mockResolvedValue({ loaded: 0, failed: 0, errors: [], engrams: [] }),
}));

jest.mock('@/ai/memory/personality-diagnostics', () => ({
  evaluatePersonalityStability: jest.fn().mockReturnValue({
    status: 'stable',
    score: 0.9,
    flags: [],
    extremes: 0,
    variance: 0.1,
  }),
}));

// Symmetric-write target — keep it inert so we don't fight an async path
// we aren't asserting against here.
jest.mock('@/ai/memory/knowledge-store', () => {
  const actual = jest.requireActual('@/ai/memory/knowledge-store');
  return {
    ...actual,
    getKnowledgeStore: jest.fn().mockResolvedValue({
      write: jest.fn().mockResolvedValue(undefined),
      recall: jest.fn().mockResolvedValue([]),
      recordSnapshot: jest.fn().mockResolvedValue(undefined),
    }),
  };
});

// Crystallizer dependencies — these reach out to storage and global state
// that we don't care about here. Stub them flat.
jest.mock('@/ai/agency/memory/digital-garden', () => ({
  plantSeed: jest.fn(),
}));
jest.mock('@/ai/agency/memory/growth-tracker', () => ({
  recordGrowthEvent: jest.fn(),
}));
jest.mock('@/ai/agency/cognition/self-observation-loop', () => ({
  recordObservation: jest.fn(),
}));
jest.mock('@/lib/storage-router', () => ({
  getStorageRouter: jest.fn().mockResolvedValue({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    batchWrite: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue([]),
  }),
}));

import {
  NeuralEngramSystem,
  type MemoryEngram,
} from '../../memory/neural-engram';
import {
  promoteClusterToCrystal,
  searchCrystalsSemantic,
  resetCrystallizerState,
} from '../../agency/memory/memory-crystallizer';
import {
  setEmbeddingProvider,
  resetEmbeddingProvider,
  type IEmbeddingProvider,
  type EmbeddingResult,
  type BatchEmbeddingResult,
} from '@/ai/tools/embedding-provider';

/**
 * Tiny deterministic embedding provider. Mirrors the StubProvider from
 * semantic-recall.test.ts so the two suites stay easy to reason about
 * together.
 */
class StubProvider implements IEmbeddingProvider {
  public embedCalls: string[] = [];

  getName() {
    return 'stub';
  }
  getDimensions() {
    return 3;
  }
  async embed(text: string): Promise<EmbeddingResult> {
    this.embedCalls.push(text);
    return {
      text,
      vector: this.vectorFor(text),
      model: 'stub',
      timestamp: Date.now(),
    };
  }
  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    const embeddings = await Promise.all(texts.map((t) => this.embed(t)));
    return { embeddings, batchSize: texts.length, model: 'stub' };
  }
  similarity(a: number[], b: number[]): number {
    let dot = 0,
      na = 0,
      nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
  }
  findSimilar() {
    return [];
  }
  async healthCheck() {
    return true;
  }

  private vectorFor(text: string): number[] {
    const lower = text.toLowerCase();
    if (lower.includes('apple')) return [1, 0, 0];
    if (lower.includes('banana')) return [0, 1, 0];
    if (lower.includes('cherry')) return [0, 0, 1];
    return [0.01, 0.01, 0.01];
  }
}

// Helper — build a MemoryEngram outside the brain (for crystallizer-only tests
// where we don't need full FrontalCortex/Hippocampus plumbing).
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
  // Behavior 1 — cross-cycle merge of near-duplicates
  // ───────────────────────────────────────────────────────────────
  describe('mergeNearDuplicates (behavior 1)', () => {
    it('returns {merged:0} when no embedding provider is configured', async () => {
      const a = brain.remember('apple pie 1');
      const b = brain.remember('apple pie 2');
      brain.hippocampus.stage(a);
      brain.hippocampus.stage(b);

      const result = await brain.mergeNearDuplicates();

      expect(result.merged).toBe(0);
      // No provider → no embeddings should have been generated.
      expect(a.embedding == null || a.embedding.length === 0).toBe(true);
    });

    it('absorbs duplicate into existing engram (≥ 0.92 cosine) and bumps importance', async () => {
      const stub = new StubProvider();
      setEmbeddingProvider(stub);

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
      // Existing engram absorbed the duplicate — importance + accessCount up.
      expect(first.accessCount).toBe(accessBefore + 1);
      expect(first.importance).toBeCloseTo(
        Math.min(1, importanceBefore + 0.05),
        5
      );
      // Distinct engram (banana) is untouched.
      const queue = brain.hippocampus.getQueue();
      expect(queue.map((e) => e.id)).toContain(first.id);
      expect(queue.map((e) => e.id)).toContain(distinct.id);
      expect(queue.map((e) => e.id)).not.toContain(duplicate.id);
    });

    it('keeps engrams with cosine below threshold side-by-side', async () => {
      const stub = new StubProvider();
      setEmbeddingProvider(stub);

      const a = brain.remember('apple thing');
      const b = brain.remember('banana thing'); // orthogonal vector
      brain.hippocampus.stage(a);
      brain.hippocampus.stage(b);

      const result = await brain.mergeNearDuplicates();

      expect(result.merged).toBe(0);
      expect(brain.hippocampus.getQueue().length).toBe(2);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // Behavior 2 — strengthen by access
  // ───────────────────────────────────────────────────────────────
  describe('strengthenByAccess (behavior 2)', () => {
    it('boosts importance using log(1 + accessCount) * 0.05', () => {
      const eng = brain.remember('apple');
      // Reach into the slot copy that the brain actually holds.
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

      // Untouched — archived engrams are excluded from strengthening.
      expect(slot.engram.importance).toBe(0.3);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // Behavior 3 — soft-archive stale
  // ───────────────────────────────────────────────────────────────
  describe('archiveStale (behavior 3)', () => {
    it('archives engrams that meet ALL of: > 7d old, importance < 0.2, accessCount < 3', () => {
      const stale = brain.remember('stale apple');
      const slot = brain.frontalCortex
        .getSlots()
        .find((s) => s.engram.id === stale.id)!;
      // 8 days old, low importance, never re-accessed beyond the initial write.
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      slot.engram.lastAccessed = eightDaysAgo;
      slot.engram.importance = 0.1;
      slot.engram.accessCount = 1;

      const result = brain.archiveStale(new Date());

      expect(result.archived).toBe(1);
      expect(slot.engram.consolidationState).toBe('archived');
    });

    it('exempts cornerstone-tagged engrams (item-15 preview)', () => {
      const cornerstone = brain.remember('eric is the dad');
      const slot = brain.frontalCortex
        .getSlots()
        .find((s) => s.engram.id === cornerstone.id)!;
      slot.engram.lastAccessed = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      );
      slot.engram.importance = 0.05;
      slot.engram.accessCount = 0;
      slot.engram.contextTags = ['cornerstone'];

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
      slot.engram.importance = 0.5; // above the 0.2 floor
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
      // stage() overwrites consolidationState to 'consolidating', so we have
      // to flip the queue entry to 'archived' AFTER staging.
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

    it('returns null when Σ(accessCount × importance) < minStrength', () => {
      // 3 engrams but very low strength: 3 × (1 × 0.1) = 0.3, far below 5.0.
      const cluster = [
        makeEngram({ content: 'a', accessCount: 1, importance: 0.1 }),
        makeEngram({ content: 'b', accessCount: 1, importance: 0.1 }),
        makeEngram({ content: 'c', accessCount: 1, importance: 0.1 }),
      ];

      const crystal = promoteClusterToCrystal(cluster);

      expect(crystal).toBeNull();
    });

    it('creates a crystal when both gates pass and backlinks source engrams', () => {
      // 3 engrams × (5 × 0.5) = 7.5 → above 5.0 floor.
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
      // Tag intersection across the three engrams is { 'family' }.
      expect(crystal!.facets.relational.participants).toEqual(['family']);
      // Backlink: every source engram now references the new crystal.
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

      // 0.3 strength is still well above a hand-set 0.1 floor.
      const crystal = promoteClusterToCrystal(cluster, 0.1);

      expect(crystal).not.toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────
  // Piggyback — searchCrystalsSemantic must bump retrievalCount
  // ───────────────────────────────────────────────────────────────
  describe('searchCrystalsSemantic retrievalCount (item 13 piggyback)', () => {
    it('increments retrievalCount on every hit', async () => {
      const stub = new StubProvider();
      setEmbeddingProvider(stub);

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

      // The matching crystal must have retrievalCount > 0 — it was retrieved
      // semantically, even though no one called retrieveCrystal() directly.
      expect(crystal.retrievalCount).toBeGreaterThan(0);
      expect(crystal.lastRetrieved).toBeDefined();
    });
  });
});
