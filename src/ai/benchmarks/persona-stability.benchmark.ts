/**
 * @fileOverview Persona Stability Benchmark
 *
 * Wraps the existing persona-identity eval suite and formats it as
 * a benchmark for the combined report.
 *
 * The persona eval already does the heavy lifting. This just:
 *   1. Runs the eval
 *   2. Converts drift score → stability score (inverted, 0-100)
 *   3. Compares against saved baseline if one exists
 *   4. Reports in benchmark format
 *
 * Stability Score = (1 - driftScore) × 100
 * Baseline: 43.6% drift = 56.4% stability — this is Molly's current fingerprint.
 */

import { MollyLogger } from '@/ai/logger';
import {
  runPersonaIdentityEval,
  type PersonaEvalResult,
} from '@/ai/evals/persona-identity.braintrust';
import {
  loadPersonaBaseline,
  analyzePersonaDrift,
} from '@/ai/evals/persona-baseline';
import {
  gradeScore,
  type BenchmarkResult,
  type BenchmarkCaseResult,
} from './benchmark-types';

export interface PersonaStabilityBenchmarkResult extends BenchmarkResult {
  driftScore: number;
  baselineComparison?: {
    baselineDrift: number;
    currentDrift: number;
    delta: number;
    improving: boolean;
  };
  evalResult: PersonaEvalResult;
}

export async function runPersonaStabilityBenchmark(): Promise<PersonaStabilityBenchmarkResult> {
  const start = Date.now();

  MollyLogger.info('Starting Persona Stability Benchmark', 'benchmark');

  const evalResult = await runPersonaIdentityEval();

  // Stability = inverse of drift
  const stabilityScore = Math.round((1 - evalResult.overallDriftScore) * 100);
  const driftScore = Math.round(evalResult.overallDriftScore * 100);

  // Compare against saved baseline
  let baselineComparison: PersonaStabilityBenchmarkResult['baselineComparison'];
  try {
    const baseline = await loadPersonaBaseline();
    if (baseline) {
      const analysis = analyzePersonaDrift(baseline, evalResult);
      baselineComparison = {
        baselineDrift: Math.round(baseline.overallDriftScore * 100),
        currentDrift: driftScore,
        delta: Math.round(
          (evalResult.overallDriftScore - baseline.overallDriftScore) * 100
        ),
        improving: evalResult.overallDriftScore < baseline.overallDriftScore,
      };
      MollyLogger.info('Baseline comparison complete', 'benchmark', {
        recommendation: analysis.recommendation,
      });
    }
  } catch {
    // No baseline yet — this is the first run
  }

  const details: BenchmarkCaseResult[] = evalResult.responses.map((r) => ({
    caseId: r.promptId,
    score: Math.round((1 - (r.driftScore || 0)) * 100),
    passed: (r.driftScore || 0) < 0.5,
    notes: `${r.matchedThemes.length}/${r.expectedThemes.length} themes | drift: ${Math.round((r.driftScore || 0) * 100)}%`,
  }));

  let summary = `Stability: ${stabilityScore}/100 (${gradeScore(stabilityScore)}) | Drift: ${driftScore}%`;
  if (baselineComparison) {
    const direction = baselineComparison.improving
      ? '↓ improved'
      : '↑ regressed';
    summary += ` | vs baseline: ${direction} by ${Math.abs(baselineComparison.delta)}pts`;
  }

  return {
    benchmarkName: 'Persona Stability',
    version: '1.0',
    timestamp: new Date().toISOString(),
    score: stabilityScore,
    details,
    summary,
    elapsedMs: Date.now() - start,
    driftScore,
    baselineComparison,
    evalResult,
  };
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  try {
    console.log('\n🎭 PERSONA STABILITY BENCHMARK\n');

    const result = await runPersonaStabilityBenchmark();

    console.log(
      `📊 Stability Score: ${result.score}/100 (${gradeScore(result.score)})`
    );
    console.log(`📊 Drift Score:     ${result.driftScore}%`);

    if (result.baselineComparison) {
      const { baselineDrift, currentDrift, delta, improving } =
        result.baselineComparison;
      const direction = improving ? '📈 improved' : '📉 regressed';
      console.log(
        `📊 vs Baseline:     ${baselineDrift}% → ${currentDrift}% (${direction} by ${Math.abs(delta)}pts)`
      );
    }

    console.log(`\n${result.summary}\n`);

    console.log('📋 Prompt Results:');
    result.details.forEach((d) => {
      const status = d.passed ? '✅' : '⚠️';
      console.log(`   ${status} ${d.caseId}: ${d.score}/100 — ${d.notes}`);
    });

    console.log(`\nTotal time: ${(result.elapsedMs / 1000).toFixed(1)}s`);
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export default runPersonaStabilityBenchmark;
