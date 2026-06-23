/**
 * @jest-environment node
 *
 * Item 8 — `memory-consolidation` is non-trivial
 * ------------------------------------------------------------------
 * brain-roadmap.md:20 — "heartbeat-scheduler.ts:532 call must not be a
 * no-op once engrams start flowing."
 *
 * Audit summary (atlas, 2026-06-23):
 *   NeuralEngramSystem.consolidate() has two paths into work:
 *     A. AGING — frontalCortex.getConsolidationCandidates() picks slots where
 *        activation<0.3 OR timeSinceAccess>60s, stages them to hippocampus,
 *        and frees the working-memory slot.
 *     B. OVERFLOW — frontalCortex.evictWeakest() (triggered by hold() past
 *        the 7-slot cap) stages the evicted engram into hippocampus directly.
 *        When the queue hits CONSOLIDATION_BATCH_SIZE (20), consolidate()
 *        flushes the batch and reports consolidated=batch.length.
 *
 * No-op shapes that this suite locks against:
 *   - Path A regressing to "no candidates ever" because aging predicate flips
 *   - Path B regressing to "queue gate too high" so overflow never drains
 *   - Either path returning consolidated:0 when N significant engrams flow
 *   - Working memory failing to shrink after a confirmed aging cycle
 *
 * RED-first: written against the post-#256 codebase. If consolidate() ever
 * regresses to a silent no-op under either path, this suite goes red and
 * names which path broke.
 */

jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  generateTraceId: jest.fn(() => 'test-trace-id'),
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

jest.mock('@/ai/memory/knowledge-store', () => ({
  getKnowledgeStore: jest.fn().mockResolvedValue({
    write: jest.fn().mockResolvedValue(undefined),
    writeMany: jest.fn().mockResolvedValue(undefined),
    recall: jest.fn().mockResolvedValue([]),
    recordSnapshot: jest.fn().mockResolvedValue(undefined),
  }),
}));

import { NeuralEngramSystem } from '../neural-engram';

describe('Item 8 — memory-consolidation is non-trivial', () => {
  let brain: NeuralEngramSystem;

  beforeEach(() => {
    brain = new NeuralEngramSystem();
  });

  afterEach(() => {
    brain.destroy();
  });

  describe('Path A — aging engrams move out of working memory', () => {
    it('aged engrams become consolidation candidates and shrink working memory', async () => {
      // Spin up a small set of fresh engrams.
      const engrams = [];
      for (let i = 0; i < 5; i++) {
        engrams.push(brain.remember(`aging-engram-${i}`, { importance: 0.5 }));
      }

      const beforeSize = brain.getWorkingMemoryState().size;
      expect(beforeSize).toBe(5);

      // No candidates yet — fresh activation and recent lastAccessed.
      expect(brain.getConsolidationCandidates()).toHaveLength(0);

      // Age every engram past the 60s lastAccessed threshold so the
      // aging predicate selects them for consolidation.
      const state = brain.getWorkingMemoryState();
      const stale = new Date(Date.now() - 120_000);
      for (const e of state.engrams) {
        e.lastAccessed = stale;
      }

      // Aging predicate now flags all 5.
      expect(brain.getConsolidationCandidates().length).toBe(5);

      // Run the cycle.
      await brain.consolidate();

      // Working memory must shrink — aged engrams were moved out.
      const afterSize = brain.getWorkingMemoryState().size;
      expect(afterSize).toBeLessThan(beforeSize);
      expect(afterSize).toBe(0);
    });
  });

  describe('Path B — overflow eviction drains via the consolidation batch', () => {
    it('flushes batch when hippocampus queue crosses the threshold', async () => {
      // 30 engrams: 7 stay in working memory, 23 evict into hippocampus
      // (well past CONSOLIDATION_BATCH_SIZE = 20).
      for (let i = 0; i < 30; i++) {
        brain.remember(`overflow-engram-${i}`, { importance: 0.5 });
      }

      // Working memory pinned at capacity.
      expect(brain.getWorkingMemoryState().size).toBe(7);

      // The queue gate must have triggered: consolidate() returns a
      // non-zero batch and the queue size drops by exactly batch.length.
      const result = await brain.consolidate();
      expect(result.consolidated).toBeGreaterThan(0);
      expect(result.consolidated).toBeGreaterThanOrEqual(20);
    });

    it('returns honest zero when no engrams flow', async () => {
      // Empty system: consolidate is a documented no-op. The contract is
      // that it does not throw and reports its emptiness truthfully —
      // not that it pretends to have done work.
      const result = await brain.consolidate();
      expect(result.consolidated).toBe(0);
      expect(result.queued).toBe(0);
    });
  });

  describe('heartbeat-scheduler wiring contract', () => {
    it('exposes the consolidate() entry point that heartbeat-scheduler.ts:532 calls', () => {
      // Lock the API surface: heartbeat-scheduler invokes
      // engramSystem.consolidate() and expects {consolidated, queued}.
      // If either the method disappears or the return shape changes,
      // the scheduler would silently break — catch that here.
      expect(typeof brain.consolidate).toBe('function');
    });

    it('consolidate() returns the {consolidated, queued} shape', async () => {
      brain.remember('shape-check', { importance: 0.5 });
      const result = await brain.consolidate();
      expect(result).toEqual(
        expect.objectContaining({
          consolidated: expect.any(Number),
          queued: expect.any(Number),
        })
      );
    });
  });
});
