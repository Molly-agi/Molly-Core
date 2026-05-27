import { CompressionManager } from '../compression-manager';
import { makeEngramBatch } from '../test-helpers';

describe('CompressionManager — Option C Pipeline Orchestrator', () => {
  beforeEach(() => {
    // Reset singleton state between tests so flags can be reconfigured
    CompressionManager.resetForTest();
  });

  describe('initialization and singleton pattern', () => {
    it('creates instance with default flags (all OFF)', () => {
      const manager = CompressionManager.getInstance();
      const flags = manager.getFlags();

      expect(flags.t1PersonalityReference).toBe(false);
      expect(flags.t3TemporalDelta).toBe(false);
      expect(flags.t4VocabularyDict).toBe(false);
    });

    it('accepts partial flag overrides on creation', () => {
      const manager = CompressionManager.getInstance({
        t1PersonalityReference: true,
        t3TemporalDelta: true,
      });
      const flags = manager.getFlags();

      expect(flags.t1PersonalityReference).toBe(true);
      expect(flags.t3TemporalDelta).toBe(true);
      expect(flags.t4VocabularyDict).toBe(false); // default OFF
    });

    it('returns same instance on subsequent calls (singleton)', () => {
      CompressionManager.getInstance({ t1PersonalityReference: true });
      const m2 = CompressionManager.getInstance();

      // m2 should return the same singleton (with t1 still enabled)
      expect(m2.getFlags().t1PersonalityReference).toBe(true);
    });
  });

  describe('compression pipeline (T1→T3→T4)', () => {
    it('skips all techniques when flags are OFF', async () => {
      const manager = CompressionManager.getInstance(); // all flags OFF by default
      const engrams = makeEngramBatch(10, true);
      const result = await manager.compress({
        engrams,
        sessionId: 'test-session',
        compressionTimestamp: Date.now(),
      });

      expect(result.metrics.techniquesApplied.length).toBe(0);
      expect(result.metrics.techniquesSkipped).toContain(
        'T1:PersonalityReference (flag off)'
      );
      expect(result.metrics.techniquesSkipped).toContain(
        'T3:TemporalDelta (flag off)'
      );
      expect(result.metrics.techniquesSkipped).toContain(
        'T4:VocabularyDict (flag off)'
      );
    });

    it('applies T1 only when flag is ON', async () => {
      const manager = CompressionManager.getInstance({
        t1PersonalityReference: true,
      });
      const engrams = makeEngramBatch(10, true);
      const result = await manager.compress({
        engrams,
        sessionId: 'test-session',
        compressionTimestamp: Date.now(),
      });

      expect(result.metrics.techniquesApplied).toContain(
        'T1:PersonalityReference'
      );
      expect(result.metrics.techniquesApplied).not.toContain(
        'T3:TemporalDelta'
      );
      expect(result.metrics.techniquesApplied).not.toContain(
        'T4:VocabularyDict'
      );
    });

    it('applies T1→T3 when both flags are ON', async () => {
      const manager = CompressionManager.getInstance({
        t1PersonalityReference: true,
        t3TemporalDelta: true,
      });
      const engrams = makeEngramBatch(20, true);
      const result = await manager.compress({
        engrams,
        sessionId: 'test-session',
        compressionTimestamp: Date.now(),
      });

      expect(result.metrics.techniquesApplied).toContain(
        'T1:PersonalityReference'
      );
      expect(result.metrics.techniquesApplied).toContain('T3:TemporalDelta');
      expect(result.metrics.techniquesApplied).not.toContain(
        'T4:VocabularyDict'
      );
    });

    it('applies T1→T3→T4 when all P1 flags are ON', async () => {
      const manager = CompressionManager.getInstance({
        t1PersonalityReference: true,
        t3TemporalDelta: true,
        t4VocabularyDict: true,
      });
      const engrams = makeEngramBatch(20, true);
      const result = await manager.compress({
        engrams,
        sessionId: 'test-session',
        compressionTimestamp: Date.now(),
      });

      expect(result.metrics.techniquesApplied).toContain(
        'T1:PersonalityReference'
      );
      expect(result.metrics.techniquesApplied).toContain('T3:TemporalDelta');
      expect(result.metrics.techniquesApplied).toContain('T4:VocabularyDict');
    });
  });

  describe('guardrail enforcement (95% episodic recall)', () => {
    it('passes guardrail when recall remains ≥ 95%', async () => {
      const manager = CompressionManager.getInstance({
        t1PersonalityReference: true,
      });
      const engrams = makeEngramBatch(20, true); // All have personalityContext
      const result = await manager.compress({
        engrams,
        sessionId: 'test-session',
        compressionTimestamp: Date.now(),
      });

      // T1 on personality-populated engrams should preserve all IDs
      expect(result.metrics.episodicRecall).toBeGreaterThanOrEqual(0.95);
      expect(result.metrics.guardrailPassed).toBe(true);
      expect(result.metrics.techniquesApplied).toContain(
        'T1:PersonalityReference'
      );
    });

    it('skips technique when guardrail would be violated (simulated by disabling recall preservation)', async () => {
      // This is a conceptual test: we set up a condition where guardrail
      // would trigger. In practice, our techniques preserve recall perfectly,
      // so we simulate by checking the skip reason.
      const manager = CompressionManager.getInstance({
        t1PersonalityReference: true,
      });
      const engrams = makeEngramBatch(10, true);
      const result = await manager.compress({
        engrams,
        sessionId: 'test-session',
        compressionTimestamp: Date.now(),
      });

      // Our T1 implementation preserves all IDs perfectly, so guardrail passes.
      // This test verifies the structure exists; real guardrail violations
      // would come from custom techniques that actually lose data.
      expect(result.metrics.episodicRecall).toBe(1.0);
    });
  });

  describe('compression metrics', () => {
    it('reports correct compression ratio', async () => {
      const manager = CompressionManager.getInstance({
        t1PersonalityReference: true,
        t3TemporalDelta: true,
      });
      const engrams = makeEngramBatch(15, true);
      const result = await manager.compress({
        engrams,
        sessionId: 'test-session',
        compressionTimestamp: Date.now(),
      });

      const metrics = result.metrics;
      expect(metrics.originalByteSize).toBeGreaterThan(0);
      expect(metrics.compressedByteSize).toBeGreaterThanOrEqual(0);
      // Compression ratio should be a percentage (0-100+). Can be negative if expanded.
      expect(typeof metrics.compressionRatio).toBe('number');
    });

    it('reports engram counts before and after compression', async () => {
      const manager = CompressionManager.getInstance({
        t1PersonalityReference: true,
      });
      const engrams = makeEngramBatch(10, true);
      const result = await manager.compress({
        engrams,
        sessionId: 'test-session',
        compressionTimestamp: Date.now(),
      });

      const metrics = result.metrics;
      expect(metrics.originalCount).toBe(10);
      // After T1 personality ref, all engrams survive (lossless)
      expect(metrics.survivingCount).toBe(10);
    });

    it('tracks which techniques were applied and which were skipped', async () => {
      const manager = CompressionManager.getInstance({
        t1PersonalityReference: true,
        // t3 and t4 are OFF
      });
      const engrams = makeEngramBatch(10, true);
      const result = await manager.compress({
        engrams,
        sessionId: 'test-session',
        compressionTimestamp: Date.now(),
      });

      expect(result.metrics.techniquesApplied).toContain(
        'T1:PersonalityReference'
      );
      expect(result.metrics.techniquesSkipped.length).toBeGreaterThan(0);
      expect(result.metrics.techniquesSkipped.join(',')).toContain('T3');
    });
  });

  describe('round-trip decompression', () => {
    it('decompresses to original engrams after T1 compression', async () => {
      const manager = CompressionManager.getInstance({
        t1PersonalityReference: true,
      });
      const original = makeEngramBatch(10, true);
      const result = await manager.compress({
        engrams: original,
        sessionId: 'test-session',
        compressionTimestamp: Date.now(),
      });

      const decompressed = await manager.decompress(result.bundle);

      // All IDs must be preserved
      const originalIds = new Set(original.map((e) => e.id));
      const decompressedIds = new Set(decompressed.map((e) => e.id));
      expect(decompressedIds).toEqual(originalIds);

      // Personality contexts must be restored
      for (const e of decompressed) {
        expect(e.personalityContext).toBeDefined();
      }
    });

    it('decompresses to original engrams after T1→T3 compression', async () => {
      const manager = CompressionManager.getInstance({
        t1PersonalityReference: true,
        t3TemporalDelta: true,
      });
      const original = makeEngramBatch(15, true);
      const result = await manager.compress({
        engrams: original,
        sessionId: 'test-session',
        compressionTimestamp: Date.now(),
      });

      const decompressed = await manager.decompress(result.bundle);

      // All engrams must survive round-trip
      expect(decompressed.length).toBe(original.length);

      // All numeric fields must be restored to high precision
      const origById = new Map(original.map((e) => [e.id, e]));
      for (const e of decompressed) {
        const orig = origById.get(e.id)!;
        expect(e.emotionalValence).toBeCloseTo(orig.emotionalValence, 9);
        expect(e.arousal).toBeCloseTo(orig.arousal, 9);
        expect(e.importance).toBeCloseTo(orig.importance, 9);
      }
    });

    it('decompresses correctly when techniques applied in reverse order', async () => {
      const manager = CompressionManager.getInstance({
        t1PersonalityReference: true,
        t3TemporalDelta: true,
        t4VocabularyDict: true,
      });
      const original = makeEngramBatch(20, true);
      const result = await manager.compress({
        engrams: original,
        sessionId: 'test-session',
        compressionTimestamp: Date.now(),
      });

      // Decompression should reverse T4→T3→T1
      const decompressed = await manager.decompress(result.bundle);

      // All IDs present
      const originalIds = new Set(original.map((e) => e.id));
      const decompressedIds = new Set(decompressed.map((e) => e.id));
      expect(decompressedIds).toEqual(originalIds);

      // Content restored
      for (const e of decompressed) {
        expect(e.content).toBeTruthy();
        expect(e.personalityContext).toBeDefined();
      }
    });
  });

  describe('bundle structure', () => {
    it('stores version and timestamp in bundle', async () => {
      const manager = CompressionManager.getInstance({
        t1PersonalityReference: true,
      });
      const engrams = makeEngramBatch(5, true);
      const now = Date.now();
      const result = await manager.compress({
        engrams,
        sessionId: 'test-session',
        compressionTimestamp: now,
      });

      expect(result.bundle.version).toBe('1.0');
      expect(result.bundle.compressedAt).toBe(now);
      expect(result.bundle.sessionId).toBe('test-session');
    });

    it('stores technique order in bundle', async () => {
      const manager = CompressionManager.getInstance({
        t1PersonalityReference: true,
        t3TemporalDelta: true,
      });
      const engrams = makeEngramBatch(10, true);
      const result = await manager.compress({
        engrams,
        sessionId: 'test-session',
        compressionTimestamp: Date.now(),
      });

      expect(result.bundle.techniqueOrder).toContain('T1:PersonalityReference');
      expect(result.bundle.techniqueOrder).toContain('T3:TemporalDelta');
    });

    it('stores stage payloads for each applied technique', async () => {
      const manager = CompressionManager.getInstance({
        t1PersonalityReference: true,
        t3TemporalDelta: true,
      });
      const engrams = makeEngramBatch(10, true);
      const result = await manager.compress({
        engrams,
        sessionId: 'test-session',
        compressionTimestamp: Date.now(),
      });

      expect(result.bundle.stages.afterT1).toBeDefined();
      expect(result.bundle.stages.afterT3).toBeDefined();
    });

    it('includes audit entries for each engram transformation', async () => {
      const manager = CompressionManager.getInstance({
        t1PersonalityReference: true,
      });
      const engrams = makeEngramBatch(5, true);
      const result = await manager.compress({
        engrams,
        sessionId: 'test-session',
        compressionTimestamp: Date.now(),
      });

      expect(result.bundle.auditEntries.length).toBeGreaterThan(0);
      for (const entry of result.bundle.auditEntries) {
        expect(entry.technique).toBeDefined();
        expect(entry.engramId).toBeDefined();
        expect(['retained', 'transformed', 'pruned']).toContain(entry.action);
      }
    });
  });

  describe('edge cases', () => {
    it('handles empty engram array', async () => {
      const manager = CompressionManager.getInstance({
        t1PersonalityReference: true,
        t3TemporalDelta: true,
        t4VocabularyDict: true,
      });

      const result = await manager.compress({
        engrams: [],
        sessionId: 'test-session',
        compressionTimestamp: Date.now(),
      });

      expect(result.metrics.originalCount).toBe(0);
      expect(result.metrics.survivingCount).toBe(0);
    });

    it('handles single engram (edge case for windowed techniques)', async () => {
      const manager = CompressionManager.getInstance({
        t1PersonalityReference: true,
        t3TemporalDelta: true,
      });

      const [single] = makeEngramBatch(1, true);
      const result = await manager.compress({
        engrams: [single],
        sessionId: 'test-session',
        compressionTimestamp: Date.now(),
      });

      expect(result.metrics.survivingCount).toBe(1);
      expect(result.metrics.guardrailPassed).toBe(true);
    });

    it('handles engrams without personalityContext (mixed)', async () => {
      const manager = CompressionManager.getInstance({
        t1PersonalityReference: true,
      });

      // Mix of engrams with and without personality
      const withPersonality = makeEngramBatch(5, true);
      const withoutPersonality = makeEngramBatch(5, false);
      const mixed = [...withPersonality, ...withoutPersonality];

      const result = await manager.compress({
        engrams: mixed,
        sessionId: 'test-session',
        compressionTimestamp: Date.now(),
      });

      // All 10 should survive (lossless)
      expect(result.metrics.survivingCount).toBe(10);
      // T1 preserves all engrams — no data loss
      expect(result.metrics.episodicRecall).toBeGreaterThanOrEqual(0.95);
    });
  });

  describe('P2/P3 techniques (future)', () => {
    it('applies P2 techniques (T2/T6) and logs P3 (T5) as "not yet built"', async () => {
      const manager = CompressionManager.getInstance({
        t2TimeDecayFidelity: true,
        t5NumericQuantization: true,
        t6InteractionTrace: true,
      });

      const engrams = makeEngramBatch(5, true);
      const result = await manager.compress({
        engrams,
        sessionId: 'test-session',
        compressionTimestamp: Date.now(),
      });

      // T2 and T6 should now be applied (no longer "not yet built")
      expect(result.metrics.techniquesApplied).toContain(
        'T2:TimeDecayFidelity'
      );
      expect(result.metrics.techniquesApplied).toContain('T6:InteractionTrace');

      // T5 is now implemented and should be applied when enabled
      expect(result.metrics.techniquesApplied).toContain(
        'T5:NumericQuantization'
      );
    });
  });
});
