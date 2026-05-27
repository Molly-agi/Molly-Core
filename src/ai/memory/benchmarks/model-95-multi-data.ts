/**
 * MODEL_95_NESTED Multi-Data Benchmark
 * Tests the 95 model against three distinct data types:
 *   1. Fat/Nested AI Memory (what it's designed for)
 *   2. VR Gaming Data (session profiles, gameplay telemetry)
 *   3. Generic Bulk Data (web, stats, database records, logs)
 *
 * Measures compression, recall, and speed across all three workloads.
 * Date: May 25, 2026
 */

import { CompressionManager } from '@/ai/memory/compression/compression-manager';
import { generateTestEngrams } from '@/ai/memory/benchmarks/production-models';
import type { MemoryEngram } from '@/ai/memory/neural-engram';

// ─── Benchmark Result Type ────────────────────────────────────────────────────

export interface BenchmarkResult {
  dataType: string;
  engramCount: number;
  originalSizeKB: number;
  compressedSizeKB: number;
  compressionRatio: number; // (1 - compressed/original) × 100
  episodicRecall: number;
  executionTimeMs: number;
  techniquesApplied: string[];
  techniquesSkipped: string[];
  passed: boolean;
  notes: string;
}

// ─── Data Generators ──────────────────────────────────────────────────────────

/**
 * FAT MEMORY: Complex nested AI memory structures with full personality context.
 * Designed for deep introspection, multi-layered associations.
 */
function generateFatAIMemory(count: number): MemoryEngram[] {
  return generateTestEngrams(count); // Uses full nested structure
}

/**
 * VR GAMING DATA: Lightweight, telemetry-focused structures.
 * Typical VR session: gameplay stats, controller events, performance metrics.
 */
function generateVRGameplayData(count: number): MemoryEngram[] {
  const engrams: MemoryEngram[] = [];
  const environments = ['forest', 'cave', 'city', 'space', 'underwater'];
  const actions = ['walk', 'grab', 'throw', 'interact', 'shoot', 'climb'];

  for (let i = 0; i < count; i++) {
    const env = environments[i % environments.length];
    const action = actions[i % actions.length];

    engrams.push({
      id: `vr_session_${i}`,
      userId: 'vr-player-1',
      content: `VR Session ${i}: ${action} in ${env}. Performance: ${(60 + Math.random() * 30).toFixed(1)} FPS, Headset temp: ${(35 + Math.random() * 10).toFixed(1)}C`,
      timestamp: new Date(Date.now() - i * 30000), // 30-second intervals
      importance: Math.random() * 0.5 + 0.3,
      emotionalValence: Math.random() * 2 - 1,
      arousal: 0.5 + Math.random() * 0.5,
      accessCount: Math.floor(Math.random() * 10),
      lastAccessed: new Date(),
      consolidationState: 'transient',
      contextTags: [env, action, 'vr', 'gameplay'],
      data: {
        environment: env,
        action,
        duration_seconds: Math.floor(Math.random() * 300),
        fps_avg: 60 + Math.random() * 30,
        headset_temp_c: 35 + Math.random() * 10,
        controller_l_battery: Math.random() * 100,
        controller_r_battery: Math.random() * 100,
        play_area_size_m2: Math.random() * 30 + 5,
        score: Math.floor(Math.random() * 10000),
        distance_traveled_m: Math.random() * 500,
        success: Math.random() > 0.2,
      },
    } as any);
  }

  return engrams;
}

/**
 * GENERIC BULK DATA: Heterogeneous non-AI data (web, stats, DB, logs).
 * Typical storage workload: mixed content types, inconsistent schemas.
 */
function generateGenericBulkData(count: number): MemoryEngram[] {
  const engrams: MemoryEngram[] = [];
  const dataTypes = ['web', 'stats', 'database', 'log'];

  for (let i = 0; i < count; i++) {
    const type = dataTypes[i % dataTypes.length];

    let data: Record<string, any>;
    let content: string;

    if (type === 'web') {
      const html = `<html><head><title>Page ${i}</title></head><body><h1>Content ${i}</h1><p>${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(5)}</p></body></html>`;
      content = html;
      data = {
        url: `https://example.com/page/${i}`,
        statusCode: 200,
        contentType: 'text/html',
        byteSize: html.length,
      };
    } else if (type === 'stats') {
      content = `Metric ${i}: cpu=${(Math.random()*100).toFixed(2)}% mem=${(Math.random()*32).toFixed(2)}GB disk=${(Math.random()*100).toFixed(1)}%`;
      data = {
        cpu_percent: parseFloat((Math.random() * 100).toFixed(6)),
        memory_gb: parseFloat((Math.random() * 32).toFixed(6)),
        disk_percent: parseFloat((Math.random() * 100).toFixed(6)),
        timestamp_unix: Date.now() - i * 60000,
      };
    } else if (type === 'database') {
      const categories = ['Electronics', 'Clothing', 'Food'];
      content = `Product ${i}: SKU-${i} in ${categories[i % 3]} category`;
      data = {
        sku: `SKU-${String(i).padStart(6, '0')}`,
        category: categories[i % 3],
        price_usd: parseFloat((Math.random() * 999.99).toFixed(2)),
        stock_qty: Math.floor(Math.random() * 10000),
        rating: parseFloat((1 + Math.random() * 4).toFixed(2)),
      };
    } else {
      const levels = ['INFO', 'WARN', 'ERROR'];
      const level = i % 20 === 0 ? 'ERROR' : i % 5 === 0 ? 'WARN' : 'INFO';
      content = `[${level}] Service-${Math.floor(i / 100)} - Event ${i} processed in ${Math.floor(Math.random() * 2000)}ms`;
      data = {
        level,
        service: `service-${Math.floor(i / 100)}`,
        duration_ms: Math.floor(Math.random() * 2000),
        status: level === 'ERROR' ? 'failed' : 'success',
      };
    }

    engrams.push({
      id: `${type}_${i}`,
      userId: 'bulk-storage',
      content,
      timestamp: new Date(Date.now() - i * 1000),
      importance: type === 'log' && content.includes('ERROR') ? 0.9 : 0.3,
      emotionalValence: 0,
      arousal: 0,
      accessCount: Math.floor(Math.random() * 100),
      lastAccessed: new Date(),
      consolidationState: 'consolidated',
      contextTags: [type],
      data,
    } as any);
  }

  return engrams;
}

// ─── MODEL_95_NESTED Configuration ────────────────────────────────────────────

const MODEL_95_FLAGS = {
  s0SchemaStripper: false,
  t1PersonalityReference: true,
  t3TemporalDelta: true,
  t4VocabularyDict: true,
  t2TimeDecayFidelity: true,
  t6InteractionTrace: true,
  t5NumericQuantization: true,
  t7ContentDelta: true,
  t8StandardCompression: true,
};

// ─── Benchmark Executor ───────────────────────────────────────────────────────

async function runBenchmark(
  dataType: string,
  engrams: MemoryEngram[]
): Promise<BenchmarkResult> {
  CompressionManager.resetForTest();
  const startTime = performance.now();
  const originalSize = JSON.stringify(engrams).length;

  const manager = CompressionManager.getInstance(MODEL_95_FLAGS);
  const result = await manager.compress({
    engrams,
    sessionId: `model-95-${dataType}`,
    compressionTimestamp: Date.now(),
  });

  const executionTime = performance.now() - startTime;
  const compressedSize = result.metrics.compressedByteSize;
  const compressionRatio = result.metrics.compressionRatio;

  return {
    dataType,
    engramCount: engrams.length,
    originalSizeKB: Math.round(originalSize / 1024),
    compressedSizeKB: Math.round(compressedSize / 1024),
    compressionRatio,
    episodicRecall: result.metrics.episodicRecall,
    executionTimeMs: Math.round(executionTime),
    techniquesApplied: result.metrics.techniquesApplied,
    techniquesSkipped: result.metrics.techniquesSkipped,
    passed: compressionRatio >= 50 && result.metrics.episodicRecall >= 0.95,
    notes: result.metrics.fidelityNotes || '',
  };
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function runModel95MultiDataBenchmark(
  testSize: number = 1000
): Promise<{
  timestamp: string;
  model: string;
  results: BenchmarkResult[];
  summary: string;
}> {
  console.log(`\n${'═'.repeat(80)}`);
  console.log('  MODEL_95_NESTED — Multi-Data Benchmark');
  console.log('  Testing against: Fat AI Memory | VR Gaming | Generic Bulk Data');
  console.log(`  Test Size: ${testSize} engrams per dataset`);
  console.log(`${'═'.repeat(80)}\n`);

  const results: BenchmarkResult[] = [];

  // 1. FAT AI MEMORY
  console.log('[1/3] Generating Fat AI Memory...');
  const fatMemory = generateFatAIMemory(testSize);
  console.log(`  ✓ ${fatMemory.length} engrams (nested, personality-rich)`);
  console.log('  Running compression...');
  const fatResult = await runBenchmark('FAT_AI_MEMORY', fatMemory);
  results.push(fatResult);
  console.log(
    `  ✓ Result: ${fatResult.compressionRatio.toFixed(1)}% compression, ${(fatResult.episodicRecall * 100).toFixed(1)}% recall\n`
  );

  // 2. VR GAMING DATA
  console.log('[2/3] Generating VR Gameplay Data...');
  const vrData = generateVRGameplayData(testSize);
  console.log(`  ✓ ${vrData.length} engrams (telemetry-focused)`);
  console.log('  Running compression...');
  const vrResult = await runBenchmark('VR_GAMEPLAY', vrData);
  results.push(vrResult);
  console.log(
    `  ✓ Result: ${vrResult.compressionRatio.toFixed(1)}% compression, ${(vrResult.episodicRecall * 100).toFixed(1)}% recall\n`
  );

  // 3. GENERIC BULK DATA
  console.log('[3/3] Generating Generic Bulk Data (web/stats/db/logs)...');
  const bulkData = generateGenericBulkData(testSize);
  console.log(`  ✓ ${bulkData.length} engrams (heterogeneous)`);
  console.log('  Running compression...');
  const bulkResult = await runBenchmark('GENERIC_BULK', bulkData);
  results.push(bulkResult);
  console.log(
    `  ✓ Result: ${bulkResult.compressionRatio.toFixed(1)}% compression, ${(bulkResult.episodicRecall * 100).toFixed(1)}% recall\n`
  );

  // Summary
  const summary = `
MODEL_95_NESTED Multi-Data Benchmark Summary
═════════════════════════════════════════════

Fat AI Memory:
  • Original: ${fatResult.originalSizeKB} KB
  • Compressed: ${fatResult.compressedSizeKB} KB
  • Compression: ${fatResult.compressionRatio.toFixed(1)}%
  • Recall: ${(fatResult.episodicRecall * 100).toFixed(1)}%
  • Time: ${fatResult.executionTimeMs}ms
  • Status: ${fatResult.passed ? '✓ PASS' : '✗ FAIL'}

VR Gameplay Data:
  • Original: ${vrResult.originalSizeKB} KB
  • Compressed: ${vrResult.compressedSizeKB} KB
  • Compression: ${vrResult.compressionRatio.toFixed(1)}%
  • Recall: ${(vrResult.episodicRecall * 100).toFixed(1)}%
  • Time: ${vrResult.executionTimeMs}ms
  • Status: ${vrResult.passed ? '✓ PASS' : '✗ FAIL'}

Generic Bulk Data (web/stats/db/logs):
  • Original: ${bulkResult.originalSizeKB} KB
  • Compressed: ${bulkResult.compressedSizeKB} KB
  • Compression: ${bulkResult.compressionRatio.toFixed(1)}%
  • Recall: ${(bulkResult.episodicRecall * 100).toFixed(1)}%
  • Time: ${bulkResult.executionTimeMs}ms
  • Status: ${bulkResult.passed ? '✓ PASS' : '✗ FAIL'}

Overall: ${results.every(r => r.passed) ? '✓ ALL PASSED' : '✗ SOME FAILED'}
`;

  return {
    timestamp: new Date().toISOString(),
    model: 'MODEL_95_NESTED',
    results,
    summary,
  };
}
