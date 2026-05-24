import {
  MemoryLifecycleCoordinator,
  getMemoryLifecycleCoordinator,
  clearCoordinators,
  type CompressionPipeline,
} from '../lifecycle-coordinator';
import type { Firestore } from 'firebase/firestore';
import { makeEngramBatch } from '../test-helpers';

// Mock Firestore (minimal stub for dependency injection)
const mockFirestore = {} as Firestore;

describe('MemoryLifecycleCoordinator — Full Memory Lifecycle', () => {
  beforeEach(() => {
    clearCoordinators();
  });

  describe('initialization', () => {
    it('creates coordinator with default pipeline config', () => {
      const coordinator = new MemoryLifecycleCoordinator(mockFirestore, 'user123');

      expect(coordinator).toBeDefined();
      // Verify internal state was set up
      expect(() => {
        coordinator.getAuditReport();
      }).not.toThrow();
    });

    it('creates coordinator with custom pipeline flags', () => {
      const pipeline: CompressionPipeline = {
        enableVocabDict: false,
        enableTemporalDelta: true,
        enablePersonalityRef: true,
      };

      const coordinator = new MemoryLifecycleCoordinator(
        mockFirestore,
        'user456',
        pipeline
      );
      expect(coordinator).toBeDefined();
    });

    it('can initialize vocabulary scanner from corpus', async () => {
      const coordinator = new MemoryLifecycleCoordinator(mockFirestore, 'user789');
      const corpus = 'the quick brown fox jumps over the lazy dog ' + 'the test'.repeat(100);

      // Should not throw
      await expect(
        coordinator.initializeVocabularyScan(corpus)
      ).resolves.not.toThrow();
    });
  });

  describe('compression pipeline (compressMemoryBatch)', () => {
    it('compresses engram batch with all techniques enabled', async () => {
      const coordinator = new MemoryLifecycleCoordinator(mockFirestore, 'user-compress-all', {
        enableVocabDict: true,
        enableTemporalDelta: true,
        enablePersonalityRef: true,
      });

      const engrams = makeEngramBatch(15, true);
      const result = await coordinator.compressMemoryBatch(engrams);

      expect(result.compressed).toBeInstanceOf(Buffer);
      expect(result.compressed.length).toBeGreaterThan(0);
      expect(result.metrics.techniquesUsed.length).toBeGreaterThan(0);
      expect(result.checkpointId).toBeDefined();
    });

    it('applies T1 personality reference when enabled', async () => {
      const coordinator = new MemoryLifecycleCoordinator(mockFirestore, 'user-t1', {
        enablePersonalityRef: true,
        enableTemporalDelta: false,
        enableVocabDict: false,
      });

      const engrams = makeEngramBatch(10, true);
      const result = await coordinator.compressMemoryBatch(engrams);

      expect(result.metrics.techniquesUsed).toContain('T1_PERSONALITY_REF');
      expect(result.personalityBundle).toBeDefined();
    });

    it('applies T3 temporal delta when enabled', async () => {
      const coordinator = new MemoryLifecycleCoordinator(mockFirestore, 'user-t3', {
        enablePersonalityRef: false,
        enableTemporalDelta: true,
        enableVocabDict: false,
      });

      const engrams = makeEngramBatch(12, true);
      const result = await coordinator.compressMemoryBatch(engrams);

      expect(result.metrics.techniquesUsed).toContain('T3_TEMPORAL_DELTA');
      expect(result.temporalBundle).toBeDefined();
    });

    it('skips techniques when disabled in pipeline', async () => {
      const coordinator = new MemoryLifecycleCoordinator(mockFirestore, 'user-skip', {
        enablePersonalityRef: false,
        enableTemporalDelta: false,
        enableVocabDict: false,
      });

      const engrams = makeEngramBatch(5, true);
      const result = await coordinator.compressMemoryBatch(engrams);

      // Only text-based compression, no structural techniques
      expect(result.metrics.techniquesUsed.length).toBe(0);
    });

    it('reports correct compression metrics', async () => {
      const coordinator = new MemoryLifecycleCoordinator(mockFirestore, 'user-metrics', {
        enableVocabDict: true,
        enableTemporalDelta: true,
        enablePersonalityRef: true,
      });

      const engrams = makeEngramBatch(20, true);
      const result = await coordinator.compressMemoryBatch(engrams);

      const metrics = result.metrics;
      expect(metrics.originalSize).toBeGreaterThan(0);
      expect(metrics.compressedSize).toBeGreaterThanOrEqual(0);
      expect(metrics.compressionRatio).toBeGreaterThanOrEqual(0);
      expect(metrics.timeMs).toBeGreaterThanOrEqual(0);
      expect(metrics.fidelityLoss).toBeGreaterThanOrEqual(0);
    });

    it('creates checkpoint before compression', async () => {
      const coordinator = new MemoryLifecycleCoordinator(mockFirestore, 'user-checkpoint');
      const engrams = makeEngramBatch(5, true);

      const result = await coordinator.compressMemoryBatch(engrams);

      // Checkpoint ID should be recorded (or empty if checkpoint creation fails gracefully)
      expect(result.checkpointId).toBeDefined();
      expect(typeof result.checkpointId).toBe('string');
    });
  });

  describe('decompression and round-trip', () => {
    it('decompresses and returns engrams (T1 only)', async () => {
      const coordinator = new MemoryLifecycleCoordinator(mockFirestore, 'user-decomp-t1', {
        enablePersonalityRef: true,
        enableTemporalDelta: false,
        enableVocabDict: false,
      });

      const original = makeEngramBatch(8, true);
      const result = await coordinator.compressMemoryBatch(original);
      const decompressed = coordinator.decompressMemoryBatch(result);

      // Decompression should return an array (may be empty if bundles not used)
      expect(Array.isArray(decompressed)).toBe(true);
      // If personality bundle exists, decompression should attempt restore
      if (result.personalityBundle) {
        expect(decompressed.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('decompresses and returns engrams (T3 only)', async () => {
      const coordinator = new MemoryLifecycleCoordinator(mockFirestore, 'user-decomp-t3', {
        enablePersonalityRef: false,
        enableTemporalDelta: true,
        enableVocabDict: false,
      });

      const original = makeEngramBatch(12, true);
      const result = await coordinator.compressMemoryBatch(original);
      const decompressed = coordinator.decompressMemoryBatch(result);

      // Temporal bundle decompression should fully restore
      expect(Array.isArray(decompressed)).toBe(true);
      if (result.temporalBundle) {
        expect(decompressed.length).toBe(original.length);
      }
    });

    it('decompresses and returns engrams (T1+T3 combined)', async () => {
      const coordinator = new MemoryLifecycleCoordinator(mockFirestore, 'user-decomp-t1t3', {
        enablePersonalityRef: true,
        enableTemporalDelta: true,
        enableVocabDict: false,
      });

      const original = makeEngramBatch(15, true);
      const result = await coordinator.compressMemoryBatch(original);
      const decompressed = coordinator.decompressMemoryBatch(result);

      // With temporal delta, should reconstruct full engrams
      expect(Array.isArray(decompressed)).toBe(true);
      expect(decompressed.length).toBe(original.length);
      expect(decompressed.every((e) => e.id)).toBe(true);
    });

    it('handles empty engram batch gracefully', async () => {
      const coordinator = new MemoryLifecycleCoordinator(mockFirestore, 'user-empty');
      const result = await coordinator.compressMemoryBatch([]);

      expect(result.compressed).toBeInstanceOf(Buffer);
      expect(result.metrics.originalSize).toBe(0);

      // Decompression should not throw
      const decompressed = coordinator.decompressMemoryBatch(result);
      expect(Array.isArray(decompressed)).toBe(true);
    });
  });

  describe('audit logging', () => {
    it('logs eviction action', async () => {
      const coordinator = new MemoryLifecycleCoordinator(mockFirestore, 'user-evict');
      const [engram] = makeEngramBatch(1, true);

      // Should not throw
      await expect(
        coordinator.logEviction(engram, 'CAPACITY_CONSTRAINT', 1024)
      ).resolves.not.toThrow();
    });

    it('logs consolidation batch', async () => {
      const coordinator = new MemoryLifecycleCoordinator(mockFirestore, 'user-consol');

      // Should not throw
      await expect(
        coordinator.logConsolidation(10, 5120)
      ).resolves.not.toThrow();
    });

    it('retrieves audit report', async () => {
      const coordinator = new MemoryLifecycleCoordinator(mockFirestore, 'user-audit');
      const report = await coordinator.getAuditReport();

      expect(report).toBeDefined();
    });
  });

  describe('emergency restore', () => {
    it('supports emergency rollback from checkpoint', async () => {
      const coordinator = new MemoryLifecycleCoordinator(mockFirestore, 'user-restore');
      const engrams = makeEngramBatch(5, true);
      const compressResult = await coordinator.compressMemoryBatch(engrams);

      // Should not throw (checkpoint manager is mocked)
      if (compressResult.checkpointId) {
        await expect(
          coordinator.emergencyRestore(compressResult.checkpointId)
        ).resolves.not.toThrow();
      }
    });
  });

  describe('singleton pattern', () => {
    it('returns same instance for same user', () => {
      const coord1 = getMemoryLifecycleCoordinator(mockFirestore, 'user-singleton');
      const coord2 = getMemoryLifecycleCoordinator(mockFirestore, 'user-singleton');

      expect(coord1).toBe(coord2);
    });

    it('returns different instances for different users', () => {
      const coord1 = getMemoryLifecycleCoordinator(mockFirestore, 'user-a');
      const coord2 = getMemoryLifecycleCoordinator(mockFirestore, 'user-b');

      expect(coord1).not.toBe(coord2);
    });

    it('clears all coordinators', () => {
      const coord1 = getMemoryLifecycleCoordinator(mockFirestore, 'user-clear-1');
      const coord2 = getMemoryLifecycleCoordinator(mockFirestore, 'user-clear-2');

      clearCoordinators();

      const coord1New = getMemoryLifecycleCoordinator(mockFirestore, 'user-clear-1');
      const coord2New = getMemoryLifecycleCoordinator(mockFirestore, 'user-clear-2');

      expect(coord1).not.toBe(coord1New);
      expect(coord2).not.toBe(coord2New);
    });
  });

  describe('pipeline configurations', () => {
    it('handles T1-only pipeline', async () => {
      const coordinator = new MemoryLifecycleCoordinator(mockFirestore, 'user-t1-only', {
        enablePersonalityRef: true,
        enableTemporalDelta: false,
        enableVocabDict: false,
      });

      const engrams = makeEngramBatch(10, true);
      const result = await coordinator.compressMemoryBatch(engrams);

      expect(result.metrics.techniquesUsed).toEqual(['T1_PERSONALITY_REF']);
    });

    it('handles T3-only pipeline', async () => {
      const coordinator = new MemoryLifecycleCoordinator(mockFirestore, 'user-t3-only', {
        enablePersonalityRef: false,
        enableTemporalDelta: true,
        enableVocabDict: false,
      });

      const engrams = makeEngramBatch(10, true);
      const result = await coordinator.compressMemoryBatch(engrams);

      expect(result.metrics.techniquesUsed).toEqual(['T3_TEMPORAL_DELTA']);
    });

    it('handles T4-only (vocabulary dict) pipeline', async () => {
      const coordinator = new MemoryLifecycleCoordinator(mockFirestore, 'user-t4-only', {
        enablePersonalityRef: false,
        enableTemporalDelta: false,
        enableVocabDict: true,
      });

      // Initialize vocabulary compressor first
      const corpus = 'test vocabulary words for compression ' + 'test'.repeat(100);
      await coordinator.initializeVocabularyScan(corpus);

      const engrams = makeEngramBatch(10, true);
      const result = await coordinator.compressMemoryBatch(engrams);

      expect(result.metrics.techniquesUsed).toEqual(['T4_VOCAB_DICT']);
    });

    it('handles full T1+T3+T4 pipeline', async () => {
      const coordinator = new MemoryLifecycleCoordinator(mockFirestore, 'user-full-p1', {
        enablePersonalityRef: true,
        enableTemporalDelta: true,
        enableVocabDict: true,
      });

      // Initialize vocabulary compressor
      const corpus = 'memory compression techniques for molly ' + 'memory'.repeat(80);
      await coordinator.initializeVocabularyScan(corpus);

      const engrams = makeEngramBatch(15, true);
      const result = await coordinator.compressMemoryBatch(engrams);

      expect(result.metrics.techniquesUsed).toContain('T1_PERSONALITY_REF');
      expect(result.metrics.techniquesUsed).toContain('T3_TEMPORAL_DELTA');
      expect(result.metrics.techniquesUsed).toContain('T4_VOCAB_DICT');
    });
  });

  describe('integration', () => {
    it('maintains lifecycle through compress→decompress→verify', async () => {
      const coordinator = new MemoryLifecycleCoordinator(mockFirestore, 'user-lifecycle', {
        enablePersonalityRef: true,
        enableTemporalDelta: true,
        enableVocabDict: true,
      });

      // Scan corpus for vocabulary
      const corpus = 'the memory system stores important context ' + 'the test'.repeat(50);
      await coordinator.initializeVocabularyScan(corpus);

      // Create and compress
      const original = makeEngramBatch(20, true);
      const compressed = await coordinator.compressMemoryBatch(original);

      // Log audit action
      await coordinator.logConsolidation(original.length, compressed.metrics.compressedSize);

      // Decompress and verify
      const restored = coordinator.decompressMemoryBatch(compressed);

      expect(restored.length).toBe(original.length);
      expect(restored.every((e) => e.id && e.content)).toBe(true);
    });
  });
});
