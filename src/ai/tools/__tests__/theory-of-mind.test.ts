/**
 * @fileOverview Tests for Theory of Mind Tool — Mental State Modeling
 *
 * Tests theory of mind functionality including:
 * - Knowledge tracking
 * - Intent inference
 * - Emotional state management
 * - Preference observation
 * - Perspective taking
 */

// Mock the theory-of-mind agency
jest.mock('../../agency/cognition/theory-of-mind', () => ({
  updateKnowledge: jest.fn(),
  getKnowledge: jest.fn(),
  doesEricKnow: jest.fn(),
  listKnowledge: jest.fn(),
  inferIntent: jest.fn(),
  completeIntent: jest.fn(),
  getActiveIntents: jest.fn(),
  getCurrentFocus: jest.fn(),
  updateEmotionalState: jest.fn(),
  inferEmotionalState: jest.fn(),
  getCurrentEmotionalState: jest.fn(),
  observePreference: jest.fn(),
  getPreference: jest.fn(),
  getPreferences: jest.fn(),
  updateCommunicationStyle: jest.fn(),
  takePerspective: jest.fn(),
  processMessage: jest.fn(),
  startSession: jest.fn(),
  getTheoryOfMindStatus: jest.fn(),
  exportMentalModel: jest.fn(),
}));

import * as tomModule from '../../agency/cognition/theory-of-mind';

// Mock defineTool to capture the handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let toolHandler: (input: any) => Promise<any>;

jest.mock('@genkit-ai/ai', () => ({
  defineTool: jest.fn((config, handler) => {
    toolHandler = handler;
    return { __config: config, __handler: handler };
  }),
}));

const mockUpdateKnowledge = tomModule.updateKnowledge as jest.MockedFunction<
  typeof tomModule.updateKnowledge
>;
const mockDoesEricKnow = tomModule.doesEricKnow as jest.MockedFunction<
  typeof tomModule.doesEricKnow
>;
const mockGetKnowledge = tomModule.getKnowledge as jest.MockedFunction<
  typeof tomModule.getKnowledge
>;
const mockListKnowledge = tomModule.listKnowledge as jest.MockedFunction<
  typeof tomModule.listKnowledge
>;
const mockInferIntent = tomModule.inferIntent as jest.MockedFunction<
  typeof tomModule.inferIntent
>;
const mockCompleteIntent = tomModule.completeIntent as jest.MockedFunction<
  typeof tomModule.completeIntent
>;
const mockGetActiveIntents = tomModule.getActiveIntents as jest.MockedFunction<
  typeof tomModule.getActiveIntents
>;
const mockGetCurrentFocus = tomModule.getCurrentFocus as jest.MockedFunction<
  typeof tomModule.getCurrentFocus
>;
const mockUpdateEmotionalState =
  tomModule.updateEmotionalState as jest.MockedFunction<
    typeof tomModule.updateEmotionalState
  >;
const mockInferEmotionalState =
  tomModule.inferEmotionalState as jest.MockedFunction<
    typeof tomModule.inferEmotionalState
  >;
const mockGetCurrentEmotionalState =
  tomModule.getCurrentEmotionalState as jest.MockedFunction<
    typeof tomModule.getCurrentEmotionalState
  >;
const mockObservePreference =
  tomModule.observePreference as jest.MockedFunction<
    typeof tomModule.observePreference
  >;
const mockGetPreference = tomModule.getPreference as jest.MockedFunction<
  typeof tomModule.getPreference
>;
const mockGetPreferences = tomModule.getPreferences as jest.MockedFunction<
  typeof tomModule.getPreferences
>;
const mockTakePerspective = tomModule.takePerspective as jest.MockedFunction<
  typeof tomModule.takePerspective
>;
const mockProcessMessage = tomModule.processMessage as jest.MockedFunction<
  typeof tomModule.processMessage
>;
const mockGetTheoryOfMindStatus =
  tomModule.getTheoryOfMindStatus as jest.MockedFunction<
    typeof tomModule.getTheoryOfMindStatus
  >;
const mockExportMentalModel =
  tomModule.exportMentalModel as jest.MockedFunction<
    typeof tomModule.exportMentalModel
  >;

describe('Theory of Mind Tool', () => {
  beforeAll(async () => {
    await import('../theory-of-mind');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Knowledge Actions', () => {
    it('learns knowledge about a topic', async () => {
      mockUpdateKnowledge.mockReturnValue({
        topic: 'TypeScript',
        knowledgeLevel: 'expert',
        confidence: 0.9,
      } as unknown);

      const result = await toolHandler({
        action: 'learnKnowledge',
        topic: 'TypeScript',
        description: 'Eric is proficient in TypeScript',
        knowledgeLevel: 'expert',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('TypeScript');
    });

    it('requires topic for learnKnowledge', async () => {
      const result = await toolHandler({ action: 'learnKnowledge' });
      expect(result.success).toBe(false);
      expect(result.message).toContain('Missing topic');
    });

    it('checks if Eric knows a topic', async () => {
      mockDoesEricKnow.mockReturnValue({
        knows: true,
        level: 'familiar',
        confidence: 0.8,
      });
      mockGetKnowledge.mockReturnValue(null);

      const result = await toolHandler({
        action: 'checkKnowledge',
        topic: 'React',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Eric knows');
    });

    it('lists knowledge', async () => {
      mockListKnowledge.mockReturnValue([
        { topic: 'js', knowledgeLevel: 'expert' },
        { topic: 'python', knowledgeLevel: 'familiar' },
      ] as unknown);

      const result = await toolHandler({ action: 'listKnowledge' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('2 knowledge item');
    });
  });

  describe('Intent Actions', () => {
    it('infers intent', async () => {
      mockInferIntent.mockReturnValue({
        id: 'intent_1',
        description: 'Build a feature',
        type: 'session',
        priority: 7,
        confidence: 0.8,
      } as unknown);

      const result = await toolHandler({
        action: 'inferIntent',
        intentDescription: 'Build a feature',
        intentType: 'session',
        priority: 7,
      });

      expect(result.success).toBe(true);
      expect(result.data.description).toBe('Build a feature');
    });

    it('requires intentDescription', async () => {
      const result = await toolHandler({ action: 'inferIntent' });
      expect(result.success).toBe(false);
    });

    it('completes intent', async () => {
      mockCompleteIntent.mockReturnValue(true);

      const result = await toolHandler({
        action: 'completeIntent',
        intentId: 'intent_123',
      });

      expect(result.success).toBe(true);
    });

    it('gets active intents', async () => {
      mockGetActiveIntents.mockReturnValue([
        {
          id: '1',
          description: 'Task 1',
          type: 'immediate',
          priority: 5,
          confidence: 0.7,
        },
      ] as unknown);

      const result = await toolHandler({ action: 'activeIntents' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('1 active intent');
    });

    it('gets current focus', async () => {
      mockGetCurrentFocus.mockReturnValue({
        id: 'f1',
        description: 'Current task',
        type: 'immediate',
        priority: 8,
      } as unknown);

      const result = await toolHandler({ action: 'currentFocus' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Current task');
    });

    it('handles no current focus', async () => {
      mockGetCurrentFocus.mockReturnValue(null);

      const result = await toolHandler({ action: 'currentFocus' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('No clear current focus');
    });
  });

  describe('Emotional Actions', () => {
    it('updates emotional state', async () => {
      const result = await toolHandler({
        action: 'updateEmotion',
        emotionalState: 'focused',
        intensity: 0.8,
        trigger: 'Deep work session',
      });

      expect(result.success).toBe(true);
      expect(mockUpdateEmotionalState).toHaveBeenCalledWith(
        'focused',
        0.8,
        'Deep work session',
        []
      );
    });

    it('requires emotionalState', async () => {
      const result = await toolHandler({ action: 'updateEmotion' });
      expect(result.success).toBe(false);
    });

    it('infers emotion from message', async () => {
      mockInferEmotionalState.mockReturnValue({
        state: 'frustrated',
        intensity: 0.6,
        indicators: ['exclamation marks', 'short responses'],
      });

      const result = await toolHandler({
        action: 'inferEmotion',
        message: 'This is broken again!',
      });

      expect(result.success).toBe(true);
      expect(result.data.state).toBe('frustrated');
    });

    it('gets current emotional state', async () => {
      mockGetCurrentEmotionalState.mockReturnValue({
        state: 'neutral',
        intensity: 0.5,
        trending: 'stable',
      });

      const result = await toolHandler({ action: 'currentEmotion' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('neutral');
    });
  });

  describe('Preference Actions', () => {
    it('observes preference', async () => {
      mockObservePreference.mockReturnValue({
        category: 'communication',
        key: 'verbosity',
        value: 'concise',
        strength: 0.9,
        observedCount: 5,
      } as unknown);

      const result = await toolHandler({
        action: 'observePreference',
        preferenceCategory: 'communication',
        preferenceKey: 'verbosity',
        preferenceValue: 'concise',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('verbosity');
    });

    it('requires all preference fields', async () => {
      const result = await toolHandler({
        action: 'observePreference',
        preferenceCategory: 'communication',
      });

      expect(result.success).toBe(false);
    });

    it('gets specific preference', async () => {
      mockGetPreference.mockReturnValue({
        key: 'theme',
        value: 'dark',
      } as unknown);

      const result = await toolHandler({
        action: 'getPreference',
        preferenceCategory: 'workflow',
        preferenceKey: 'theme',
      });

      expect(result.success).toBe(true);
    });

    it('lists preferences', async () => {
      mockGetPreferences.mockReturnValue([
        { key: 'a', value: '1' },
        { key: 'b', value: '2' },
      ] as unknown);

      const result = await toolHandler({ action: 'listPreferences' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('2 preference');
    });

    it('sets communication style', async () => {
      const result = await toolHandler({
        action: 'setCommunicationStyle',
        communicationStyle: 'detailed',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Perspective Actions', () => {
    it('takes perspective', async () => {
      mockTakePerspective.mockReturnValue({
        suggestedApproach: 'Be direct and technical',
        knowledgeRelevant: [],
        emotionalContext: 'focused',
      });

      const result = await toolHandler({
        action: 'perspective',
        situation: 'Debugging a complex issue',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('direct');
    });

    it('processes message', async () => {
      mockProcessMessage.mockReturnValue({
        emotionalState: 'curious',
        urgency: 'medium',
        suggestedApproach: 'Provide detailed explanation',
      });

      const result = await toolHandler({
        action: 'processMessage',
        message: 'How does this work?',
      });

      expect(result.success).toBe(true);
      expect(result.data.emotionalState).toBe('curious');
    });
  });

  describe('Session & Status Actions', () => {
    it('starts new session', async () => {
      const result = await toolHandler({ action: 'newSession' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('New session');
    });

    it('gets status', async () => {
      mockGetTheoryOfMindStatus.mockReturnValue({
        modelConfidence: 85,
        knowledgeItems: 20,
        activeIntents: 3,
      });

      const result = await toolHandler({ action: 'status' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('85%');
    });

    it('exports mental model', async () => {
      mockExportMentalModel.mockReturnValue({
        personName: 'Eric',
        knowledge: [],
        intents: [],
        preferences: [],
      });

      const result = await toolHandler({ action: 'export' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Eric');
    });
  });

  describe('Error Handling', () => {
    it('handles unknown action', async () => {
      const result = await toolHandler({ action: 'unknown' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown action');
    });

    it('catches and returns errors', async () => {
      mockUpdateKnowledge.mockImplementation(() => {
        throw new Error('Database error');
      });

      const result = await toolHandler({
        action: 'learnKnowledge',
        topic: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Database error');
    });
  });
});
