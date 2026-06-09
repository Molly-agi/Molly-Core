import { CompressionManager } from '../../compression/compression-manager';
import { makePersonality } from '../../compression/test-helpers';

test('debug: actual metrics values from compression pipeline', async () => {
  CompressionManager.resetForTest();
  const manager = CompressionManager.getInstance({
    t1PersonalityReference: true,
    t3TemporalDelta: true,
    t4VocabularyDict: true,
    t2TimeDecayFidelity: false,
    t6InteractionTrace: false,
    t5NumericQuantization: false,
  });

  const engrams = Array.from({ length: 20 }, (_, i) => ({
    id: `e_${i}`,
    userId: 'test',
    content: `Memory ${i}: detailed content about experiences and patterns that repeats personality context.`,
    timestamp: new Date(),
    importance: 0.5,
    emotionalValence: 0.1,
    arousal: 0.3,
    accessCount: i * 2,
    lastAccessed: new Date(),
    consolidationState: 'consolidated' as const,
    contextTags: ['test'],
    relatedEngrams: [],
    personalityContext: makePersonality({ warmth: 0.8, assertiveness: 0.5, curiosity: 0.9 }),
    data: { key: 'value' },
  }));

  const originalSize = JSON.stringify(engrams).length;
  const result = await manager.compress({ engrams, sessionId: 'debug', compressionTimestamp: Date.now() });
  const m = result.metrics;

  console.log('=== REAL METRICS ===');
  console.log('originalSize (engrams JSON):', originalSize);
  console.log('metrics.originalByteSize:', m.originalByteSize);
  console.log('metrics.compressedByteSize:', m.compressedByteSize);
  console.log('metrics.compressionRatio (% reduction):', m.compressionRatio);
  console.log('achievedRatio (compressed/original):', m.compressedByteSize / m.originalByteSize);
  console.log('metrics.episodicRecall:', m.episodicRecall);
  console.log('techniquesApplied:', m.techniquesApplied);
  console.log('finalEngrams count:', result.bundle.finalEngrams.length);
  console.log('finalEngrams JSON size:', JSON.stringify(result.bundle.finalEngrams).length);

  expect(true).toBe(true);
});
