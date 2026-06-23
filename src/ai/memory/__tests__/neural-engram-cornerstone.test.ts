/**
 * @jest-environment node
 *
 * Item 15 — Eric-cornerstone never-decay tier
 * ------------------------------------------------------------------
 * brain-roadmap.md:15 — "Dedicated about-my-dad tier. Preferences, history,
 * what hurts him, what makes him happy. Always injected, survives every
 * consolidation pass."
 *
 * Two invariants this suite locks:
 *   1. Cornerstone engrams survive a full consolidation cycle that would
 *      evict their non-cornerstone neighbors. They stay in working memory
 *      and are never staged to the hippocampus.
 *   2. Cornerstone engrams are always present in recall() / recallEverything()
 *      results regardless of substring/tag match against the query.
 *
 * RED-first: this suite ran red before the cornerstone field + skip/inject
 * logic landed on neural-engram.ts.
 */

jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
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

import { NeuralEngramSystem, type MemoryEngram } from '../neural-engram';

describe('Item 15 — Eric-cornerstone never-decay tier', () => {
  let system: NeuralEngramSystem;

  beforeEach(() => {
    system = new NeuralEngramSystem();
  });

  afterEach(() => {
    system.destroy();
  });

  describe('schema', () => {
    it('accepts a cornerstone tier handle on remember()', () => {
      const engram = system.remember('Eric loves coffee in the morning', {
        cornerstone: 'eric',
      });
      expect(engram.cornerstone).toBe('eric');
    });

    it('defaults cornerstone to undefined when not supplied', () => {
      const engram = system.remember('routine working memory entry');
      expect(engram.cornerstone).toBeUndefined();
    });
  });

  describe('consolidation survival', () => {
    it('cornerstone engram survives a consolidation cycle that evicts neighbors', async () => {
      // Cornerstone: high-tier, must never leave working memory.
      const corner = system.remember('Eric was born on a Tuesday', {
        cornerstone: 'eric',
        importance: 0.9,
      });
      // Normal engram, low importance — eligible for consolidation.
      const normal = system.remember('random unimportant note', {
        importance: 0.1,
      });

      // Drive working memory state into "ready to consolidate" — force the
      // normal engram to look stale by reaching deep into the public state
      // and mutating lastAccessed. Cornerstone stays fresh because it must
      // be skipped regardless of staleness.
      const state = system.getWorkingMemoryState();
      for (const e of state.engrams) {
        if (e.id === normal.id) {
          (e as MemoryEngram).lastAccessed = new Date(Date.now() - 120_000);
        }
      }

      await system.consolidate();

      const after = system.getWorkingMemoryState();
      const ids = after.engrams.map((e) => e.id);

      // Cornerstone must remain in working memory.
      expect(ids).toContain(corner.id);
      // Normal engram should have been staged out.
      expect(ids).not.toContain(normal.id);
    });

    it('cornerstone is excluded from getConsolidationCandidates()', () => {
      const corner = system.remember('Eric hates being interrupted', {
        cornerstone: 'eric',
      });
      system.remember('background fact, importance default');

      // Drive the cornerstone's slot to a state that would normally make it
      // a consolidation candidate (low activation + stale lastAccessed).
      const state = system.getWorkingMemoryState();
      const cornerEngram = state.engrams.find((e) => e.id === corner.id);
      if (cornerEngram) {
        cornerEngram.lastAccessed = new Date(Date.now() - 120_000);
      }

      const candidates = system.getConsolidationCandidates();
      const candidateIds = candidates.map((e) => e.id);
      expect(candidateIds).not.toContain(corner.id);
    });
  });

  describe('recall injection', () => {
    it('cornerstone engrams appear in recall() even when query does not match', () => {
      const corner = system.remember('Eric prefers black tea, no sugar', {
        cornerstone: 'eric',
      });
      system.remember('unrelated content about widgets');

      const hits = system.recall('elephantine-query-with-no-overlap');
      const ids = hits.map((e) => e.id);
      expect(ids).toContain(corner.id);
    });

    it('cornerstone engrams appear in recallEverything() even when query does not match', async () => {
      const corner = system.remember(
        'Eric is allergic to shellfish — never order it',
        {
          cornerstone: 'eric',
        }
      );
      system.remember('unrelated content about widgets');

      const result = await system.recallEverything(
        'totally-unrelated-search-string'
      );
      const ids = result.rightHits.map((e) => e.id);
      expect(ids).toContain(corner.id);
    });

    it('does not double-inject cornerstone when query already matches it', () => {
      const corner = system.remember('Eric loves coffee', {
        cornerstone: 'eric',
      });
      const hits = system.recall('coffee');
      const occurrences = hits.filter((e) => e.id === corner.id).length;
      expect(occurrences).toBe(1);
    });
  });
});
