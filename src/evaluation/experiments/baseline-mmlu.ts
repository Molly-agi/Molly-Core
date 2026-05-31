/**
 * Baseline Experiment Template
 *
 * MMLU-Pro evaluation experiment for Phase 1 benchmarking.
 * Serves as foundation for all subsequent evaluation runs.
 */

import type { BenchmarkInput, BenchmarkOutput } from '../braintrust/types';
import { scoreResponse } from '../scorers/llm-judge';

export interface ExperimentConfig {
  name: string;
  description: string;
  datasetId: string;
  maxSamples?: number;
  timeout?: number;
}

export interface ExperimentRun {
  config: ExperimentConfig;
  startTime: Date;
  endTime?: Date;
  results: {
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    avgScore: number;
    scores: Map<string, number[]>; // scorer name -> array of scores
  };
}

/**
 * Base experiment class
 */
export abstract class BaselineExperiment {
  protected config: ExperimentConfig;
  protected run: ExperimentRun;

  constructor(config: ExperimentConfig) {
    this.config = config;
    this.run = {
      config,
      startTime: new Date(),
      results: {
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        avgScore: 0,
        scores: new Map(),
      },
    };
  }

  /**
   * Execute experiment
   */
  abstract execute(inputs: BenchmarkInput[]): Promise<void>;

  /**
   * Get experiment results
   */
  getResults(): ExperimentRun {
    return this.run;
  }

  /**
   * Generate summary report
   */
  getSummary() {
    const duration = this.run.endTime
      ? (this.run.endTime.getTime() - this.run.startTime.getTime()) / 1000
      : 0;

    return {
      name: this.config.name,
      description: this.config.description,
      totalTests: this.run.results.totalTests,
      passed: this.run.results.passed,
      failed: this.run.results.failed,
      skipped: this.run.results.skipped,
      passRate:
        this.run.results.totalTests > 0
          ? (this.run.results.passed / this.run.results.totalTests) * 100
          : 0,
      avgScore: this.run.results.avgScore,
      duration: `${duration.toFixed(2)}s`,
      scorerStats: this.getScoreStats(),
    };
  }

  /**
   * Calculate statistics for each scorer
   */
  protected getScoreStats() {
    const stats: Record<string, Record<string, number>> = {};

    for (const [scorerName, scores] of this.run.results.scores) {
      if (scores.length > 0) {
        stats[scorerName] = {
          avg: scores.reduce((a, b) => a + b, 0) / scores.length,
          min: Math.min(...scores),
          max: Math.max(...scores),
          count: scores.length,
        };
      }
    }

    return stats;
  }
}

/**
 * MMLU-Pro baseline experiment
 */
export class MMluProBaselineExperiment extends BaselineExperiment {
  /**
   * Execute MMLU-Pro baseline evaluation
   */
  async execute(inputs: BenchmarkInput[]): Promise<void> {
    const maxSamples = this.config.maxSamples || inputs.length;
    const testInputs = inputs.slice(0, maxSamples);

    console.log(
      `[${this.config.name}] Starting with ${testInputs.length} samples`
    );

    for (const input of testInputs) {
      this.run.results.totalTests++;

      try {
        // Simulate Molly's response (in real implementation, call Molly's API)
        const output = await this.getMollyResponse(input);

        // Score the response
        const scores = await scoreResponse(
          input,
          output,
          input.metadata?.correctAnswer
        );

        // Record results
        let passCount = 0;
        let totalScore = 0;

        for (const [scorerName, scoreResult] of scores) {
          if (!this.run.results.scores.has(scorerName)) {
            this.run.results.scores.set(scorerName, []);
          }

          this.run.results.scores.get(scorerName)!.push(scoreResult.score);
          totalScore += scoreResult.score;

          if (scoreResult.passed) {
            passCount++;
          }
        }

        if (passCount > 0) {
          this.run.results.passed++;
        } else {
          this.run.results.failed++;
        }

        // Calculate average score for this item
        const avgScore = totalScore / scores.size;
        if (this.run.results.totalTests % 10 === 0) {
          console.log(
            `  Progress: ${this.run.results.totalTests}/${testInputs.length} - Avg Score: ${avgScore.toFixed(2)}`
          );
        }
      } catch (error) {
        console.error(`Error processing input ${input.id}:`, error);
        this.run.results.skipped++;
      }

      // Timeout check
      if (
        this.config.timeout &&
        new Date().getTime() - this.run.startTime.getTime() >
          this.config.timeout
      ) {
        console.warn(
          `Experiment timeout reached. Stopping at ${this.run.results.totalTests} tests.`
        );
        break;
      }
    }

    this.run.endTime = new Date();

    // Calculate aggregate score
    if (this.run.results.scores.size > 0) {
      let totalAvg = 0;
      for (const scores of this.run.results.scores.values()) {
        totalAvg += scores.reduce((a, b) => a + b, 0) / scores.length;
      }
      this.run.results.avgScore = totalAvg / this.run.results.scores.size;
    }

    console.log(
      `[${this.config.name}] Completed: ${this.run.results.passed} passed, ${this.run.results.failed} failed, ${this.run.results.skipped} skipped`
    );
  }

  /**
   * Get Molly's response (placeholder - will be replaced with real API call)
   */
  protected async getMollyResponse(
    input: BenchmarkInput
  ): Promise<BenchmarkOutput> {
    // TODO: Replace with real Molly API call
    // For now, simulate a response based on the question

    // Mock response - select a random option
    const selectedIndex = Math.floor(
      Math.random() * (input.options?.length || 1)
    );
    const selectedOption = input.options?.[selectedIndex] || 'Unknown';

    return {
      answer: selectedOption,
      reasoning: `Selected option ${String.fromCharCode(65 + selectedIndex)} based on analysis of ${input.question.substring(0, 30)}...`,
      confidence: 0.5 + Math.random() * 0.5, // Random between 0.5-1.0
      metadata: {
        model: 'molly-baseline',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

/**
 * Create baseline experiment
 */
export function createMMluProBaseline(
  overrides?: Partial<ExperimentConfig>
): BaselineExperiment {
  const config: ExperimentConfig = {
    name: 'MMLU-Pro Baseline',
    description: 'Molly AGI baseline evaluation on MMLU-Pro dataset',
    datasetId: 'mmlu-pro-base',
    maxSamples: 50, // Start with 50 samples for Phase 1
    timeout: 5 * 60 * 1000, // 5 minute timeout
    ...overrides,
  };

  return new MMluProBaselineExperiment(config);
}
