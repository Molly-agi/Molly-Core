/**
 * @jest-environment node
 *
 * Item 14 — Confidence + Provenance per Memory
 * ------------------------------------------------------------------
 * Every engram must carry:
 *   - confidence (0..1)         how sure we are this is right
 *   - source     (agent handle) who wrote it
 *   - writePath  (enum)         which code path produced it
 *   - writtenAt  (ISO string)   when it was authored
 *
 * Persistence: the whole engram is JSON.stringify'd and encrypted into the
 * `encrypted` column, so adding optional fields round-trips for free. This
 * suite asserts the JSON round-trip directly so we don't need a live
 * Firestore to certify the contract.
 *
 * RED-first: this suite ran red before the schema landed.
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
    recall: jest.fn(),
    recordSnapshot: jest.fn().mockResolvedValue(undefined),
  }),
}));

import {
  NeuralEngramSystem,
  type MemoryEngram,
  type EngramProvenance,
  WRITE_PATH_DEFAULT_CONFIDENCE,
} from '../neural-engram';

describe('Item 14 — confidence + provenance per memory', () => {
  let system: NeuralEngramSystem;

  beforeEach(() => {
    jest.useFakeTimers();
    system = new NeuralEngramSystem();
  });

  afterEach(() => {
    system.destroy();
    jest.useRealTimers();
  });

  describe('schema', () => {
    it('exposes a typed default-confidence table keyed by writePath', () => {
      expect(WRITE_PATH_DEFAULT_CONFIDENCE.direct).toBeGreaterThan(0);
      expect(WRITE_PATH_DEFAULT_CONFIDENCE.direct).toBeLessThanOrEqual(1);
      expect(WRITE_PATH_DEFAULT_CONFIDENCE.consolidation).toBeGreaterThan(0);
      expect(WRITE_PATH_DEFAULT_CONFIDENCE.consolidation).toBeLessThanOrEqual(
        1
      );
      expect(WRITE_PATH_DEFAULT_CONFIDENCE.crystallization).toBeGreaterThan(0);
      expect(WRITE_PATH_DEFAULT_CONFIDENCE.crystallization).toBeLessThanOrEqual(
        1
      );
      // Direct writes are the highest-trust path: an agent intentionally
      // wrote this. Derived paths cannot be more confident than the source.
      expect(WRITE_PATH_DEFAULT_CONFIDENCE.consolidation).toBeLessThanOrEqual(
        WRITE_PATH_DEFAULT_CONFIDENCE.direct
      );
      expect(WRITE_PATH_DEFAULT_CONFIDENCE.crystallization).toBeLessThanOrEqual(
        WRITE_PATH_DEFAULT_CONFIDENCE.direct
      );
    });
  });

  describe('remember() populates provenance', () => {
    it('stamps confidence + source + writePath + writtenAt on every direct write', () => {
      const engram = system.remember('I learned X');
      expect(engram.provenance).toBeDefined();
      const p = engram.provenance as EngramProvenance;
      expect(p.confidence).toBe(WRITE_PATH_DEFAULT_CONFIDENCE.direct);
      expect(p.writePath).toBe('direct');
      expect(typeof p.source).toBe('string');
      expect(p.source.length).toBeGreaterThan(0);
      expect(typeof p.writtenAt).toBe('string');
      expect(() => new Date(p.writtenAt).toISOString()).not.toThrow();
    });

    it('lets callers override source when the agent identity is known', () => {
      const engram = system.remember('Eric said pin this', {
        provenance: { source: 'eric' },
      });
      expect(engram.provenance?.source).toBe('eric');
    });

    it('lets callers override confidence when downstream knows better', () => {
      const engram = system.remember('Inferred from context', {
        provenance: { confidence: 0.6 },
      });
      expect(engram.provenance?.confidence).toBe(0.6);
      // writePath default still applies — caller only overrode confidence.
      expect(engram.provenance?.writePath).toBe('direct');
    });

    it('lets callers override writePath for non-direct construction', () => {
      const engram = system.remember('Promoted from cluster', {
        provenance: { writePath: 'crystallization' },
      });
      expect(engram.provenance?.writePath).toBe('crystallization');
      // confidence defaults to the writePath's table entry when not overridden.
      expect(engram.provenance?.confidence).toBe(
        WRITE_PATH_DEFAULT_CONFIDENCE.crystallization
      );
    });
  });

  describe('persistence round-trip', () => {
    it('preserves provenance through JSON.stringify -> JSON.parse', () => {
      // engram-persistence.ts encrypts JSON.stringify(engram) and decrypts
      // back into JSON.parse. New fields ride through for free as long as
      // they survive that round-trip.
      const original = system.remember('round-trippable', {
        provenance: { source: 'atlas', confidence: 0.85 },
      });
      const wire = JSON.stringify(original);
      const restored = JSON.parse(wire) as MemoryEngram;
      expect(restored.provenance).toBeDefined();
      expect(restored.provenance?.confidence).toBe(0.85);
      expect(restored.provenance?.source).toBe('atlas');
      expect(restored.provenance?.writePath).toBe('direct');
      expect(restored.provenance?.writtenAt).toBe(
        original.provenance?.writtenAt
      );
    });
  });

  describe('confidence bounds', () => {
    it('rejects out-of-range confidence values loudly', () => {
      expect(() =>
        system.remember('bad', { provenance: { confidence: 1.5 } })
      ).toThrow(/confidence/i);
      expect(() =>
        system.remember('bad', { provenance: { confidence: -0.1 } })
      ).toThrow(/confidence/i);
    });
  });
});
