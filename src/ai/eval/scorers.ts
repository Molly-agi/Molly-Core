/**
 * LLM-as-a-Judge Scorer Framework
 *
 * Uses an LLM to evaluate outputs against rubrics when labeled ground truth is unavailable.
 * Supports multiple scoring scales: binary (pass/fail), 3-point, 5-point.
 */

import { Scorer, ScorerResult, LLMJudgeConfig } from './types';

/**
 * Multi-choice accuracy scorer (deterministic)
 */
export const multiChoiceScorer: Scorer = {
  name: 'multi_choice',
  description: 'Exact match for multiple choice questions',
  async score(output: unknown, expected: unknown): Promise<ScorerResult> {
    if (!output || expected === undefined) {
      return {
        score: 0,
        passed: false,
        reasoning: 'Missing output or expected value',
      };
    }

    // Extract answer index from output
    const outputIndex = extractAnswerIndex(output);
    const expectedObject =
      typeof expected === 'object' && expected !== null
        ? (expected as Record<string, unknown>)
        : null;
    const expectedIndex =
      typeof expectedObject?.answerIndex === 'number'
        ? expectedObject.answerIndex
        : typeof expected === 'number'
          ? expected
          : -1;

    const passed = outputIndex === expectedIndex;
    const score = passed ? 1 : 0;
    const answerText =
      typeof expectedObject?.answerText === 'string'
        ? expectedObject.answerText
        : `option ${expectedIndex + 1}`;

    return {
      score,
      passed,
      reasoning: passed
        ? `Correct answer: ${answerText}`
        : `Wrong answer. Got index ${outputIndex}, expected ${expectedIndex}`,
    };
  },
};

/**
 * Helper: Extract answer index from various output formats
 */
function extractAnswerIndex(output: unknown): number {
  if (typeof output === 'number') return output;

  if (typeof output === 'string') {
    // Check for pattern like "Answer: B" or "(C)"
    const match = output.match(/\(?([A-D])\)?/i);
    if (match) {
      return match[1].toUpperCase().charCodeAt(0) - 65; // A=0, B=1, C=2, D=3
    }

    // Check for explicit index
    const indexMatch = output.match(/index[:\s]+(\d+)/i);
    if (indexMatch) {
      return parseInt(indexMatch[1], 10);
    }
  }

  if (typeof output === 'object' && output !== null) {
    const outputRecord = output as Record<string, unknown>;
    if (typeof outputRecord.answerIndex === 'number')
      return outputRecord.answerIndex;
    if (typeof outputRecord.answer === 'number') return outputRecord.answer;
  }

  return -1; // Unknown format
}

/**
 * LLM-as-Judge Scorer (requires LLM integration)
 *
 * In a real implementation, this would call Molly or another LLM
 * For now, it provides the framework and mock implementation.
 */
export class LLMJudgeScorer implements Scorer {
  name: string;
  description: string;
  config: LLMJudgeConfig;

  constructor(config: LLMJudgeConfig) {
    this.config = config;
    this.name = `llm_judge_${config.scale}`;
    this.description = `LLM-based judge using ${config.scale} scale`;
  }

  async score(
    output: unknown,
    expected: unknown,
    _context?: unknown
  ): Promise<ScorerResult> {
    try {
      // In production: call Molly or Claude to evaluate
      // return await this.callLLMJudge(output, expected, context);

      // For now: mock evaluation based on rubric
      return this.mockEvaluate(output, expected);
    } catch (error) {
      return {
        score: 0,
        passed: false,
        reasoning: `Scorer error: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Mock evaluation based on rubric
   * Placeholder for LLM integration
   */
  private mockEvaluate(output: unknown, expected: unknown): ScorerResult {
    const criteria = this.config.criteria || [];
    let score = 0;

    // Check basic criteria
    if (output && typeof output === 'string' && output.length > 0) {
      score += 0.5; // Has response
    }

    if (expected && output === expected) {
      score += 0.5; // Exact match
    }

    // Normalize to scale
    const maxScore = this.getMaxScore();
    const normalizedScore = Math.round(score * maxScore);

    return {
      score: normalizedScore,
      passed: normalizedScore > 1,
      rubric: this.config.rubric,
      reasoning: `Evaluated against ${criteria.length} criteria using ${this.config.scale} scale`,
    };
  }

  private getMaxScore(): number {
    switch (this.config.scale) {
      case 'binary':
        return 1;
      case 'three-point':
        return 3;
      case 'five-point':
        return 5;
      default:
        return 1;
    }
  }

  /**
   * Placeholder for actual LLM integration
   */
  private async callLLMJudge(
    _output: unknown,
    _expected: unknown,
    _context?: unknown
  ): Promise<ScorerResult> {
    // TODO: Integrate with Molly or Claude
    // await callMollyAPI({
    //   task: 'evaluate',
    //   output,
    //   expected,
    //   rubric: this.config.rubric,
    //   scale: this.config.scale,
    // })

    throw new Error('LLM integration not yet implemented');
  }
}

/**
 * Common rubrics for evaluation
 */
export const COMMON_RUBRICS = {
  helpfulness: {
    name: 'helpfulness',
    description: 'Is the response helpful and relevant to the query?',
    scale: 'three-point' as const,
    criteria: [
      'Directly addresses the question',
      'Provides useful information',
      'Well-structured and clear',
    ],
  },
  accuracy: {
    name: 'accuracy',
    description: 'Is the response factually correct?',
    scale: 'three-point' as const,
    criteria: [
      'No factual errors',
      'Information is verifiable',
      'Properly sourced or explained',
    ],
  },
  tone: {
    name: 'tone',
    description: 'Is the tone appropriate for the context?',
    scale: 'binary' as const,
    criteria: ['Professional', 'Respectful'],
  },
  completeness: {
    name: 'completeness',
    description: 'Does the response cover all aspects of the query?',
    scale: 'three-point' as const,
    criteria: [
      'Covers main points',
      'Addresses edge cases',
      'Provides examples or evidence',
    ],
  },
};

const scorersExports = {
  multiChoiceScorer,
  LLMJudgeScorer,
  COMMON_RUBRICS,
  extractAnswerIndex,
};
export default scorersExports;
