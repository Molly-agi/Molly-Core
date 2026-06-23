/**
 * @jest-environment node
 *
 * @fileOverview Roadmap #12 — Right-hemisphere semantic recall tests.
 *
 * Covers:
 *   - FrontalCortex.searchSemantic (lazy embed, cosine, ranking)
 *   - Hippocampus.searchSemantic (consolidation queue, lazy embed)
 *   - NeuralEngramSystem.recallSemantic (working+consolidated merge, dedupe)
 *   - Provider-absent fallback (returns [])
 *   - Per-engram embed failures are isolated, not propagated
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

jest.mock('@/ai/memory/knowledge-store', () => {
  // We need the real cosineSimilarity export for ranking inside searchSemantic
  // since the implementation imports it from here. Keep the rest mocked.
  const actual = jest.requireActual('@/ai/memory/knowledge-store');
  return {
    cosineSimilarity: actual.cosineSimilarity,
    getKnowledgeStore: jest.fn().mockResolvedValue({
      write: jest.fn().mockResolvedValue(undefined),
      recall: jest.fn().mockResolvedValue([]),
      recordSnapshot: jest.fn().mockResolvedValue(undefined),
    }),
  };
});

const embedSpy = jest.fn();
let providerReady = true;
jest.mock('@/ai/tools/embedding-provider', () => ({
  isEmbeddingProviderReady: () => providerReady,
  getEmbeddingProvider: () => ({
    getName: () => 'mock',
    embed: embedSpy,
    embedBatch: jest.fn(),
    getDimensions: () => 3,
  }),
}));

import { NeuralEngramSystem } from '@/ai/memory/neural-engram';

// Map content string → embedding vector; lets us shape similarity precisely.
function vecFor(content: string): number[] {
  if (content.includes('cat')) return [1, 0, 0];
  if (content.includes('dog')) return [0.9, 0.1, 0];
  if (content.includes('rocket')) return [0, 1, 0];
  if (content.includes('feline')) return [0.95, 0.05, 0];
  return [0, 0, 1];
}

describe('Right-hemisphere semantic recall (roadmap #12)', () => {
  let brain: NeuralEngramSystem;

  beforeEach(() => {
    providerReady = true;
    embedSpy.mockReset();
    embedSpy.mockImplementation((text: string) =>
      Promise.resolve({ vector: vecFor(text), model: 'mock', dimensions: 3 })
    );
    brain = new NeuralEngramSystem();
  });

  afterEach(() => {
    brain.destroy();
  });

  describe('FrontalCortex.searchSemantic', () => {
    it('returns [] when embedding provider is not ready', async () => {
      providerReady = false;
      brain.remember('the cat sat on the mat');
      const hits = await brain.frontalCortex.searchSemantic('feline');
      expect(hits).toEqual([]);
      expect(embedSpy).not.toHaveBeenCalled();
    });

    it('lazy-embeds engrams on first query and caches them', async () => {
      const e = brain.remember('the cat sat on the mat');
      expect(e.embedding).toBeFalsy();

      const hits = await brain.frontalCortex.searchSemantic('feline');
      expect(hits.length).toBe(1);
      expect(hits[0].engram.embedding).toEqual([1, 0, 0]);

      // Second call should NOT re-embed the same engram
      const callsAfterFirst = embedSpy.mock.calls.length;
      await brain.frontalCortex.searchSemantic('feline');
      // Only the query gets re-embedded; engram embedding is cached
      expect(embedSpy.mock.calls.length).toBe(callsAfterFirst + 1);
    });

    it('ranks more-similar engrams higher', async () => {
      brain.remember('the cat sat on the mat'); // closer to feline
      brain.remember('the rocket flew far'); // very different

      const hits = await brain.frontalCortex.searchSemantic('feline');
      expect(hits.length).toBe(2);
      expect(hits[0].engram.content).toContain('cat');
      expect(hits[0].similarity).toBeGreaterThan(hits[1].similarity);
    });

    it('isolates per-engram embed failures and continues', async () => {
      brain.remember('the cat sat'); // succeeds
      brain.remember('explosion content'); // will fail
      brain.remember('the rocket flew'); // succeeds

      embedSpy.mockImplementation((text: string) => {
        if (text.includes('explosion')) {
          return Promise.reject(new Error('boom'));
        }
        return Promise.resolve({
          vector: vecFor(text),
          model: 'mock',
          dimensions: 3,
        });
      });

      const hits = await brain.frontalCortex.searchSemantic('feline');
      expect(hits.length).toBe(2); // failing engram skipped
      expect(hits.some((h) => h.engram.content.includes('explosion'))).toBe(
        false
      );
    });

    it('returns [] when the query embed fails', async () => {
      brain.remember('the cat sat');
      embedSpy.mockImplementation((text: string) => {
        if (text === 'feline') return Promise.reject(new Error('q-fail'));
        return Promise.resolve({
          vector: vecFor(text),
          model: 'mock',
          dimensions: 3,
        });
      });

      const hits = await brain.frontalCortex.searchSemantic('feline');
      expect(hits).toEqual([]);
    });
  });

  describe('Hippocampus.searchSemantic', () => {
    it('searches the consolidation queue with lazy embed', async () => {
      const e = brain.remember('the cat sat on the mat');
      brain.hippocampus.stage(e);

      const hits = await brain.hippocampus.searchSemantic('feline');
      expect(hits.length).toBe(1);
      expect(hits[0].engram.id).toBe(e.id);
      expect(hits[0].engram.embedding).toEqual([1, 0, 0]);
    });

    it('returns [] when provider not ready', async () => {
      providerReady = false;
      const e = brain.remember('cat content');
      brain.hippocampus.stage(e);
      const hits = await brain.hippocampus.searchSemantic('feline');
      expect(hits).toEqual([]);
    });
  });

  describe('NeuralEngramSystem.recallSemantic', () => {
    it('merges working + consolidated and dedupes by id', async () => {
      const e1 = brain.remember('the cat sat on the mat');
      const e2 = brain.remember('a different feline lounged');
      // Stage e1 into hippocampus so it appears in both tiers
      brain.hippocampus.stage(e1);

      const merged = await brain.recallSemantic('feline');
      const ids = merged.map((m) => m.id);

      // e1 appears in both tiers but only once in result
      expect(ids.filter((id) => id === e1.id).length).toBe(1);
      // both engrams present
      expect(ids).toContain(e1.id);
      expect(ids).toContain(e2.id);
    });

    it('returns only working hits when consolidated tier is empty', async () => {
      const e = brain.remember('the cat sat');
      const merged = await brain.recallSemantic('feline');
      expect(merged.length).toBe(1);
      expect(merged[0].id).toBe(e.id);
    });
  });
});
