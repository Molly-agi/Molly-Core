/**
 * @fileOverview Tests for Collaborative Hive Flow
 *
 * Tests multi-agent problem solving including:
 * - Collaboration modes (sequential, debate, consensus, rapid)
 * - Agent types (researcher, architect, critic, auditor, implementer, synthesizer)
 * - Multi-round collaboration
 * - Confidence metrics
 * - Memory integration
 * - Convenience functions
 * - Fallback handling
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
  generateTraceId: jest.fn(() => 'test-trace-hive'),
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
    CODE: 'code',
    RESEARCH: 'research',
  },
}));

jest.mock('../../tools/memory', () => ({
  recallExperiences: jest.fn(),
}));

jest.mock('../../methodology', () => ({
  logMethodologyStep: jest.fn(),
  performStressTest: jest.fn(),
}));

jest.mock('@/firebase/firestore/agent-memory', () => ({
  recordCodeModification: jest.fn(),
}));

jest.mock('../../tools/timeout-retry', () => ({
  withTimeout: jest.fn((fn) => fn()),
}));

import { molly } from '../../genkit';
import { recallExperiences } from '../../tools/memory';
import { logMethodologyStep, performStressTest } from '../../methodology';
import { recordCodeModification } from '@/firebase/firestore/agent-memory';

const mockMollyGenerate = molly.generate as jest.Mock;
const mockRecallExperiences = recallExperiences as jest.Mock;
const mockLogMethodologyStep = logMethodologyStep as jest.Mock;
const mockPerformStressTest = performStressTest as jest.Mock;
const mockRecordCodeModification = recordCodeModification as jest.Mock;

describe('Collaborative Hive Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecallExperiences.mockResolvedValue([]);
    mockLogMethodologyStep.mockResolvedValue(undefined);
    mockPerformStressTest.mockResolvedValue({
      passed: true,
      report: 'All tests pass',
    });
    mockRecordCodeModification.mockResolvedValue(undefined);

    // Default mock for agent responses
    mockMollyGenerate.mockResolvedValue({
      text: 'This is a confident and clear contribution. I strongly recommend this approach.',
    });
  });

  describe('Collaboration Modes', () => {
    const modes = ['sequential', 'debate', 'consensus', 'rapid'] as const;

    it.each(modes)('handles mode: %s', async (mode) => {
      const { collaborativeHiveFlow } = await import('../collaborative-hive');

      const result = await collaborativeHiveFlow({
        objective: 'Test objective',
        userId: 'test-user',
        mode,
        agents: ['researcher', 'architect', 'synthesizer'],
        maxRounds: 1,
        qualityThreshold: 0.7,
      });

      expect(result).toBeDefined();
      expect(result.mode).toBe(mode);
      expect(result.objective).toBe('Test objective');
    });
  });

  describe('Agent Types', () => {
    const agents = [
      'researcher',
      'architect',
      'critic',
      'auditor',
      'implementer',
      'synthesizer',
    ] as const;

    it.each(agents)('runs %s agent', async (agent) => {
      const { collaborativeHiveFlow } = await import('../collaborative-hive');

      const result = await collaborativeHiveFlow({
        objective: 'Test specific agent',
        userId: 'test-user',
        mode: 'sequential',
        agents: [agent, 'synthesizer'],
        maxRounds: 1,
        qualityThreshold: 0.5,
      });

      expect(result).toBeDefined();
      expect(result.contributions.length).toBeGreaterThan(0);
      expect(result.contributions.some((c) => c.agent === agent)).toBe(true);
    });
  });

  describe('Multi-Round Collaboration', () => {
    it('runs multiple rounds in debate mode', async () => {
      const { collaborativeHiveFlow } = await import('../collaborative-hive');

      // Return low confidence to force multiple rounds
      mockMollyGenerate.mockResolvedValue({
        text: 'Maybe this could work. I am uncertain about the approach.',
      });

      const result = await collaborativeHiveFlow({
        objective: 'Complex problem requiring debate',
        userId: 'test-user',
        mode: 'debate',
        agents: ['researcher', 'architect'],
        maxRounds: 2,
        qualityThreshold: 0.9, // High threshold forces multiple rounds
      });

      expect(result.rounds).toBeGreaterThanOrEqual(1);
      // Should have contributions from multiple rounds
      expect(result.contributions.length).toBeGreaterThanOrEqual(2);
    });

    it('reaches consensus early when confidence is high', async () => {
      const { collaborativeHiveFlow } = await import('../collaborative-hive');

      // Return high confidence
      mockMollyGenerate.mockResolvedValue({
        text: 'I am confident and certain this is definitely the right approach. Clearly successful.',
      });

      const result = await collaborativeHiveFlow({
        objective: 'Clear problem',
        userId: 'test-user',
        mode: 'consensus',
        agents: ['researcher', 'architect'],
        maxRounds: 4,
        qualityThreshold: 0.5, // Low threshold allows early consensus
      });

      expect(result.quality.consensusReached).toBe(true);
    });
  });

  describe('Confidence Estimation', () => {
    it('detects low confidence from uncertain language', async () => {
      const { collaborativeHiveFlow } = await import('../collaborative-hive');

      mockMollyGenerate.mockResolvedValue({
        text: 'Maybe this could possibly work. I am uncertain and unclear about the outcome.',
      });

      const result = await collaborativeHiveFlow({
        objective: 'Test confidence',
        userId: 'test-user',
        mode: 'sequential',
        agents: ['researcher'],
        maxRounds: 1,
        qualityThreshold: 0.7,
      });

      // First contribution should have lower confidence
      expect(result.contributions[0].confidence).toBeLessThan(0.6);
    });

    it('detects high confidence from confident language', async () => {
      const { collaborativeHiveFlow } = await import('../collaborative-hive');

      mockMollyGenerate.mockResolvedValue({
        text: 'I am confident and certain this is definitely the correct approach. The solution clearly works.',
      });

      const result = await collaborativeHiveFlow({
        objective: 'Test confidence',
        userId: 'test-user',
        mode: 'sequential',
        agents: ['researcher'],
        maxRounds: 1,
        qualityThreshold: 0.7,
      });

      expect(result.contributions[0].confidence).toBeGreaterThan(0.6);
    });
  });

  describe('Memory Integration', () => {
    it('recalls relevant memories for objective', async () => {
      mockRecallExperiences.mockResolvedValue([
        {
          context: 'previous solution',
          suggestion: 'Use caching pattern',
          vibe: 'confident',
        },
      ]);

      const { collaborativeHiveFlow } = await import('../collaborative-hive');

      await collaborativeHiveFlow({
        objective: 'Optimize performance',
        userId: 'test-user',
        mode: 'sequential',
        agents: ['researcher'],
        maxRounds: 1,
        qualityThreshold: 0.5,
      });

      expect(mockRecallExperiences).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user',
          context: 'Optimize performance',
          limit: 10,
        })
      );
    });

    it('saves hive solution to memory', async () => {
      const { collaborativeHiveFlow } = await import('../collaborative-hive');

      await collaborativeHiveFlow({
        objective: 'Build new feature',
        userId: 'test-user',
        mode: 'sequential',
        agents: ['architect', 'synthesizer'],
        maxRounds: 1,
        qualityThreshold: 0.5,
      });

      expect(mockRecordCodeModification).toHaveBeenCalledWith(
        'test-user',
        'HIVE_ORCHESTRATOR',
        expect.any(String),
        expect.stringContaining('Hive solution for: Build new feature')
      );
    });
  });

  describe('Concern and Suggestion Extraction', () => {
    it('extracts concerns from agent responses', async () => {
      const { collaborativeHiveFlow } = await import('../collaborative-hive');

      mockMollyGenerate.mockResolvedValue({
        text: 'The approach looks good. Concerns: potential memory leak in edge cases. Risk: performance under load.',
      });

      const result = await collaborativeHiveFlow({
        objective: 'Review design',
        userId: 'test-user',
        mode: 'sequential',
        agents: ['critic'],
        maxRounds: 1,
        qualityThreshold: 0.5,
      });

      expect(result.contributions[0].concerns).toBeDefined();
      expect(result.contributions[0].concerns?.length).toBeGreaterThan(0);
    });

    it('extracts suggestions from agent responses', async () => {
      const { collaborativeHiveFlow } = await import('../collaborative-hive');

      mockMollyGenerate.mockResolvedValue({
        text: 'I recommend using a caching layer. The system should implement retry logic.',
      });

      const result = await collaborativeHiveFlow({
        objective: 'Improve system',
        userId: 'test-user',
        mode: 'sequential',
        agents: ['architect'],
        maxRounds: 1,
        qualityThreshold: 0.5,
      });

      expect(result.contributions[0].suggestions).toBeDefined();
      expect(result.contributions[0].suggestions?.length).toBeGreaterThan(0);
    });
  });

  describe('Audit Integration', () => {
    it('passes when stress test succeeds', async () => {
      mockPerformStressTest.mockResolvedValue({
        passed: true,
        report: 'All stress tests passed',
      });

      const { collaborativeHiveFlow } = await import('../collaborative-hive');

      const result = await collaborativeHiveFlow({
        objective: 'Build robust system',
        userId: 'test-user',
        mode: 'sequential',
        agents: ['architect', 'auditor'],
        maxRounds: 1,
        qualityThreshold: 0.5,
      });

      expect(result.audit.passed).toBe(true);
      expect(result.isSuccess).toBe(true);
    });

    it('fails when stress test fails', async () => {
      mockPerformStressTest.mockResolvedValue({
        passed: false,
        report: 'Performance degradation detected',
      });

      const { collaborativeHiveFlow } = await import('../collaborative-hive');

      const result = await collaborativeHiveFlow({
        objective: 'Build system',
        userId: 'test-user',
        mode: 'sequential',
        agents: ['architect'],
        maxRounds: 1,
        qualityThreshold: 0.5,
      });

      expect(result.audit.passed).toBe(false);
      expect(result.isSuccess).toBe(false);
    });
  });

  describe('Output Structure', () => {
    it('includes all required sections', async () => {
      const { collaborativeHiveFlow } = await import('../collaborative-hive');

      const result = await collaborativeHiveFlow({
        objective: 'Complete solution',
        userId: 'test-user',
        mode: 'sequential',
        agents: ['researcher', 'architect', 'critic', 'auditor', 'synthesizer'],
        maxRounds: 1,
        qualityThreshold: 0.5,
      });

      expect(result.research).toBeDefined();
      expect(result.research.findings).toBeDefined();
      expect(result.architecture).toBeDefined();
      expect(result.architecture.design).toBeDefined();
      expect(result.critique).toBeDefined();
      expect(result.critique.concerns).toBeDefined();
      expect(result.audit).toBeDefined();
      expect(result.audit.passed).toBeDefined();
      expect(result.synthesis).toBeDefined();
      expect(result.synthesis.summary).toBeDefined();
      expect(result.synthesis.nextSteps).toBeDefined();
      expect(result.quality).toBeDefined();
    });

    it('includes quality metrics', async () => {
      const { collaborativeHiveFlow } = await import('../collaborative-hive');

      const result = await collaborativeHiveFlow({
        objective: 'Quality test',
        userId: 'test-user',
        mode: 'sequential',
        agents: ['researcher', 'synthesizer'],
        maxRounds: 1,
        qualityThreshold: 0.5,
      });

      expect(result.quality.overallConfidence).toBeGreaterThanOrEqual(0);
      expect(result.quality.overallConfidence).toBeLessThanOrEqual(1);
      expect(typeof result.quality.consensusReached).toBe('boolean');
      expect(result.quality.agentAgreement).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Convenience Functions', () => {
    beforeEach(() => {
      mockMollyGenerate.mockResolvedValue({
        text: 'Clear and confident contribution.',
      });
    });

    it('runCollaborativeHive() uses sequential mode', async () => {
      const { runCollaborativeHive } = await import('../collaborative-hive');

      const result = await runCollaborativeHive('Test objective', 'test-user');

      expect(result).toBeDefined();
      expect(result.mode).toBe('sequential');
    });

    it('quickHive() uses rapid mode with fewer agents', async () => {
      const { quickHive } = await import('../collaborative-hive');

      const result = await quickHive('Quick problem', 'test-user');

      expect(result).toBeDefined();
      expect(result.mode).toBe('rapid');
    });

    it('deepHive() uses debate mode with more rounds', async () => {
      const { deepHive } = await import('../collaborative-hive');

      const result = await deepHive(
        'Complex problem',
        'test-user',
        'Extra context'
      );

      expect(result).toBeDefined();
      expect(result.mode).toBe('debate');
    });

    it('consensusHive() uses consensus mode', async () => {
      const { consensusHive } = await import('../collaborative-hive');

      const result = await consensusHive('Consensus problem', 'test-user');

      expect(result).toBeDefined();
      expect(result.mode).toBe('consensus');
    });

    it('designReviewHive() uses debate mode for architecture', async () => {
      const { designReviewHive } = await import('../collaborative-hive');

      const result = await designReviewHive('Review this design', 'test-user');

      expect(result).toBeDefined();
      expect(result.mode).toBe('debate');
      expect(result.objective).toContain('Review and improve');
    });

    it('researchHive() uses sequential mode for research', async () => {
      const { researchHive } = await import('../collaborative-hive');

      const result = await researchHive('Research topic', 'test-user');

      expect(result).toBeDefined();
      expect(result.mode).toBe('sequential');
      expect(result.objective).toContain('Research and synthesize');
    });
  });

  describe('Fallback Handling', () => {
    it('returns fallback output on complete failure', async () => {
      mockMollyGenerate.mockRejectedValue(new Error('All agents failed'));

      const { collaborativeHiveFlow } = await import('../collaborative-hive');

      const result = await collaborativeHiveFlow({
        objective: 'Failing objective',
        userId: 'test-user',
        mode: 'sequential',
        agents: ['researcher'],
        maxRounds: 1,
        qualityThreshold: 0.5,
      });

      expect(result.isSuccess).toBe(false);
      expect(result.contributions.length).toBe(0);
      expect(result.synthesis.summary).toContain('error');
    });

    it('fallback includes retry recommendation', async () => {
      mockMollyGenerate.mockRejectedValue(new Error('Error'));

      const { collaborativeHiveFlow } = await import('../collaborative-hive');

      const result = await collaborativeHiveFlow({
        objective: 'Test fallback',
        userId: 'test-user',
        mode: 'sequential',
        agents: ['researcher'],
        maxRounds: 1,
        qualityThreshold: 0.5,
      });

      expect(result.synthesis.nextSteps).toContain('Retry');
      expect(result.critique.recommendations).toEqual(
        expect.arrayContaining([expect.stringContaining('Retry')])
      );
    });
  });

  describe('Methodology Logging', () => {
    it('logs methodology steps for each agent', async () => {
      const { collaborativeHiveFlow } = await import('../collaborative-hive');

      await collaborativeHiveFlow({
        objective: 'Test logging',
        userId: 'test-user',
        mode: 'sequential',
        agents: ['researcher', 'architect', 'auditor'],
        maxRounds: 1,
        qualityThreshold: 0.5,
      });

      // Should log for memory recall, each agent, and audit
      expect(mockLogMethodologyStep).toHaveBeenCalled();
    });
  });
});
