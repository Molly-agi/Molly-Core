/**
 * @fileOverview Molly Benchmark Runner
 *
 * Runs all 5 Molly-specific benchmarks and produces a single
 * MollyBenchmarkReport with weighted overall score.
 *
 * Weights:
 *   Memory Advantage    30% — the core differentiator
 *   Termux Correctness  20% — practical daily use
 *   Tool Accuracy       20% — right tool = right answer
 *   Continuity Score    15% — Eric's #1 pain point
 *   Persona Stability   15% — she stays Molly
 *
 * "Measure what matters. Then improve it."
 */

import { MollyLogger } from '@/ai/logger';
import { getStorageRouter } from '@/lib/storage-router';
import {
  gradeScore,
  weightedAverage,
  type MollyBenchmarkReport,
} from './benchmark-types';

import runMemoryAdvantageBenchmark from './memory-advantage.benchmark';
import runTermuxCorrectnessBenchmark from './termux-correctness.benchmark';
import runToolAccuracyBenchmark from './tool-accuracy.benchmark';
import runContinuityBenchmark from './continuity.benchmark';
import runPersonaStabilityBenchmark from './persona-stability.benchmark';

// ============================================================================
// WEIGHTS
// ============================================================================

const WEIGHTS = {
  memory: 0.3,
  termux: 0.2,
  tools: 0.2,
  continuity: 0.15,
  persona: 0.15,
} as const;

// ============================================================================
// SAVE + LOAD
// ============================================================================

const STORAGE_KEY = 'molly-benchmarks/full-suite';

export async function saveReport(report: MollyBenchmarkReport): Promise<void> {
  const storage = await getStorageRouter();
  await storage.add(`${STORAGE_KEY}/${report.reportId}`, report);
}

export async function loadLatestReport(): Promise<MollyBenchmarkReport | null> {
  const storage = await getStorageRouter();
  const results = await storage.query(STORAGE_KEY, {});
  if (!results.length) return null;
  // Sort by date descending
  results.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  return results[0] as MollyBenchmarkReport;
}

// ============================================================================
// MAIN RUNNER
// ============================================================================

export interface RunOptions {
  skip?: Array<'memory' | 'termux' | 'tools' | 'continuity' | 'persona'>;
  quiet?: boolean;
}

export async function runAllBenchmarks(
  options: RunOptions = {}
): Promise<MollyBenchmarkReport> {
  const start = Date.now();
  const { skip = [], quiet = false } = options;

  const log = (msg: string) => {
    if (!quiet) console.log(msg);
  };

  log('\n╔═══════════════════════════════════════════════╗');
  log('║       MOLLY BENCHMARK SUITE — FULL RUN        ║');
  log('╚═══════════════════════════════════════════════╝\n');

  MollyLogger.info('Starting full benchmark suite', 'benchmark', { skip });

  // Run all benchmarks (skipping any requested)
  // Sequential to avoid OOM in codespace

  log('📊 [1/5] Memory Advantage (30% weight)...');
  const memoryResult = skip.includes('memory')
    ? null
    : await runMemoryAdvantageBenchmark();
  if (memoryResult)
    log(
      `   Score: ${memoryResult.score}/100 (${gradeScore(memoryResult.score)})\n`
    );

  log('⌨️  [2/5] Termux Correctness (20% weight)...');
  const termuxResult = skip.includes('termux')
    ? null
    : await runTermuxCorrectnessBenchmark();
  if (termuxResult)
    log(
      `   Score: ${termuxResult.score}/100 (${gradeScore(termuxResult.score)})\n`
    );

  log('🔧 [3/5] Tool Accuracy (20% weight)...');
  const toolsResult = skip.includes('tools')
    ? null
    : await runToolAccuracyBenchmark();
  if (toolsResult)
    log(
      `   Score: ${toolsResult.score}/100 (${gradeScore(toolsResult.score)})\n`
    );

  log('🔄 [4/5] Context Continuity (15% weight)...');
  const continuityResult = skip.includes('continuity')
    ? null
    : await runContinuityBenchmark();
  if (continuityResult)
    log(
      `   Score: ${continuityResult.score}/100 (${gradeScore(continuityResult.score)})\n`
    );

  log('🎭 [5/5] Persona Stability (15% weight)...');
  const personaResult = skip.includes('persona')
    ? null
    : await runPersonaStabilityBenchmark();
  if (personaResult)
    log(
      `   Score: ${personaResult.score}/100 (${gradeScore(personaResult.score)})\n`
    );

  // Compute weighted overall
  const scorePairs: Array<[number, number]> = [];
  if (memoryResult) scorePairs.push([memoryResult.score, WEIGHTS.memory]);
  if (termuxResult) scorePairs.push([termuxResult.score, WEIGHTS.termux]);
  if (toolsResult) scorePairs.push([toolsResult.score, WEIGHTS.tools]);
  if (continuityResult)
    scorePairs.push([continuityResult.score, WEIGHTS.continuity]);
  if (personaResult) scorePairs.push([personaResult.score, WEIGHTS.persona]);

  const overallScore =
    scorePairs.length > 0 ? Math.round(weightedAverage(scorePairs)) : 0;

  const reportId = `benchmark-${Date.now()}`;

  const report: MollyBenchmarkReport = {
    reportId,
    timestamp: new Date().toISOString(),
    overallScore,
    grade: gradeScore(overallScore),
    benchmarks: {
      ...(memoryResult ? { memoryAdvantage: memoryResult } : {}),
      ...(termuxResult ? { termuxCorrectness: termuxResult } : {}),
      ...(toolsResult ? { toolAccuracy: toolsResult } : {}),
      ...(continuityResult ? { continuityScore: continuityResult } : {}),
      ...(personaResult ? { personaStability: personaResult } : {}),
    },
    elapsedMs: Date.now() - start,
  };

  // Save to storage
  try {
    await saveReport(report);
    MollyLogger.info('Benchmark report saved', 'benchmark', { reportId });
  } catch (err) {
    MollyLogger.warn('Could not save benchmark report', 'benchmark', { err });
  }

  // Print full report
  log('\n╔═══════════════════════════════════════════════╗');
  log('║              FINAL REPORT                     ║');
  log('╚═══════════════════════════════════════════════╝\n');
  log(`Overall Score: ${overallScore}/100  Grade: ${gradeScore(overallScore)}`);
  log(`Generated:     ${new Date().toLocaleString()}`);
  log(`Duration:      ${(report.elapsedMs / 1000 / 60).toFixed(1)} minutes\n`);
  log('Breakdown:');
  if (memoryResult)
    log(
      `  Memory Advantage    (30%): ${memoryResult.score}/100 ${gradeScore(memoryResult.score)}`
    );
  if (termuxResult)
    log(
      `  Termux Correctness  (20%): ${termuxResult.score}/100 ${gradeScore(termuxResult.score)}`
    );
  if (toolsResult)
    log(
      `  Tool Accuracy       (20%): ${toolsResult.score}/100 ${gradeScore(toolsResult.score)}`
    );
  if (continuityResult)
    log(
      `  Context Continuity  (15%): ${continuityResult.score}/100 ${gradeScore(continuityResult.score)}`
    );
  if (personaResult)
    log(
      `  Persona Stability   (15%): ${personaResult.score}/100 ${gradeScore(personaResult.score)}`
    );

  log('\nSummaries:');
  if (memoryResult) log(`  📊 ${memoryResult.summary}`);
  if (termuxResult) log(`  ⌨️  ${termuxResult.summary}`);
  if (toolsResult) log(`  🔧 ${toolsResult.summary}`);
  if (continuityResult) log(`  🔄 ${continuityResult.summary}`);
  if (personaResult) log(`  🎭 ${personaResult.summary}`);

  log(`\nReport ID: ${reportId}`);
  log('');

  MollyLogger.info('Full benchmark suite complete', 'benchmark', {
    overallScore,
    grade: gradeScore(overallScore),
    elapsedMs: report.elapsedMs,
  });

  return report;
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  const skip: RunOptions['skip'] = [];
  if (args.includes('--skip-memory')) skip.push('memory');
  if (args.includes('--skip-termux')) skip.push('termux');
  if (args.includes('--skip-tools')) skip.push('tools');
  if (args.includes('--skip-continuity')) skip.push('continuity');
  if (args.includes('--skip-persona')) skip.push('persona');

  try {
    await runAllBenchmarks({ skip });
  } catch (error) {
    console.error('❌ Benchmark suite failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export default runAllBenchmarks;
