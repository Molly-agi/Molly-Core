/**
 * Load Testing Suite for Three Production Models
 * Measures stability and performance under varying memory loads
 */

import { CompressionManager } from '../compression/compression-manager';
import type { NeuralEngram } from '../neural-engram';

// Stable persona baseline — mirrors real AI memory patterns for T1 deduplication
const PERSONA_BASE = { warmth: 0.945, assertiveness: 0.820, curiosity: 0.985, reflectivity: 0.910 };
const drift = () => (Math.random() - 0.5) * 0.04; // ±2% natural variance

export interface LoadTestScenario {
  name: string;
  engramCount: number;
  contentLength: number; // avg characters per memory
  patternType: 'uniform' | 'skewed' | 'burst'; // distribution pattern
}

export interface LoadTestResult {
  scenario: LoadTestScenario;
  modelName: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  executionTimeMs: number;
  memoryPeakMB: number;
  throughputMBps: number;
  success: boolean;
  errors?: string[];
}

const LOAD_SCENARIOS: LoadTestScenario[] = [
  {
    name: 'Light Load',
    engramCount: 500,
    contentLength: 300,
    patternType: 'uniform',
  },
  {
    name: 'Normal Load',
    engramCount: 2000,
    contentLength: 500,
    patternType: 'uniform',
  },
  {
    name: 'Heavy Load',
    engramCount: 5000,
    contentLength: 800,
    patternType: 'uniform',
  },
  {
    name: 'Burst Pattern',
    engramCount: 3000,
    contentLength: 600,
    patternType: 'burst',
  },
  {
    name: 'Skewed Load',
    engramCount: 4000,
    contentLength: 700,
    patternType: 'skewed',
  },
];

/**
 * Generate test engrams with different patterns
 */
function generateLoadTestEngrams(scenario: LoadTestScenario): NeuralEngram[] {
  const engrams: NeuralEngram[] = [];

  for (let i = 0; i < scenario.engramCount; i++) {
    let importance: number;

    // Pattern-based importance distribution
    switch (scenario.patternType) {
      case 'burst':
        // Some memories are very important (spike pattern)
        importance =
          Math.random() < 0.3 ? 0.8 + Math.random() * 0.2 : Math.random() * 0.3;
        break;
      case 'skewed':
        // Most are low importance, few are high
        importance = Math.pow(Math.random(), 2);
        break;
      case 'uniform':
      default:
        importance = Math.random();
    }

    const engram: NeuralEngram = {
      id: `load_test_${scenario.name.replace(/\s+/g, '_')}_${i}`,
      userId: 'load-test-user',
      content: 'X'.repeat(scenario.contentLength), // Simplified for load testing
      timestamp: new Date(
        Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000
      ),
      importance,
      emotionalValence: (Math.random() - 0.5) * 2,
      arousal: Math.random(),
      accessCount: Math.floor(Math.random() * 100),
      lastAccessed: new Date(),
      consolidationState: 'consolidated',
      contextTags: ['load-test', scenario.patternType],
      personalityContext: {
        warmth: PERSONA_BASE.warmth + drift(),
        assertiveness: PERSONA_BASE.assertiveness + drift(),
        curiosity: PERSONA_BASE.curiosity + drift(),
        reflectivity: PERSONA_BASE.reflectivity + drift(),
      },
      data: {
        context: {
          primary: scenario.name,
          sessionPhase: i % 3 === 0 ? 'opening' : i % 3 === 1 ? 'deepening' : 'resolution',
          priorContext: `Load test memory ${Math.max(0, i - 1)} in scenario ${scenario.name}`,
        },
        emotionalState: {
          primary: scenario.patternType,
          intensity: importance,
          valence: (Math.random() - 0.5) * 2,
          regulation: { strategy: 'acceptance', effectiveness: Math.random() },
        },
        associations: {
          relatedMemories: [`load_test_${Math.max(0, i - 3)}`, `load_test_${Math.max(0, i - 7)}`],
          strength: Math.random(),
        },
        metadata: {
          sourceType: scenario.patternType,
          processingDepth: i % 4 === 0 ? 'deep' : 'surface',
          consolidationAttempts: Math.floor(Math.random() * 3),
        },
      },
    };

    engrams.push(engram);
  }

  return engrams;
}

/**
 * Run load test for a given model and scenario
 */
export async function runLoadTest(
  scenario: LoadTestScenario,
  modelName: string,
  enabledTechniques: string[]
): Promise<LoadTestResult> {
  try {
    const engrams = generateLoadTestEngrams(scenario);
    const originalSize = JSON.stringify(engrams).length;

    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;

    CompressionManager.resetForTest();
    const manager = CompressionManager.getInstance({
      t1PersonalityReference: enabledTechniques.some(t => ['PERSONALITY_REF', 'T1'].includes(t)),
      t3TemporalDelta: enabledTechniques.some(t => ['TEMPORAL_DELTA', 'T3'].includes(t)),
      t4VocabularyDict: enabledTechniques.some(t => ['VOCAB_DICT', 'T4'].includes(t)),
      t2TimeDecayFidelity: enabledTechniques.some(t => ['TIME_DECAY', 'T2'].includes(t)),
      t6InteractionTrace: enabledTechniques.some(t => ['INTERACTION_TRACE', 'T6'].includes(t)),
      t5NumericQuantization: enabledTechniques.some(t => ['NUMERIC_QUANT', 'T5'].includes(t)),
    });
    const result = await manager.compress({
      engrams,
      sessionId: `load-test-${scenario.name}-${modelName}`,
      compressionTimestamp: Date.now(),
    });

    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;

    const compressedSize = result.metrics.compressedByteSize;
    const compressionRatio = compressedSize / originalSize;
    const executionTime = endTime - startTime;
    const memoryPeakMB = ((endMemory - startMemory) / 1024 / 1024).toFixed(2);
    const throughputMBps = (
      originalSize /
      1024 /
      1024 /
      (executionTime / 1000)
    ).toFixed(2);

    return {
      scenario,
      modelName,
      originalSize,
      compressedSize,
      compressionRatio,
      executionTimeMs: executionTime,
      memoryPeakMB: parseFloat(memoryPeakMB),
      throughputMBps: parseFloat(throughputMBps),
      success: true,
    };
  } catch (error) {
    return {
      scenario,
      modelName,
      originalSize: 0,
      compressedSize: 0,
      compressionRatio: 0,
      executionTimeMs: 0,
      memoryPeakMB: 0,
      throughputMBps: 0,
      success: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * Run full load test suite for all models and scenarios
 */
export async function runFullLoadTestSuite() {
  const models = [
    {
      name: 'MODEL_75_VR',
      techniques: ['PERSONALITY_REF', 'TEMPORAL_DELTA', 'VOCAB_DICT'],
    },
    {
      name: 'MODEL_85_FLAT',
      techniques: ['PERSONALITY_REF', 'TEMPORAL_DELTA', 'VOCAB_DICT'],
    },
    {
      name: 'MODEL_95_NESTED',
      techniques: [
        'SCHEMA_STRIPPER',
        'PERSONALITY_REF',
        'TEMPORAL_DELTA',
        'VOCAB_DICT',
        'TIME_DECAY',
        'INTERACTION_TRACE',
      ],
    },
  ];

  const allResults: LoadTestResult[] = [];

  for (const scenario of LOAD_SCENARIOS) {
    console.log(
      `\nRunning scenario: ${scenario.name} (${scenario.engramCount} engrams)...`
    );

    for (const model of models) {
      const result = await runLoadTest(scenario, model.name, model.techniques);
      allResults.push(result);

      if (result.success) {
        console.log(
          `  ✓ ${model.name}: ${result.executionTimeMs.toFixed(0)}ms, ${(result.compressionRatio * 100).toFixed(1)}% ratio`
        );
      } else {
        console.log(`  ✗ ${model.name}: ${result.errors?.join(', ')}`);
      }
    }
  }

  return allResults;
}

/**
 * Format load test results for reporting
 */
export function formatLoadTestResults(results: LoadTestResult[]): string {
  const lines: string[] = [];

  lines.push('\n' + '═'.repeat(100));
  lines.push('LOAD TEST RESULTS: THREE PRODUCTION MODELS');
  lines.push('═'.repeat(100));

  // Group by model
  const byModel = new Map<string, LoadTestResult[]>();
  for (const result of results) {
    if (!byModel.has(result.modelName)) {
      byModel.set(result.modelName, []);
    }
    byModel.get(result.modelName)!.push(result);
  }

  for (const [modelName, modelResults] of byModel) {
    lines.push(`\n${modelName}:`);
    lines.push('-'.repeat(100));

    const passCount = modelResults.filter((r) => r.success).length;
    lines.push(
      `  Status: ${passCount}/${modelResults.length} scenarios passed`
    );

    for (const result of modelResults) {
      if (result.success) {
        lines.push(
          `  ✓ ${result.scenario.name.padEnd(15)} | ${result.executionTimeMs.toFixed(0).padStart(6)}ms | ${(result.compressionRatio * 100).toFixed(1).padStart(5)}% | ${result.throughputMBps.toFixed(2).padStart(6)} MB/s`
        );
      } else {
        lines.push(
          `  ✗ ${result.scenario.name.padEnd(15)} | ERROR: ${result.errors?.join(', ')}`
        );
      }
    }
  }

  lines.push('\n' + '═'.repeat(100));
  const totalPass = results.filter((r) => r.success).length;
  lines.push(`OVERALL: ${totalPass}/${results.length} tests passed`);
  lines.push('═'.repeat(100) + '\n');

  return lines.join('\n');
}
