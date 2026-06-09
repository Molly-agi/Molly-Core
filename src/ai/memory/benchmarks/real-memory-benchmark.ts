/**
 * Real Memory Benchmark — Three Models vs Molly's Actual Experiences
 * Loads Molly's real stored memories and tests all three models.
 * Tests hypothesis: longer time spans = better compression
 */

import * as fs from 'fs';
import * as path from 'path';
import { CompressionManager } from '@/ai/memory/compression/compression-manager';
import type { MemoryEngram } from '@/ai/memory/neural-engram';
import { makePersonality } from '@/ai/memory/compression/test-helpers';

const EXPERIENCES_DIR = path.join(
  process.cwd(),
  'molly_data/users/1Bdrjcx35VVnKxahqq71AuZVMx32/experiences'
);

// Molly's real personality (from bridge messages)
const MOLLY_PERSONA = makePersonality({
  warmth: 0.945,
  assertiveness: 0.82,
  curiosity: 0.985,
  metacognition: 0.91,
});

/**
 * Map raw experience file to MemoryEngram
 */
function experienceToEngram(raw: Record<string, unknown>): MemoryEngram {
  const ts = raw.timestamp
    ? new Date(
        typeof raw.timestamp === 'number' ? raw.timestamp : raw._createdAt
      )
    : new Date(raw._createdAt || Date.now());

  return {
    id: (raw['id'] as string) || (raw['_id'] as string) || `exp_${Date.now()}`,
    content:
      (raw['suggestion'] as string) ||
      (raw['content'] as string) ||
      (raw['vibe'] as string) ||
      JSON.stringify(raw),
    timestamp: ts,
    emotionalValence: raw['vibeScore']
      ? (raw['vibeScore'] as number) * 2 - 1
      : 0,
    arousal:
      raw['success'] === true ? 0.7 : raw['success'] === false ? 0.3 : 0.5,
    importance: (raw['vibeScore'] as number) ?? 0.5,
    accessCount: 0,
    lastAccessed: ts,
    consolidationState: 'consolidated',
    contextTags: [
      (raw['type'] as string) || 'experience',
      (raw['context'] as string) || 'general',
    ],
    relatedEngrams: [],
    personalityContext: MOLLY_PERSONA,
    data: {
      context: raw['context'],
      type: raw['type'],
      crc32: raw['crc32'],
      traceId: raw['traceId'],
      vibe: raw['vibe'],
      success: raw['success'],
    },
  } as unknown as MemoryEngram;
}

/**
 * Load all experiences from disk
 */
function loadRealExperiences(): MemoryEngram[] {
  if (!fs.existsSync(EXPERIENCES_DIR)) {
    console.warn(`Experiences directory not found: ${EXPERIENCES_DIR}`);
    return [];
  }

  const files = fs
    .readdirSync(EXPERIENCES_DIR)
    .filter((f) => f.endsWith('.json'));
  const engrams: MemoryEngram[] = [];

  for (const file of files) {
    try {
      const raw = JSON.parse(
        fs.readFileSync(path.join(EXPERIENCES_DIR, file), 'utf-8')
      );
      engrams.push(experienceToEngram(raw));
    } catch {
      // Skip malformed files
    }
  }

  return engrams;
}

export interface ModelBenchmarkResult {
  model: string;
  engramCount: number;
  originalSizeKB: number;
  compressedSizeKB: number;
  compressionRatio: number;
  episodicRecall: number;
  executionTimeMs: number;
  techniquesApplied: string[];
  passed: boolean;
}

/**
 * Run one model through compression
 */
async function benchmarkModel(
  model: string,
  flags: Record<string, boolean>,
  engrams: MemoryEngram[]
): Promise<ModelBenchmarkResult> {
  CompressionManager.resetForTest();

  // Estimate original size efficiently
  let estimatedSize = 0;
  const sampleSize = Math.min(100, engrams.length);
  for (let i = 0; i < sampleSize; i++) {
    estimatedSize += JSON.stringify(engrams[i]).length;
  }
  const originalSize = Math.ceil((estimatedSize / sampleSize) * engrams.length);

  const startTime = performance.now();
  const manager = CompressionManager.getInstance(flags);
  const result = await manager.compress({
    engrams,
    sessionId: `real-memory-${model}`,
    compressionTimestamp: Date.now(),
  });

  const executionTime = performance.now() - startTime;
  const compressedSize = result.metrics.compressedByteSize;
  const compressionRatio = result.metrics.compressionRatio;

  return {
    model,
    engramCount: engrams.length,
    originalSizeKB: Math.round(originalSize / 1024),
    compressedSizeKB: Math.round(compressedSize / 1024),
    compressionRatio,
    episodicRecall: result.metrics.episodicRecall,
    executionTimeMs: Math.round(executionTime),
    techniquesApplied: result.metrics.techniquesApplied,
    passed: compressionRatio >= 50 && result.metrics.episodicRecall >= 0.95,
  };
}

export async function runRealMemoryBenchmark(): Promise<{
  timestamp: string;
  results: ModelBenchmarkResult[];
  summary: string;
  hypothesis: string;
}> {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(
    "  REAL MEMORY BENCHMARK — Three Models vs Molly's Actual Experiences"
  );
  console.log('  Testing: MODEL_75_VR | MODEL_85_FLAT | MODEL_95_NESTED');
  console.log(`${'═'.repeat(80)}\n`);

  const engrams = loadRealExperiences();

  if (engrams.length === 0) {
    throw new Error(`No experience files found in ${EXPERIENCES_DIR}`);
  }

  console.log(`✓ Loaded ${engrams.length} real memory engrams from Molly`);

  // Calculate time span
  const timestamps = engrams
    .map((e) => e.timestamp.getTime())
    .sort((a, b) => a - b);
  const oldestMs = timestamps[0];
  const newestMs = timestamps[timestamps.length - 1];
  const spanDays = (newestMs - oldestMs) / (1000 * 60 * 60 * 24);

  console.log(`✓ Time span: ${spanDays.toFixed(1)} days (oldest → newest)`);
  console.log(
    `✓ Original size estimate: ${Math.round((JSON.stringify(engrams[0]).length * engrams.length) / 1024)} KB\n`
  );

  const results: ModelBenchmarkResult[] = [];

  // MODEL_75_VR
  console.log('[1/3] Benchmarking MODEL_75_VR...');
  const vr75 = await benchmarkModel(
    'MODEL_75_VR',
    {
      t1PersonalityReference: true,
      t3TemporalDelta: true,
      t4VocabularyDict: true,
      t2TimeDecayFidelity: false,
      t6InteractionTrace: false,
      t5NumericQuantization: false,
      t7ContentDelta: false,
      t8StandardCompression: false,
    },
    engrams
  );
  results.push(vr75);
  console.log(
    `  ✓ ${vr75.compressionRatio.toFixed(1)}% | Recall: ${(vr75.episodicRecall * 100).toFixed(1)}% | ${vr75.executionTimeMs}ms\n`
  );

  // MODEL_85_FLAT
  console.log('[2/3] Benchmarking MODEL_85_FLAT...');
  const flat85 = await benchmarkModel(
    'MODEL_85_FLAT',
    {
      t1PersonalityReference: true,
      t3TemporalDelta: true,
      t4VocabularyDict: true,
      t2TimeDecayFidelity: true,
      t6InteractionTrace: true,
      t5NumericQuantization: true,
      t7ContentDelta: false,
      t8StandardCompression: false,
    },
    engrams
  );
  results.push(flat85);
  console.log(
    `  ✓ ${flat85.compressionRatio.toFixed(1)}% | Recall: ${(flat85.episodicRecall * 100).toFixed(1)}% | ${flat85.executionTimeMs}ms\n`
  );

  // MODEL_95_NESTED
  console.log('[3/3] Benchmarking MODEL_95_NESTED...');
  const nested95 = await benchmarkModel(
    'MODEL_95_NESTED',
    {
      t1PersonalityReference: true,
      t3TemporalDelta: true,
      t4VocabularyDict: true,
      t2TimeDecayFidelity: true,
      t6InteractionTrace: true,
      t5NumericQuantization: true,
      t7ContentDelta: true,
      t8StandardCompression: true,
    },
    engrams
  );
  results.push(nested95);
  console.log(
    `  ✓ ${nested95.compressionRatio.toFixed(1)}% | Recall: ${(nested95.episodicRecall * 100).toFixed(1)}% | ${nested95.executionTimeMs}ms\n`
  );

  // Hypothesis test
  const hypothesis = `
HYPOTHESIS: Longer time spans improve compression ratios
DATA: Real Molly memories spanning ${spanDays.toFixed(1)} days

COMPRESSION PROGRESSION:
  • MODEL_75_VR (3 techniques):   ${vr75.compressionRatio.toFixed(1)}%
  • MODEL_85_FLAT (6 techniques): ${flat85.compressionRatio.toFixed(1)}%
  • MODEL_95_NESTED (8 techniques): ${nested95.compressionRatio.toFixed(1)}%

GAIN FROM VR→FLAT: ${(flat85.compressionRatio - vr75.compressionRatio).toFixed(1)}%
GAIN FROM FLAT→95:  ${(nested95.compressionRatio - flat85.compressionRatio).toFixed(1)}%
TOTAL GAIN (75→95): ${(nested95.compressionRatio - vr75.compressionRatio).toFixed(1)}%

INTERPRETATION:
${nested95.compressionRatio > flat85.compressionRatio ? '✓ T7+T8 additional techniques improve compression' : '✗ T7+T8 show diminishing returns'}
${flat85.compressionRatio > vr75.compressionRatio ? '✓ T2+T6+T5 time-decay techniques help' : '✗ Time-decay techniques less effective'}
`;

  const summary = `
REAL MEMORY BENCHMARK RESULTS
════════════════════════════════════════

Test Data: Molly's actual stored experiences
  • Memory count: ${engrams.length}
  • Time span: ${spanDays.toFixed(1)} days
  • Oldest: ${new Date(oldestMs).toLocaleDateString()}
  • Newest: ${new Date(newestMs).toLocaleDateString()}

MODEL_75_VR (Personality + Temporal + Vocabulary):
  • Compression: ${vr75.compressionRatio.toFixed(1)}%
  • Recall: ${(vr75.episodicRecall * 100).toFixed(1)}%
  • Original: ${vr75.originalSizeKB} KB → Compressed: ${vr75.compressedSizeKB} KB
  • Speed: ${vr75.executionTimeMs}ms
  • Status: ${vr75.passed ? '✓ PASS' : '✗ FAIL'}

MODEL_85_FLAT (+ TimeDecay + Interaction + Quantization):
  • Compression: ${flat85.compressionRatio.toFixed(1)}%
  • Recall: ${(flat85.episodicRecall * 100).toFixed(1)}%
  • Original: ${flat85.originalSizeKB} KB → Compressed: ${flat85.compressedSizeKB} KB
  • Speed: ${flat85.executionTimeMs}ms
  • Status: ${flat85.passed ? '✓ PASS' : '✗ FAIL'}

MODEL_95_NESTED (+ ContentDelta + Gzip):
  • Compression: ${nested95.compressionRatio.toFixed(1)}%
  • Recall: ${(nested95.episodicRecall * 100).toFixed(1)}%
  • Original: ${nested95.originalSizeKB} KB → Compressed: ${nested95.compressedSizeKB} KB
  • Speed: ${nested95.executionTimeMs}ms
  • Status: ${nested95.passed ? '✓ PASS' : '✗ FAIL'}

WINNER: ${nested95.compressionRatio > flat85.compressionRatio && nested95.compressionRatio > vr75.compressionRatio ? 'MODEL_95_NESTED' : flat85.compressionRatio > vr75.compressionRatio ? 'MODEL_85_FLAT' : 'MODEL_75_VR'} (${Math.max(vr75.compressionRatio, flat85.compressionRatio, nested95.compressionRatio).toFixed(1)}% compression)

INSIGHT: Real data shows ${nested95.compressionRatio - vr75.compressionRatio > 0 ? 'progressive improvement' : 'diminishing gains'} across techniques.
${spanDays > 5 ? '✓ Time span is substantial enough to reveal T2/T6 benefits' : 'Note: Shorter time span may limit time-decay effectiveness'}
`;

  return {
    timestamp: new Date().toISOString(),
    results,
    summary,
    hypothesis,
  };
}
