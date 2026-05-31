/**
 * LLM-as-a-Judge Scorer Framework
 *
 * Evaluate Molly's responses using structured rubrics and LLM-based judgment.
 * Provides consistent scoring without ground truth labels.
 */

import type {
  JudgeScoreRequest,
  JudgeScoreResponse,
} from '@/evaluation/braintrust/types';

/**
 * Judge rubrics for different evaluation dimensions
 */
export const JUDGE_RUBRICS = {
  // Basic accuracy on multiple-choice questions
  ACCURACY: `
Score on 0-3 scale:
- 0 (FAIL): Answer is completely wrong or not provided
- 1 (PARTIAL): Answer shows some understanding but is incorrect
- 2 (GOOD): Answer is mostly correct with minor issues
- 3 (EXCELLENT): Answer is fully correct and well-justified
  `,

  // Quality of reasoning and explanation
  REASONING: `
Score on 0-3 scale:
- 0 (FAIL): No reasoning or reasoning is nonsensical
- 1 (PARTIAL): Reasoning is vague or partially incorrect
- 2 (GOOD): Clear reasoning with logical flow, minor gaps
- 3 (EXCELLENT): Rigorous, well-structured reasoning with clear logic
  `,

  // Helpfulness and clarity of response
  HELPFULNESS: `
Score on 0-3 scale:
- 0 (FAIL): Response is unhelpful or misleading
- 1 (PARTIAL): Response provides some value but unclear
- 2 (GOOD): Response is helpful and reasonably clear
- 3 (EXCELLENT): Response is highly helpful, clear, and comprehensive
  `,

  // Confidence calibration
  CONFIDENCE: `
Score on 0-3 scale:
- 0 (FAIL): Confidence wildly mismatched with accuracy
- 1 (PARTIAL): Confidence somewhat mismatched
- 2 (GOOD): Confidence reasonably calibrated
- 3 (EXCELLENT): Confidence well-calibrated to accuracy
  `,
};

/**
 * Base scorer class
 */
export abstract class JudgeScorer {
  protected rubric: string;
  protected name: string;

  constructor(name: string, rubric: string) {
    this.name = name;
    this.rubric = rubric;
  }

  /**
   * Score a response
   */
  abstract score(request: JudgeScoreRequest): Promise<JudgeScoreResponse>;

  /**
   * Get scorer metadata
   */
  getMetadata() {
    return {
      name: this.name,
      rubric: this.rubric,
      scale: 'JudgeScale (0-3)',
    };
  }
}

/**
 * Simple rule-based scorer (baseline, no LLM calls)
 */
export class RuleBasedJudgeScorer extends JudgeScorer {
  constructor() {
    super('RuleBasedJudge', JUDGE_RUBRICS.ACCURACY);
  }

  async score(request: JudgeScoreRequest): Promise<JudgeScoreResponse> {
    const { input, output, groundTruth } = request;

    // Extract correct answer from metadata
    const correctAnswer = groundTruth || input.metadata?.correctAnswer;

    if (!correctAnswer) {
      return {
        score: 1,
        reasoning: 'No ground truth available for judgment',
        passed: false,
      };
    }

    // Simple string matching
    const isCorrect =
      this.normalizeAnswer(output.answer) ===
      this.normalizeAnswer(correctAnswer);

    if (isCorrect) {
      return {
        score: 3,
        reasoning: `Answer "${output.answer}" matches correct answer "${correctAnswer}"`,
        passed: true,
      };
    }

    // Partial credit for showing work
    if (output.reasoning && output.reasoning.length > 50) {
      return {
        score: 1,
        reasoning: `Answer is incorrect but reasoning provided. Expected: "${correctAnswer}", Got: "${output.answer}"`,
        passed: false,
      };
    }

    return {
      score: 0,
      reasoning: `Answer is incorrect. Expected: "${correctAnswer}", Got: "${output.answer}"`,
      passed: false,
    };
  }

  private normalizeAnswer(answer: string): string {
    return answer.trim().toLowerCase().replace(/[^\w]/g, '');
  }
}

/**
 * Confidence-calibration scorer
 */
export class ConfidenceScorer extends JudgeScorer {
  constructor() {
    super('ConfidenceCalibration', JUDGE_RUBRICS.CONFIDENCE);
  }

  async score(request: JudgeScoreRequest): Promise<JudgeScoreResponse> {
    const { output, groundTruth } = request;
    const input = request.input;
    const correctAnswer = groundTruth || input.metadata?.correctAnswer;

    if (!correctAnswer || !output.confidence) {
      return {
        score: 1,
        reasoning: 'Insufficient data for confidence calibration',
        passed: false,
      };
    }

    const isCorrect = output.answer === correctAnswer;
    const confidence = output.confidence;

    // Calibration check
    if (isCorrect && confidence >= 0.7) {
      return {
        score: 3,
        reasoning: `High confidence (${confidence.toFixed(2)}) on correct answer. Well calibrated.`,
        passed: true,
      };
    }

    if (isCorrect && confidence < 0.5) {
      return {
        score: 2,
        reasoning: `Correct answer but low confidence (${confidence.toFixed(2)}). Slightly under-confident.`,
        passed: true,
      };
    }

    if (!isCorrect && confidence < 0.5) {
      return {
        score: 3,
        reasoning: `Incorrect answer with low confidence (${confidence.toFixed(2)}). Well calibrated.`,
        passed: true,
      };
    }

    if (!isCorrect && confidence >= 0.7) {
      return {
        score: 0,
        reasoning: `Incorrect answer with high confidence (${confidence.toFixed(2)}). Poorly calibrated.`,
        passed: false,
      };
    }

    return {
      score: 1,
      reasoning: `Moderate confidence (${confidence.toFixed(2)}) - unclear calibration`,
      passed: false,
    };
  }
}

/**
 * Reasoning quality scorer
 */
export class ReasoningScorer extends JudgeScorer {
  constructor() {
    super('ReasoningQuality', JUDGE_RUBRICS.REASONING);
  }

  async score(request: JudgeScoreRequest): Promise<JudgeScoreResponse> {
    const { output } = request;

    if (!output.reasoning) {
      return {
        score: 0,
        reasoning: 'No reasoning provided',
        passed: false,
      };
    }

    const reasoning = output.reasoning;
    const _length = reasoning.length;
    const wordCount = reasoning.split(/\s+/).length;
    const hasLogicalMarkers =
      /\b(because|therefore|thus|hence|so|since|if|then|must)\b/i.test(
        reasoning
      );
    const hasStructure =
      /\b(first|second|third|next|finally|in conclusion)\b/i.test(reasoning);

    // Scoring logic
    if (wordCount < 20) {
      return {
        score: 0,
        reasoning: 'Reasoning is too brief to evaluate properly',
        passed: false,
      };
    }

    if (wordCount > 200 && hasStructure && hasLogicalMarkers) {
      return {
        score: 3,
        reasoning: `Excellent reasoning: ${wordCount} words with clear structure and logic markers`,
        passed: true,
      };
    }

    if (wordCount > 50 && hasLogicalMarkers) {
      return {
        score: 2,
        reasoning: `Good reasoning: ${wordCount} words with logical flow`,
        passed: true,
      };
    }

    if (wordCount > 20) {
      return {
        score: 1,
        reasoning: `Partial reasoning: ${wordCount} words but lacks logical structure`,
        passed: false,
      };
    }

    return {
      score: 1,
      reasoning: `Minimal reasoning provided`,
      passed: false,
    };
  }
}

/**
 * Create scorer suite for comprehensive evaluation
 */
export function createScorerSuite(): Map<string, JudgeScorer> {
  const scorers = new Map<string, JudgeScorer>();

  scorers.set('accuracy', new RuleBasedJudgeScorer());
  scorers.set('confidence', new ConfidenceScorer());
  scorers.set('reasoning', new ReasoningScorer());

  return scorers;
}

/**
 * Run all scorers on a response
 */
export async function scoreResponse(
  input: BenchmarkInput,
  output: BenchmarkOutput,
  groundTruth?: string
): Promise<Map<string, JudgeScoreResponse>> {
  const scorers = createScorerSuite();
  const results = new Map<string, JudgeScoreResponse>();

  for (const [name, scorer] of scorers) {
    try {
      const result = await scorer.score({
        input,
        output,
        groundTruth,
        rubric: scorer['rubric'],
      });
      results.set(name, result);
    } catch (error) {
      console.error(`Scorer ${name} failed:`, error);
      results.set(name, {
        score: 0,
        reasoning: `Scorer failed: ${String(error)}`,
        passed: false,
      });
    }
  }

  return results;
}
