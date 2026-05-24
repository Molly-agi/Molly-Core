/**
 * Baseline Experiment Template (Phase 1)
 *
 * Configures and runs the initial evaluation on Molly
 * Focus: MMLU-Pro with multi-choice and LLM-as-judge scorers
 *
 * Usage: npx tsx scripts/run-baseline-experiment.ts
 */

import { BaselineExperimentConfig, EvaluationResult } from './types';

/**
 * Baseline experiment configuration (Phase 1)
 */
export const BASELINE_CONFIG: BaselineExperimentConfig = {
  name: 'molly-baseline-v1',
  description:
    'Phase 1 baseline evaluation: Molly on MMLU-Pro (500 samples)',

  // Start with MMLU-Pro only
  benchmarks: ['mmlu-pro'],

  // Dataset configurations
  datasets: [
    {
      name: 'mmlu-pro-500-sample',
      description: 'MMLU-Pro: 500-sample subset across 57 subjects',
      version: '1.0',
      benchmarkType: 'mmlu-pro',
      exampleCount: 500,
      source: './mmlu_sample_500.json',
    },
  ],

  // Use deterministic scorer for Phase 1
  scorers: ['multi_choice'],

  // Start with smaller sample
  samplesPerBenchmark: 50,

  // Reasonable timeout for 50 samples
  timeout: 600, // 10 minutes
};

/**
 * Phase 1 Extended config (for when we add more scorers)
 */
export const BASELINE_WITH_LLM_JUDGE: BaselineExperimentConfig = {
  ...BASELINE_CONFIG,
  name: 'molly-baseline-with-judge',
  description:
    'Phase 1 extended: MMLU-Pro with LLM-as-Judge scorer',
  scorers: ['multi_choice', 'llm_judge'],
  samplesPerBenchmark: 100, // Larger sample with judge
  timeout: 1200, // 20 minutes
};

/**
 * Experiment result aggregator
 */
export class BaselineResults {
  experimentId: string;
  config: BaselineExperimentConfig;
  results: EvaluationResult[] = [];
  startTime: Date = new Date();
  endTime?: Date;
  error?: string;

  constructor(config: BaselineExperimentConfig) {
    this.config = config;
    this.experimentId = `baseline-${Date.now()}`;
  }

  /**
   * Add individual result
   */
  addResult(result: EvaluationResult) {
    this.results.push(result);
  }

  /**
   * Calculate aggregate metrics
   */
  getMetrics() {
    const totalResults = this.results.length;
    if (totalResults === 0) {
      return {
        totalResults: 0,
        avgAccuracy: 0,
        passRate: 0,
        totalDuration: 0,
      };
    }

    const passedResults = this.results.filter((r) => {
      const multiChoiceResult = r.scorerResults['multi_choice'];
      return multiChoiceResult?.passed ?? false;
    });

    const totalDuration = this.results.reduce(
      (sum, r) => sum + r.duration,
      0
    );

    return {
      totalResults,
      avgAccuracy: passedResults.length / totalResults,
      passRate: passedResults.length / totalResults,
      totalDuration,
      avgDurationMs: totalDuration / totalResults,
    };
  }

  /**
   * Generate summary report
   */
  getSummary() {
    const metrics = this.getMetrics();
    const duration = this.endTime
      ? (this.endTime.getTime() - this.startTime.getTime()) / 1000
      : 0;

    return {
      experimentId: this.experimentId,
      config: this.config,
      metrics,
      duration,
      timestamp: {
        start: this.startTime.toISOString(),
        end: this.endTime?.toISOString(),
      },
      error: this.error,
    };
  }

  /**
   * Export results to JSON for Braintrust
   */
  exportForBraintrust() {
    return {
      experimentId: this.experimentId,
      experimentName: this.config.name,
      benchmark: this.config.benchmarks[0],
      results: this.results.map((r) => ({
        exampleId: r.exampleId,
        output: r.modelOutput,
        expected: r.expectedOutput,
        scores: r.scorerResults,
        passed: Object.values(r.scorerResults).every(
          (s) => s.passed
        ),
        duration: r.duration,
      })),
      summary: this.getSummary(),
    };
  }
}

/**
 * Baseline experiment lifecycle
 */
export class BaselineExperiment {
  config: BaselineExperimentConfig;
  results: BaselineResults;

  constructor(config: BaselineExperimentConfig) {
    this.config = config;
    this.results = new BaselineResults(config);
  }

  /**
   * Lifecycle: Setup
   */
  async setup() {
    console.log(
      `\n📊 Baseline Experiment: ${this.config.name}`
    );
    console.log(`Description: ${this.config.description}`);
    console.log(
      `Benchmarks: ${this.config.benchmarks.join(', ')}`
    );
    console.log(
      `Scorers: ${this.config.scorers.join(', ')}`
    );
    console.log(
      `Samples: ${this.config.samplesPerBenchmark} per benchmark\n`
    );
  }

  /**
   * Lifecycle: Run
   */
  async run() {
    // Will be implemented by subclasses or specialized runners
    console.log('Running baseline experiment...');
  }

  /**
   * Lifecycle: Teardown
   */
  async teardown() {
    this.results.endTime = new Date();

    const summary = this.results.getSummary();
    console.log('\n✅ Experiment Complete');
    console.log(
      `Total Results: ${summary.metrics.totalResults}`
    );
    console.log(
      `Accuracy: ${(summary.metrics.avgAccuracy * 100).toFixed(1)}%`
    );
    console.log(`Duration: ${summary.duration.toFixed(1)}s`);
  }

  /**
   * Full lifecycle
   */
  async execute() {
    try {
      await this.setup();
      await this.run();
      await this.teardown();
      return this.results.getSummary();
    } catch (error) {
      this.results.error = (error as Error).message;
      console.error('❌ Experiment failed:', error);
      throw error;
    }
  }
}

export default {
  BASELINE_CONFIG,
  BASELINE_WITH_LLM_JUDGE,
  BaselineResults,
  BaselineExperiment,
};
