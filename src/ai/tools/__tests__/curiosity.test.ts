/**
 * @fileOverview Tests for Curiosity Tool — Molly's Interface to Wonder
 *
 * Tests curiosity operations including:
 * - Question generation and management
 * - Investigation lifecycle
 * - Status and listing
 * - Curiosity cycle
 * - Error handling
 */

// Mock the curiosity engine before imports
const mockGenerateQuestion = jest.fn();
const mockSelectNextQuestion = jest.fn();
const mockBeginInvestigation = jest.fn();
const mockRecordInvestigationStep = jest.fn();
const mockCompleteInvestigation = jest.fn();
const mockAbandonInvestigation = jest.fn();
const mockDeferQuestion = jest.fn();
const mockGetCuriosityStatus = jest.fn();
const mockGetActiveQuestions = jest.fn();
const mockGetQuestionById = jest.fn();
const mockCuriousFromConversation = jest.fn();
const mockCuriousAboutSelf = jest.fn();
const mockRunCuriosityCycle = jest.fn();

jest.mock('../../agency/curiosity-engine', () => ({
  generateQuestion: (...args: unknown[]) => mockGenerateQuestion(...args),
  selectNextQuestion: (...args: unknown[]) => mockSelectNextQuestion(...args),
  beginInvestigation: (...args: unknown[]) => mockBeginInvestigation(...args),
  recordInvestigationStep: (...args: unknown[]) =>
    mockRecordInvestigationStep(...args),
  completeInvestigation: (...args: unknown[]) =>
    mockCompleteInvestigation(...args),
  abandonInvestigation: (...args: unknown[]) =>
    mockAbandonInvestigation(...args),
  deferQuestion: (...args: unknown[]) => mockDeferQuestion(...args),
  getCuriosityStatus: (...args: unknown[]) => mockGetCuriosityStatus(...args),
  getActiveQuestions: (...args: unknown[]) => mockGetActiveQuestions(...args),
  getQuestionById: (...args: unknown[]) => mockGetQuestionById(...args),
  curiousFromConversation: (...args: unknown[]) =>
    mockCuriousFromConversation(...args),
  curiousAboutSelf: (...args: unknown[]) => mockCuriousAboutSelf(...args),
  runCuriosityCycle: (...args: unknown[]) => mockRunCuriosityCycle(...args),
}));

// Store the tool info
const toolInfo: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler?: (input: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config?: any;
} = {};

jest.mock('@genkit-ai/ai', () => ({
  defineTool: jest.fn((config, handler) => {
    toolInfo.config = config;
    toolInfo.handler = handler;
    return { __config: config, __handler: handler };
  }),
}));

describe('Curiosity Tool', () => {
  beforeAll(async () => {
    // Dynamic import triggers tool definition
    await import('../curiosity');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Wonder Action', () => {
    it('generates question with all fields', async () => {
      mockGenerateQuestion.mockReturnValue({
        id: 'q-123',
        type: 'pattern',
        question: 'Why do users always start sessions at midnight?',
        priority: 75,
      });

      const result = await toolInfo.handler!({
        action: 'wonder',
        type: 'pattern',
        source: 'observation',
        observation: 'Users logging in at midnight',
        context: 'Analytics data',
        priority: 75,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Now wondering');
      expect(result.data.id).toBe('q-123');
      expect(result.data.type).toBe('pattern');

      expect(mockGenerateQuestion).toHaveBeenCalledWith(
        'pattern',
        'observation',
        'Users logging in at midnight',
        'Analytics data',
        75
      );
    });

    it('uses default values when optional fields missing', async () => {
      mockGenerateQuestion.mockReturnValue({
        id: 'q-456',
        type: 'gap',
        question: 'A generated question',
        priority: 50,
      });

      await toolInfo.handler!({
        action: 'wonder',
        type: 'gap',
        observation: 'Something interesting',
      });

      expect(mockGenerateQuestion).toHaveBeenCalledWith(
        'gap',
        'self_reflection', // default source
        'Something interesting',
        '', // default context
        50 // default priority
      );
    });

    it('fails without required fields', async () => {
      const result = await toolInfo.handler!({
        action: 'wonder',
        // Missing type and observation
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Missing required fields');
    });

    it('fails with type but no observation', async () => {
      const result = await toolInfo.handler!({
        action: 'wonder',
        type: 'connection',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('observation');
    });
  });

  describe('Status Action', () => {
    it('returns curiosity status', async () => {
      mockGetCuriosityStatus.mockReturnValue({
        uninvestigatedCount: 5,
        activeInvestigations: 2,
        totalQuestions: 10,
        satisfiedCount: 3,
      });

      const result = await toolInfo.handler!({ action: 'status' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('5 questions to explore');
      expect(result.message).toContain('2 active investigations');
      expect(result.data.totalQuestions).toBe(10);
    });
  });

  describe('List Action', () => {
    it('lists active questions', async () => {
      mockGetActiveQuestions.mockReturnValue([
        {
          id: 'q-1',
          type: 'pattern',
          priority: 80,
          question: 'First question about patterns',
        },
        {
          id: 'q-2',
          type: 'gap',
          priority: 60,
          question: 'Second question about gaps',
        },
      ]);

      const result = await toolInfo.handler!({ action: 'list' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('2 active');
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe('q-1');
    });

    it('limits to 10 questions', async () => {
      mockGetActiveQuestions.mockReturnValue(
        Array.from({ length: 20 }, (_, i) => ({
          id: `q-${i}`,
          type: 'pattern',
          priority: 50,
          question: `Question ${i}`,
        }))
      );

      const result = await toolInfo.handler!({ action: 'list' });

      expect(result.data).toHaveLength(10);
    });

    it('truncates long questions', async () => {
      const longQuestion = 'A'.repeat(200);
      mockGetActiveQuestions.mockReturnValue([
        { id: 'q-1', type: 'pattern', priority: 50, question: longQuestion },
      ]);

      const result = await toolInfo.handler!({ action: 'list' });

      expect(result.data[0].question.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Select Action', () => {
    it('selects next question', async () => {
      mockSelectNextQuestion.mockReturnValue({
        id: 'q-selected',
        type: 'improvement',
        priority: 90,
        question: 'How can we optimize this?',
        keywords: ['optimize', 'performance'],
      });

      const result = await toolInfo.handler!({ action: 'select' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Selected');
      expect(result.data.id).toBe('q-selected');
      expect(result.data.keywords).toContain('optimize');
    });

    it('fails when no questions available', async () => {
      mockSelectNextQuestion.mockReturnValue(null);

      const result = await toolInfo.handler!({ action: 'select' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('No questions available');
    });
  });

  describe('Investigate Action', () => {
    it('begins investigation', async () => {
      mockBeginInvestigation.mockReturnValue({
        startedAt: Date.now(),
        steps: [],
      });
      mockGetQuestionById.mockReturnValue({
        question: 'Why does this happen?',
      });

      const result = await toolInfo.handler!({
        action: 'investigate',
        questionId: 'q-123',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Investigation begun');
      expect(result.data.questionId).toBe('q-123');
    });

    it('fails without questionId', async () => {
      const result = await toolInfo.handler!({ action: 'investigate' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Missing questionId');
    });

    it('fails when question not found', async () => {
      mockBeginInvestigation.mockReturnValue(null);

      const result = await toolInfo.handler!({
        action: 'investigate',
        questionId: 'nonexistent',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('Step Action', () => {
    it('records investigation step', async () => {
      mockRecordInvestigationStep.mockReturnValue(true);

      const result = await toolInfo.handler!({
        action: 'step',
        questionId: 'q-123',
        tool: 'webSearch',
        stepDescription: 'Searched for relevant documentation',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Recorded step');
      expect(mockRecordInvestigationStep).toHaveBeenCalledWith(
        'q-123',
        'webSearch',
        'Searched for relevant documentation'
      );
    });

    it('fails without required fields', async () => {
      const result = await toolInfo.handler!({
        action: 'step',
        questionId: 'q-123',
        // Missing tool and stepDescription
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Missing required fields');
    });

    it('fails when investigation not found', async () => {
      mockRecordInvestigationStep.mockReturnValue(false);

      const result = await toolInfo.handler!({
        action: 'step',
        questionId: 'q-999',
        tool: 'search',
        stepDescription: 'Tried something',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('Complete Action', () => {
    it('completes investigation with satisfaction', async () => {
      mockCompleteInvestigation.mockReturnValue(true);

      const result = await toolInfo.handler!({
        action: 'complete',
        questionId: 'q-123',
        findings: 'Found the answer in the docs',
        satisfied: true,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('curiosity satisfied');
    });

    it('completes investigation without satisfaction', async () => {
      mockCompleteInvestigation.mockReturnValue(true);

      const result = await toolInfo.handler!({
        action: 'complete',
        questionId: 'q-123',
        findings: 'Partial understanding gained',
        satisfied: false,
        followUpQuestions: ['What about edge cases?', 'Why this approach?'],
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('more to learn');
      expect(result.data.followUpQuestions).toHaveLength(2);
    });

    it('fails without required fields', async () => {
      const result = await toolInfo.handler!({
        action: 'complete',
        questionId: 'q-123',
        // Missing findings and satisfied
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Missing required fields');
    });

    it('fails when investigation not found', async () => {
      mockCompleteInvestigation.mockReturnValue(false);

      const result = await toolInfo.handler!({
        action: 'complete',
        questionId: 'q-999',
        findings: 'Something',
        satisfied: true,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('Abandon Action', () => {
    it('abandons investigation with reason', async () => {
      mockAbandonInvestigation.mockReturnValue(true);

      const result = await toolInfo.handler!({
        action: 'abandon',
        questionId: 'q-123',
        reason: 'Too complex for current tools',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('abandoned');
      expect(result.message).toContain('Too complex');
    });

    it('fails without required fields', async () => {
      const result = await toolInfo.handler!({
        action: 'abandon',
        questionId: 'q-123',
        // Missing reason
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Missing required fields');
    });

    it('fails when investigation not found', async () => {
      mockAbandonInvestigation.mockReturnValue(false);

      const result = await toolInfo.handler!({
        action: 'abandon',
        questionId: 'q-999',
        reason: 'Not relevant',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('Defer Action', () => {
    it('defers question for later', async () => {
      mockDeferQuestion.mockReturnValue(true);

      const result = await toolInfo.handler!({
        action: 'defer',
        questionId: 'q-123',
        reason: 'Need more context first',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('deferred');
    });

    it('fails without questionId', async () => {
      const result = await toolInfo.handler!({ action: 'defer' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Missing questionId');
    });

    it('fails when question not found', async () => {
      mockDeferQuestion.mockReturnValue(false);

      const result = await toolInfo.handler!({
        action: 'defer',
        questionId: 'q-999',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('Cycle Action', () => {
    it('runs curiosity cycle with investigation', async () => {
      mockRunCuriosityCycle.mockResolvedValue({
        investigated: true,
        message: 'Investigated question about patterns',
        question: {
          id: 'q-cycled',
          question: 'A cycled question',
          type: 'pattern',
        },
      });

      const result = await toolInfo.handler!({ action: 'cycle' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Investigated');
      expect(result.data.id).toBe('q-cycled');
    });

    it('runs curiosity cycle without investigation', async () => {
      mockRunCuriosityCycle.mockResolvedValue({
        investigated: false,
        message: 'No questions to investigate',
        question: null,
      });

      const result = await toolInfo.handler!({ action: 'cycle' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('No questions');
      expect(result.data).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('handles unknown action', async () => {
      const result = await toolInfo.handler!({ action: 'invalid' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown action');
    });

    it('handles thrown errors', async () => {
      mockGetCuriosityStatus.mockImplementation(() => {
        throw new Error('Engine crashed');
      });

      const result = await toolInfo.handler!({ action: 'status' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Error');
      expect(result.message).toContain('Engine crashed');
    });

    it('handles non-Error thrown values', async () => {
      mockGetCuriosityStatus.mockImplementation(() => {
        throw 'String error';
      });

      const result = await toolInfo.handler!({ action: 'status' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('String error');
    });
  });

  describe('Tool Configuration', () => {
    it('is named curiosity', () => {
      expect(toolInfo.config.name).toBe('curiosity');
    });

    it('has comprehensive description', () => {
      expect(toolInfo.config.description).toContain('wonder');
      expect(toolInfo.config.description).toContain('investigate');
    });
  });

  describe('All Curiosity Types', () => {
    const types = [
      'pattern',
      'gap',
      'connection',
      'contradiction',
      'improvement',
      'origin',
    ] as const;

    it.each(types)('accepts %s type', async (type) => {
      mockGenerateQuestion.mockReturnValue({
        id: `q-${type}`,
        type,
        question: `Question about ${type}`,
        priority: 50,
      });

      const result = await toolInfo.handler!({
        action: 'wonder',
        type,
        observation: 'Test observation',
      });

      expect(result.success).toBe(true);
      expect(result.data.type).toBe(type);
    });
  });

  describe('All Source Types', () => {
    const sources = [
      'memory',
      'failure',
      'conversation',
      'tool_use',
      'observation',
      'self_reflection',
    ] as const;

    it.each(sources)('accepts %s source', async (source) => {
      mockGenerateQuestion.mockReturnValue({
        id: 'q-source-test',
        type: 'pattern',
        question: 'Test question',
        priority: 50,
      });

      const result = await toolInfo.handler!({
        action: 'wonder',
        type: 'pattern',
        source,
        observation: 'Test',
      });

      expect(result.success).toBe(true);
      expect(mockGenerateQuestion).toHaveBeenCalledWith(
        'pattern',
        source,
        expect.any(String),
        expect.any(String),
        expect.any(Number)
      );
    });
  });
});
