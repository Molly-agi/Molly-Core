#!/usr/bin/env npx tsx
/**
 * Run Baseline Evaluation Experiment
 *
 * Execute the MMLU-Pro baseline evaluation and generate reports.
 * 
 * Usage:
 *   npx tsx scripts/run-baseline-evaluation.ts [--samples N] [--timeout MS]
 */

import * as fs from 'fs';
import * as path from 'path';
import { createMMluProBaseline } from '../src/evaluation/experiments/baseline-mmlu';
import { loadMMLUProDataset, getMMLUStatistics } from '../src/evaluation/datasets/mmlu-pro';

async function main() {
  try {
    console.log('🧪 Molly AGI Baseline Evaluation - Phase 1');
    console.log('═'.repeat(60));

    // Parse command line arguments
    const args = process.argv.slice(2);
    const maxSamples = parseInt(args[args.indexOf('--samples') + 1] || '50', 10);
    const timeout = parseInt(args[args.indexOf('--timeout') + 1] || '300000', 10); // 5 min default

    console.log(`\n📊 Configuration:`);
    console.log(`  Max samples: ${maxSamples}`);
    console.log(`  Timeout: ${(timeout / 1000).toFixed(0)}s`);

    // Load dataset
    console.log(`\n📂 Loading MMLU-Pro dataset...`);
    const inputs = await loadMMLUProDataset();
    const stats = await getMMLUStatistics();

    console.log(`✓ Loaded ${stats.totalQuestions} total questions`);
    console.log(`  Subjects: ${stats.uniqueSubjects}`);
    console.log(`  Difficulty levels: ${stats.uniqueDifficulties}`);
    console.log(`  Distribution:`, JSON.stringify(stats.difficultyDistribution, null, 2));

    // Create and run experiment
    console.log(`\n🚀 Starting baseline experiment...`);
    const experiment = createMMluProBaseline({
      maxSamples,
      timeout,
    });

    const startTime = Date.now();
    await experiment.execute(inputs);
    const duration = Date.now() - startTime;

    // Get results
    const summary = experiment.getSummary();
    console.log(`\n✅ Experiment completed in ${(duration / 1000).toFixed(2)}s`);

    // Print summary
    console.log(`\n📈 Results Summary:`);
    console.log(`  Total Tests: ${summary.totalTests}`);
    console.log(`  Passed: ${summary.passed}`);
    console.log(`  Failed: ${summary.failed}`);
    console.log(`  Skipped: ${summary.skipped}`);
    console.log(`  Pass Rate: ${summary.passRate.toFixed(1)}%`);
    console.log(`  Average Score: ${summary.avgScore.toFixed(2)}/3.0`);

    // Print scorer-specific stats
    console.log(`\n📊 Scorer Statistics:`);
    for (const [scorerName, stats] of Object.entries(summary.scorerStats)) {
      console.log(`  ${scorerName}:`);
      console.log(`    Average: ${(stats.avg as number).toFixed(2)}`);
      console.log(`    Min: ${stats.min}`);
      console.log(`    Max: ${stats.max}`);
      console.log(`    Count: ${stats.count}`);
    }

    // Save results to file
    const reportPath = path.join(process.cwd(), 'BASELINE_EVALUATION_REPORT.json');
    const report = {
      timestamp: new Date().toISOString(),
      experimentName: summary.name,
      experimentDescription: summary.description,
      configuration: {
        maxSamples,
        timeout,
        totalDatasetSize: stats.totalQuestions,
      },
      results: summary,
      datasetStats: stats,
      rawResults: experiment.getResults(),
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n💾 Report saved to: ${reportPath}`);

    // Print next steps
    console.log(`\n📝 Next Steps:`);
    console.log(`  1. Review BASELINE_EVALUATION_REPORT.json for detailed results`);
    console.log(`  2. Integrate with Braintrust: npm run braintrust:push-results`);
    console.log(`  3. Compare with Phase 1 baseline once established`);
    console.log(`  4. Proceed to Phase 2: ARC-AGI and GPQA evaluation`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Evaluation failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);
