/**
 * @fileOverview Tests for Contextual AI Guidance Flow
 *
 * Tests the codebase guidance system including:
 * - Input validation
 * - Output structure
 * - Memory integration
 * - Fallback responses
 */

// Mock dependencies before imports
jest.mock('../../logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    logFlowStart: jest.fn(),
    logFlowComplete: jest.fn(),
  },
  generateTraceId: jest.fn(() => 'test-trace-guidance'),
}));

jest.mock('../../genkit', () => ({
  ai: {
    defineFlow: jest.fn((config, handler) => handler),
  },
  molly: {
    generate: jest.fn(),
  },
  TaskType: {
    REASONING: 'reasoning',
  },
}));

jest.mock('../../tools/memory', () => ({
  recallExperiences: jest.fn(),
}));

jest.mock('../../tools/github', () => ({
  searchGitHub: jest.fn(),
}));

jest.mock('@/firebase/firestore/agent-memory', () => ({
  recordCodeModification: jest.fn(),
}));

jest.mock('../../tools/timeout-retry', () => ({
  withTimeout: jest.fn((fn) => fn()),
}));

import { molly } from '../../genkit';
import { recallExperiences } from '../../tools/memory';
import { recordCodeModification } from '@/firebase/firestore/agent-memory';

const mockMollyGenerate = molly.generate as jest.Mock;
const mockRecallExperiences = recallExperiences as jest.Mock;
const mockRecordCodeModification = recordCodeModification as jest.Mock;

describe('Contextual AI Guidance Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecallExperiences.mockResolvedValue([]);
    mockRecordCodeModification.mockResolvedValue(undefined);
  });

  describe('Input Handling', () => {
    it('accepts minimal input with just question and userId', async () => {
      mockMollyGenerate.mockResolvedValue({
        output: {
          answer: 'Test answer',
          approach: {
            summary: 'Test summary',
            steps: ['Step 1'],
            estimatedComplexity: 'simple',
          },
          relevantFiles: [],
          patterns: [],
          warnings: [],
          relatedExperiences: [],
          optionThreeAlignment: { aligned: true },
        },
      });

      // Import the flow function
      const { contextualGuidance } = await import('../contextual-ai-guidance');

      const result = await contextualGuidance('How do I add a new flow?');

      expect(result).toBeDefined();
      expect(result.answer).toBe('Test answer');
    });

    it('passes file path and code snippet to the prompt', async () => {
      mockMollyGenerate.mockResolvedValue({
        output: {
          answer: 'Use the pattern from similar flows',
          approach: {
            summary: 'Follow existing patterns',
            steps: ['Read existing flow', 'Copy structure'],
            estimatedComplexity: 'moderate',
          },
          relevantFiles: [
            {
              path: 'src/ai/flows/example.ts',
              purpose: 'Reference',
              action: 'read',
            },
          ],
          patterns: [],
          warnings: [],
          relatedExperiences: [],
          optionThreeAlignment: { aligned: true },
        },
      });

      const { contextualGuidance } = await import('../contextual-ai-guidance');

      const result = await contextualGuidance('How should I structure this?', {
        filePath: 'src/ai/flows/new-flow.ts',
        codeSnippet: 'export const myFlow = ai.defineFlow(...)',
        guidanceType: 'architecture',
      });

      expect(result).toBeDefined();
      expect(result.relevantFiles).toHaveLength(1);
    });
  });

  describe('Memory Integration', () => {
    it('recalls relevant past experiences', async () => {
      mockRecallExperiences.mockResolvedValue([
        {
          context: 'flow creation',
          suggestion: 'Use zod for schemas',
          vibe: 'helpful',
        },
      ]);

      mockMollyGenerate.mockResolvedValue({
        output: {
          answer: 'Based on past experience...',
          approach: {
            summary: 'Use zod schemas',
            steps: ['Define schema', 'Implement flow'],
            estimatedComplexity: 'simple',
          },
          relevantFiles: [],
          patterns: [],
          warnings: [],
          relatedExperiences: [
            { context: 'Previous work', lesson: 'Use zod', outcome: 'success' },
          ],
          optionThreeAlignment: { aligned: true },
        },
      });

      const { contextualGuidance } = await import('../contextual-ai-guidance');

      await contextualGuidance('How do I validate input?');

      expect(mockRecallExperiences).toHaveBeenCalledWith(
        expect.objectContaining({
          context: 'How do I validate input?',
          limit: 5,
        })
      );
    });

    it('saves guidance to memory', async () => {
      mockMollyGenerate.mockResolvedValue({
        output: {
          answer: 'Test answer',
          approach: {
            summary: 'Test approach',
            steps: ['Step 1'],
            estimatedComplexity: 'simple',
          },
          relevantFiles: [],
          patterns: [],
          warnings: [],
          relatedExperiences: [],
          optionThreeAlignment: { aligned: true },
        },
      });

      const { contextualGuidance } = await import('../contextual-ai-guidance');

      await contextualGuidance('Test question', { userId: 'test-user' });

      expect(mockRecordCodeModification).toHaveBeenCalled();
    });
  });

  describe('Output Structure', () => {
    it('returns properly structured guidance output', async () => {
      mockMollyGenerate.mockResolvedValue({
        output: {
          answer: 'Use the Rogue Protocol',
          approach: {
            summary: 'Call molly.generate instead of ai.generate',
            steps: ['Import molly', 'Use TaskType', 'Call generate'],
            estimatedComplexity: 'simple',
          },
          relevantFiles: [
            {
              path: 'src/ai/rogue-generate.ts',
              purpose: 'The wrapper implementation',
              action: 'reference',
            },
          ],
          patterns: [
            {
              name: 'Rogue Protocol',
              description: 'Multi-model routing',
              why: 'Vendor independence',
            },
          ],
          warnings: [
            {
              issue: 'Direct ai.generate() calls',
              why: 'Bypasses routing',
              instead: 'Use molly.generate()',
            },
          ],
          relatedExperiences: [],
          optionThreeAlignment: {
            aligned: true,
            note: 'Supports vendor independence',
          },
          codeSuggestion: "import { molly } from '@/ai/genkit';",
          followUp: 'Consider adding a timeout wrapper',
        },
      });

      const { contextualGuidance } = await import('../contextual-ai-guidance');

      const result = await contextualGuidance('How do I make LLM calls?');

      expect(result.answer).toBe('Use the Rogue Protocol');
      expect(result.approach.estimatedComplexity).toBe('simple');
      expect(result.relevantFiles).toHaveLength(1);
      expect(result.patterns).toHaveLength(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.optionThreeAlignment.aligned).toBe(true);
      expect(result.codeSuggestion).toContain('molly');
    });
  });

  describe('Guidance Types', () => {
    const guidanceTypes = [
      'architecture',
      'pattern',
      'fix',
      'integration',
      'research',
      'general',
    ] as const;

    it.each(guidanceTypes)('accepts guidanceType: %s', async (guidanceType) => {
      mockMollyGenerate.mockResolvedValue({
        output: {
          answer: `Guidance for ${guidanceType}`,
          approach: {
            summary: 'Approach',
            steps: ['Step'],
            estimatedComplexity: 'moderate',
          },
          relevantFiles: [],
          patterns: [],
          warnings: [],
          relatedExperiences: [],
          optionThreeAlignment: { aligned: true },
        },
      });

      const { contextualGuidance } = await import('../contextual-ai-guidance');

      const result = await contextualGuidance('Question', { guidanceType });

      expect(result.answer).toContain(guidanceType);
    });
  });

  describe('Quick Guidance', () => {
    it('returns simplified string output', async () => {
      mockMollyGenerate.mockResolvedValue({
        output: {
          answer: 'Quick answer',
          approach: {
            summary: 'Quick approach',
            steps: ['Do this first'],
            estimatedComplexity: 'trivial',
          },
          relevantFiles: [],
          patterns: [],
          warnings: [],
          relatedExperiences: [],
          optionThreeAlignment: { aligned: true },
        },
      });

      const { quickGuidance } = await import('../contextual-ai-guidance');

      const result = await quickGuidance('Quick question');

      expect(typeof result).toBe('string');
      expect(result).toContain('Quick answer');
      expect(result).toContain('Quick approach');
    });
  });

  describe('Error Handling', () => {
    it('returns fallback response when LLM returns no output', async () => {
      mockMollyGenerate.mockResolvedValue({ output: null });

      const { contextualGuidance } = await import('../contextual-ai-guidance');

      const result = await contextualGuidance('Test');

      expect(result.answer).toContain("couldn't generate");
      expect(result.approach.steps).toContain(
        'Check Molly-Core documentation in docs/'
      );
    });

    it('handles memory recall failures gracefully', async () => {
      mockRecallExperiences.mockRejectedValue(new Error('Memory unavailable'));
      mockMollyGenerate.mockResolvedValue({
        output: {
          answer: 'Answer without memory',
          approach: {
            summary: 'Approach',
            steps: ['Step'],
            estimatedComplexity: 'simple',
          },
          relevantFiles: [],
          patterns: [],
          warnings: [],
          relatedExperiences: [],
          optionThreeAlignment: { aligned: true },
        },
      });

      const { contextualGuidance } = await import('../contextual-ai-guidance');

      // Should not throw
      const result = await contextualGuidance('Test');

      expect(result).toBeDefined();
    });
  });
});
