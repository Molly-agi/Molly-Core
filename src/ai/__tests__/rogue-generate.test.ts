/**
 * @fileOverview Rogue Generate Wrapper Tests
 *
 * Tests molly.generate() — the Rogue-aware wrapper that routes
 * LLM calls through the Model Router with fallback and health tracking.
 */

// Mock logger
jest.mock('../logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  generateTraceId: jest.fn(() => 'test-trace-rogue'),
}));

// Mock genkit-core — we don't want real LLM calls
jest.mock('../genkit-core', () => ({
  ai: {
    generate: jest.fn(),
    embed: jest.fn(),
  },
}));

// Mock model-router to control routing behavior
const mockResolveModel = jest.fn();
const mockReportSuccess = jest.fn();
const mockReportFailure = jest.fn();

jest.mock('../model-router', () => ({
  TaskType: {
    REASONING: 'reasoning',
    CREATIVE: 'creative',
    CHAT: 'chat',
    CODE: 'code',
    TTS: 'tts',
    IMAGE: 'image',
    EMBEDDING: 'embedding',
    VISION: 'vision',
    RESEARCH: 'research',
    BACKGROUND: 'background',
  },
  getModelRouter: jest.fn(() => ({
    resolveModel: mockResolveModel,
    reportSuccess: mockReportSuccess,
    reportFailure: mockReportFailure,
  })),
}));

import { molly } from '../rogue-generate';
import { ai } from '../genkit-core';
import { TaskType } from '../model-router';

const mockAiGenerate = ai.generate as jest.Mock;
const mockAiEmbed = ai.embed as jest.Mock;

// Helper: create a mock routing decision
function mockDecision(providerId: string, modelString: string, depth = 0) {
  return {
    provider: { id: providerId, name: `Provider ${providerId}` },
    modelString,
    taskType: TaskType.CHAT,
    reason: 'test',
    fallbackDepth: depth,
    routingLatencyMs: 0.5,
  };
}

describe('molly.generate() — Rogue Generate Wrapper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Basic Routing ──

  describe('Basic Routing', () => {
    it('routes through the model router and calls ai.generate()', async () => {
      mockResolveModel.mockResolvedValue(
        mockDecision('gemini', 'googleai/gemini-2.5-flash')
      );
      mockAiGenerate.mockResolvedValue({ text: 'Hello from Molly!' });

      const result = await molly.generate(TaskType.CHAT, {
        prompt: 'Hello',
        system: 'You are Molly.',
      });

      expect(result.text).toBe('Hello from Molly!');
      expect(mockResolveModel).toHaveBeenCalledWith(TaskType.CHAT);
      expect(mockAiGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'googleai/gemini-2.5-flash',
          prompt: 'Hello',
          system: 'You are Molly.',
        })
      );
    });

    it('passes all options through to ai.generate()', async () => {
      mockResolveModel.mockResolvedValue(
        mockDecision('gemini', 'googleai/gemini-2.5-pro')
      );
      mockAiGenerate.mockResolvedValue({ text: 'response' });

      const history = [
        { role: 'user', parts: [{ text: 'Hi' }] },
        { role: 'model', parts: [{ text: 'Hello!' }] },
      ];

      await molly.generate(TaskType.REASONING, {
        prompt: 'Analyze this code',
        system: 'You are an engineer.',
        history,
        config: { temperature: 0.2 },
      });

      expect(mockAiGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'googleai/gemini-2.5-pro',
          prompt: 'Analyze this code',
          system: 'You are an engineer.',
          history,
          config: { temperature: 0.2 },
        })
      );
    });

    it('uses different models for different task types', async () => {
      mockAiGenerate.mockResolvedValue({ text: 'ok' });

      // CHAT → flash
      mockResolveModel.mockResolvedValue(
        mockDecision('gemini', 'googleai/gemini-2.5-flash')
      );
      await molly.generate(TaskType.CHAT, { prompt: 'chat' });
      expect(mockAiGenerate).toHaveBeenLastCalledWith(
        expect.objectContaining({ model: 'googleai/gemini-2.5-flash' })
      );

      // REASONING → pro
      mockResolveModel.mockResolvedValue(
        mockDecision('gemini', 'googleai/gemini-2.5-pro')
      );
      await molly.generate(TaskType.REASONING, { prompt: 'think' });
      expect(mockAiGenerate).toHaveBeenLastCalledWith(
        expect.objectContaining({ model: 'googleai/gemini-2.5-pro' })
      );

      // CODE → claude
      mockResolveModel.mockResolvedValue(
        mockDecision('claude', 'anthropic/claude-sonnet-4-20250514')
      );
      await molly.generate(TaskType.CODE, { prompt: 'code' });
      expect(mockAiGenerate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          model: 'anthropic/claude-sonnet-4-20250514',
        })
      );
    });
  });

  // ── Health Tracking ──

  describe('Health Tracking', () => {
    it('reports success with response time on successful call', async () => {
      mockResolveModel.mockResolvedValue(
        mockDecision('gemini', 'googleai/gemini-2.5-flash')
      );
      mockAiGenerate.mockResolvedValue({ text: 'ok' });

      await molly.generate(TaskType.CHAT, { prompt: 'test' });

      expect(mockReportSuccess).toHaveBeenCalledWith(
        'gemini',
        expect.any(Number)
      );
      expect(mockReportFailure).not.toHaveBeenCalled();
    });

    it('reports failure when ai.generate() throws', async () => {
      mockResolveModel.mockResolvedValue(
        mockDecision('gemini', 'googleai/gemini-2.5-flash')
      );
      mockAiGenerate.mockRejectedValue(new Error('API rate limit'));

      await expect(
        molly.generate(TaskType.CHAT, { prompt: 'test' })
      ).rejects.toThrow('API rate limit');

      expect(mockReportFailure).toHaveBeenCalledWith(
        'gemini',
        expect.any(Error)
      );
    });
  });

  // ── Fallback ──

  describe('Fallback', () => {
    it('falls back to different provider on failure', async () => {
      // First resolve → gemini, second resolve → claude
      mockResolveModel
        .mockResolvedValueOnce(
          mockDecision('gemini', 'googleai/gemini-2.5-flash')
        )
        .mockResolvedValueOnce(
          mockDecision('claude', 'anthropic/claude-sonnet-4-20250514', 1)
        );

      // First call fails, second succeeds
      mockAiGenerate
        .mockRejectedValueOnce(new Error('Gemini down'))
        .mockResolvedValueOnce({ text: 'Claude to the rescue!' });

      const result = await molly.generate(TaskType.CHAT, {
        prompt: 'help',
      });

      expect(result.text).toBe('Claude to the rescue!');
      expect(mockAiGenerate).toHaveBeenCalledTimes(2);
      expect(mockReportFailure).toHaveBeenCalledWith(
        'gemini',
        expect.any(Error)
      );
      expect(mockReportSuccess).toHaveBeenCalledWith(
        'claude',
        expect.any(Number)
      );
    });

    it('throws original error when fallback returns same provider', async () => {
      // Both resolves return gemini (only one provider available)
      mockResolveModel.mockResolvedValue(
        mockDecision('gemini', 'googleai/gemini-2.5-flash')
      );
      mockAiGenerate.mockRejectedValue(new Error('Gemini down'));

      await expect(
        molly.generate(TaskType.CHAT, { prompt: 'help' })
      ).rejects.toThrow('Gemini down');

      // Only called once — didn't retry with same provider
      expect(mockAiGenerate).toHaveBeenCalledTimes(1);
    });

    it('throws original error when fallback also fails', async () => {
      mockResolveModel
        .mockResolvedValueOnce(
          mockDecision('gemini', 'googleai/gemini-2.5-flash')
        )
        .mockResolvedValueOnce(
          mockDecision('claude', 'anthropic/claude-sonnet-4-20250514', 1)
        );

      mockAiGenerate
        .mockRejectedValueOnce(new Error('Gemini down'))
        .mockRejectedValueOnce(new Error('Claude also down'));

      await expect(
        molly.generate(TaskType.CHAT, { prompt: 'help' })
      ).rejects.toThrow('Gemini down');

      expect(mockAiGenerate).toHaveBeenCalledTimes(2);
    });
  });

  // ── Embed ──

  describe('molly.embed()', () => {
    it('routes embedding through the router', async () => {
      mockResolveModel.mockResolvedValue(
        mockDecision('gemini', 'googleai/gemini-embedding-001')
      );
      mockAiEmbed.mockResolvedValue([{ embedding: [0.1, 0.2, 0.3] }]);

      const result = await molly.embed({ content: 'test text' });

      expect(mockResolveModel).toHaveBeenCalledWith(TaskType.EMBEDDING);
      expect(mockAiEmbed).toHaveBeenCalledWith(
        expect.objectContaining({
          embedder: 'googleai/gemini-embedding-001',
          content: 'test text',
        })
      );
      expect(result).toEqual([{ embedding: [0.1, 0.2, 0.3] }]);
    });

    it('reports success on successful embed', async () => {
      mockResolveModel.mockResolvedValue(
        mockDecision('gemini', 'googleai/gemini-embedding-001')
      );
      mockAiEmbed.mockResolvedValue([{ embedding: [0.1] }]);

      await molly.embed({ content: 'test' });

      expect(mockReportSuccess).toHaveBeenCalledWith(
        'gemini',
        expect.any(Number)
      );
    });

    it('reports failure on embed error', async () => {
      mockResolveModel.mockResolvedValue(
        mockDecision('gemini', 'googleai/gemini-embedding-001')
      );
      mockAiEmbed.mockRejectedValue(new Error('Embed failed'));

      await expect(molly.embed({ content: 'test' })).rejects.toThrow(
        'Embed failed'
      );

      expect(mockReportFailure).toHaveBeenCalledWith(
        'gemini',
        expect.any(Error)
      );
    });
  });
});
