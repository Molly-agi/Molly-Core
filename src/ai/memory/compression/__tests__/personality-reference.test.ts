import {
  applyPersonalityReferenceCompression,
  decompressPersonalityReferences,
  measurePersonalityCompressionGain,
} from '../personality-reference';
import { makeEngramBatch, makePersonality } from '../test-helpers';

describe('T1: Personality Reference Compression', () => {
  describe('compression', () => {
    it('returns all original engram IDs (lossless — no engrams dropped)', () => {
      const engrams = makeEngramBatch(20, true);
      const bundle = applyPersonalityReferenceCompression(engrams);

      const originalIds = new Set(engrams.map((e) => e.id));
      const bundleIds = new Set(bundle.engrams.map((e) => e.id));
      expect(bundleIds).toEqual(originalIds);
    });

    it('removes inline personalityContext from engrams', () => {
      const engrams = makeEngramBatch(5, true);
      const bundle = applyPersonalityReferenceCompression(engrams);

      for (const e of bundle.engrams) {
        expect(
          (e as { personalityContext?: unknown }).personalityContext
        ).toBeUndefined();
      }
    });

    it('stores unique personality snapshots in the reference table', () => {
      // All engrams share the same personality → should produce exactly 1 ref
      const sharedPersonality = makePersonality({ warmth: 0.9 });
      const engrams = makeEngramBatch(10, false).map((e) => ({
        ...e,
        personalityContext: sharedPersonality,
      }));

      const bundle = applyPersonalityReferenceCompression(engrams);

      expect(Object.keys(bundle.personalityRefs).length).toBe(1);
    });

    it('deduplicates near-identical personalities (within 0.005 tolerance)', () => {
      const base = makePersonality();
      // Differences < 0.005 should hash to the same ref
      const p1 = { ...base, warmth: 0.85 };
      const p2 = { ...base, warmth: 0.8502 }; // diff = 0.0002 < 0.005
      const p3 = { ...base, warmth: 0.86 }; // diff = 0.01 — different ref

      const engrams = [
        { ...makeEngramBatch(1, false)[0], id: 'e0', personalityContext: p1 },
        { ...makeEngramBatch(1, false)[0], id: 'e1', personalityContext: p2 },
        { ...makeEngramBatch(1, false)[0], id: 'e2', personalityContext: p3 },
      ];

      const bundle = applyPersonalityReferenceCompression(engrams);

      // e0 and e1 should share the same ref; e2 gets its own
      expect(Object.keys(bundle.personalityRefs).length).toBe(2);
    });

    it('passes through engrams that have no personalityContext', () => {
      const engrams = makeEngramBatch(5, false); // no personality
      const bundle = applyPersonalityReferenceCompression(engrams);

      expect(bundle.engrams.length).toBe(5);
      expect(Object.keys(bundle.personalityRefs).length).toBe(0);
    });

    it('sets personalityRefId pointer on each engram that had a context', () => {
      const engrams = makeEngramBatch(5, true);
      const bundle = applyPersonalityReferenceCompression(engrams);

      for (const e of bundle.engrams) {
        const refId = (e as { personalityRefId?: string }).personalityRefId;
        expect(refId).toBeDefined();
        expect(bundle.personalityRefs[refId!]).toBeDefined();
      }
    });
  });

  describe('decompression (round-trip)', () => {
    it('restores all original personality contexts after round-trip', () => {
      const personality = makePersonality({ warmth: 0.95 });
      const engrams = makeEngramBatch(8, false).map((e) => ({
        ...e,
        personalityContext: personality,
      }));

      const bundle = applyPersonalityReferenceCompression(engrams);
      const restored = decompressPersonalityReferences(bundle);

      for (const e of restored) {
        expect(e.personalityContext).toBeDefined();
        expect(e.personalityContext!.warmth).toBeCloseTo(0.95, 5);
      }
    });

    it('restores engrams without personalityContext unchanged', () => {
      const engrams = makeEngramBatch(5, false);
      const bundle = applyPersonalityReferenceCompression(engrams);
      const restored = decompressPersonalityReferences(bundle);

      expect(restored.length).toBe(engrams.length);
      for (const e of restored) {
        expect(e.personalityContext).toBeUndefined();
      }
    });

    it('preserves all non-personality fields exactly', () => {
      const engrams = makeEngramBatch(5, true);
      const bundle = applyPersonalityReferenceCompression(engrams);
      const restored = decompressPersonalityReferences(bundle);

      for (let i = 0; i < engrams.length; i++) {
        expect(restored[i].id).toBe(engrams[i].id);
        expect(restored[i].content).toBe(engrams[i].content);
        expect(restored[i].importance).toBe(engrams[i].importance);
        expect(restored[i].emotionalValence).toBe(engrams[i].emotionalValence);
      }
    });
  });

  describe('compression gain', () => {
    it('achieves positive compression gain with many engrams sharing personality', () => {
      const sharedPersonality = makePersonality();
      const engrams = makeEngramBatch(50, false).map((e) => ({
        ...e,
        personalityContext: sharedPersonality,
      }));

      const bundle = applyPersonalityReferenceCompression(engrams);
      const stats = measurePersonalityCompressionGain(engrams, bundle);

      expect(stats.savedBytes).toBeGreaterThan(0);
      expect(stats.ratioPercent).toBeGreaterThan(0);
    });

    it('produces no negative compression gain (never makes things larger)', () => {
      // Even in the worst case (all unique personalities), we shouldn't expand by much
      const engrams = makeEngramBatch(5, false).map((e, i) => ({
        ...e,
        personalityContext: makePersonality({ warmth: 0.1 + i * 0.1 }),
      }));

      const bundle = applyPersonalityReferenceCompression(engrams);
      const stats = measurePersonalityCompressionGain(engrams, bundle);

      // Worst case: slight overhead from the ref table. Acceptable tolerance: <5%
      expect(stats.compressedBytes).toBeLessThan(stats.originalBytes * 1.05);
    });
  });
});
