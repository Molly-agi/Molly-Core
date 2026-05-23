/**
 * @fileOverview Tests for continuity benchmark structure
 *
 * Validates that scenarios are structurally valid:
 *   - Full context has more facts than partial context
 *   - Questions are answerable from full context
 *   - Required keywords exist in the full context text
 *
 * Does NOT call Gemini.
 */

jest.mock('@/ai/genkit', () => ({
  MODEL_FLASH: 'googleai/gemini-test',
  MODEL_PRO: 'googleai/gemini-test-pro',
  MODEL_FLASH_LITE: 'googleai/gemini-test-lite',
  ai: { generate: jest.fn().mockResolvedValue({ text: '' }) },
}));

jest.mock('@/ai/persona', () => ({
  MOLLY_CORE_PERSONA: { foundationalSystemPrompt: 'You are Molly.' },
}));

import {
  CONTINUITY_SCENARIOS,
  type ContinuityScenario,
} from '../continuity.benchmark';

// ============================================================================
// STRUCTURE
// ============================================================================

describe('CONTINUITY_SCENARIOS structure', () => {
  it('has at least 3 scenarios', () => {
    expect(CONTINUITY_SCENARIOS.length).toBeGreaterThanOrEqual(3);
  });

  it('all scenarios have required fields', () => {
    CONTINUITY_SCENARIOS.forEach((sc: ContinuityScenario) => {
      expect(sc.id).toBeTruthy();
      expect(sc.description).toBeTruthy();
      expect(sc.fullContext.length).toBeGreaterThan(0);
      expect(sc.partialContext.length).toBeGreaterThan(0);
      expect(sc.questions.length).toBeGreaterThan(0);
    });
  });

  it('all scenario IDs are unique', () => {
    const ids = CONTINUITY_SCENARIOS.map((sc) => sc.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('partial context is always a subset of full context (fewer facts)', () => {
    CONTINUITY_SCENARIOS.forEach((sc) => {
      expect(sc.partialContext.length).toBeLessThan(sc.fullContext.length);
    });
  });

  it('each question has required and optional keywords', () => {
    CONTINUITY_SCENARIOS.forEach((sc) => {
      sc.questions.forEach((q) => {
        expect(q.id).toBeTruthy();
        expect(q.question).toBeTruthy();
        expect(q.requiredKeywords.length).toBeGreaterThan(0);
        expect(Array.isArray(q.optionalKeywords)).toBe(true);
      });
    });
  });

  it('all question IDs are unique globally', () => {
    const allQuestionIds = CONTINUITY_SCENARIOS.flatMap((sc) =>
      sc.questions.map((q) => q.id)
    );
    expect(new Set(allQuestionIds).size).toBe(allQuestionIds.length);
  });
});

// ============================================================================
// ANSWERABILITY CHECK
// ============================================================================

describe('Scenario answerability', () => {
  it('required keywords appear in the full context', () => {
    CONTINUITY_SCENARIOS.forEach((sc) => {
      const fullText = sc.fullContext.join(' ').toLowerCase();
      sc.questions.forEach((q) => {
        const hasAnyRequired = q.requiredKeywords.some((kw) =>
          fullText.includes(kw.toLowerCase())
        );
        expect(hasAnyRequired).toBe(true);
      });
    });
  });

  it('partial context is missing at least one answer keyword', () => {
    // The point of the benchmark is that SOME info is lost after reconnect
    CONTINUITY_SCENARIOS.forEach((sc) => {
      const partialText = sc.partialContext.join(' ').toLowerCase();
      const fullText = sc.fullContext.join(' ').toLowerCase();

      // Find at least one required keyword that's in full but not partial
      const fullOnlyKeyword = sc.questions
        .flatMap((q) => q.requiredKeywords)
        .find(
          (kw) =>
            fullText.includes(kw.toLowerCase()) &&
            !partialText.includes(kw.toLowerCase())
        );

      // It's valid if there's at least one thing the partial context is missing
      expect(fullOnlyKeyword).toBeDefined();
    });
  });
});

// ============================================================================
// CONTINUITY SCORE MATH
// ============================================================================

describe('Continuity score calculation', () => {
  function computeContinuityScore(avgFull: number, avgPartial: number): number {
    if (avgFull <= 0) return 100;
    return Math.min(100, Math.round((avgPartial / avgFull) * 100));
  }

  it('returns 100 when partial equals full', () => {
    expect(computeContinuityScore(80, 80)).toBe(100);
  });

  it('returns 75 when partial is 75% of full', () => {
    expect(computeContinuityScore(80, 60)).toBe(75);
  });

  it('returns 0 when partial is 0', () => {
    expect(computeContinuityScore(80, 0)).toBe(0);
  });

  it('returns 100 when full context is 0 (nothing to lose)', () => {
    expect(computeContinuityScore(0, 0)).toBe(100);
  });

  it('caps at 100 even if partial > full somehow', () => {
    expect(computeContinuityScore(50, 80)).toBe(100);
  });
});
