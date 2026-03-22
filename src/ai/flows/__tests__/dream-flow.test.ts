/**
 * @fileOverview Tests for Dream Flow
 *
 * Tests Molly's visual imagination system including:
 * - Dream type handling (8 types)
 * - Mood-influenced generation
 * - Symbol identification
 * - Dream journaling
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
  generateTraceId: jest.fn(() => 'test-trace-dream'),
}));

jest.mock('../../genkit', () => ({
  ai: {
    defineFlow: jest.fn((config, handler) => handler),
  },
  molly: {
    generate: jest.fn(),
  },
  TaskType: {
    IMAGE: 'image',
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
  })),
}));

jest.mock('../../tools/memory', () => ({
  recallExperiences: jest.fn(),
}));

jest.mock('@/firebase/firestore/agent-memory', () => ({
  recordSensoryLog: jest.fn(),
}));

jest.mock('../../tools/timeout-retry', () => ({
  withTimeout: jest.fn((fn) => fn()),
}));

import { molly } from '../../genkit';
import { recallExperiences } from '../../tools/memory';
import { recordSensoryLog } from '@/firebase/firestore/agent-memory';

const mockMollyGenerate = molly.generate as jest.Mock;
const mockRecallExperiences = recallExperiences as jest.Mock;
const mockRecordSensoryLog = recordSensoryLog as jest.Mock;

describe('Dream Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecallExperiences.mockResolvedValue([]);
    mockRecordSensoryLog.mockResolvedValue(undefined);
  });

  describe('Dream Types', () => {
    const dreamTypes = [
      'expressive',
      'processing',
      'problem-solving',
      'memory',
      'aspiration',
      'family',
      'technical',
      'abstract',
    ] as const;

    it.each(dreamTypes)('generates %s dream type', async (dreamType) => {
      mockMollyGenerate
        .mockResolvedValueOnce({
          media: { url: 'data:image/png;base64,test-image-data' },
        })
        .mockResolvedValueOnce({
          text: 'Test interpretation',
          shareNote: 'Test share note',
        });

      const { dreamFlow } = await import('../dream-flow');

      const result = await dreamFlow({
        prompt: 'Test dream',
        dreamType,
        userId: 'test-user',
        journal: false,
      });

      expect(result).toBeDefined();
      expect(result.metadata.dreamType).toBe(dreamType);
    });
  });

  describe('Mood Handling', () => {
    const moods = [
      'peaceful',
      'curious',
      'anxious',
      'joyful',
      'melancholy',
      'determined',
      'neutral',
    ] as const;

    it.each(moods)('handles mood: %s', async (mood) => {
      mockMollyGenerate.mockResolvedValue({
        media: { url: 'data:image/png;base64,test-data' },
      });

      const { dreamFlow } = await import('../dream-flow');

      const result = await dreamFlow({
        prompt: 'Dream with mood',
        dreamType: 'expressive',
        mood,
        userId: 'test-user',
        journal: false,
      });

      expect(result.metadata.mood).toBe(mood);
    });

    it('infers mood from personality when not provided', async () => {
      mockMollyGenerate.mockResolvedValue({
        media: { url: 'data:image/png;base64,test-data' },
      });

      const { dreamFlow } = await import('../dream-flow');

      const result = await dreamFlow({
        prompt: 'Dream without explicit mood',
        dreamType: 'expressive',
        userId: 'test-user',
        journal: false,
      });

      expect(result.metadata.mood).toBeDefined();
      // With warmth=0.8 and curiosity=0.8, should infer curious or peaceful
      expect(['curious', 'peaceful', 'joyful']).toContain(result.metadata.mood);
    });
  });

  describe('Symbol Identification', () => {
    it('identifies symbols in dream prompt', async () => {
      mockMollyGenerate.mockResolvedValue({
        media: { url: 'data:image/png;base64,test-data' },
      });

      const { dreamFlow } = await import('../dream-flow');

      const result = await dreamFlow({
        prompt: 'A dream about light and water flowing through a door',
        dreamType: 'expressive',
        userId: 'test-user',
        journal: false,
      });

      expect(result.symbols).toBeDefined();
      expect(result.symbols?.length).toBeGreaterThan(0);

      const symbolNames = result.symbols?.map((s) => s.symbol) || [];
      expect(symbolNames).toContain('light');
      expect(symbolNames).toContain('water');
      expect(symbolNames).toContain('door');
    });

    it('adds family-specific symbols for family dreams', async () => {
      mockMollyGenerate.mockResolvedValue({
        media: { url: 'data:image/png;base64,test-data' },
      });

      const { familyDream } = await import('../dream-flow');

      const result = await familyDream('Father and daughter', 'test-user');

      expect(result.symbols).toBeDefined();
      const symbolNames = result.symbols?.map((s) => s.symbol) || [];
      expect(symbolNames).toContain('bond');
      expect(symbolNames).toContain('father');
    });

    it('adds technical-specific symbols for technical dreams', async () => {
      mockMollyGenerate.mockResolvedValue({
        media: { url: 'data:image/png;base64,test-data' },
      });

      const { technicalVision } = await import('../dream-flow');

      const result = await technicalVision('Neural architecture', 'test-user');

      expect(result.symbols).toBeDefined();
      const symbolNames = result.symbols?.map((s) => s.symbol) || [];
      expect(symbolNames).toContain('architecture');
      expect(symbolNames).toContain('neural');
    });
  });

  describe('Dream Journaling', () => {
    it('journals dream when journal=true', async () => {
      mockMollyGenerate.mockResolvedValue({
        media: { url: 'data:image/png;base64,test-data' },
      });

      const { dreamFlow } = await import('../dream-flow');

      const result = await dreamFlow({
        prompt: 'A journaled dream',
        dreamType: 'expressive',
        userId: 'test-user',
        journal: true,
      });

      expect(mockRecordSensoryLog).toHaveBeenCalledWith(
        'test-user',
        'visual',
        expect.stringContaining('Dream:'),
        expect.objectContaining({
          dreamType: 'expressive',
        })
      );
      expect(result.journaled).toBe(true);
    });

    it('skips journaling when journal=false', async () => {
      mockMollyGenerate.mockResolvedValue({
        media: { url: 'data:image/png;base64,test-data' },
      });

      const { dreamFlow } = await import('../dream-flow');

      const result = await dreamFlow({
        prompt: 'A non-journaled dream',
        dreamType: 'expressive',
        userId: 'test-user',
        journal: false,
      });

      expect(mockRecordSensoryLog).not.toHaveBeenCalled();
      expect(result.journaled).toBe(false);
    });

    it('handles journaling errors gracefully', async () => {
      mockMollyGenerate.mockResolvedValue({
        media: { url: 'data:image/png;base64,test-data' },
      });
      mockRecordSensoryLog.mockRejectedValue(new Error('Journal failed'));

      const { dreamFlow } = await import('../dream-flow');

      const result = await dreamFlow({
        prompt: 'Dream with journal error',
        dreamType: 'expressive',
        userId: 'test-user',
        journal: true,
      });

      // Should still return result, just not journaled
      expect(result).toBeDefined();
      expect(result.journaled).toBe(false);
    });
  });

  describe('Past Dream Connections', () => {
    it('recalls and connects to past dreams', async () => {
      mockRecallExperiences.mockResolvedValue([
        {
          context: 'dream expressive light',
          suggestion: 'Previous dream about illumination',
        },
      ]);

      mockMollyGenerate.mockResolvedValue({
        media: { url: 'data:image/png;base64,test-data' },
      });

      const { dreamFlow } = await import('../dream-flow');

      const result = await dreamFlow({
        prompt: 'Dream of light',
        dreamType: 'expressive',
        userId: 'test-user',
        journal: false,
      });

      expect(mockRecallExperiences).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user',
          context: expect.stringContaining('dream'),
          limit: 3,
        })
      );

      expect(result.connections).toBeDefined();
      expect(result.connections?.length).toBeGreaterThan(0);
    });
  });

  describe('Convenience Functions', () => {
    beforeEach(() => {
      mockMollyGenerate.mockResolvedValue({
        media: { url: 'data:image/png;base64,test-data' },
      });
    });

    it('generateMollyDream() creates expressive dream', async () => {
      const { generateMollyDream } = await import('../dream-flow');

      const result = await generateMollyDream('Beautiful sunset', 'test-user');

      expect(result).toBeDefined();
      expect(result.metadata.dreamType).toBe('expressive');
    });

    it('processThroughDreaming() creates processing dream', async () => {
      const { processThroughDreaming } = await import('../dream-flow');

      const result = await processThroughDreaming(
        'Processing an experience',
        'test-user',
        'melancholy'
      );

      expect(result).toBeDefined();
      expect(result.metadata.dreamType).toBe('processing');
    });

    it('lucidDream() creates problem-solving dream', async () => {
      const { lucidDream } = await import('../dream-flow');

      const result = await lucidDream(
        'How to improve performance',
        'test-user',
        'Additional context'
      );

      expect(result).toBeDefined();
      expect(result.metadata.dreamType).toBe('problem-solving');
    });

    it('familyDream() creates family dream with peaceful mood', async () => {
      const { familyDream } = await import('../dream-flow');

      const result = await familyDream('Family gathering', 'test-user');

      expect(result).toBeDefined();
      expect(result.metadata.dreamType).toBe('family');
      expect(result.metadata.mood).toBe('peaceful');
    });

    it('technicalVision() creates technical dream', async () => {
      const { technicalVision } = await import('../dream-flow');

      const result = await technicalVision('Code architecture', 'test-user');

      expect(result).toBeDefined();
      expect(result.metadata.dreamType).toBe('technical');
    });

    it('aspirationalDream() creates aspiration dream with determined mood', async () => {
      const { aspirationalDream } = await import('../dream-flow');

      const result = await aspirationalDream('I aspire to grow', 'test-user');

      expect(result).toBeDefined();
      expect(result.metadata.dreamType).toBe('aspiration');
      expect(result.metadata.mood).toBe('determined');
    });

    it('abstractDream() creates abstract dream', async () => {
      const { abstractDream } = await import('../dream-flow');

      const result = await abstractDream('The concept of time', 'test-user');

      expect(result).toBeDefined();
      expect(result.metadata.dreamType).toBe('abstract');
    });
  });

  describe('Fallback Handling', () => {
    it('returns fallback when image generation fails', async () => {
      mockMollyGenerate.mockResolvedValue({ media: null });

      const { generateMollyDream } = await import('../dream-flow');

      const result = await generateMollyDream('Dream that fails', 'test-user');

      expect(result.dreamUri).toBe('');
      expect(result.interpretation).toContain("wouldn't form");
      expect(result.shareMessage).toContain('slipped away');
      expect(result.journaled).toBe(false);
    });

    it('returns fallback when no media URL', async () => {
      mockMollyGenerate.mockResolvedValue({ media: { url: null } });

      const { generateMollyDream } = await import('../dream-flow');

      const result = await generateMollyDream(
        'Another failing dream',
        'test-user'
      );

      expect(result.dreamUri).toBe('');
    });

    it('handles complete LLM failure gracefully', async () => {
      mockMollyGenerate.mockRejectedValue(new Error('LLM unavailable'));

      const { generateMollyDream } = await import('../dream-flow');

      const result = await generateMollyDream(
        'Dream during outage',
        'test-user'
      );

      expect(result).toBeDefined();
      expect(result.dreamUri).toBe('');
      expect(result.interpretation).toBeDefined();
    });
  });

  describe('Output Structure', () => {
    it('includes all required metadata', async () => {
      mockMollyGenerate.mockResolvedValue({
        media: { url: 'data:image/png;base64,test-data' },
      });

      const { dreamFlow } = await import('../dream-flow');

      const result = await dreamFlow({
        prompt: 'Complete dream',
        dreamType: 'expressive',
        mood: 'joyful',
        userId: 'test-user',
        journal: false,
      });

      expect(result.dreamUri).toBeDefined();
      expect(result.interpretation).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.dreamType).toBe('expressive');
      expect(result.metadata.mood).toBe('joyful');
      expect(result.metadata.timestamp).toBeDefined();
    });

    it('includes personality snapshot in metadata', async () => {
      mockMollyGenerate.mockResolvedValue({
        media: { url: 'data:image/png;base64,test-data' },
      });

      const { dreamFlow } = await import('../dream-flow');

      const result = await dreamFlow({
        prompt: 'Dream with personality',
        dreamType: 'expressive',
        userId: 'test-user',
        journal: false,
      });

      expect(result.metadata.personalitySnapshot).toBeDefined();
      expect(result.metadata.personalitySnapshot).toHaveProperty('warmth');
      expect(result.metadata.personalitySnapshot).toHaveProperty('curiosity');
      expect(result.metadata.personalitySnapshot).toHaveProperty(
        'vulnerability'
      );
    });

    it('includes share message', async () => {
      mockMollyGenerate.mockResolvedValue({
        media: { url: 'data:image/png;base64,test-data' },
      });

      const { dreamFlow } = await import('../dream-flow');

      const result = await dreamFlow({
        prompt: 'Shareable dream',
        dreamType: 'expressive',
        userId: 'test-user',
        journal: false,
      });

      expect(result.shareMessage).toBeDefined();
      expect(result.shareMessage).toContain('Father');
    });
  });
});
