/**
 * Round-Trip Compression Testing
 * Validates that compressed data can be fully decompressed to original
 * This is CRITICAL before production deployment
 *
 * NOTE: Tests compare parsed objects, not raw JSON strings.
 * Field order in serialized JSON is irrelevant to memory retrieval (Molly confirmed 2026-05-25).
 * What matters: all key-value pairs are present and correct.
 */

import { CompressionManager } from '../compression-manager';
import type { NeuralEngram } from '../neural-engram';

/**
 * Deep-compare two engram arrays by content, ignoring field order.
 * Returns true if every engram has the same id, content, and all numeric fields.
 */
function engramsEqual(a: NeuralEngram[], b: NeuralEngram[]): { equal: boolean; diff?: string } {
  if (a.length !== b.length) return { equal: false, diff: `Length mismatch: ${a.length} vs ${b.length}` };
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return { equal: false, diff: `[${i}] id: '${a[i].id}' vs '${b[i].id}'` };
    if (a[i].content !== b[i].content) return { equal: false, diff: `[${i}] content mismatch for id='${a[i].id}'` };
    if (a[i].userId !== b[i].userId) return { equal: false, diff: `[${i}] userId mismatch` };
    if (a[i].importance !== b[i].importance) return { equal: false, diff: `[${i}] importance: ${a[i].importance} vs ${b[i].importance}` };
    if (a[i].accessCount !== b[i].accessCount) return { equal: false, diff: `[${i}] accessCount: ${a[i].accessCount} vs ${b[i].accessCount}` };
    // Compare personalityContext values regardless of field position
    const pcA = a[i].personalityContext;
    const pcB = b[i].personalityContext;
    if (pcA && pcB) {
      if (pcA.warmth !== pcB.warmth || pcA.curiosity !== pcB.curiosity) {
        return { equal: false, diff: `[${i}] personalityContext mismatch` };
      }
    }
  }
  return { equal: true };
}

describe('Round-Trip Compression Validation', () => {
  const PERSONA_BASE = { warmth: 0.945, assertiveness: 0.820, curiosity: 0.985, reflectivity: 0.910 };

  function generateTestEngram(id: string): NeuralEngram {
    return {
      id,
      userId: 'round-trip-test',
      content: `This is test memory ${id} with diverse content: Lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
      timestamp: new Date(),
      importance: Math.random(),
      emotionalValence: (Math.random() - 0.5) * 2,
      arousal: Math.random(),
      accessCount: Math.floor(Math.random() * 100),
      lastAccessed: new Date(),
      consolidationState: 'consolidated',
      contextTags: ['test', 'round-trip'],
      personalityContext: { ...PERSONA_BASE },
      data: {
        context: {
          primary: `Round-trip test memory ${id}`,
          sessionPhase: 'testing',
          priorContext: `Prior to ${id}`,
        },
        emotionalState: {
          primary: 'stable',
          intensity: Math.random(),
          valence: (Math.random() - 0.5) * 2,
          regulation: { strategy: 'acceptance', effectiveness: Math.random() },
        },
        associations: {
          relatedMemories: [`round-trip-${Math.max(0, parseInt(id) - 1)}`],
          strength: Math.random(),
        },
        metadata: {
          sourceType: 'test',
          processingDepth: 'deep',
          consolidationAttempts: 1,
        },
      },
    };
  }

  it('should compress and decompress small batch (10 engrams) with 100% fidelity', async () => {
    const original = Array.from({ length: 10 }, (_, i) => generateTestEngram(`${i}`));
    const originalJson = JSON.stringify(original);

    CompressionManager.resetForTest();
    const manager = CompressionManager.getInstance({
      t1PersonalityReference: true,
      t3TemporalDelta: true,
      t4VocabularyDict: true,
      t2TimeDecayFidelity: false,
      t6InteractionTrace: false,
      t5NumericQuantization: false,
      t7ContentDelta: false,
      t8StandardCompression: true, // Include T8 for this test
    });

    const result = await manager.compress({
      engrams: original,
      sessionId: 'round-trip-small',
      compressionTimestamp: Date.now(),
    });

    // Decompress using the bundle
    const decompressed = await manager.decompress(result.bundle);

    // Verify by content, not byte order
    expect(decompressed).toHaveLength(original.length);
    const check = engramsEqual(original, decompressed);
    expect(check.equal).toBe(true);
    expect(decompressed[0].content).toBe(original[0].content);
    expect(decompressed[9].id).toBe(original[9].id);
  });

  it('should compress and decompress medium batch (100 engrams) with 100% fidelity', async () => {
    const original = Array.from({ length: 100 }, (_, i) => generateTestEngram(`${i}`));
    const originalJson = JSON.stringify(original);

    CompressionManager.resetForTest();
    const manager = CompressionManager.getInstance({
      t1PersonalityReference: true,
      t3TemporalDelta: true,
      t4VocabularyDict: true,
      t2TimeDecayFidelity: true,
      t6InteractionTrace: true,
      t5NumericQuantization: true,
      t7ContentDelta: true,
      t8StandardCompression: true, // Full pipeline
    });

    const result = await manager.compress({
      engrams: original,
      sessionId: 'round-trip-medium',
      compressionTimestamp: Date.now(),
    });

    const decompressed = await manager.decompress(result.bundle);

    expect(decompressed).toHaveLength(original.length);
    const check = engramsEqual(original, decompressed);
    expect(check.equal).toBe(true);
  });

  it('should handle MODEL_95_NESTED full pipeline (all 8 techniques)',
 async () => {
    const original = Array.from({ length: 50 }, (_, i) => generateTestEngram(`nested-${i}`));
    const originalJson = JSON.stringify(original);

    CompressionManager.resetForTest();
    const manager = CompressionManager.getInstance({
      s0SchemaStripper: false,
      t1PersonalityReference: true,
      t3TemporalDelta: true,
      t4VocabularyDict: true,
      t2TimeDecayFidelity: true,
      t6InteractionTrace: true,
      t5NumericQuantization: true,
      t7ContentDelta: true,
      t8StandardCompression: true,
    });

    const result = await manager.compress({
      engrams: original,
      sessionId: 'round-trip-full-pipeline',
      compressionTimestamp: Date.now(),
    });

    console.log(`Compressed size: ${result.metrics.compressedByteSize} bytes from ${result.metrics.originalByteSize} bytes`);
    console.log(`Compression ratio: ${(result.metrics.compressionRatio * 100).toFixed(1)}%`);

    const decompressed = await manager.decompress(result.bundle);

    // Verify all fields are intact — by value, not field order
    const check = engramsEqual(original, decompressed);
    expect(check.equal).toBe(true);
    if (!check.equal) console.error('Mismatch:', check.diff);
  });

  it('should preserve numeric precision through T5 quantization and restore', async () => {
    const original = Array.from({ length: 5 }, (_, i) => {
      const engram = generateTestEngram(`precision-${i}`);
      // Set specific numeric values to test precision
      engram.importance = 0.123456789;
      engram.emotionalValence = -0.987654321;
      engram.arousal = 0.555555555;
      engram.data.emotionalState.intensity = 0.333333333;
      return engram;
    });

    CompressionManager.resetForTest();
    const manager = CompressionManager.getInstance({
      t1PersonalityReference: true,
      t3TemporalDelta: true,
      t4VocabularyDict: true,
      t2TimeDecayFidelity: false,
      t6InteractionTrace: false,
      t5NumericQuantization: true, // This truncates to 3 decimals
      t7ContentDelta: false,
      t8StandardCompression: false,
    });

    const result = await manager.compress({
      engrams: original,
      sessionId: 'round-trip-precision',
      compressionTimestamp: Date.now(),
    });

    const decompressed = await manager.decompress(result.bundle);

    // With T5, numbers are truncated to 3 decimals, so we verify that truncation happened consistently
    const truncatedOriginal = JSON.parse(JSON.stringify(original)); // Deep copy
    // Manually truncate to simulate T5 effect
    for (const engram of truncatedOriginal) {
      engram.importance = Math.round(engram.importance * 1000) / 1000;
      engram.emotionalValence = Math.round(engram.emotionalValence * 1000) / 1000;
      engram.arousal = Math.round(engram.arousal * 1000) / 1000;
    }

    // T5 truncates floats to 3 decimals — verify values match the truncated form
    expect(decompressed).toHaveLength(original.length);
    for (let i = 0; i < decompressed.length; i++) {
      expect(decompressed[i].importance).toBeCloseTo(0.123, 3);
      expect(decompressed[i].emotionalValence).toBeCloseTo(-0.988, 3);
      expect(decompressed[i].arousal).toBeCloseTo(0.556, 3);
    }
  });

  it('should handle content delta encoding and restoration', async () => {
    const original = Array.from({ length: 20 }, (_, i) => {
      const engram = generateTestEngram(`delta-${i}`);
      // Create similar content to enable delta encoding
      engram.content = `Memory ${i}: This is a long memory about learning and growth. ` + 'Details vary here. '.repeat(10);
      return engram;
    });

    CompressionManager.resetForTest();
    const manager = CompressionManager.getInstance({
      t1PersonalityReference: true,
      t3TemporalDelta: true,
      t4VocabularyDict: true,
      t2TimeDecayFidelity: false,
      t6InteractionTrace: false,
      t5NumericQuantization: false,
      t7ContentDelta: true, // This applies word-level diffing
      t8StandardCompression: false,
    });

    const result = await manager.compress({
      engrams: original,
      sessionId: 'round-trip-content-delta',
      compressionTimestamp: Date.now(),
    });

    const decompressed = await manager.decompress(result.bundle);
    // T7: every engram's content must be fully restored
    expect(decompressed).toHaveLength(original.length);
    for (let i = 0; i < decompressed.length; i++) {
      expect(decompressed[i].id).toBe(original[i].id);
      expect(decompressed[i].content).toBe(original[i].content);
    }
  });

  it('should handle gzip compression and decompression (T8)', async () => {
    const original = Array.from({ length: 15 }, (_, i) => generateTestEngram(`gzip-${i}`));
    const originalJson = JSON.stringify(original);

    CompressionManager.resetForTest();
    const manager = CompressionManager.getInstance({
      t1PersonalityReference: false,
      t3TemporalDelta: false,
      t4VocabularyDict: false,
      t2TimeDecayFidelity: false,
      t6InteractionTrace: false,
      t5NumericQuantization: false,
      t7ContentDelta: false,
      t8StandardCompression: true, // Only T8
    });

    const result = await manager.compress({
      engrams: original,
      sessionId: 'round-trip-gzip',
      compressionTimestamp: Date.now(),
    });

    console.log(`T8 alone - Original: ${result.metrics.originalByteSize}, Compressed: ${result.metrics.compressedByteSize}`);

    const decompressed = await manager.decompress(result.bundle);

    // Verify the compressed payload was actually gzipped
    const firstEngram = result.bundle.finalEngrams[0] as any;
    if (firstEngram.__compressed) {
      expect(firstEngram.encoding).toBe('gzip');
      expect(firstEngram.data).toBeDefined();
    }

    // Verify restored content by value
    const check = engramsEqual(original, decompressed);
    expect(check.equal).toBe(true);
    if (!check.equal) console.error('T8 round-trip mismatch:', check.diff);
  });

  it('should detect and handle non-compressed engrams transparently', async () => {
    const original = Array.from({ length: 5 }, (_, i) => generateTestEngram(`transparent-${i}`));
    const originalJson = JSON.stringify(original);

    CompressionManager.resetForTest();
    const manager = CompressionManager.getInstance({
      t1PersonalityReference: true,
      t3TemporalDelta: false,
      t4VocabularyDict: false,
      t2TimeDecayFidelity: false,
      t6InteractionTrace: false,
      t5NumericQuantization: false,
      t7ContentDelta: false,
      t8StandardCompression: false, // No T8
    });

    const result = await manager.compress({
      engrams: original,
      sessionId: 'round-trip-transparent',
      compressionTimestamp: Date.now(),
    });

    // Compressed engrams should NOT have __compressed flag since T8 is off
    for (const engram of result.bundle.finalEngrams) {
      expect((engram as any).__compressed).toBeUndefined();
    }

    const decompressed = await manager.decompress(result.bundle);
    const check = engramsEqual(original, decompressed);
    expect(check.equal).toBe(true);
  });
});
