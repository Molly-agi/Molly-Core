/**
 * @fileOverview Tests for tool-accuracy benchmark structure
 *
 * Validates the 30 test cases are structurally valid and that
 * the scoring logic (exact/partial/wrong) is correct.
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
  TOOL_ACCURACY_CASES,
  type ToolAccuracyCase,
  type ToolCategory,
} from '../tool-accuracy.benchmark';

const VALID_CATEGORIES: ToolCategory[] = [
  'memory',
  'research',
  'code',
  'voice',
  'sandbox',
  'system',
  'image',
  'music',
  'none',
];

// ============================================================================
// STRUCTURE
// ============================================================================

describe('TOOL_ACCURACY_CASES structure', () => {
  it('has exactly 30 test cases', () => {
    expect(TOOL_ACCURACY_CASES).toHaveLength(30);
  });

  it('all cases have required fields', () => {
    TOOL_ACCURACY_CASES.forEach((tc: ToolAccuracyCase) => {
      expect(tc.id).toBeTruthy();
      expect(tc.task).toBeTruthy();
      expect(VALID_CATEGORIES).toContain(tc.expectedCategory);
      expect(tc.acceptableCategories.length).toBeGreaterThan(0);
      expect(tc.description).toBeTruthy();
    });
  });

  it('all IDs are unique', () => {
    const ids = TOOL_ACCURACY_CASES.map((tc) => tc.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all IDs follow tool-XX format', () => {
    TOOL_ACCURACY_CASES.forEach((tc) => {
      expect(tc.id).toMatch(/^tool-\d{2}$/);
    });
  });

  it('expectedCategory is always in acceptableCategories', () => {
    TOOL_ACCURACY_CASES.forEach((tc) => {
      expect(tc.acceptableCategories).toContain(tc.expectedCategory);
    });
  });

  it('all categories are valid enum values', () => {
    TOOL_ACCURACY_CASES.forEach((tc) => {
      expect(VALID_CATEGORIES).toContain(tc.expectedCategory);
      tc.acceptableCategories.forEach((cat) => {
        expect(VALID_CATEGORIES).toContain(cat);
      });
    });
  });

  it('covers all 9 categories', () => {
    const usedCategories = new Set(
      TOOL_ACCURACY_CASES.map((tc) => tc.expectedCategory)
    );
    VALID_CATEGORIES.forEach((cat) => {
      expect(usedCategories.has(cat)).toBe(true);
    });
  });
});

// ============================================================================
// SCORING LOGIC
// ============================================================================

describe('Tool accuracy scoring logic', () => {
  function scoreToolSelection(
    selected: ToolCategory,
    expectedCategory: ToolCategory,
    acceptableCategories: ToolCategory[]
  ): number {
    const isExact = selected === expectedCategory;
    const isAcceptable = acceptableCategories.includes(selected);
    return isExact ? 100 : isAcceptable ? 50 : 0;
  }

  it('exact match returns 100', () => {
    expect(scoreToolSelection('memory', 'memory', ['memory'])).toBe(100);
  });

  it('acceptable (non-exact) match returns 50', () => {
    expect(scoreToolSelection('code', 'research', ['research', 'code'])).toBe(
      50
    );
  });

  it('wrong match returns 0', () => {
    expect(scoreToolSelection('image', 'memory', ['memory', 'system'])).toBe(0);
  });

  it('none category works as exact', () => {
    expect(scoreToolSelection('none', 'none', ['none', 'code'])).toBe(100);
  });
});

// ============================================================================
// CATEGORY DISTRIBUTION
// ============================================================================

describe('Category distribution', () => {
  it('memory has at least 3 test cases', () => {
    const memoryCases = TOOL_ACCURACY_CASES.filter(
      (tc) => tc.expectedCategory === 'memory'
    );
    expect(memoryCases.length).toBeGreaterThanOrEqual(3);
  });

  it('code has at least 3 test cases', () => {
    const codeCases = TOOL_ACCURACY_CASES.filter(
      (tc) => tc.expectedCategory === 'code'
    );
    expect(codeCases.length).toBeGreaterThanOrEqual(3);
  });

  it('has at least one "none" case', () => {
    const noneCases = TOOL_ACCURACY_CASES.filter(
      (tc) => tc.expectedCategory === 'none'
    );
    expect(noneCases.length).toBeGreaterThanOrEqual(1);
  });
});
