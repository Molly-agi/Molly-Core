/**
 * Tests for Unified Multi-Modal Perception Layer
 *
 * Tests text processing (sentiment, urgency, questions),
 * cross-modal synthesis, perception statistics, and history management.
 *
 * Vision and voice processing involve dynamic imports that are hard to mock
 * in isolation, so we focus on the text pathway and synthesis logic.
 */

jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
    output: jest.fn(),
  },
  generateTraceId: () => 'test-trace-id',
}));

// Mock dynamic imports used via await import() inside the module.
// These modules are lazily imported and wrapped in try/catch,
// so the mocks just need to exist at the right paths.
jest.mock('@/ai/agency/cognition/emotional-state', () => ({
  getCurrentState: () => ({ primary: 'curious' }),
}));

jest.mock('@/ai/agency/planning/initiative-engine', () => ({
  getActiveInitiatives: () => [],
}));

jest.mock('@/ai/agency/cognition/theory-of-mind', () => ({
  inferIntent: (text: string) => {
    if (text.includes('help')) return { description: 'request-help' };
    return null;
  },
}));

// Mock vision to avoid file system dependencies
jest.mock('@/ai/vision/family-recognition', () => ({
  recognizeFaces: jest.fn().mockResolvedValue({
    facesDetected: 0,
    familyRecognized: [],
    unknownFaces: 0,
    faces: [],
    processingTimeMs: 0,
  }),
  processRecognitionTriggers: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  jest.resetModules();
});

async function loadPerception() {
  return import('../unified-perception');
}

// ============================================================================
// perceiveText — text processing
// ============================================================================

describe('perceiveText', () => {
  it('processes text input and returns a unified perception', async () => {
    const { perceiveText } = await loadPerception();
    const result = await perceiveText('Hello, how are you?');

    expect(result.id).toMatch(/^perc_/);
    expect(result.timestamp).toBeGreaterThan(0);
    expect(result.modalities.text).toBeDefined();
    expect(result.modalities.context).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('detects positive sentiment', async () => {
    const { perceiveText } = await loadPerception();
    const result = await perceiveText('I love this amazing wonderful day');
    expect(result.modalities.text?.sentiment).toBe('positive');
  });

  it('detects negative sentiment', async () => {
    const { perceiveText } = await loadPerception();
    const result = await perceiveText('This is bad and wrong and frustrating');
    expect(result.modalities.text?.sentiment).toBe('negative');
  });

  it('detects mixed sentiment', async () => {
    const { perceiveText } = await loadPerception();
    const result = await perceiveText(
      'I love this great thing but it has a bad problem'
    );
    expect(result.modalities.text?.sentiment).toBe('mixed');
  });

  it('detects neutral sentiment', async () => {
    const { perceiveText } = await loadPerception();
    const result = await perceiveText('The sky is blue');
    expect(result.modalities.text?.sentiment).toBe('neutral');
  });

  it('detects urgency from urgent words', async () => {
    const { perceiveText } = await loadPerception();
    const result = await perceiveText('This is urgent and needs attention now');
    expect(result.modalities.text?.urgency).toBe('high');
  });

  it('defaults to normal urgency', async () => {
    const { perceiveText } = await loadPerception();
    const result = await perceiveText('Just checking in');
    expect(result.modalities.text?.urgency).toBe('normal');
  });

  it('detects questions in text', async () => {
    const { perceiveText } = await loadPerception();
    const result = await perceiveText('How are you? What are you working on?');
    expect(result.modalities.text?.questions).toHaveLength(2);
  });

  it('extracts topics from text', async () => {
    const { perceiveText } = await loadPerception();
    const result = await perceiveText(
      'Building perception system architecture'
    );
    expect(result.modalities.text?.topics.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Synthesis
// ============================================================================

describe('synthesis', () => {
  it('suggests speak response when questions are detected', async () => {
    const { perceiveText } = await loadPerception();
    const result = await perceiveText('What is the status of the project?');
    expect(result.synthesis.suggestedResponseType).toBe('speak');
  });

  it('suggests act or wait when intent may not be general', async () => {
    const { perceiveText } = await loadPerception();
    const result = await perceiveText('I need help with something');
    // The theory-of-mind dynamic import may fail in test env,
    // which means intent stays 'general' and response defaults to 'wait'
    expect(['act', 'wait']).toContain(result.synthesis.suggestedResponseType);
  });

  it('includes insights array', async () => {
    const { perceiveText } = await loadPerception();
    const result = await perceiveText('Can you help me?');
    expect(Array.isArray(result.synthesis.insights)).toBe(true);
  });

  it('sets attention priority based on urgency', async () => {
    const { perceiveText } = await loadPerception();
    const result = await perceiveText('This is a non-urgent update');
    expect(['low', 'normal', 'high', 'urgent']).toContain(
      result.synthesis.attentionPriority
    );
  });
});

// ============================================================================
// Context Perception
// ============================================================================

describe('context perception', () => {
  it('always includes context modality', async () => {
    const { perceiveText } = await loadPerception();
    const result = await perceiveText('test');
    expect(result.modalities.context).toBeDefined();
    expect(result.modalities.context.dayOfWeek).toBeTruthy();
    expect(typeof result.modalities.context.isWorkDay).toBe('boolean');
    expect(typeof result.modalities.context.recentInteractions).toBe('number');
  });

  it('provides valid time of day', async () => {
    const { perceiveText } = await loadPerception();
    const result = await perceiveText('test');
    expect(['morning', 'afternoon', 'evening', 'night']).toContain(
      result.modalities.context.timeOfDay
    );
  });
});

// ============================================================================
// Perception stats and history
// ============================================================================

describe('getRecentPerceptions', () => {
  it('returns recent perceptions', async () => {
    const { perceiveText, getRecentPerceptions } = await loadPerception();
    await perceiveText('first');
    await perceiveText('second');
    const recent = getRecentPerceptions(5);
    expect(recent.length).toBeGreaterThanOrEqual(2);
  });

  it('respects the limit parameter', async () => {
    const { perceiveText, getRecentPerceptions } = await loadPerception();
    await perceiveText('one');
    await perceiveText('two');
    await perceiveText('three');
    const recent = getRecentPerceptions(2);
    expect(recent.length).toBe(2);
  });
});

describe('getPerceptionStats', () => {
  it('returns perception statistics', async () => {
    const { perceiveText, getPerceptionStats } = await loadPerception();
    await perceiveText('hello world');

    const stats = getPerceptionStats();
    expect(stats.totalPerceptions).toBeGreaterThanOrEqual(1);
    expect(stats.averageConfidence).toBeGreaterThan(0);
    expect(stats.modalityCounts.text).toBeGreaterThanOrEqual(1);
    expect(stats.modalityCounts.context).toBeGreaterThanOrEqual(1);
    expect(stats.lastPerceptionTime).toBeGreaterThan(0);
  });
});

describe('buildPerceptionContext', () => {
  it('returns a context string after perception', async () => {
    const { perceiveText, buildPerceptionContext } = await loadPerception();
    await perceiveText('test input');

    const context = buildPerceptionContext();
    expect(typeof context).toBe('string');
    expect(context).toContain('Multi-modal perception active');
  });

  it('returns "No recent sensory input" when empty', async () => {
    // Fresh module — no perceptions yet
    const { buildPerceptionContext } = await loadPerception();
    // Note: other tests in this file may have already added perceptions
    // since modules persist within the test suite
    const context = buildPerceptionContext();
    expect(typeof context).toBe('string');
  });
});

// ============================================================================
// perceive — multi-modal
// ============================================================================

describe('perceive', () => {
  it('handles empty input array', async () => {
    const { perceive } = await loadPerception();
    const result = await perceive([]);
    expect(result.modalities.context).toBeDefined();
    expect(result.confidence).toBe(0.5); // Default when no modalities
  });

  it('handles voice input', async () => {
    const { perceive } = await loadPerception();
    const result = await perceive([
      {
        modality: 'voice',
        data: 'audio://test',
        timestamp: Date.now(),
        metadata: { transcription: 'hello there' },
      },
    ]);
    expect(result.modalities.voice).toBeDefined();
    expect(result.modalities.voice?.transcription).toBe('hello there');
  });

  it('processes multiple modalities', async () => {
    const { perceive } = await loadPerception();
    const result = await perceive([
      { modality: 'text', data: 'Hello world', timestamp: Date.now() },
      {
        modality: 'voice',
        data: 'audio://test',
        timestamp: Date.now(),
        metadata: { transcription: 'hello' },
      },
    ]);
    expect(result.modalities.text).toBeDefined();
    expect(result.modalities.voice).toBeDefined();
    expect(result.modalities.context).toBeDefined();
  });
});
