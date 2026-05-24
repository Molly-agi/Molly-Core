/**
 * Evaluation System Type Definitions
 *
 * Defines interfaces for benchmarks, scorers, and evaluation results.
 */

/**
 * A single evaluation task/example
 */
export interface EvaluationExample {
  id: string;
  benchmark: BenchmarkType;
  input: Record<string, any>;
  expectedOutput?: any;
  metadata?: Record<string, any>;
}

/**
 * Supported benchmark types
 */
export type BenchmarkType =
  | 'mmlu-pro'
  | 'arc-agi'
  | 'gpqa'
  | 'swe-bench'
  | 'humaneval'
  | 'livecodebench';

/**
 * MMLU-Pro example: multiple choice question
 */
export interface MMluProExample extends EvaluationExample {
  benchmark: 'mmlu-pro';
  input: {
    question: string;
    choices: string[]; // A, B, C, D options
    subject: string; // e.g., "mathematics", "biology"
  };
  expectedOutput: {
    answerIndex: number; // 0-3 (A-D)
    answerText: string;
  };
}

/**
 * Scorer interface: evaluates model output against expected
 */
export interface Scorer {
  name: string;
  description: string;
  score(output: any, expected: any, context?: any): Promise<ScorerResult>;
}

/**
 * Result from a scorer
 */
export interface ScorerResult {
  score: number; // 0-1 or 0-3 depending on rubric
  passed: boolean;
  reasoning?: string;
  rubric?: string;
}

/**
 * LLM-as-Judge scorer configuration
 */
export interface LLMJudgeConfig {
  rubric: string; // Evaluation rubric
  scale: 'binary' | 'three-point' | 'five-point'; // Score scale
  criteria: string[]; // Specific criteria to evaluate
}

/**
 * Evaluation result for a single example
 */
export interface EvaluationResult {
  exampleId: string;
  benchmark: BenchmarkType;
  modelOutput: any;
  expectedOutput: any;
  scorerResults: Record<string, ScorerResult>;
  duration: number; // milliseconds
  timestamp: string;
  error?: string;
}

/**
 * Aggregated experiment results
 */
export interface ExperimentResults {
  experimentId: string;
  name: string;
  benchmark: BenchmarkType;
  totalExamples: number;
  passedExamples: number;
  accuracy: number; // 0-1
  averageScore: number;
  results: EvaluationResult[];
  startTime: string;
  endTime: string;
  duration: number; // seconds
}

/**
 * Comparison between two models
 */
export interface ModelComparison {
  model1: {
    name: string;
    results: ExperimentResults;
  };
  model2: {
    name: string;
    results: ExperimentResults;
  };
  benchmark: BenchmarkType;
  winner?: 'model1' | 'model2' | 'tie';
  significanceDifference: number; // percentage points
  timestamp: string;
}

/**
 * Dataset configuration
 */
export interface DatasetConfig {
  name: string;
  description: string;
  version: string;
  benchmarkType: BenchmarkType;
  exampleCount: number;
  source?: string;
}

/**
 * Baseline experiment configuration
 */
export interface BaselineExperimentConfig {
  name: string;
  description: string;
  benchmarks: BenchmarkType[];
  datasets: DatasetConfig[];
  scorers: string[];
  samplesPerBenchmark: number;
  timeout: number; // seconds
}

export default {
  EvaluationExample,
  BenchmarkType,
  MMluProExample,
  Scorer,
  ScorerResult,
  LLMJudgeConfig,
  EvaluationResult,
  ExperimentResults,
  ModelComparison,
  DatasetConfig,
  BaselineExperimentConfig,
};
