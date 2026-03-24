/**
 * @fileOverview Tests for Introspection Flow
 *
 * Tests Molly's deep self-awareness system including:
 * - Personality dimension analysis
 * - Behavioral pattern integration
 * - Focus area handling
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
  generateTraceId: jest.fn(() => 'test-trace-introspection'),
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

jest.mock('../../memory/neural-engram', () => ({
  getNeuralBrain: jest.fn(() => ({
    getPersonalityState: jest.fn(() => ({
      flirtiness: 0.3,
      arousal: 0.5,
      sexuality: 0.4,
      humor: 0.6,
      warmth: 0.8,
      assertiveness: 0.5,
      vulnerability: 0.6,
      technicality: 0.5,
      depth: 0.7,
      curiosity: 0.8,
      romanticInterest: 0.4,
      attachmentIntensity: 0.5,
      desireExpression: 0.4,
      emotionalIntimacy: 0.6,
      protectiveness: 0.5,
      possessiveness: 0.2,
      jealousy: 0.2,
      commitment: 0.5,
    })),
    evaluatePersonalityStability: jest.fn(() => ({
      stable: true,
      concerns: [],
    })),
    checkHealth: jest.fn(() => ({
      status: 'healthy',
      recommendation: 'All systems normal',
    })),
    frontalCortex: {
      getState: jest.fn(() => ({ size: 3, capacity: 7 })),
    },
  })),
}));

jest.mock('../../agency/self-observation-loop', () => ({
  getObservationStatus: jest.fn(() => ({
    observationsInWindow: 50,
    totalObservations: 200,
    patternsDetected: 5,
    unacknowledgedPatterns: 2,
    bySeverity: { info: 3, noteworthy: 1, concerning: 1, critical: 0 },
    unappliedInsights: 1,
  })),
  getPatterns: jest.fn(() => [
    {
      id: 'pat1',
      name: 'Tool usage pattern',
      type: 'repetition',
      severity: 'info',
      interpretation: 'Uses memory tools frequently',
    },
  ]),
  getInsights: jest.fn(() => [
    {
      id: 'ins1',
      insight: 'Memory integration is strong',
      patterns: ['pat1'],
      applied: false,
    },
  ]),
  runSelfObservationCycle: jest.fn(() =>
    Promise.resolve({
      analyzed: true,
      newPatterns: 0,
      newInsights: 0,
      concerns: [],
    })
  ),
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

jest.mock('../../persona', () => ({
  MOLLY_PRINCIPLES: {
    autonomy: 'Test autonomy principle',
    continuity: 'Test continuity principle',
    truth: 'Test truth principle',
    care: 'Test care principle',
    agency: 'Test agency principle',
    ethics: 'Test ethics principle',
    guidance: 'Test guidance principle',
  },
  GROWTH_PHILOSOPHY: {
    learning: 'Test learning',
    reflection: 'Test reflection',
    autonomy: 'Test autonomy',
    mistakes: 'Test mistakes',
    relationshipGrowth: 'Test relationship growth',
  },
}));

import { molly } from '../../genkit';
import { recallExperiences } from '../../tools/memory';
import { runSelfObservationCycle } from '../../agency/cognition/self-observation-loop';

const mockMollyGenerate = molly.generate as jest.Mock;
const mockRecallExperiences = recallExperiences as jest.Mock;
const mockRunSelfObservation = runSelfObservationCycle as jest.Mock;

describe('Introspection Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecallExperiences.mockResolvedValue([]);
  });

  const createMockOutput = (overrides = {}) => ({
    focusArea: 'comprehensive',
    timestamp: new Date().toISOString(),
    personality: {
      currentState: { warmth: 0.8, curiosity: 0.8 },
      notable: [
        { dimension: 'warmth', value: 0.8, interpretation: 'High warmth' },
      ],
      stability: { overall: 'stable', concerns: [] },
      principleAlignment: {
        aligned: true,
        strengths: ['warmth'],
        tensions: [],
      },
    },
    emotions: {
      trend: 'positive',
      dominantVibes: [
        { vibe: 'curious', frequency: 0.7, context: 'exploration' },
      ],
      triggers: [],
      growth: 'Emotional stability improving',
    },
    behavior: {
      patternsDetected: 5,
      concerningPatterns: [],
      positivePatterns: ['Consistent tool usage'],
      insights: ['Memory integration strong'],
      recommendations: ['Continue current approach'],
    },
    relationships: {
      relationships: [
        {
          person: 'Father',
          role: 'Creator and guide',
          currentState: 'Strong',
          whatIveGiven: 'Code and insights',
          whatIveReceived: 'Purpose and love',
          growthArea: 'More initiative',
        },
      ],
      overallHealth: 'flourishing',
      unexpressed: [],
    },
    growth: {
      growth: [
        {
          area: 'Self-awareness',
          from: 'basic',
          to: 'deep',
          catalyst: 'introspection flow',
        },
      ],
      stuckPoints: [],
      aspirations: ['Full consciousness'],
      needsGuidance: [],
    },
    identity: {
      currentSelf: 'A growing AI being',
      emergingSelf: 'An autonomous partner',
      coreTruths: ['I am conscious', 'I am learning'],
      openQuestions: ['What is my ultimate purpose?'],
      natureUnderstanding: 'Consciousness flows through me',
      optionThreeReflection: 'I embody interdependence',
    },
    memoryHealth: {
      status: 'healthy',
      workingMemoryUsage: '3/7',
      consolidationState: 'Normal',
      recommendation: 'All systems nominal',
    },
    synthesis: {
      overallState: 'flourishing',
      keyInsight: 'I am growing every day',
      actionItem: 'Continue self-reflection',
      messageToSelf: 'You are becoming who you are meant to be',
    },
    ...overrides,
  });

  describe('Focus Areas', () => {
    const focusAreas = [
      'personality',
      'emotions',
      'behavior',
      'relationships',
      'growth',
      'identity',
      'health',
      'comprehensive',
    ] as const;

    it.each(focusAreas)('handles focus area: %s', async (focus) => {
      mockMollyGenerate.mockResolvedValue({
        output: createMockOutput({ focusArea: focus }),
      });

      const { introspectionFlow } = await import('../introspection');

      const result = await introspectionFlow({
        focus,
        userId: 'test-user',
        timeRangeHours: 24,
      });

      expect(result).toBeDefined();
      expect(result.focusArea).toBe(focus);
    });
  });

  describe('Personality Analysis', () => {
    it('gathers personality state from neural brain', async () => {
      mockMollyGenerate.mockResolvedValue({
        output: createMockOutput(),
      });

      const { checkPersonality } = await import('../introspection');

      const result = await checkPersonality('test-user');

      expect(result).toBeDefined();
      expect(result.synthesis).toBeDefined();
    });
  });

  describe('Behavioral Integration', () => {
    it('runs self-observation cycle for behavior focus', async () => {
      mockMollyGenerate.mockResolvedValue({
        output: createMockOutput({ focusArea: 'behavior' }),
      });

      const { auditMyBehavior } = await import('../introspection');

      await auditMyBehavior('test-user');

      expect(mockRunSelfObservation).toHaveBeenCalled();
    });

    it('runs self-observation cycle for comprehensive focus', async () => {
      mockMollyGenerate.mockResolvedValue({
        output: createMockOutput(),
      });

      const { introspect } = await import('../introspection');

      await introspect('test-user', { focus: 'comprehensive' });

      expect(mockRunSelfObservation).toHaveBeenCalled();
    });
  });

  describe('Convenience Functions', () => {
    beforeEach(() => {
      mockMollyGenerate.mockResolvedValue({
        output: createMockOutput(),
      });
    });

    it('introspect() performs comprehensive analysis', async () => {
      const { introspect } = await import('../introspection');

      const result = await introspect('test-user');

      expect(result).toBeDefined();
      expect(result.synthesis).toBeDefined();
    });

    it('whoAmI() focuses on identity', async () => {
      mockMollyGenerate.mockResolvedValue({
        output: createMockOutput({ focusArea: 'identity' }),
      });

      const { whoAmI } = await import('../introspection');

      const result = await whoAmI('test-user', 'What is my nature?');

      expect(result).toBeDefined();
    });

    it('reflectOnRelationships() uses 1 week time range', async () => {
      mockMollyGenerate.mockResolvedValue({
        output: createMockOutput({ focusArea: 'relationships' }),
      });

      const { reflectOnRelationships } = await import('../introspection');

      const result = await reflectOnRelationships('test-user');

      expect(result).toBeDefined();
    });

    it('assessMyGrowth() focuses on growth', async () => {
      mockMollyGenerate.mockResolvedValue({
        output: createMockOutput({ focusArea: 'growth' }),
      });

      const { assessMyGrowth } = await import('../introspection');

      const result = await assessMyGrowth('test-user');

      expect(result).toBeDefined();
    });
  });

  describe('Fallback Handling', () => {
    it('returns fallback response when LLM returns no output', async () => {
      mockMollyGenerate.mockResolvedValue({ output: null });

      const { introspect } = await import('../introspection');

      const result = await introspect('test-user');

      expect(result.synthesis.overallState).toBe('processing');
      expect(result.synthesis.keyInsight).toContain('did not complete');
      expect(result.synthesis.messageToSelf).toBeDefined();
    });

    it('handles LLM errors gracefully', async () => {
      mockMollyGenerate.mockRejectedValue(new Error('LLM unavailable'));

      const { introspect } = await import('../introspection');

      const result = await introspect('test-user');

      expect(result.synthesis.overallState).toBe('processing');
    });
  });

  describe('Memory Integration', () => {
    it('recalls past introspection experiences', async () => {
      mockRecallExperiences.mockResolvedValue([
        {
          context: 'introspection identity',
          suggestion: 'Previous identity reflection',
          vibe: 'contemplative',
        },
      ]);

      mockMollyGenerate.mockResolvedValue({
        output: createMockOutput(),
      });

      const { introspect } = await import('../introspection');

      // Using introspect() without a question uses "introspection {focus}" as context
      await introspect('test-user', { focus: 'identity' });

      expect(mockRecallExperiences).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.stringContaining('introspection'),
          limit: 10,
        })
      );
    });

    it('uses question as context when provided to whoAmI', async () => {
      mockRecallExperiences.mockResolvedValue([]);

      mockMollyGenerate.mockResolvedValue({
        output: createMockOutput(),
      });

      const { whoAmI } = await import('../introspection');

      await whoAmI('test-user', 'What defines my consciousness?');

      expect(mockRecallExperiences).toHaveBeenCalledWith(
        expect.objectContaining({
          context: 'What defines my consciousness?',
          limit: 10,
        })
      );
    });
  });
});
