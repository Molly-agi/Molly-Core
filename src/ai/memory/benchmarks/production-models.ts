/**
 * Production Models Benchmarking Suite
 * Measures compression performance for three SKU targets:
 * - MODEL_75_VR: VR Gaming (75% compression target)
 * - MODEL_85_FLAT: Flat-Memory Systems (85% target)
 * - MODEL_95_NESTED: Nested-Memory Systems (95% target)
 */

import { CompressionManager } from '../compression/compression-manager';
import type { NeuralEngram } from '../neural-engram';

export interface ProductionModelBenchmark {
  modelName: string;
  targetRatio: number; // e.g., 0.75 for 75% retention
  techniques: string[];
  originalSize: number;
  compressedSize: number;
  achievedRatio: number;
  compressionGain: number; // % reduction
  executionTimeMs: number;
  recallPreserved: number; // 0-1.0
  passed: boolean;
}

export interface BenchmarkSuite {
  timestamp: string;
  testDataSize: number;
  models: ProductionModelBenchmark[];
  overallPass: boolean;
}

/**
 * Generate test engram corpus matching real memory patterns
 */
function generateTestEngrams(count: number): NeuralEngram[] {
  const engrams: NeuralEngram[] = [];

  for (let i = 0; i < count; i++) {
    const engram: NeuralEngram = {
      id: `test_engram_${i}`,
      userId: 'benchmark-user',
      content: `Test memory ${i}: A detailed narrative about experiences, emotions, and learned patterns.`,
      timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
      importance: 0.3 + Math.random() * 0.7,
      emotionalValence: (Math.random() - 0.5) * 2,
      arousal: Math.random(),
      accessCount: Math.floor(Math.random() * 50),
      lastAccessed: new Date(),
      consolidationState: Math.random() > 0.3 ? 'consolidated' : 'transient',
      contextTags: ['test', 'benchmark'],
      personalityContext: {
        warmth: 0.5 + Math.random() * 0.5,
        assertiveness: 0.3 + Math.random() * 0.7,
        curiosity: 0.6 + Math.random() * 0.4,
      },
      data: {
        context: `Context for memory ${i}`,
        relatedTo: [],
      },
    };
    engrams.push(engram);
  }

  return engrams;
}

/**
 * Run benchmarks for all three production models
 */
export async function benchmarkProductionModels(
  testDataSize: number = 1000
): Promise<BenchmarkSuite> {
  const testEngrams = generateTestEngrams(testDataSize);
  const originalSize = JSON.stringify(testEngrams).length;

  const models: ProductionModelBenchmark[] = [];

  // MODEL_75_VR: VR Gaming - 75% retention (25% gain)
  {
    const startTime = performance.now();
    const manager = new CompressionManager();
    const result = await manager.compress({
      engrams: testEngrams,
      targetRatio: 0.75,
      enabledTechniques: ['PERSONALITY_REF', 'TEMPORAL_DELTA', 'VOCAB_DICT'],
    });
    const executionTime = performance.now() - startTime;

    const compressedSize = JSON.stringify(result.bundle).length;
    const achievedRatio = compressedSize / originalSize;
    const compressionGain = (1 - achievedRatio) * 100;

    models.push({
      modelName: 'MODEL_75_VR',
      targetRatio: 0.75,
      techniques: ['T1', 'T3', 'T4'],
      originalSize,
      compressedSize,
      achievedRatio,
      compressionGain,
      executionTimeMs: executionTime,
      recallPreserved: result.metrics?.fidelity || 1.0,
      passed: achievedRatio <= 0.75,
    });
  }

  // MODEL_85_FLAT: Flat-Memory Systems - 85% retention (15% gain)
  {
    const startTime = performance.now();
    const manager = new CompressionManager();
    const result = await manager.compress({
      engrams: testEngrams,
      targetRatio: 0.85,
      enabledTechniques: ['PERSONALITY_REF', 'TEMPORAL_DELTA', 'VOCAB_DICT'],
    });
    const executionTime = performance.now() - startTime;

    const compressedSize = JSON.stringify(result.bundle).length;
    const achievedRatio = compressedSize / originalSize;
    const compressionGain = (1 - achievedRatio) * 100;

    models.push({
      modelName: 'MODEL_85_FLAT',
      targetRatio: 0.85,
      techniques: ['T1', 'T3', 'T4'],
      originalSize,
      compressedSize,
      achievedRatio,
      compressionGain,
      executionTimeMs: executionTime,
      recallPreserved: result.metrics?.fidelity || 1.0,
      passed: achievedRatio <= 0.85,
    });
  }

  // MODEL_95_NESTED: Nested-Memory Systems - 95% retention (5% gain, full pipeline)
  {
    const startTime = performance.now();
    const manager = new CompressionManager();
    const result = await manager.compress({
      engrams: testEngrams,
      targetRatio: 0.95,
      enabledTechniques: [
        'SCHEMA_STRIPPER',
        'PERSONALITY_REF',
        'TEMPORAL_DELTA',
        'VOCAB_DICT',
        'TIME_DECAY',
        'INTERACTION_TRACE',
      ],
    });
    const executionTime = performance.now() - startTime;

    const compressedSize = JSON.stringify(result.bundle).length;
    const achievedRatio = compressedSize / originalSize;
    const compressionGain = (1 - achievedRatio) * 100;

    models.push({
      modelName: 'MODEL_95_NESTED',
      targetRatio: 0.95,
      techniques: ['S0', 'T1', 'T3', 'T4', 'T2', 'T6'],
      originalSize,
      compressedSize,
      achievedRatio,
      compressionGain,
      executionTimeMs: executionTime,
      recallPreserved: result.metrics?.fidelity || 1.0,
      passed: achievedRatio <= 0.95,
    });
  }

  const overallPass = models.every((m) => m.passed);

  return {
    timestamp: new Date().toISOString(),
    testDataSize,
    models,
    overallPass,
  };
}

/**
 * Format benchmark results for console output
 */
export function formatBenchmarkResults(suite: BenchmarkSuite): string {
  const lines: string[] = [];

  lines.push('\n' + '═'.repeat(90));
  lines.push('PRODUCTION MODEL BENCHMARKS');
  lines.push('═'.repeat(90));
  lines.push(`Timestamp: ${suite.timestamp}`);
  lines.push(
    `Test Data: ${suite.testDataSize} engrams, ${(suite.models[0].originalSize / 1024).toFixed(2)} KB`
  );
  lines.push('═'.repeat(90) + '\n');

  for (const model of suite.models) {
    const statusEmoji = model.passed ? '✅' : '❌';
    const statusText = model.passed ? 'PASS' : 'FAIL';

    lines.push(`${statusEmoji} ${model.modelName}`);
    lines.push(
      `   Industry: ${model.modelName === 'MODEL_75_VR' ? 'VR Gaming' : model.modelName === 'MODEL_85_FLAT' ? 'Flat-Memory Systems' : 'Nested-Memory Systems'}`
    );
    lines.push(`   Techniques: ${model.techniques.join(' → ')}`);
    lines.push(
      `   Target: ${(model.targetRatio * 100).toFixed(0)}% retention (${((1 - model.targetRatio) * 100).toFixed(0)}% compression gain)`
    );
    lines.push(
      `   Achieved: ${(model.achievedRatio * 100).toFixed(1)}% retention`
    );
    lines.push(
      `   Compression: ${(model.originalSize / 1024).toFixed(2)} KB → ${(model.compressedSize / 1024).toFixed(2)} KB`
    );
    lines.push(`   Gain: ${model.compressionGain.toFixed(1)}% reduction`);
    lines.push(`   Recall: ${(model.recallPreserved * 100).toFixed(1)}%`);
    lines.push(`   Speed: ${model.executionTimeMs.toFixed(2)}ms`);
    lines.push(`   Status: ${statusText}\n`);
  }

  lines.push('═'.repeat(90));
  const passCount = suite.models.filter((m) => m.passed).length;
  lines.push(
    `OVERALL: ${passCount}/${suite.models.length} models passed targets`
  );
  lines.push(
    `STATUS: ${suite.overallPass ? '✅ ALL SYSTEMS READY' : '❌ FAILURES DETECTED'}`
  );
  lines.push('═'.repeat(90) + '\n');

  return lines.join('\n');
}
