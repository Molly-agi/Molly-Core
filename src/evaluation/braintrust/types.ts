/**
 * Braintrust Evaluation Framework Types
 *
 * Core interfaces for running AGI benchmarks against Molly
 * using Braintrust's evaluation SDK.
 */

export interface BraintrustConfig {
  apiKey: string;
  projectName: string;
  datasetName: string;
  experimentName: string;
  description?: string;
}

export interface BenchmarkInput {
  id: string;
  question: string;
  context?: string;
  options?: string[];
  difficulty?: 'easy' | 'medium' | 'hard' | 'expert';
  category?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface BenchmarkOutput {
  answer: string;
  reasoning?: string;
  confidence?: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface ScorerResult {
  name: string;
  score: number;
  details?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface ExperimentResult {
  datasetId: string;
  experimentId: string;
  timestamp: string;
  results: {
    totalTests: number;
    passed: number;
    failed: number;
    avgScore: number;
    scorerResults: ScorerResult[];
  };
}

/**
 * MMLU-Pro specific types
 */
export interface MMLUProEntry {
  question: string;
  options: string[];
  correctAnswer: string;
  subject: string;
  level: string;
}

/**
 * LLM-as-a-Judge scorer rubric
 */
export enum JudgeScale {
  FAIL = 0,
  PARTIAL = 1,
  GOOD = 2,
  EXCELLENT = 3,
}

export interface JudgeScoreRequest {
  input: BenchmarkInput;
  output: BenchmarkOutput;
  groundTruth?: string;
  rubric: string;
}

export interface JudgeScoreResponse {
  score: JudgeScale;
  reasoning: string;
  passed: boolean;
}
