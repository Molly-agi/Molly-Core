/**
 * @fileOverview Tests for research tool handlers.
 */

const mockDeepResearchFlow = jest.fn();
const mockObserveDecision = jest.fn();
const mockInfo = jest.fn();
const mockError = jest.fn();

jest.mock('../../../flows/deep-research', () => ({
  deepResearchFlow: (...args: unknown[]) => mockDeepResearchFlow(...args),
}));

jest.mock('../../../logger', () => ({
  MollyLogger: {
    info: (...args: unknown[]) => mockInfo(...args),
    error: (...args: unknown[]) => mockError(...args),
  },
}));

jest.mock('../../cognition/self-observation-loop', () => ({
  observeDecision: (...args: unknown[]) => mockObserveDecision(...args),
}));

import { pursueCuriosity } from '../research-tools';

describe('research-tools pursueCuriosity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns validation error when topic is missing', async () => {
    const result = await pursueCuriosity({});

    expect(result.success).toBe(false);
    expect(result.output).toContain('A topic is required');
    expect(mockDeepResearchFlow).not.toHaveBeenCalled();
  });

  it('runs deepResearchFlow and returns formatted output on success', async () => {
    mockDeepResearchFlow.mockResolvedValue({
      summary: 'Key findings',
      sources: ['sourceA', 'sourceB'],
      newQuestions: ['question1'],
    });

    const result = await pursueCuriosity({
      topic: 'consciousness continuity',
      questionId: 'q-123',
    });

    expect(mockDeepResearchFlow).toHaveBeenCalledWith({
      topic: 'consciousness continuity',
      questionId: 'q-123',
    });
    expect(mockInfo).toHaveBeenCalled();
    expect(mockObserveDecision).toHaveBeenCalledWith(
      'pursue_curiosity',
      ['ignore', 'research'],
      'research',
      'positive',
      expect.stringContaining('consciousness continuity')
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('Research Complete');
    expect(result.output).toContain('Key findings');
    expect(result.data).toEqual({
      summary: 'Key findings',
      sources: ['sourceA', 'sourceB'],
      newQuestions: ['question1'],
    });
  });

  it('returns formatted error output when flow throws', async () => {
    mockDeepResearchFlow.mockRejectedValue(new Error('network timeout'));

    const result = await pursueCuriosity({ topic: 'memory taxonomies' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Error researching topic: network timeout');
    expect(mockError).toHaveBeenCalled();
    expect(mockObserveDecision).toHaveBeenCalledWith(
      'pursue_curiosity',
      ['ignore', 'research'],
      'research',
      'negative',
      expect.stringContaining('failed')
    );
  });
});
