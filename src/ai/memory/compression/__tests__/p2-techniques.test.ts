import {
  applyTimeDecayFidelity,
  decompressTimeDecayFidelity,
  measureTimeDecayGain,
  getTimeDecayDistributionSummary,
} from '../time-decay-fidelity';
import {
  applyInteractionTrace,
  decompressInteractionTrace,
  measureInteractionTraceGain,
  getInteractionDistributionSummary,
} from '../interaction-trace';
import { makeEngram, makeEngramBatch } from '../test-helpers';

describe('T2: Time-Decay Fidelity', () => {
  const now = Date.now();

  describe('applyTimeDecayFidelity', () => {
    it('handles empty engram array', () => {
      const result = applyTimeDecayFidelity([], now);
      expect(result.engrams).toHaveLength(0);
      expect(result.recallPreserved).toBe(1.0);
    });

    it('assigns fidelity tiers based on age', () => {
      const fresh = makeEngram({ id: 'fresh-1', content: 'Recent memory' });
      fresh.timestamp = new Date(now - 1 * 24 * 60 * 60 * 1000); // 1 day old

      const old = makeEngram({ id: 'old-1', content: 'Old memory' });
      old.timestamp = new Date(now - 30 * 24 * 60 * 60 * 1000); // 30 days old

      const result = applyTimeDecayFidelity([fresh, old], now);

      expect(result.engrams).toHaveLength(2);
      expect(result.stage.fidelityDistribution.recent).toBeGreaterThan(0);
      expect(result.stage.oldestEngramAgeDays).toBeGreaterThan(28);
    });

    it('forces high fidelity for breakthrough events', () => {
      const breakthrough = makeEngram({ id: 'breakthrough-1', content: 'Major realization' });
      breakthrough.consolidationState = 'breakthrough';
      breakthrough.timestamp = new Date(now - 60 * 24 * 60 * 60 * 1000); // 60 days old

      const result = applyTimeDecayFidelity([breakthrough], now);

      const bMeta = result.stage.decayMetadata[0];
      expect(bMeta.isBreakthrough).toBe(true);
      expect(bMeta.fidelityTier).toBe('recent');
    });

    it('calculates decay factors correctly', () => {
      const engrams = makeEngramBatch(3);
      engrams[0].timestamp = new Date(now); // Just now
      engrams[1].timestamp = new Date(now - 7 * 24 * 60 * 60 * 1000); // 7 days (half-life)
      engrams[2].timestamp = new Date(now - 14 * 24 * 60 * 60 * 1000); // 14 days

      const result = applyTimeDecayFidelity(engrams, now);

      const factors = Object.values(result.stage.decayFactors);
      expect(factors[0]).toBeCloseTo(1.0, 2); // Fresh ~= 1.0
      expect(factors[1]).toBeCloseTo(0.5, 2); // Half-life ~= 0.5
      expect(factors[2]).toBeCloseTo(0.25, 2); // 2x half-life ~= 0.25
    });

    it('preserves 100% recall (lossless)', () => {
      const engrams = makeEngramBatch(10);
      const result = applyTimeDecayFidelity(engrams, now);
      expect(result.recallPreserved).toBe(1.0);
    });

    it('returns all engrams unchanged', () => {
      const engrams = makeEngramBatch(5);
      const originalIds = engrams.map((e) => e.id);

      const result = applyTimeDecayFidelity(engrams, now);

      expect(result.engrams).toHaveLength(5);
      expect(result.engrams.map((e) => e.id)).toEqual(expect.arrayContaining(originalIds));
    });

    it('defers very old engrams for reconstruction', () => {
      const veryOld = makeEngram({
        id: 'very-old-1',
        content: 'Ancient memory'
      });
      veryOld.timestamp = new Date(now - 90 * 24 * 60 * 60 * 1000); // 90 days

      const result = applyTimeDecayFidelity([veryOld], now);

      const meta = result.stage.decayMetadata[0];
      expect(meta.fidelityTier).toBe('deferred');
      expect(meta.reasonForTier).toContain('deferred reconstruction');
    });

    it('tracks breakthrough count', () => {
      const engrams = [
        makeEngram({ id: '1', content: 'Normal' }),
        makeEngram({ id: '2', content: 'Breakthrough' }),
        makeEngram({ id: '3', content: 'Normal' }),
      ];
      engrams[1].consolidationState = 'epiphany';

      const result = applyTimeDecayFidelity(engrams, now);

      expect(result.stage.breakthroughCount).toBe(1);
    });
  });

  describe('decompressTimeDecayFidelity', () => {
    it('returns all engrams unchanged', () => {
      const engrams = makeEngramBatch(5);
      const compressed = applyTimeDecayFidelity(engrams, now);

      const decompressed = decompressTimeDecayFidelity(
        compressed.engrams,
        compressed.stage
      );

      expect(decompressed).toHaveLength(5);
      expect(decompressed).toEqual(engrams);
    });

    it('preserves engram metadata', () => {
      const engram = makeEngram({ id: 'test-1', content: 'Test memory' });
      engram.emotionalValence = 0.7;
      engram.arousal = 0.5;

      const compressed = applyTimeDecayFidelity([engram], now);
      const decompressed = decompressTimeDecayFidelity(
        compressed.engrams,
        compressed.stage
      );

      expect(decompressed[0].emotionalValence).toBe(0.7);
      expect(decompressed[0].arousal).toBe(0.5);
    });
  });

  describe('measureTimeDecayGain', () => {
    it('always returns 1.0 (lossless)', () => {
      const engrams = makeEngramBatch(10);
      const compressed = applyTimeDecayFidelity(engrams, now);

      const gain = measureTimeDecayGain(compressed.stage);

      expect(gain).toBe(1.0);
    });
  });

  describe('getTimeDecayDistributionSummary', () => {
    it('returns summary string with percentages', () => {
      const engrams = makeEngramBatch(4);
      engrams[0].timestamp = new Date(now - 1 * 24 * 60 * 60 * 1000); // Recent
      engrams[1].timestamp = new Date(now - 7 * 24 * 60 * 60 * 1000); // Standard
      engrams[2].timestamp = new Date(now - 30 * 24 * 60 * 60 * 1000); // Archived
      engrams[3].timestamp = new Date(now - 90 * 24 * 60 * 60 * 1000); // Deferred

      const compressed = applyTimeDecayFidelity(engrams, now);
      const summary = getTimeDecayDistributionSummary(compressed.stage);

      expect(summary).toContain('Recent:');
      expect(summary).toContain('Standard:');
      expect(summary).toContain('Archived:');
      expect(summary).toContain('Deferred:');
      expect(summary).toContain('%');
    });

    it('returns "No engrams" for empty stage', () => {
      const stage = {
        decayMetadata: [],
        decayFactors: {},
        fidelityDistribution: {
          recent: 0,
          standard: 0,
          archived: 0,
          deferred: 0,
        },
        oldestEngramAgeDays: 0,
        newestEngramAgeDays: 0,
        breakthoughCount: 0,
      };

      const summary = getTimeDecayDistributionSummary(stage);

      expect(summary).toBe('No engrams');
    });
  });
});

describe('T6: Interaction Trace', () => {
  const now = Date.now();

  describe('applyInteractionTrace', () => {
    it('handles empty engram array', () => {
      const result = applyInteractionTrace([], now);
      expect(result.engrams).toHaveLength(0);
      expect(result.recallPreserved).toBe(1.0);
    });

    it('assigns usage tiers based on interaction frequency', () => {
      const hotEngram = makeEngram({ id: 'hot-1', content: 'Frequently used' });
      const coldEngram = makeEngram({ id: 'cold-1', content: 'Rarely used' });

      const tracker = new Map([
        [
          'hot-1',
          [
            { type: 'retrieved' as const, timestamp: now },
            { type: 'referenced' as const, timestamp: now - 1000 },
            { type: 'reflected' as const, timestamp: now - 2000 },
          ],
        ],
        [
          'cold-1',
          [
            { type: 'retrieved' as const, timestamp: now - 30 * 24 * 60 * 60 * 1000 },
          ],
        ],
      ]);

      hotEngram.timestamp = new Date(now - 1 * 24 * 60 * 60 * 1000);
      coldEngram.timestamp = new Date(now - 30 * 24 * 60 * 60 * 1000);

      const result = applyInteractionTrace([hotEngram, coldEngram], now, tracker);

      expect(result.engrams).toHaveLength(2);
      const hotMeta = result.stage.interactionMetadata.find((m) => m.engramId === 'hot-1');
      const coldMeta = result.stage.interactionMetadata.find((m) => m.engramId === 'cold-1');
      expect(hotMeta?.usageTier).toBe('hot');
      expect(coldMeta?.usageTier).toBe('dormant');
    });

    it('counts interactions correctly', () => {
      const engram = makeEngram({ id: 'traced-1', content: 'Traced memory' });
      const tracker = new Map([
        [
          'traced-1',
          [
            { type: 'retrieved' as const, timestamp: now },
            { type: 'referenced' as const, timestamp: now - 1000 },
            { type: 'updated' as const, timestamp: now - 2000 },
            { type: 'compared' as const, timestamp: now - 3000 },
            { type: 'reflected' as const, timestamp: now - 4000 },
          ],
        ],
      ]);

      const result = applyInteractionTrace([engram], now, tracker);

      const meta = result.stage.interactionMetadata[0];
      expect(meta.interactionCount).toBe(5);
    });

    it('calculates frequency per day correctly', () => {
      const engram = makeEngram({ id: 'freq-1', content: 'Frequency test' });
      engram.timestamp = new Date(now - 5 * 24 * 60 * 60 * 1000); // 5 days old

      const tracker = new Map([
        [
          'freq-1',
          Array.from({ length: 15 }, (_, i) => ({
            type: 'retrieved' as const,
            timestamp: now - i * 8 * 60 * 60 * 1000, // 8 hours apart
          })),
        ],
      ]);

      const result = applyInteractionTrace([engram], now, tracker);

      const meta = result.stage.interactionMetadata[0];
      // 15 interactions over ~5 days = 3 interactions/day
      expect(meta.frequency).toBeCloseTo(3.0, 0);
    });

    it('preserves 100% recall (lossless)', () => {
      const engrams = makeEngramBatch(10);
      const result = applyInteractionTrace(engrams, now);
      expect(result.recallPreserved).toBe(1.0);
    });

    it('returns all engrams unchanged', () => {
      const engrams = makeEngramBatch(5);
      const originalIds = engrams.map((e) => e.id);

      const result = applyInteractionTrace(engrams, now);

      expect(result.engrams).toHaveLength(5);
      expect(result.engrams.map((e) => e.id)).toEqual(expect.arrayContaining(originalIds));
    });

    it('handles undefined interaction tracker', () => {
      const engrams = makeEngramBatch(3);

      const result = applyInteractionTrace(engrams, now, undefined);

      expect(result.engrams).toHaveLength(3);
      expect(result.stage.totalInteractions).toBe(0);
      result.stage.interactionMetadata.forEach((meta) => {
        expect(meta.interactionCount).toBe(0);
        expect(meta.usageTier).toBe('dormant');
      });
    });
  });

  describe('decompressInteractionTrace', () => {
    it('returns all engrams unchanged', () => {
      const engrams = makeEngramBatch(5);
      const compressed = applyInteractionTrace(engrams, now);

      const decompressed = decompressInteractionTrace(
        compressed.engrams,
        compressed.stage
      );

      expect(decompressed).toHaveLength(5);
      expect(decompressed).toEqual(engrams);
    });

    it('preserves engram metadata', () => {
      const engram = makeEngram({ id: 'test-1', content: 'Test memory' });
      engram.emotionalValence = 0.8;
      engram.importance = 0.9;

      const compressed = applyInteractionTrace([engram], now);
      const decompressed = decompressInteractionTrace(
        compressed.engrams,
        compressed.stage
      );

      expect(decompressed[0].emotionalValence).toBe(0.8);
      expect(decompressed[0].importance).toBe(0.9);
    });
  });

  describe('measureInteractionTraceGain', () => {
    it('always returns 1.0 (lossless)', () => {
      const engrams = makeEngramBatch(10);
      const compressed = applyInteractionTrace(engrams, now);

      const gain = measureInteractionTraceGain(compressed.stage);

      expect(gain).toBe(1.0);
    });
  });

  describe('getInteractionDistributionSummary', () => {
    it('returns summary string with usage tiers', () => {
      const engrams = [
        makeEngram({ id: '1', content: 'Memory 1' }),
        makeEngram({ id: '2', content: 'Memory 2' }),
        makeEngram({ id: '3', content: 'Memory 3' }),
        makeEngram({ id: '4', content: 'Memory 4' }),
      ];

      const tracker = new Map([
        ['1', Array.from({ length: 5 }, (_, i) => ({ type: 'retrieved' as const, timestamp: now - i * 1000 }))],
        ['2', Array.from({ length: 2 }, (_, i) => ({ type: 'retrieved' as const, timestamp: now - 7 * 24 * 60 * 60 * 1000 - i * 1000 }))],
        ['3', Array.from({ length: 1 }, (_, i) => ({ type: 'retrieved' as const, timestamp: now - 14 * 24 * 60 * 60 * 1000 - i * 1000 }))],
        ['4', []],
      ]);

      engrams[0].timestamp = new Date(now - 1 * 24 * 60 * 60 * 1000);
      engrams[1].timestamp = new Date(now - 7 * 24 * 60 * 60 * 1000);
      engrams[2].timestamp = new Date(now - 14 * 24 * 60 * 60 * 1000);
      engrams[3].timestamp = new Date(now - 30 * 24 * 60 * 60 * 1000);

      const compressed = applyInteractionTrace(engrams, now, tracker);
      const summary = getInteractionDistributionSummary(compressed.stage);

      expect(summary).toContain('Hot:');
      expect(summary).toContain('Warm:');
      expect(summary).toContain('Cold:');
      expect(summary).toContain('Dormant:');
      expect(summary).toContain('%');
    });

    it('returns "No engrams" for empty stage', () => {
      const stage = {
        interactionMetadata: [],
        usageDistribution: {
          hot: 0,
          warm: 0,
          cold: 0,
          dormant: 0,
        },
        totalInteractions: 0,
        avgInteractionFrequency: 0,
        hotMemoryCount: 0,
      };

      const summary = getInteractionDistributionSummary(stage);

      expect(summary).toBe('No engrams');
    });
  });
});
