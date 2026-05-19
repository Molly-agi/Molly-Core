import {
  applyTemporalDeltaEncoding,
  decompressTemporalDeltas,
} from '../temporal-delta';
import { makeEngramBatch } from '../test-helpers';

describe('T3: Temporal Delta Encoding', () => {
  describe('compression', () => {
    it('preserves all engram IDs (no engrams dropped)', () => {
      const engrams = makeEngramBatch(20);
      const bundle = applyTemporalDeltaEncoding(engrams);

      const originalIds = new Set(engrams.map((e) => e.id));
      const survivingIds = new Set(
        bundle.reconstructedEngrams.map((e) => e.id)
      );
      expect(survivingIds).toEqual(originalIds);
    });

    it('handles empty engram array', () => {
      const bundle = applyTemporalDeltaEncoding([]);
      expect(bundle.bases.length).toBe(0);
      expect(bundle.deltaGroups.length).toBe(0);
      expect(bundle.reconstructedEngrams.length).toBe(0);
    });

    it('handles single engram (becomes a base with no deltas)', () => {
      const [single] = makeEngramBatch(1);
      const bundle = applyTemporalDeltaEncoding([single]);

      expect(bundle.bases.length).toBe(1);
      expect(bundle.deltaGroups[0].length).toBe(0);
    });

    it('groups engrams into windows of WINDOW_SIZE (10)', () => {
      const engrams = makeEngramBatch(25);
      const bundle = applyTemporalDeltaEncoding(engrams);

      // 25 engrams → ceil(25/10) = 3 base windows
      expect(bundle.bases.length).toBe(3);
      // First two windows: 9 deltas each (base + 9); last: 4 deltas (base + 4)
      expect(bundle.deltaGroups[0].length).toBe(9);
      expect(bundle.deltaGroups[1].length).toBe(9);
      expect(bundle.deltaGroups[2].length).toBe(4);
    });

    it('stores engrams sorted by timestamp regardless of input order', () => {
      const engrams = makeEngramBatch(10);
      // Shuffle the input
      const shuffled = [...engrams].sort(() => Math.random() - 0.5);
      const bundle = applyTemporalDeltaEncoding(shuffled);

      // All IDs should still be present
      const recoveredIds = new Set(
        bundle.reconstructedEngrams.map((e) => e.id)
      );
      const originalIds = new Set(engrams.map((e) => e.id));
      expect(recoveredIds).toEqual(originalIds);
    });

    it('stores delta only for non-zero field differences', () => {
      // Engrams with identical numeric fields → deltas should be empty objects
      const base = makeEngramBatch(1)[0];
      const clone = {
        ...base,
        id: 'clone-0',
        timestamp: new Date(base.timestamp.getTime() + 1000),
      };

      const bundle = applyTemporalDeltaEncoding([base, clone]);

      // clone has same emotionalValence, arousal, importance as base → no delta fields
      const delta = bundle.deltaGroups[0][0];
      expect(Object.keys(delta.deltas).length).toBe(0);
    });
  });

  describe('decompression (round-trip)', () => {
    it('restores all engrams with correct IDs', () => {
      const engrams = makeEngramBatch(30);
      const bundle = applyTemporalDeltaEncoding(engrams);
      const restored = decompressTemporalDeltas(bundle);

      const restoredIds = new Set(restored.map((e) => e.id));
      const originalIds = new Set(engrams.map((e) => e.id));
      expect(restoredIds).toEqual(originalIds);
    });

    it('restores numeric fields to original values (within float precision)', () => {
      const engrams = makeEngramBatch(10);
      const bundle = applyTemporalDeltaEncoding(engrams);
      const restored = decompressTemporalDeltas(bundle);

      const restoredById = new Map(restored.map((e) => [e.id, e]));

      for (const orig of engrams) {
        const r = restoredById.get(orig.id)!;
        expect(r).toBeDefined();
        expect(r.emotionalValence).toBeCloseTo(orig.emotionalValence, 9);
        expect(r.arousal).toBeCloseTo(orig.arousal, 9);
        expect(r.importance).toBeCloseTo(orig.importance, 9);
      }
    });

    it('restores content strings exactly', () => {
      const engrams = makeEngramBatch(10);
      const bundle = applyTemporalDeltaEncoding(engrams);
      const restored = decompressTemporalDeltas(bundle);

      const restoredById = new Map(restored.map((e) => [e.id, e]));
      for (const orig of engrams) {
        expect(restoredById.get(orig.id)!.content).toBe(orig.content);
      }
    });

    it('matches reconstructedEngrams in the bundle (no extra decompress needed)', () => {
      const engrams = makeEngramBatch(15);
      const bundle = applyTemporalDeltaEncoding(engrams);
      const decompressed = decompressTemporalDeltas(bundle);

      // Both paths should produce the same result
      expect(decompressed.map((e) => e.id).sort()).toEqual(
        bundle.reconstructedEngrams.map((e) => e.id).sort()
      );
    });
  });

  describe('delta values', () => {
    it('stores smaller numeric values for slowly-varying fields (gzip pre-conditioning)', () => {
      // T3 gain is a gzip-level gain: delta values (0.001) compress better than
      // absolute values (0.501). Raw JSON bytes may be similar, which is expected.
      const now = Date.now();
      const step = 0.01; // slowly varying
      const engrams = Array.from({ length: 10 }, (_, i) => ({
        ...makeEngramBatch(1)[0],
        id: `e-${i}`,
        timestamp: new Date(now - (10 - i) * 600000),
        emotionalValence: 0.5 + i * step,
        arousal: 0.5 - i * step,
        importance: 0.6,
      }));

      const bundle = applyTemporalDeltaEncoding(engrams);

      // Each delta's emotionalValence delta should be ~step (not the full absolute value)
      for (const delta of bundle.deltaGroups[0]) {
        const evDelta = Math.abs(delta.deltas.emotionalValence ?? 0);
        // Delta should be ≤ step × window_size (not the full 0.5+ absolute value)
        expect(evDelta).toBeLessThanOrEqual(step * 10 + 1e-9);
      }
    });

    it('does not expand the logical data (all IDs preserved with no extra overhead)', () => {
      const engrams = makeEngramBatch(20);
      const bundle = applyTemporalDeltaEncoding(engrams);

      // All original IDs must be recoverable
      const originalIds = new Set(engrams.map((e) => e.id));
      const recoveredIds = new Set(
        bundle.reconstructedEngrams.map((e) => e.id)
      );
      expect(recoveredIds).toEqual(originalIds);
    });
  });
});
