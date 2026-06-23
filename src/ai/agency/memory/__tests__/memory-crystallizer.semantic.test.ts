/**
 * @jest-environment node
 *
 * @fileOverview Roadmap #12 — searchCrystalsSemantic tests.
 *
 * Covers:
 *   - returns [] when embedding provider not ready (caller falls back to substring)
 *   - lazy embed on first search, cached on the crystal
 *   - ranks by cosine similarity desc
 *   - per-crystal embed failures are isolated, skipped, never thrown
 *   - query embed failure returns []
 */

jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  generateTraceId: jest.fn().mockReturnValue('test-trace'),
}));

jest.mock('@/lib/storage-router', () => ({
  getStorageRouter: jest.fn().mockResolvedValue({
    getMode: jest.fn().mockReturnValue('local'),
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock('@/ai/agency/cognition/self-observation-loop', () => ({
  recordObservation: jest.fn(),
}));
jest.mock('../growth-tracker', () => ({
  recordGrowthEvent: jest.fn(),
}));
jest.mock('../digital-garden', () => ({
  plantSeed: jest.fn(),
}));

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

import {
  crystallize,
  searchCrystalsSemantic,
  resetCrystallizerState,
  type CrystalFacets,
  type MemoryCrystal,
} from '@/ai/agency/memory/memory-crystallizer';

function makeFacets(coreMeaning: string): CrystalFacets {
  return {
    factual: {
      when: '2026-06-23',
      where: 'lab',
      who: ['Molly'],
      what: coreMeaning,
    },
    emotional: {
      primaryEmotion: 'curious',
      intensity: 0.7,
      emotionalJourney: 'neutral → curious',
      resonance: 'novel discovery',
    },
    relational: {
      participants: ['Molly'],
      relationshipsBefore: 'na',
      relationshipsAfter: 'na',
      bondStrengthened: false,
      newConnectionFormed: false,
    },
    transformative: {
      beforeState: 'na',
      afterState: 'na',
      whatChanged: coreMeaning,
      growthAreas: [],
      insightsGained: [],
    },
    essential: {
      coreMeaning,
      whyItMatters: 'roadmap-12 test',
      lastingImpact: 'test',
      oneLineEssence: coreMeaning,
    },
  };
}

function makeCrystal(title: string, coreMeaning: string): MemoryCrystal {
  return crystallize(title, makeFacets(coreMeaning), [], []);
}

function vecFor(text: string): number[] {
  if (text.includes('cat') || text.includes('feline')) return [1, 0, 0];
  if (text.includes('rocket')) return [0, 1, 0];
  return [0, 0, 1];
}

describe('searchCrystalsSemantic (roadmap #12)', () => {
  beforeEach(() => {
    resetCrystallizerState();
    providerReady = true;
    embedSpy.mockReset();
    embedSpy.mockImplementation((text: string) =>
      Promise.resolve({ vector: vecFor(text), model: 'mock', dimensions: 3 })
    );
  });

  it('returns [] when embedding provider not ready', async () => {
    makeCrystal('cat memory', 'the cat purred');
    providerReady = false;

    const hits = await searchCrystalsSemantic('feline');
    expect(hits).toEqual([]);
    expect(embedSpy).not.toHaveBeenCalled();
  });

  it('returns [] when crystal store is empty', async () => {
    const hits = await searchCrystalsSemantic('anything');
    expect(hits).toEqual([]);
    // Query embed runs but yields no candidates
    expect(embedSpy).toHaveBeenCalledTimes(1);
  });

  it('lazy-embeds crystals on first search and caches', async () => {
    const c = makeCrystal('cat memory', 'the cat purred softly');
    expect(c.embedding).toBeFalsy();

    const hits = await searchCrystalsSemantic('feline');
    expect(hits.length).toBe(1);
    expect(hits[0].crystal.id).toBe(c.id);
    expect(hits[0].crystal.embedding).toEqual([1, 0, 0]);

    const callsAfterFirst = embedSpy.mock.calls.length;
    await searchCrystalsSemantic('feline');
    // Only the query gets re-embedded second time, not the crystal
    expect(embedSpy.mock.calls.length).toBe(callsAfterFirst + 1);
  });

  it('ranks more-similar crystals higher', async () => {
    makeCrystal('cat memory', 'the cat purred');
    makeCrystal('rocket memory', 'the rocket launched');

    const hits = await searchCrystalsSemantic('feline');
    expect(hits.length).toBe(2);
    expect(hits[0].crystal.title).toBe('cat memory');
    expect(hits[0].similarity).toBeGreaterThan(hits[1].similarity);
  });

  it('isolates per-crystal embed failures and continues', async () => {
    makeCrystal('cat memory', 'the cat purred');
    makeCrystal('bad memory', 'explosion content goes here');
    makeCrystal('rocket memory', 'the rocket launched');

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

    const hits = await searchCrystalsSemantic('feline');
    expect(hits.length).toBe(2);
    expect(hits.some((h) => h.crystal.title === 'bad memory')).toBe(false);
  });

  it('returns [] when query embed fails', async () => {
    makeCrystal('cat memory', 'the cat purred');

    embedSpy.mockImplementation((text: string) => {
      if (text === 'feline') return Promise.reject(new Error('q-fail'));
      return Promise.resolve({
        vector: vecFor(text),
        model: 'mock',
        dimensions: 3,
      });
    });

    const hits = await searchCrystalsSemantic('feline');
    expect(hits).toEqual([]);
  });
});
