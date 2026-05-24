/**
 * Benchmark Runner
 * Orchestrates all benchmarking tests and generates comprehensive reports
 */

import {
  benchmarkProductionModels,
  formatBenchmarkResults,
} from './production-models';
import { runFullLoadTestSuite, formatLoadTestResults } from './load-test';
import { AblationTestEngine, type AblationSuite } from './ablation';
import { MollyLogger } from '../../logger';

export interface BenchmarkRunResult {
  timestamp: string;
  productionModels: Awaited<ReturnType<typeof benchmarkProductionModels>>;
  loadTests: Awaited<ReturnType<typeof runFullLoadTestSuite>>;
  ablationReport: AblationSuite;
}

/**
 * Execute comprehensive benchmark suite
 */
export async function runComprehensiveBenchmarks(): Promise<BenchmarkRunResult> {
  MollyLogger.info(
    'Starting comprehensive benchmark suite',
    'benchmark-runner'
  );

  const timestamp = new Date().toISOString();

  // Phase 1: Production Model Benchmarks
  MollyLogger.info(
    'Phase 1: Production model baseline tests',
    'benchmark-runner'
  );
  const productionModels = await benchmarkProductionModels(1000);

  // Phase 2: Load Testing
  MollyLogger.info(
    'Phase 2: Load testing under realistic scenarios',
    'benchmark-runner'
  );
  const loadTests = await runFullLoadTestSuite();

  // Phase 3: Ablation Analysis (optional)
  MollyLogger.info('Phase 3: Ablation analysis', 'benchmark-runner');
  const ablationEngine = new AblationTestEngine();
  const ablationReport = await ablationEngine.executeAblationRun(
    'This is a test corpus for ablation analysis. It contains varied content to measure compression technique impact.',
    ['NONE', 'VOCAB_DICT', 'TEMPORAL_DELTA', 'PERSONALITY_REF', 'TIME_DECAY']
  );

  MollyLogger.info(
    'Comprehensive benchmark suite complete',
    'benchmark-runner',
    {
      productionModelsPassed: productionModels.overallPass ? 'YES' : 'NO',
      loadTestsCount: loadTests.length,
      ablationReportCount: ablationReport.reports.length,
    }
  );

  return {
    timestamp,
    productionModels,
    loadTests,
    ablationReport,
  };
}

/**
 * Format complete benchmark report
 */
export function formatCompleteBenchmarkReport(
  result: BenchmarkRunResult
): string {
  const lines: string[] = [];

  lines.push('\n' + '═'.repeat(100));
  lines.push('COMPREHENSIVE BENCHMARK REPORT');
  lines.push('═'.repeat(100));
  lines.push(`Generated: ${result.timestamp}\n`);

  // Production Models Results
  lines.push(formatBenchmarkResults(result.productionModels));

  // Load Test Results
  lines.push(formatLoadTestResults(result.loadTests));

  // Summary
  lines.push('═'.repeat(100));
  lines.push('FINAL STATUS');
  lines.push('═'.repeat(100));

  const prodPass = result.productionModels.overallPass;
  const loadPass =
    result.loadTests.filter((r) => r.success).length ===
    result.loadTests.length;

  lines.push(`Production Models: ${prodPass ? '✅ PASS' : '❌ FAIL'}`);
  lines.push(`Load Testing: ${loadPass ? '✅ PASS' : '❌ FAIL'}`);
  lines.push(
    `Ablation Tests: ${result.ablationReport.reports.length} techniques analyzed`
  );

  lines.push(
    '\nREADINESS: ' +
      (prodPass && loadPass
        ? '🟢 READY FOR PRODUCTION'
        : '🔴 REQUIRES ATTENTION')
  );
  lines.push('═'.repeat(100) + '\n');

  return lines.join('\n');
}
