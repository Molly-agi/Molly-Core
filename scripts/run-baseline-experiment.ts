/**
 * Baseline Experiment Runner
 *
 * Orchestrates Phase 1 evaluation: loads MMLU-Pro, runs Molly against samples,
 * scores with multi-choice scorer, and exports results to Braintrust.
 *
 * Run: npx tsx scripts/run-baseline-experiment.ts
 */

import { loadMMLUProDataset, sampleExamples, getMMLUProStats } from '../src/ai/eval/mmlu-pro-loader';
import { multiChoiceScorer } from '../src/ai/eval/scorers';
import {
  BASELINE_CONFIG,
  BaselineExperiment,
  BaselineResults,
} from '../src/ai/eval/baseline-experiment';
import { EvaluationResult, MMluProExample } from '../src/ai/eval/types';

/**
 * Mock Molly response for Phase 1 (testing framework)
 * In production: call actual Molly flow
 */
async function mockMollyResponse(
  example: MMluProExample
): Promise<any> {
  // Simulate Molly thinking for a moment
  await new Promise((r) => setTimeout(r, 100));

  // For testing: randomly pick an answer
  // In production: call src/app/actions/ai-flows.ts
  const randomIndex = Math.floor(
    Math.random() * example.input.choices.length
  );

  return {
    answerIndex: randomIndex,
    answerText: example.input.choices[randomIndex],
    confidence: Math.random(),
    reasoning: 'Mock response (Phase 1)',
  };
}

/**
 * Run baseline experiment
 */
async function runBaseline() {
  console.log('🚀 Launching Molly AGI Baseline Experiment (Phase 1)');
  console.log('=' .repeat(60) + '\n');

  try {
    // Step 1: Load dataset
    console.log('📥 Loading MMLU-Pro dataset...');
    const allExamples = await loadMMLUProDataset();
    const stats = await getMMLUProStats(allExamples);
    console.log(`✓ Loaded ${stats.totalExamples} examples across ${stats.subjectsCount} subjects`);
    console.log(`  Subject breakdown:`, stats.subjectBreakdown);
    console.log();

    // Step 2: Sample examples
    console.log(
      `📊 Sampling ${BASELINE_CONFIG.samplesPerBenchmark} examples...`
    );
    const sampleSet = sampleExamples(
      allExamples,
      BASELINE_CONFIG.samplesPerBenchmark
    );
    console.log(`✓ Sample prepared\n`);

    // Step 3: Initialize results
    const results = new BaselineResults(BASELINE_CONFIG);

    // Step 4: Run evaluation on samples
    console.log(
      `🧪 Running Molly against ${sampleSet.length} examples...`
    );
    console.log('(Timing varies by model - typically 1-5s per example)\n');

    let processed = 0;
    const startTime = Date.now();

    for (const example of sampleSet) {
      try {
        const exampleStart = Date.now();

        // Call Molly (or mock)
        const mollyOutput = await mockMollyResponse(example);

        // Score the response
        const scorerResult = await multiChoiceScorer.score(
          mollyOutput,
          example.expectedOutput
        );

        const duration = Date.now() - exampleStart;

        // Record result
        const result: EvaluationResult = {
          exampleId: example.id,
          benchmark: 'mmlu-pro',
          modelOutput: mollyOutput,
          expectedOutput: example.expectedOutput,
          scorerResults: {
            multi_choice: scorerResult,
          },
          duration,
          timestamp: new Date().toISOString(),
        };

        results.addResult(result);

        processed++;
        const progress = ((processed / sampleSet.length) * 100).toFixed(0);
        process.stdout.write(
          `\r  Progress: ${progress}% (${processed}/${sampleSet.length})`
        );
      } catch (error) {
        console.error(
          `\n❌ Error evaluating example ${example.id}:`,
          error
        );
      }
    }

    const totalTime = (Date.now() - startTime) / 1000;
    console.log(`\n\n✓ Evaluation complete (${totalTime.toFixed(1)}s)\n`);

    // Step 5: Calculate metrics
    results.endTime = new Date();
    const summary = results.getSummary();

    console.log('📈 Results:');
    console.log(
      `  Total: ${summary.metrics.totalResults} examples`
    );
    console.log(
      `  Accuracy: ${(summary.metrics.avgAccuracy * 100).toFixed(1)}%`
    );
    console.log(
      `  Pass Rate: ${(summary.metrics.passRate * 100).toFixed(1)}%`
    );
    console.log(
      `  Avg Duration: ${summary.metrics.avgDurationMs.toFixed(0)}ms per example`
    );
    console.log();

    // Step 6: Export for Braintrust
    console.log('💾 Preparing export for Braintrust...');
    const braintrustExport = results.exportForBraintrust();
    console.log(`✓ Export ready (${JSON.stringify(braintrustExport).length} bytes)\n`);

    // Step 7: Save results locally
    console.log('💾 Saving results to disk...');
    const fs = await import('fs');
    const resultsPath = `./baseline-results-${results.experimentId}.json`;
    fs.writeFileSync(resultsPath, JSON.stringify(summary, null, 2));
    console.log(`✓ Saved to: ${resultsPath}\n`);

    // Final summary
    console.log('=' .repeat(60));
    console.log('✅ Phase 1 Baseline Complete');
    console.log('=' .repeat(60));
    console.log('\n📋 Next Steps:');
    console.log('1. Review results above');
    console.log(
      '2. Push results to Braintrust: npx tsx scripts/push-to-braintrust.ts'
    );
    console.log('3. Phase 2: Add ARC-AGI and GPQA benchmarks');
    console.log('4. Phase 3: Add SWE-bench for software engineering eval\n');

    return summary;
  } catch (error) {
    console.error('❌ Baseline experiment failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runBaseline().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { runBaseline };
