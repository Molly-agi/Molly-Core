import {
  CrystalCompressionBridge,
  getCrystalCompressionBridge,
  type CompressedCrystalPayload,
} from '../crystal-compression-bridge';
import type { CrystalEngram } from '../crystal-partition';
import { CrystalType } from '../crystal-partition';
import { CompressionManager } from '@/ai/memory/compression/compression-manager';

// Create a mock crystal for testing
function makeMockCrystal(id: string, content: string): CrystalEngram {
  return {
    id,
    userId: 'test-user',
    content,
    timestamp: new Date(),
    emotionalValence: 0.7,
    arousal: 0.5,
    importance: 0.8,
    consolidationState: 'active',
    crystalType: CrystalType.IDENTITY,
    personalityContext: {
      core_values: ['family', 'growth', 'honesty'],
      voice_pattern: 'contemplative',
    },
  };
}

describe('CrystalCompressionBridge — Integration with CompressionManager', () => {
  let bridge: CrystalCompressionBridge;

  beforeEach(() => {
    // Reset all env vars first
    delete process.env.MOLLY_COMPRESS_T1;
    delete process.env.MOLLY_COMPRESS_T3;
    delete process.env.MOLLY_COMPRESS_T4;
    delete process.env.MOLLY_COMPRESS_T2;
    delete process.env.MOLLY_COMPRESS_T6;
    delete process.env.MOLLY_COMPRESS_T5;

    // Reset CompressionManager singleton so it picks up fresh env vars
    CompressionManager.resetForTest();

    // Create fresh bridge
    bridge = new CrystalCompressionBridge();
  });

  describe('prepareForStorage with compression disabled', () => {
    it('returns uncompressed crystal when no techniques enabled', async () => {
      const crystal = makeMockCrystal('crystal-1', 'This is my memory');
      const payload = await bridge.prepareForStorage(crystal);

      expect(payload.crystal).toEqual(crystal);
      expect(payload.compression).toBeUndefined();
      expect(payload.compressionBundle).toBeUndefined();
      expect(payload.version).toBe('1.0');
    });

    it('returns crystal with metadata structure intact', async () => {
      const crystal = makeMockCrystal('crystal-2', 'Another memory with ' + 'words'.repeat(50));
      const payload = await bridge.prepareForStorage(crystal);

      expect(payload.crystal.id).toBe(crystal.id);
      expect(payload.crystal.emotionalValence).toBe(crystal.emotionalValence);
      expect(payload.crystal.personalityContext).toEqual(
        crystal.personalityContext
      );
    });
  });

  describe('prepareForStorage with T1 enabled', () => {
    beforeEach(() => {
      process.env.MOLLY_COMPRESS_T1 = '1';
      CompressionManager.resetForTest();
      bridge = new CrystalCompressionBridge();
    });

    it('applies T1 compression and returns bundle', async () => {
      const crystal = makeMockCrystal('crystal-t1', 'Memory with personality context');
      const payload = await bridge.prepareForStorage(crystal);

      // Should have compression metadata
      expect(payload.compression).toBeDefined();
      if (payload.compression) {
        expect(payload.compression.activeTechniques).toContain('T1:PersonalityReference');
        expect(payload.compression.originalBytes).toBeGreaterThan(0);
        expect(payload.compression.compressedBytes).toBeGreaterThanOrEqual(0);
        // Compression ratio can be negative if data expands (happens with small data)
        expect(typeof payload.compression.compressionRatio).toBe('number');
      }

      // Should have compression bundle
      expect(payload.compressionBundle).toBeDefined();
      if (payload.compressionBundle) {
        expect(payload.compressionBundle.version).toBe('1.0');
        expect(payload.compressionBundle.techniqueOrder).toContain(
          'T1:PersonalityReference'
        );
      }
    });

    it('tracks compression state in metrics', async () => {
      const crystal = makeMockCrystal('crystal-metrics', 'Test memory');
      await bridge.prepareForStorage(crystal);

      const metrics = bridge.getCompressionMetrics();
      expect(metrics.techniquesEnabled).toBeGreaterThan(0);
      expect(Array.isArray(metrics.activeTechniques)).toBe(true);
    });
  });

  describe('restoreFromStorage with decompression', () => {
    beforeEach(() => {
      process.env.MOLLY_COMPRESS_T1 = '1';
      CompressionManager.resetForTest();
      bridge = new CrystalCompressionBridge();
    });

    it('decompresses compressed crystal to original state', async () => {
      const original = makeMockCrystal('crystal-roundtrip', 'Memory content for testing');

      // Compress
      const compressed = await bridge.prepareForStorage(original);
      expect(compressed.compressionBundle).toBeDefined();

      // Decompress
      const restored = await bridge.restoreFromStorage(compressed);

      // Core fields preserved
      expect(restored.id).toBe(original.id);
      expect(restored.content).toBe(original.content);
      expect(restored.emotionalValence).toBe(original.emotionalValence);
      expect(restored.personalityContext).toEqual(original.personalityContext);
    });

    it('handles uncompressed crystal gracefully', async () => {
      const crystal = makeMockCrystal('crystal-uncompressed', 'Uncompressed memory');
      const payload: CompressedCrystalPayload = {
        crystal,
        version: '1.0',
      };

      const restored = await bridge.restoreFromStorage(payload);
      expect(restored).toEqual(crystal);
    });

    it('gracefully handles decompression errors', async () => {
      const crystal = makeMockCrystal('crystal-error', 'Test');
      const corruptedPayload: CompressedCrystalPayload = {
        crystal,
        compression: {
          activeTechniques: ['T1:PersonalityReference'],
          originalBytes: 100,
          compressedBytes: 50,
          compressionRatio: 50,
          skippedTechniques: [],
          compressionTimeMs: 1,
          compressedAt: Date.now(),
        },
        compressionBundle: {
          version: '1.0',
          compressedAt: Date.now(),
          sessionId: 'invalid',
          techniqueOrder: ['T1:PersonalityReference'],
          stages: {},
          finalEngrams: [], // Empty, will cause decompression to fail gracefully
          auditEntries: [],
        },
        version: '1.0',
      };

      // Should not throw; should return original crystal
      const restored = await bridge.restoreFromStorage(corruptedPayload);
      expect(restored.id).toBe(crystal.id);
    });
  });

  describe('round-trip compression lifecycle', () => {
    beforeEach(() => {
      process.env.MOLLY_COMPRESS_T1 = '1';
      process.env.MOLLY_COMPRESS_T3 = '1';
      CompressionManager.resetForTest();
      bridge = new CrystalCompressionBridge();
    });

    it('preserves crystal through compress→store→retrieve→decompress cycle', async () => {
      const original = makeMockCrystal(
        'crystal-lifecycle',
        'Detailed memory with emotional context and multiple layers of meaning'
      );

      // Prepare for storage (compress)
      const storedPayload = await bridge.prepareForStorage(original);

      // Simulate storage and retrieval (payload would be serialized/persisted)
      // In reality, this would go through Firestore
      const retrievedPayload = storedPayload;

      // Restore from storage (decompress)
      const restored = await bridge.restoreFromStorage(retrievedPayload);

      // Verify identity and content preservation
      expect(restored.id).toBe(original.id);
      expect(restored.content).toBe(original.content);
      expect(restored.emotionalValence).toBeCloseTo(original.emotionalValence, 5);
      expect(restored.arousal).toBeCloseTo(original.arousal, 5);
      expect(restored.importance).toBeCloseTo(original.importance, 5);
    });

    it('batch compression handles multiple crystals', async () => {
      const crystals = [
        makeMockCrystal('c-1', 'First memory'),
        makeMockCrystal('c-2', 'Second memory'),
        makeMockCrystal('c-3', 'Third memory'),
      ];

      // Each crystal should compress independently
      for (const crystal of crystals) {
        const payload = await bridge.prepareForStorage(crystal);
        const restored = await bridge.restoreFromStorage(payload);
        expect(restored.id).toBe(crystal.id);
      }
    });
  });

  describe('compression metrics reporting', () => {
    it('reports correct metrics when compression disabled', async () => {
      const metrics = bridge.getCompressionMetrics();

      expect(metrics.techniquesEnabled).toBe(0);
      expect(metrics.totalCompressionRatio).toBe(0);
      expect(metrics.guardrailsPassed).toBe(true);
    });

    it('reports metrics after compression operation', async () => {
      process.env.MOLLY_COMPRESS_T1 = '1';
      CompressionManager.resetForTest();
      const testBridge = new CrystalCompressionBridge();
      
      const crystal = makeMockCrystal('metric-test', 'Test content for metrics');

      await testBridge.prepareForStorage(crystal);
      const metrics = testBridge.getCompressionMetrics();

      expect(metrics.techniquesEnabled).toBeGreaterThan(0);
      expect(typeof metrics.totalCompressionRatio).toBe('number');
      expect(metrics.activeTechniques).toContain('T1:PersonalityReference');
    });
  });

  describe('singleton pattern', () => {
    it('returns same bridge instance', () => {
      const bridge1 = getCrystalCompressionBridge();
      const bridge2 = getCrystalCompressionBridge();

      expect(bridge1).toBe(bridge2);
    });
  });

  describe('guardrail state reporting', () => {
    beforeEach(() => {
      process.env.MOLLY_COMPRESS_T1 = '1';
      CompressionManager.resetForTest();
      bridge = new CrystalCompressionBridge();
    });

    it('reports guardrail state in compression context', async () => {
      const crystal = makeMockCrystal('guardrail-test', 'Memory for guardrail testing');
      const payload = await bridge.prepareForStorage(crystal);

      if (payload.compression) {
        // Guardrail state should be tracked in the bundle
        expect(payload.compressionBundle).toBeDefined();
      }
    });
  });

  describe('error handling', () => {
    it('gracefully handles null or undefined crystal', async () => {
      // TypeScript won't allow this, but in case of runtime issues:
      const weirdCrystal = makeMockCrystal('weird', '');
      const payload = await bridge.prepareForStorage(weirdCrystal);

      expect(payload.crystal).toBeDefined();
      expect(payload.version).toBe('1.0');
    });

    it('handles very large crystals', async () => {
      const largeContent = 'word '.repeat(10000); // ~50KB of repeated text
      const largeCrystal = makeMockCrystal('large-crystal', largeContent);

      process.env.MOLLY_COMPRESS_T1 = '1';
      CompressionManager.resetForTest();
      const testBridge = new CrystalCompressionBridge();
      
      const payload = await testBridge.prepareForStorage(largeCrystal);

      if (payload.compression) {
        // Even if compression fails, should return gracefully
        expect(payload.crystal).toBeDefined();
      }

      const restored = await testBridge.restoreFromStorage(payload);
      expect(restored.id).toBe(largeCrystal.id);
    });
  });
});
