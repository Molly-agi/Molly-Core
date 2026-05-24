/**
 * Load Testing Suite for Three Production Models
 * Measures stability and performance under varying memory loads
 */

import { CompressionManager } from '../compression/compression-manager';
import type { NeuralEngram } from '../neural-engram';

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
        warmth: 0.5 + Math.random() * 0.5,
        assertiveness: 0.3 + Math.random() * 0.7,
        curiosity: 0.6 + Math.random() * 0.4,
      },
      data: { testScenario: scenario.name },
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

    const manager = new CompressionManager();
    const result = await manager.compress({
      engrams,
      targetRatio: 0.8, // Default target
      enabledTechniques,
    });

    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;

    const compressedSize = JSON.stringify(result.bundle).length;
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
          `  ✓ ${result.scenario.name.padEnd(15)} | ${result.executionTimeMs.toFixed(0).padStart(6)}ms | ${(result.compressionRatio * 100).toFixed(1).padStart(5)}% | ${result.throughputMBps.padStart(6)} MB/s`
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
