/**
 * @fileOverview Tests for Self-Observation Tool — Molly's Self-Awareness
 *
 * Tests self-observation actions including:
 * - Status retrieval
 * - Pattern listing and filtering
 * - Insight management
 * - Observation history
 * - Pattern acknowledgment
 * - Insight application
 * - Decision reflection
 * - Full observation cycle
 */

// Mock the self-observation-loop module
const mockGetObservationStatus = jest.fn();
const mockGetPatterns = jest.fn();
const mockGetInsights = jest.fn();
const mockGetRecentObservations = jest.fn();
const mockAcknowledgePattern = jest.fn();
const mockApplyInsight = jest.fn();
const mockAnalyzePatterns = jest.fn();
const mockGenerateInsights = jest.fn();
const mockRunSelfObservationCycle = jest.fn();
const mockObserveDecision = jest.fn();

jest.mock('../../agency/cognition/self-observation-loop', () => ({
  getObservationStatus: mockGetObservationStatus,
  getPatterns: mockGetPatterns,
  getInsights: mockGetInsights,
  getRecentObservations: mockGetRecentObservations,
  acknowledgePattern: mockAcknowledgePattern,
  applyInsight: mockApplyInsight,
  analyzePatterns: mockAnalyzePatterns,
  generateInsights: mockGenerateInsights,
  runSelfObservationCycle: mockRunSelfObservationCycle,
  observeDecision: mockObserveDecision,
}));

// Mock defineTool to capture the handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let toolHandler: (input: any) => Promise<any>;

jest.mock('@genkit-ai/ai', () => ({
  defineTool: jest.fn((config, handler) => {
    toolHandler = handler;
    return { __config: config, __handler: handler };
  }),
}));

describe('Self-Observation Tool', () => {
  beforeAll(async () => {
    await import('../self-observation');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('status action', () => {
    it('returns observation status', async () => {
      mockGetObservationStatus.mockReturnValue({
        observationsInWindow: 50,
        totalObservations: 100,
        bySeverity: {
          info: 5,
          noteworthy: 3,
          concerning: 1,
          critical: 0,
        },
      });

      const result = await toolHandler({ action: 'status' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('observations tracked');
      expect(result.data).toBeDefined();
    });

    it('highlights critical patterns in message', async () => {
      mockGetObservationStatus.mockReturnValue({
        observationsInWindow: 20,
        bySeverity: {
          info: 0,
          noteworthy: 0,
          concerning: 0,
          critical: 2,
        },
      });

      const result = await toolHandler({ action: 'status' });

      expect(result.message).toContain('CRITICAL');
      expect(result.message).toContain('2');
    });

    it('highlights concerning patterns in message', async () => {
      mockGetObservationStatus.mockReturnValue({
        observationsInWindow: 30,
        bySeverity: {
          info: 10,
          noteworthy: 5,
          concerning: 3,
          critical: 0,
        },
      });

      const result = await toolHandler({ action: 'status' });

      expect(result.message).toContain('concerning');
    });
  });

  describe('patterns action', () => {
    it('returns patterns list', async () => {
      mockGetPatterns.mockReturnValue([
        {
          id: 'pat_1',
          name: 'Test Pattern',
          severity: 'noteworthy',
          type: 'repetition',
          interpretation: 'This is a test pattern that was detected.',
          recommendation: 'Review this pattern',
        },
      ]);

      const result = await toolHandler({ action: 'patterns' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('1 patterns detected');
      expect(result.data.patterns).toHaveLength(1);
    });

    it('filters by severity', async () => {
      mockGetPatterns.mockReturnValue([]);

      await toolHandler({ action: 'patterns', severity: 'critical' });

      expect(mockGetPatterns).toHaveBeenCalledWith('critical', undefined);
    });

    it('filters by acknowledged status', async () => {
      mockGetPatterns.mockReturnValue([]);

      await toolHandler({ action: 'patterns', acknowledged: false });

      expect(mockGetPatterns).toHaveBeenCalledWith(undefined, false);
    });

    it('truncates long interpretation', async () => {
      mockGetPatterns.mockReturnValue([
        {
          id: 'pat_1',
          name: 'Long Pattern',
          severity: 'info',
          type: 'trend',
          interpretation: 'X'.repeat(200),
          recommendation: 'Y'.repeat(200),
        },
      ]);

      const result = await toolHandler({ action: 'patterns' });

      expect(result.data.patterns[0].interpretation.length).toBeLessThanOrEqual(
        100
      );
    });

    it('limits to 5 patterns in summary', async () => {
      mockGetPatterns.mockReturnValue(
        Array.from({ length: 10 }, (_, i) => ({
          id: `pat_${i}`,
          name: `Pattern ${i}`,
          severity: 'info',
          type: 'repetition',
          interpretation: 'Test',
        }))
      );

      const result = await toolHandler({ action: 'patterns' });

      expect(result.data.patterns.length).toBe(5);
      expect(result.data.count).toBe(10);
    });
  });

  describe('insights action', () => {
    it('returns insights list', async () => {
      mockGetInsights.mockReturnValue([
        {
          id: 'insight_1',
          insight: 'You are improving',
          action: 'Keep it up',
          applied: false,
        },
      ]);

      const result = await toolHandler({ action: 'insights' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('1 insights generated');
    });

    it('filters by applied status', async () => {
      mockGetInsights.mockReturnValue([]);

      await toolHandler({ action: 'insights', applied: true });

      expect(mockGetInsights).toHaveBeenCalledWith(true);
    });

    it('truncates long insight text', async () => {
      mockGetInsights.mockReturnValue([
        {
          id: 'insight_1',
          insight: 'I'.repeat(200),
          action: 'A'.repeat(200),
          applied: false,
        },
      ]);

      const result = await toolHandler({ action: 'insights' });

      expect(result.data.insights[0].insight.length).toBeLessThanOrEqual(150);
      expect(result.data.insights[0].action.length).toBeLessThanOrEqual(100);
    });
  });

  describe('history action', () => {
    it('returns recent observations', async () => {
      mockGetRecentObservations.mockReturnValue([
        {
          id: 'obs_1',
          type: 'tool_use',
          subject: 'searchGitHub',
          timestamp: new Date().toISOString(),
          data: { success: true },
        },
      ]);

      const result = await toolHandler({ action: 'history' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('1 recent observations');
    });

    it('filters by observation type', async () => {
      mockGetRecentObservations.mockReturnValue([]);

      await toolHandler({ action: 'history', observationType: 'failure' });

      expect(mockGetRecentObservations).toHaveBeenCalledWith('failure', 10);
    });

    it('uses custom limit', async () => {
      mockGetRecentObservations.mockReturnValue([]);

      await toolHandler({ action: 'history', limit: 25 });

      expect(mockGetRecentObservations).toHaveBeenCalledWith(undefined, 25);
    });

    it('uses default limit of 10', async () => {
      mockGetRecentObservations.mockReturnValue([]);

      await toolHandler({ action: 'history' });

      expect(mockGetRecentObservations).toHaveBeenCalledWith(undefined, 10);
    });
  });

  describe('analyze action', () => {
    it('triggers pattern analysis', async () => {
      mockAnalyzePatterns.mockReturnValue([
        { id: 'pat_1', severity: 'noteworthy' },
        { id: 'pat_2', severity: 'concerning' },
      ]);
      mockGenerateInsights.mockReturnValue([{ id: 'insight_1' }]);

      const result = await toolHandler({ action: 'analyze' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('2 patterns');
      expect(result.message).toContain('1 new insights');
    });

    it('counts concerning patterns', async () => {
      mockAnalyzePatterns.mockReturnValue([
        { id: '1', severity: 'critical' },
        { id: '2', severity: 'concerning' },
        { id: '3', severity: 'info' },
      ]);
      mockGenerateInsights.mockReturnValue([]);

      const result = await toolHandler({ action: 'analyze' });

      expect(result.data.concerning).toBe(2);
    });
  });

  describe('acknowledge action', () => {
    it('acknowledges pattern with valid ID', async () => {
      mockAcknowledgePattern.mockReturnValue(true);

      const result = await toolHandler({
        action: 'acknowledge',
        patternId: 'pat_123',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Pattern acknowledged');
      expect(mockAcknowledgePattern).toHaveBeenCalledWith('pat_123');
    });

    it('fails when patternId is missing', async () => {
      const result = await toolHandler({ action: 'acknowledge' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Missing patternId');
    });

    it('fails when pattern not found', async () => {
      mockAcknowledgePattern.mockReturnValue(false);

      const result = await toolHandler({
        action: 'acknowledge',
        patternId: 'nonexistent',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('apply action', () => {
    it('applies insight with valid ID', async () => {
      mockApplyInsight.mockReturnValue(true);

      const result = await toolHandler({
        action: 'apply',
        insightId: 'insight_456',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('applied');
      expect(mockApplyInsight).toHaveBeenCalledWith('insight_456');
    });

    it('fails when insightId is missing', async () => {
      const result = await toolHandler({ action: 'apply' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Missing insightId');
    });

    it('fails when insight not found', async () => {
      mockApplyInsight.mockReturnValue(false);

      const result = await toolHandler({
        action: 'apply',
        insightId: 'nonexistent',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('reflect action', () => {
    it('records decision with all required fields', async () => {
      const result = await toolHandler({
        action: 'reflect',
        decision: 'Which tool to use',
        options: ['A', 'B', 'C'],
        chosen: 'B',
        outcome: 'positive',
        context: 'Testing context',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Decision recorded');
      expect(result.message).toContain('Which tool to use');
      expect(result.message).toContain('B');
      expect(result.message).toContain('positive');
    });

    it('uses empty string for missing context', async () => {
      await toolHandler({
        action: 'reflect',
        decision: 'Test decision',
        options: ['X', 'Y'],
        chosen: 'X',
        outcome: 'neutral',
      });

      expect(mockObserveDecision).toHaveBeenCalledWith(
        'Test decision',
        ['X', 'Y'],
        'X',
        'neutral',
        ''
      );
    });

    it('fails when decision is missing', async () => {
      const result = await toolHandler({
        action: 'reflect',
        options: ['A', 'B'],
        chosen: 'A',
        outcome: 'positive',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Missing required fields');
    });

    it('fails when options is missing', async () => {
      const result = await toolHandler({
        action: 'reflect',
        decision: 'Test',
        chosen: 'A',
        outcome: 'positive',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Missing required fields');
    });

    it('fails when chosen is missing', async () => {
      const result = await toolHandler({
        action: 'reflect',
        decision: 'Test',
        options: ['A', 'B'],
        outcome: 'positive',
      });

      expect(result.success).toBe(false);
    });

    it('fails when outcome is missing', async () => {
      const result = await toolHandler({
        action: 'reflect',
        decision: 'Test',
        options: ['A', 'B'],
        chosen: 'A',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('cycle action', () => {
    it('runs full self-observation cycle', async () => {
      mockRunSelfObservationCycle.mockResolvedValue({
        analyzed: true,
        newPatterns: 5,
        newInsights: 2,
        concerns: [],
      });

      const result = await toolHandler({ action: 'cycle' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('5 patterns');
      expect(result.message).toContain('2 insights');
    });

    it('includes concerns in message', async () => {
      mockRunSelfObservationCycle.mockResolvedValue({
        analyzed: true,
        newPatterns: 1,
        newInsights: 0,
        concerns: ['Critical failure rate', 'Unusual behavior'],
      });

      const result = await toolHandler({ action: 'cycle' });

      expect(result.message).toContain('CONCERNS');
      expect(result.message).toContain('Critical failure rate');
    });

    it('returns cycle data', async () => {
      mockRunSelfObservationCycle.mockResolvedValue({
        analyzed: true,
        newPatterns: 3,
        newInsights: 1,
        concerns: ['Issue 1'],
      });

      const result = await toolHandler({ action: 'cycle' });

      expect(result.data.newPatterns).toBe(3);
      expect(result.data.newInsights).toBe(1);
      expect(result.data.concerns).toContain('Issue 1');
    });

    it('handles analysis failure', async () => {
      mockRunSelfObservationCycle.mockResolvedValue({
        analyzed: false,
        newPatterns: 0,
        newInsights: 0,
        concerns: [],
      });

      const result = await toolHandler({ action: 'cycle' });

      expect(result.success).toBe(false);
    });
  });

  describe('unknown action', () => {
    it('returns error for unknown action', async () => {
      // Note: Zod schema would normally prevent this, but we test the handler
      const result = await toolHandler({ action: 'unknown' as unknown });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown action');
    });
  });

  describe('error handling', () => {
    it('catches and returns errors', async () => {
      mockGetObservationStatus.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const result = await toolHandler({ action: 'status' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Error');
      expect(result.message).toContain('Database connection failed');
    });

    it('handles non-Error exceptions', async () => {
      mockGetObservationStatus.mockImplementation(() => {
        throw 'String error';
      });

      const result = await toolHandler({ action: 'status' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('String error');
    });
  });
});
