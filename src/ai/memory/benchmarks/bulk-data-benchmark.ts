/**
 * BULK DATA HEAVY BENCHMARK — 30-60 Day Simulation
 * Tests MODEL_95_NESTED against massive accumulated datasets:
 *   - 30 days of access logs (~2.4M log lines)
 *   - 60 days of telemetry metrics (~1M data points)
 *   - 45 days of user event streams (~500K events)
 *   - Heterogeneous mixed data (web, DB, system stats combined)
 *
 * Simulates real-world storage accumulation patterns.
 * Measures: compression, recall, speed at scale.
 */

import { CompressionManager } from '@/ai/memory/compression/compression-manager';
import type { MemoryEngram } from '@/ai/memory/neural-engram';

// ─── Bulk Data Generators ─────────────────────────────────────────────────────

/**
 * 30-day access log simulation (~5K log entries per day = 150K total)
 */
function generateAccessLogs(dayCount: number = 30): MemoryEngram[] {
  const engrams: MemoryEngram[] = [];
  const services = [
    'api-gateway',
    'auth-service',
    'db-proxy',
    'cache-layer',
    'worker',
    'scheduler',
  ];
  const paths = [
    '/api/users',
    '/api/data',
    '/api/search',
    '/health',
    '/metrics',
    '/ws',
  ];
  const statuses = [200, 201, 400, 401, 403, 404, 500, 502, 503];

  const logsPerDay = 5000;
  const totalLogs = dayCount * logsPerDay;

  for (let i = 0; i < totalLogs; i++) {
    const dayOffset = Math.floor(i / logsPerDay);
    const timestamp = new Date(
      Date.now() - (dayCount - dayOffset) * 86400000 + (i % logsPerDay) * 1080
    ); // ~1080ms per log

    const service = services[i % services.length];
    const path = paths[i % paths.length];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const duration = Math.floor(Math.random() * 5000);

    engrams.push({
      id: `log_${i}`,
      userId: 'bulk-system',
      content: `[${timestamp.toISOString()}] ${service} ${path} ${status} ${duration}ms user=${Math.floor(Math.random() * 100000)}`,
      timestamp,
      importance: status >= 500 ? 0.9 : status >= 400 ? 0.6 : 0.2,
      emotionalValence: 0,
      arousal: 0,
      accessCount: 0,
      lastAccessed: new Date(),
      consolidationState: 'consolidated',
      contextTags: ['log', `http-${status}`, service],
      data: {
        service,
        path,
        statusCode: status,
        durationMs: duration,
        userId: Math.floor(Math.random() * 100000),
        method: ['GET', 'POST', 'PUT', 'DELETE'][i % 4],
        userAgent: `client-${Math.floor(i / 10000)}`,
      },
    } as unknown as MemoryEngram);
  }

  return engrams;
}

/**
 * 60-day telemetry metrics (~2K data points per day = 120K total)
 */
function generateTelemetryMetrics(dayCount: number = 60): MemoryEngram[] {
  const engrams: MemoryEngram[] = [];
  const metricsPerDay = 2000;
  const totalMetrics = dayCount * metricsPerDay;

  for (let i = 0; i < totalMetrics; i++) {
    const dayOffset = Math.floor(i / metricsPerDay);
    const timestamp = new Date(
      Date.now() -
        (dayCount - dayOffset) * 86400000 +
        (i % metricsPerDay) * 5184
    ); // ~5.2 seconds per metric

    engrams.push({
      id: `metric_${i}`,
      userId: 'bulk-system',
      content: `Telemetry snapshot ${i}: cpu=${(Math.random() * 100).toFixed(1)}% mem=${(Math.random() * 100).toFixed(1)}% disk=${(Math.random() * 100).toFixed(1)}% net=${(Math.random() * 1000).toFixed(0)}Mbps`,
      timestamp,
      importance: 0.3,
      emotionalValence: 0,
      arousal: 0,
      accessCount: 0,
      lastAccessed: new Date(),
      consolidationState: 'consolidated',
      contextTags: ['metrics', 'system', 'telemetry'],
      data: {
        cpu_percent: parseFloat((Math.random() * 100).toFixed(6)),
        memory_percent: parseFloat((Math.random() * 100).toFixed(6)),
        disk_percent: parseFloat((Math.random() * 100).toFixed(6)),
        network_mbps: parseFloat((Math.random() * 1000).toFixed(6)),
        connections: Math.floor(Math.random() * 100000),
        processes: Math.floor(Math.random() * 1000),
        load_1min: parseFloat((Math.random() * 16).toFixed(6)),
        load_5min: parseFloat((Math.random() * 16).toFixed(6)),
        load_15min: parseFloat((Math.random() * 16).toFixed(6)),
      },
    } as unknown as MemoryEngram);
  }

  return engrams;
}

/**
 * 45-day user event stream (~1.5K events per day = 67.5K total)
 */
function generateUserEventStream(dayCount: number = 45): MemoryEngram[] {
  const engrams: MemoryEngram[] = [];
  const eventTypes = [
    'click',
    'view',
    'purchase',
    'login',
    'logout',
    'share',
    'comment',
    'like',
    'search',
    'scroll',
  ];
  const eventsPerDay = 1500;
  const totalEvents = dayCount * eventsPerDay;

  for (let i = 0; i < totalEvents; i++) {
    const dayOffset = Math.floor(i / eventsPerDay);
    const timestamp = new Date(
      Date.now() - (dayCount - dayOffset) * 86400000 + (i % eventsPerDay) * 7854
    ); // ~7.8 seconds per event

    const eventType = eventTypes[i % eventTypes.length];
    const userId = `user_${Math.floor(Math.random() * 50000)}`;

    engrams.push({
      id: `event_${i}`,
      userId: 'bulk-system',
      content: `${eventType.toUpperCase()} by ${userId} at ${timestamp.toISOString()} on resource-${Math.floor(i / 100)}`,
      timestamp,
      importance:
        eventType === 'purchase' ? 0.9 : eventType === 'login' ? 0.5 : 0.2,
      emotionalValence: Math.random() * 2 - 1,
      arousal: Math.random(),
      accessCount: 0,
      lastAccessed: new Date(),
      consolidationState: 'consolidated' as const,
      contextTags: [eventType, 'user-event'],
      data: {
        eventType,
        userId,
        resourceId: `resource-${Math.floor(i / 100)}`,
        sessionId: `session-${Math.floor(i / 1000)}`,
        referrer: Math.random() > 0.5 ? 'organic' : 'paid',
        deviceType: ['mobile', 'desktop', 'tablet'][i % 3],
        duration_seconds: Math.floor(Math.random() * 3600),
      },
    } as unknown as MemoryEngram);
  }

  return engrams;
}

/**
 * MIXED HETEROGENEOUS DATA: Combines all types in realistic proportions.
 * Generates guaranteed-unique IDs. Never repeats records.
 */
function generateMixedBulkData(totalCount: number): MemoryEngram[] {
  const logs = generateAccessLogs(1); // ~5K logs
  const metrics = generateTelemetryMetrics(1); // ~2K metrics
  const events = generateUserEventStream(1); // ~1.5K events

  const allData = [...logs, ...metrics, ...events];

  if (allData.length >= totalCount) {
    return allData.slice(0, totalCount);
  }

  // If we need more entries, generate additional unique ones rather than repeating
  const result = [...allData];
  const deficit = totalCount - result.length;
  const extraLogs = generateAccessLogs(Math.ceil(deficit / 5000) + 1);
  for (const e of extraLogs) {
    // Re-stamp ID to guarantee uniqueness
    result.push({
      ...e,
      id: `mixed_extra_${result.length}`,
    } as unknown as MemoryEngram);
    if (result.length >= totalCount) break;
  }

  return result.slice(0, totalCount);
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

// ─── Benchmark Result Type ────────────────────────────────────────────────────

export interface BulkBenchmarkResult {
  dataType: string;
  daySimulation: number;
  engramCount: number;
  originalSizeKB: number;
  compressedSizeKB: number;
  compressionRatio: number;
  episodicRecall: number;
  executionTimeMs: number;
  techniquesApplied: string[];
  passed: boolean;
  metricsPerSecond: number;
}

// ─── Benchmark Executor ───────────────────────────────────────────────────────

async function runBulkBenchmark(
  dataType: string,
  engrams: MemoryEngram[],
  daySimulation: number
): Promise<BulkBenchmarkResult> {
  CompressionManager.resetForTest();

  // Estimate size without full stringify (avoid OOM on massive datasets)
  let estimatedSize = 0;
  for (const engram of engrams) {
    estimatedSize += JSON.stringify(engram).length;
    if (estimatedSize > 1000000) break; // Estimate after 1MB
  }
  const originalSize = Math.ceil(
    (estimatedSize / (engrams.length > 1000 ? 1000 : engrams.length)) *
      engrams.length
  );

  const startTime = performance.now();
  const manager = CompressionManager.getInstance(MODEL_95_FLAGS);
  const result = await manager.compress({
    engrams,
    sessionId: `model-95-bulk-${dataType}`,
    compressionTimestamp: Date.now(),
  });

  const executionTime = performance.now() - startTime;
  const compressedSize = result.metrics.compressedByteSize;
  const compressionRatio = result.metrics.compressionRatio;

  return {
    dataType,
    daySimulation,
    engramCount: engrams.length,
    originalSizeKB: Math.round(originalSize / 1024),
    compressedSizeKB: Math.round(compressedSize / 1024),
    compressionRatio,
    episodicRecall: result.metrics.episodicRecall,
    executionTimeMs: Math.round(executionTime),
    techniquesApplied: result.metrics.techniquesApplied,
    passed: compressionRatio >= 50 && result.metrics.episodicRecall >= 0.95,
    metricsPerSecond: Math.round((engrams.length / executionTime) * 1000),
  };
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function runBulkDataBenchmark(): Promise<{
  timestamp: string;
  model: string;
  results: BulkBenchmarkResult[];
  summary: string;
}> {
  console.log(`\n${'═'.repeat(80)}`);
  console.log('  MODEL_95_NESTED — Bulk Data Benchmark (30-60 Day Simulation)');
  console.log(
    '  Testing: Access Logs | Telemetry Metrics | User Events | Mixed Data'
  );
  console.log(`  Scale: ~350K total entries spanning 30-60 days`);
  console.log(`${'═'.repeat(80)}\n`);

  const results: BulkBenchmarkResult[] = [];

  // 1. ACCESS LOGS (30 DAYS)
  console.log('[1/4] Generating 30-day access logs (~150K entries)...');
  const logs = generateAccessLogs(30);
  console.log(`  ✓ ${logs.length.toLocaleString()} log entries generated`);
  console.log('  Running compression...');
  const logsResult = await runBulkBenchmark('ACCESS_LOGS_30D', logs, 30);
  results.push(logsResult);
  console.log(
    `  ✓ Result: ${logsResult.compressionRatio.toFixed(1)}% compression, ${logsResult.metricsPerSecond.toLocaleString()} entries/sec\n`
  );

  // 2. TELEMETRY METRICS (60 DAYS)
  console.log(
    '[2/4] Generating 60-day telemetry metrics (~120K data points)...'
  );
  const metrics = generateTelemetryMetrics(60);
  console.log(
    `  ✓ ${metrics.length.toLocaleString()} metric data points generated`
  );
  console.log('  Running compression...');
  const metricsResult = await runBulkBenchmark('TELEMETRY_60D', metrics, 60);
  results.push(metricsResult);
  console.log(
    `  ✓ Result: ${metricsResult.compressionRatio.toFixed(1)}% compression, ${metricsResult.metricsPerSecond.toLocaleString()} metrics/sec\n`
  );

  // 3. USER EVENTS (45 DAYS)
  console.log('[3/4] Generating 45-day user event stream (~67K events)...');
  const events = generateUserEventStream(45);
  console.log(`  ✓ ${events.length.toLocaleString()} user events generated`);
  console.log('  Running compression...');
  const eventsResult = await runBulkBenchmark('USER_EVENTS_45D', events, 45);
  results.push(eventsResult);
  console.log(
    `  ✓ Result: ${eventsResult.compressionRatio.toFixed(1)}% compression, ${eventsResult.metricsPerSecond.toLocaleString()} events/sec\n`
  );

  // 4. MIXED HETEROGENEOUS DATA (50K combined)
  console.log(
    '[4/4] Generating mixed heterogeneous bulk data (50K combined entries)...'
  );
  const mixed = generateMixedBulkData(50000);
  console.log(
    `  ✓ ${mixed.length.toLocaleString()} mixed data entries generated`
  );
  console.log('  Running compression...');
  const mixedResult = await runBulkBenchmark('MIXED_BULK', mixed, 45);
  results.push(mixedResult);
  console.log(
    `  ✓ Result: ${mixedResult.compressionRatio.toFixed(1)}% compression, ${mixedResult.metricsPerSecond.toLocaleString()} entries/sec\n`
  );

  // Summary
  const summary = `
MODEL_95_NESTED Bulk Data Benchmark — 30-60 Day Simulation
═══════════════════════════════════════════════════════════

30-Day Access Logs (~150K entries):
  • Original: ${logsResult.originalSizeKB} KB
  • Compressed: ${logsResult.compressedSizeKB} KB
  • Compression: ${logsResult.compressionRatio.toFixed(1)}%
  • Recall: ${(logsResult.episodicRecall * 100).toFixed(1)}%
  • Speed: ${logsResult.metricsPerSecond.toLocaleString()} entries/sec
  • Status: ${logsResult.passed ? '✓ PASS' : '✗ FAIL'}

60-Day Telemetry Metrics (~120K data points):
  • Original: ${metricsResult.originalSizeKB} KB
  • Compressed: ${metricsResult.compressedSizeKB} KB
  • Compression: ${metricsResult.compressionRatio.toFixed(1)}%
  • Recall: ${(metricsResult.episodicRecall * 100).toFixed(1)}%
  • Speed: ${metricsResult.metricsPerSecond.toLocaleString()} metrics/sec
  • Status: ${metricsResult.passed ? '✓ PASS' : '✗ FAIL'}

45-Day User Events (~67K events):
  • Original: ${eventsResult.originalSizeKB} KB
  • Compressed: ${eventsResult.compressedSizeKB} KB
  • Compression: ${eventsResult.compressionRatio.toFixed(1)}%
  • Recall: ${(eventsResult.episodicRecall * 100).toFixed(1)}%
  • Speed: ${eventsResult.metricsPerSecond.toLocaleString()} events/sec
  • Status: ${eventsResult.passed ? '✓ PASS' : '✗ FAIL'}

Mixed Heterogeneous Bulk Data (50K entries):
  • Original: ${mixedResult.originalSizeKB} KB
  • Compressed: ${mixedResult.compressedSizeKB} KB
  • Compression: ${mixedResult.compressionRatio.toFixed(1)}%
  • Recall: ${(mixedResult.episodicRecall * 100).toFixed(1)}%
  • Speed: ${mixedResult.metricsPerSecond.toLocaleString()} entries/sec
  • Status: ${mixedResult.passed ? '✓ PASS' : '✗ FAIL'}

Overall: ${results.every((r) => r.passed) ? '✓ ALL PASSED' : '✗ SOME FAILED'}
Average Compression: ${(results.reduce((a, r) => a + r.compressionRatio, 0) / results.length).toFixed(1)}%
Average Speed: ${Math.round(results.reduce((a, r) => a + r.metricsPerSecond, 0) / results.length).toLocaleString()} items/sec
`;

  return {
    timestamp: new Date().toISOString(),
    model: 'MODEL_95_NESTED',
    results,
    summary,
  };
}
