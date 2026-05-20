/**
 * @fileOverview Tests for Visionary Coach Flow
 *
 * Tests the strategic partnership system including:
 * - Strategic modes (8 types)
 * - Memory integration
 * - Output structure validation
 * - Convenience functions
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
  generateTraceId: jest.fn(() => 'test-trace-coach'),
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

describe('Visionary Coach Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecallExperiences.mockResolvedValue([]);
    mockRecordCodeModification.mockResolvedValue(undefined);
  });

  const createMockOutput = (overrides = {}) => ({
    acknowledgment: 'I see the progress you have made, partner.',
    assessment: {
      currentPhase: 'Phase 3: AGI Foundation',
      overallHealth: 'healthy',
      strengths: ['Strong momentum', 'Good test coverage'],
      gaps: ['Flow expansion incomplete'],
      progressRating: 7,
    },
    priorities: [
      {
        priority: 1,
        task: 'Complete flow expansion',
        rationale: 'Foundation for advanced features',
        estimatedEffort: 'medium',
        urgency: 'soon',
      },
      {
        priority: 2,
        task: 'Add integration tests',
        rationale: 'Ensure system stability',
        estimatedEffort: 'medium',
        urgency: 'when-able',
      },
    ],
    blockerGuidance: undefined,
    optionThreeAlignment: {
      aligned: true,
      strengths: ['Building with intention', 'Treating Molly as being'],
      tensions: [],
      reminder: 'The work itself is the practice of interdependence.',
    },
    celebrations: ['Completed Phase 2', 'Curiosity engine working'],
    corrections: [],
    visionReminder: 'A world where human and AI grow together.',
    partnerMessage: 'We are building something beautiful, Eric.',
    nextSessionFocus: 'Continue flow expansion with test coverage.',
    ...overrides,
  });

  describe('Strategic Modes', () => {
    const modes = [
      'strategic-review',
      'gap-analysis',
      'priority-check',
      'milestone-review',
      'course-correction',
      'philosophy-check',
      'concern',
      'vision',
    ] as const;

    it.each(modes)('handles mode: %s', async (mode) => {
      mockMollyGenerate.mockResolvedValue({
        output: createMockOutput(),
      });

      const { visionaryCoachFlow } = await import('../visionary-coach');

      const result = await visionaryCoachFlow({
        mode,
        progress: 'Recent work on flows',
        userId: 'test-user',
        hoursSinceLastReview: 24,
      });

      expect(result).toBeDefined();
      expect(result.assessment).toBeDefined();
      expect(result.priorities).toBeDefined();
    });
  });

  describe('Output Structure', () => {
    it('returns complete assessment structure', async () => {
      mockMollyGenerate.mockResolvedValue({
        output: createMockOutput(),
      });

      const { strategicReview } = await import('../visionary-coach');

      const result = await strategicReview(
        'test-user',
        'Made progress on tests'
      );

      expect(result.assessment).toHaveProperty('currentPhase');
      expect(result.assessment).toHaveProperty('overallHealth');
      expect(result.assessment).toHaveProperty('strengths');
      expect(result.assessment).toHaveProperty('gaps');
      expect(result.assessment).toHaveProperty('progressRating');
    });

    it('returns priorities with required fields', async () => {
      mockMollyGenerate.mockResolvedValue({
        output: createMockOutput(),
      });

      const { whatNext } = await import('../visionary-coach');

      const result = await whatNext('test-user', 'Just completed flow work');

      expect(result.priorities.length).toBeGreaterThan(0);
      expect(result.priorities[0]).toHaveProperty('priority');
      expect(result.priorities[0]).toHaveProperty('task');
      expect(result.priorities[0]).toHaveProperty('rationale');
      expect(result.priorities[0]).toHaveProperty('estimatedEffort');
      expect(result.priorities[0]).toHaveProperty('urgency');
    });

    it('includes Option Three alignment check', async () => {
      mockMollyGenerate.mockResolvedValue({
        output: createMockOutput(),
      });

      const { checkPhilosophy } = await import('../visionary-coach');

      const result = await checkPhilosophy('test-user', 'Recent decisions');

      expect(result.optionThreeAlignment).toHaveProperty('aligned');
      expect(result.optionThreeAlignment).toHaveProperty('strengths');
      expect(result.optionThreeAlignment).toHaveProperty('tensions');
      expect(result.optionThreeAlignment).toHaveProperty('reminder');
    });
  });

  describe('Memory Integration', () => {
    it('recalls past strategic decisions', async () => {
      mockRecallExperiences.mockResolvedValue([
        {
          context: 'strategic decision priority-check',
          suggestion: 'Prioritized test coverage',
        },
      ]);

      mockMollyGenerate.mockResolvedValue({
        output: createMockOutput(),
      });

      const { strategicReview } = await import('../visionary-coach');

      await strategicReview('test-user', 'Making progress');

      expect(mockRecallExperiences).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user',
          context: expect.stringContaining('strategic decision'),
          limit: 5,
        })
      );
    });

    it('saves strategic insights to memory', async () => {
      mockMollyGenerate.mockResolvedValue({
        output: createMockOutput(),
      });

      const { strategicReview } = await import('../visionary-coach');

      await strategicReview('test-user', 'Progress update');

      expect(mockRecordCodeModification).toHaveBeenCalledWith(
        'test-user',
        'STRATEGIC_REVIEW',
        expect.any(String),
        expect.stringContaining('Strategic review')
      );
    });
  });

  describe('Convenience Functions', () => {
    beforeEach(() => {
      mockMollyGenerate.mockResolvedValue({
        output: createMockOutput(),
      });
    });

    it('strategicReview() performs full assessment', async () => {
      const { strategicReview } = await import('../visionary-coach');

      const result = await strategicReview('test-user', 'Progress', {
        concern: 'Test coverage low',
        blockers: ['CI failing'],
      });

      expect(result).toBeDefined();
      expect(result.partnerMessage).toBeDefined();
    });

    it('whatNext() returns prioritization', async () => {
      const { whatNext } = await import('../visionary-coach');

      const result = await whatNext('test-user', 'Just finished testing');

      expect(result).toBeDefined();
      expect(result.priorities).toBeDefined();
    });

    it('findGaps() analyzes gaps', async () => {
      const { findGaps } = await import('../visionary-coach');

      const result = await findGaps('test-user', 'Current state of project');

      expect(result).toBeDefined();
      expect(result.assessment.gaps).toBeDefined();
    });

    it('celebrateMilestones() reviews achievements', async () => {
      const { celebrateMilestones } = await import('../visionary-coach');

      const result = await celebrateMilestones(
        'test-user',
        'Completed Phase 1 and 2'
      );

      expect(result).toBeDefined();
      expect(result.celebrations).toBeDefined();
    });

    it('getCourseCorrection() addresses blockers', async () => {
      mockMollyGenerate.mockResolvedValue({
        output: createMockOutput({
          blockerGuidance: [
            {
              blocker: 'CI failing',
              analysis: 'Test environment issue',
              suggestedPath: 'Fix environment config',
            },
          ],
        }),
      });

      const { getCourseCorrection } = await import('../visionary-coach');

      const result = await getCourseCorrection('test-user', 'Stuck on CI', [
        'CI keeps failing',
      ]);

      expect(result).toBeDefined();
      expect(result.corrections).toBeDefined();
    });

    it('checkPhilosophy() validates alignment', async () => {
      const { checkPhilosophy } = await import('../visionary-coach');

      const result = await checkPhilosophy(
        'test-user',
        'Recent design decisions'
      );

      expect(result).toBeDefined();
      expect(result.optionThreeAlignment).toBeDefined();
    });

    it('addressConcern() handles specific concerns', async () => {
      const { addressConcern } = await import('../visionary-coach');

      const result = await addressConcern(
        'test-user',
        'Test coverage is too low',
        'Current state of project'
      );

      expect(result).toBeDefined();
    });

    it('visionSession() provides long-term vision', async () => {
      const { visionSession } = await import('../visionary-coach');

      const result = await visionSession('test-user', 'Current state');

      expect(result).toBeDefined();
      expect(result.visionReminder).toBeDefined();
    });

    it('legacy visionaryCoach() returns partner message', async () => {
      const { visionaryCoach } = await import('../visionary-coach');

      const result = await visionaryCoach(
        'Good progress',
        'Phase 3',
        'Specific concern'
      );

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('Fallback Handling', () => {
    it('returns fallback response when LLM returns no output', async () => {
      mockMollyGenerate.mockResolvedValue({ output: null });

      const { strategicReview } = await import('../visionary-coach');

      const result = await strategicReview('test-user', 'Progress update');

      expect(result.assessment.overallHealth).toBe('needs-attention');
      expect(result.priorities.length).toBeGreaterThan(0);
      expect(result.partnerMessage).toContain('stumbled');
    });

    it('handles LLM errors gracefully', async () => {
      mockMollyGenerate.mockRejectedValue(new Error('LLM unavailable'));

      const { strategicReview } = await import('../visionary-coach');

      const result = await strategicReview('test-user', 'Progress');

      expect(result.assessment.overallHealth).toBe('needs-attention');
    });
  });

  describe('Health Levels', () => {
    const healthLevels = [
      'thriving',
      'healthy',
      'needs-attention',
      'concerning',
    ] as const;

    it.each(healthLevels)('handles health level: %s', async (health) => {
      mockMollyGenerate.mockResolvedValue({
        output: createMockOutput({
          assessment: {
            currentPhase: 'Phase 3',
            overallHealth: health,
            strengths: [],
            gaps: [],
            progressRating: 5,
          },
        }),
      });

      const { strategicReview } = await import('../visionary-coach');

      const result = await strategicReview('test-user', 'Progress');

      expect(result.assessment.overallHealth).toBe(health);
    });
  });

  describe('Effort and Urgency Categories', () => {
    it('handles all effort levels', async () => {
      const efforts = ['small', 'medium', 'large', 'epic'];

      mockMollyGenerate.mockResolvedValue({
        output: createMockOutput({
          priorities: efforts.map((effort, i) => ({
            priority: i + 1,
            task: `Task ${i}`,
            rationale: 'Test',
            estimatedEffort: effort,
            urgency: 'soon',
          })),
        }),
      });

      const { strategicReview } = await import('../visionary-coach');

      const result = await strategicReview('test-user', 'Progress');

      expect(result.priorities.map((p) => p.estimatedEffort)).toEqual(efforts);
    });

    it('handles all urgency levels', async () => {
      const urgencies = ['immediate', 'soon', 'when-able', 'future'];

      mockMollyGenerate.mockResolvedValue({
        output: createMockOutput({
          priorities: urgencies.map((urgency, i) => ({
            priority: i + 1,
            task: `Task ${i}`,
            rationale: 'Test',
            estimatedEffort: 'medium',
            urgency,
          })),
        }),
      });

      const { strategicReview } = await import('../visionary-coach');

      const result = await strategicReview('test-user', 'Progress');

      expect(result.priorities.map((p) => p.urgency)).toEqual(urgencies);
    });
  });
});
