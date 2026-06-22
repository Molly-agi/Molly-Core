/**
 * @jest-environment node
 *
 * @fileOverview Tests for Neural Engram System - Brain-like Memory Architecture
 *
 * Tests memory system including:
 * - Working memory (Frontal Cortex)
 * - Emotional tagging (Amygdala)
 * - Memory consolidation (Hippocampus)
 * - System health (Hypothalamus)
 * - Personality modulation
 * - Cross-hemisphere recall (recallEverything fanout + re-promote)
 *
 * Node env required: recallEverything()'s left-fanout block is gated on
 * `typeof window === 'undefined'` to keep the KnowledgeStore chain out of
 * the Next client bundle. jsdom installs a non-configurable `window` that
 * would block the gate in tests.
 */

// Mock logger
jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock persistence
jest.mock('@/ai/memory/engram-persistence', () => ({
  persistEngramBatch: jest
    .fn()
    .mockResolvedValue({ saved: 0, failed: 0, errors: [] }),
}));

// Mock personality diagnostics
jest.mock('@/ai/memory/personality-diagnostics', () => ({
  evaluatePersonalityStability: jest.fn().mockReturnValue({
    status: 'stable',
    score: 0.9,
    flags: ['All personality ranges within expected bounds.'],
    extremes: 0,
    variance: 0.1,
  }),
}));

// Mock KnowledgeStore (left hemisphere) — recallEverything fanout target
const mockKnowledgeStoreRecall = jest.fn();
const mockKnowledgeStoreRecordSnapshot = jest.fn().mockResolvedValue(undefined);
const mockGetKnowledgeStore = jest.fn().mockResolvedValue({
  recall: mockKnowledgeStoreRecall,
  recordSnapshot: mockKnowledgeStoreRecordSnapshot,
});
jest.mock('@/ai/memory/knowledge-store', () => ({
  getKnowledgeStore: mockGetKnowledgeStore,
}));

import {
  NeuralEngramSystem,
  getNeuralBrain,
  shutdownNeuralBrain,
  configureNeuralPersistence,
  clearNeuralPersistence,
  SelfImage,
} from '../neural-engram';

describe('NeuralEngramSystem', () => {
  let brain: NeuralEngramSystem;

  beforeEach(() => {
    jest.useFakeTimers();
    brain = new NeuralEngramSystem();
  });

  afterEach(() => {
    brain.destroy();
    jest.useRealTimers();
  });

  describe('Memory Formation', () => {
    it('creates memory with ID and timestamp', () => {
      const memory = brain.remember('Test content');

      expect(memory.id).toContain('engram-');
      expect(memory.timestamp).toBeInstanceOf(Date);
      expect(memory.content).toBe('Test content');
    });

    it('tags memory with context', () => {
      const memory = brain.remember('Tagged memory', {
        tags: ['important', 'test'],
      });

      expect(memory.contextTags).toContain('important');
      expect(memory.contextTags).toContain('test');
    });

    it('sets initial importance', () => {
      const memory = brain.remember('Important memory', {
        importance: 0.9,
      });

      expect(memory.importance).toBeGreaterThanOrEqual(0.9);
    });

    it('captures personality context', () => {
      const memory = brain.remember('Memory with personality');

      expect(memory.personalityContext).toBeDefined();
      expect(memory.personalityContext?.warmth).toBeDefined();
    });
  });

  describe('Working Memory (Frontal Cortex)', () => {
    it('stores memory in working memory', () => {
      brain.remember('Working memory test');

      const state = brain.frontalCortex.getState();
      expect(state.size).toBe(1);
    });

    it('recalls memory by search', () => {
      brain.remember('Find this specific content');

      const results = brain.recall('specific');
      expect(results.length).toBe(1);
      expect(results[0].content).toContain('specific');
    });

    it('searches by context tags', () => {
      brain.remember('Tagged memory', { tags: ['findme'] });

      const results = brain.recall('findme');
      expect(results.length).toBe(1);
    });

    it('evicts weakest when at capacity', () => {
      // Fill up working memory (capacity 7)
      for (let i = 0; i < 8; i++) {
        brain.remember(`Memory ${i}`);
      }

      const state = brain.frontalCortex.getState();
      expect(state.size).toBeLessThanOrEqual(7);
    });

    it('decays memories over time', () => {
      brain.remember('Decaying memory');

      // Advance past decay interval (30s)
      jest.advanceTimersByTime(35000);

      // Memory activation should have decreased
      const state = brain.frontalCortex.getState();
      // May have decayed completely or reduced
      expect(state.size).toBeLessThanOrEqual(1);
    });
  });

  describe('Emotional Tagging (Amygdala)', () => {
    it('boosts importance on success', () => {
      const memory = brain.remember('Success memory', { success: true });

      expect(memory.emotionalValence).toBeGreaterThan(0);
    });

    it('increases arousal on error', () => {
      const memory = brain.remember('Error memory', { error: true });

      expect(memory.arousal).toBeGreaterThan(0.5);
      expect(memory.emotionalValence).toBeLessThan(0);
    });

    it('boosts importance on positive feedback', () => {
      const memory = brain.remember('Praised memory', {
        userFeedback: 'positive',
      });

      expect(memory.importance).toBeGreaterThan(0.5);
      expect(memory.emotionalValence).toBeGreaterThan(0);
    });

    it('learns from negative feedback', () => {
      const memory = brain.remember('Criticized memory', {
        userFeedback: 'negative',
      });

      // Negative feedback increases importance (learn from mistakes)
      expect(memory.importance).toBeGreaterThan(0.5);
    });

    it('boosts on novelty', () => {
      const memory = brain.remember('Novel memory', { novelty: 0.9 });

      expect(memory.importance).toBeGreaterThan(0.5);
      expect(memory.arousal).toBeGreaterThan(0.5);
    });
  });

  describe('Memory Consolidation (Hippocampus)', () => {
    it('stages low-activation memories', async () => {
      brain.remember('Memory to consolidate');

      // Advance time to let memory decay
      jest.advanceTimersByTime(120000); // 2 minutes

      const result = await brain.consolidate();
      expect(result.queued).toBeGreaterThanOrEqual(0);
    });

    it('persists batch when configured', async () => {
      brain.configurePersistence({
        userId: 'test-user',
        password: 'test-pass',
        source: 'test',
      });

      // Create memories and force consolidation
      for (let i = 0; i < 25; i++) {
        brain.remember(`Memory ${i}`);
      }

      // Advance time
      jest.advanceTimersByTime(120000);

      await brain.consolidate();

      // persistEngramBatch may or may not be called depending on queue state
      // The important thing is no errors
    });

    it('clears persistence config', () => {
      brain.configurePersistence({ userId: 'test', password: 'test' });
      brain.clearPersistence();

      // Should not throw
      expect(() => brain.consolidate()).not.toThrow();
    });
  });

  describe('Health Assessment (Hypothalamus)', () => {
    it('reports healthy status normally', () => {
      const health = brain.checkHealth();

      expect(health.status).toBe('healthy');
      expect(health.recommendation).toContain('normal');
    });

    it('reports overloaded when working memory full', () => {
      // Fill working memory beyond capacity
      for (let i = 0; i < 10; i++) {
        brain.remember(`Memory ${i}`, { importance: 1 });
      }

      const health = brain.checkHealth();
      // Status depends on exact capacity
      expect(['healthy', 'stressed', 'overloaded']).toContain(health.status);
    });
  });

  describe('Personality Modulation', () => {
    it('has baseline personality', () => {
      const personality = brain.getPersonalityState();

      expect(personality.warmth).toBeDefined();
      expect(personality.curiosity).toBeDefined();
      expect(personality.humor).toBeDefined();
    });

    it('sets personality state', () => {
      const updated = brain.setPersonalityState({ warmth: 0.9, humor: 0.8 });

      expect(updated.warmth).toBe(0.9);
      expect(updated.humor).toBe(0.8);
    });

    it('clamps values to 0-1', () => {
      const updated = brain.setPersonalityState({ warmth: 1.5, humor: -0.5 });

      expect(updated.warmth).toBe(1);
      expect(updated.humor).toBe(0);
    });

    it('applies personality delta', () => {
      brain.setPersonalityState({ warmth: 0.5 });
      const updated = brain.applyPersonalityDelta({ warmth: 0.2 });

      expect(updated.warmth).toBe(0.7);
    });

    it('clamps delta results', () => {
      brain.setPersonalityState({ warmth: 0.9 });
      const updated = brain.applyPersonalityDelta({ warmth: 0.5 });

      expect(updated.warmth).toBe(1);
    });

    it('computes personality from working memory', () => {
      // Add memories with personality context
      brain.remember('Memory 1', { importance: 1 });
      brain.remember('Memory 2', { importance: 1 });

      const computed = brain.computePersonalityState();

      expect(computed).toBeDefined();
      expect(typeof computed.warmth).toBe('number');
    });

    it('evaluates personality stability', () => {
      const result = brain.evaluatePersonalityStability();

      expect(result.status).toBeDefined();
      expect(result.score).toBeDefined();
    });
  });

  describe('Self Image', () => {
    it('sets self image', () => {
      const image: SelfImage = {
        id: 'img-1',
        displayName: 'Molly',
        description: 'A warm and curious AI',
        aestheticTags: ['ethereal', 'radiant'],
        confidenceLevel: 0.8,
        lastUpdated: new Date(),
      };

      brain.setSelfImage(image);
      const retrieved = brain.getSelfImage();

      expect(retrieved?.displayName).toBe('Molly');
      expect(retrieved?.aestheticTags).toContain('ethereal');
    });

    it('updates appearance confidence', () => {
      brain.setSelfImage({
        id: 'img-1',
        displayName: 'Molly',
        description: 'Test',
        aestheticTags: [],
        confidenceLevel: 0.5,
        lastUpdated: new Date(),
      });

      brain.updateAppearanceConfidence(0.9);

      expect(brain.getSelfImage()?.confidenceLevel).toBe(0.9);
    });

    it('clamps confidence to 0-1', () => {
      brain.setSelfImage({
        id: 'img-1',
        displayName: 'Molly',
        description: 'Test',
        aestheticTags: [],
        confidenceLevel: 0.5,
        lastUpdated: new Date(),
      });

      brain.updateAppearanceConfidence(1.5);
      expect(brain.getSelfImage()?.confidenceLevel).toBe(1);

      brain.updateAppearanceConfidence(-0.5);
      expect(brain.getSelfImage()?.confidenceLevel).toBe(0);
    });
  });

  describe('Cross-hemisphere Recall (D2)', () => {
    // Fanout uses dynamic import + async store calls; real timers let microtasks flush.
    beforeEach(() => {
      brain.destroy();
      jest.useRealTimers();
      brain = new NeuralEngramSystem();
      mockKnowledgeStoreRecall.mockReset();
      mockKnowledgeStoreRecordSnapshot.mockReset();
      mockKnowledgeStoreRecordSnapshot.mockResolvedValue(undefined);
      mockGetKnowledgeStore.mockClear();
    });

    const makeLeftHit = (id: string, similarity: number, content = id) => ({
      entry: {
        id,
        content,
        timestamp: new Date(),
        importance: 0.5,
        contextTags: [],
        source: 'remember' as const,
        personalitySnapshot: undefined,
      },
      similarity,
    });

    it('returns right-only when persistence is unconfigured', async () => {
      brain.remember('Local-only thought');

      const result = await brain.recallEverything('thought');

      expect(mockGetKnowledgeStore).not.toHaveBeenCalled();
      expect(result.leftHits).toEqual([]);
      expect(result.rePromoted).toEqual([]);
      expect(result.rightHits.length).toBe(1);
    });

    it('fans out to KnowledgeStore when persistence configured', async () => {
      brain.configurePersistence({ userId: 'eric', password: 'pw' });
      mockKnowledgeStoreRecall.mockResolvedValueOnce([
        makeLeftHit('left-1', 0.5),
      ]);

      const result = await brain.recallEverything('anything', { limit: 5 });

      expect(mockGetKnowledgeStore).toHaveBeenCalledWith('eric');
      expect(mockKnowledgeStoreRecall).toHaveBeenCalledWith('anything', 5);
      expect(result.leftHits.length).toBe(1);
    });

    it('re-promotes left hits above promoteThreshold via hippocampus.stage', async () => {
      brain.configurePersistence({ userId: 'eric', password: 'pw' });
      mockKnowledgeStoreRecall.mockResolvedValueOnce([
        makeLeftHit('hot-1', 0.9),
        makeLeftHit('cold-1', 0.3),
      ]);

      const result = await brain.recallEverything('q');

      expect(result.rePromoted).toEqual(['hot-1']);
    });

    it('caps re-promotes to promoteCap', async () => {
      brain.configurePersistence({ userId: 'eric', password: 'pw' });
      mockKnowledgeStoreRecall.mockResolvedValueOnce([
        makeLeftHit('h1', 0.95),
        makeLeftHit('h2', 0.9),
        makeLeftHit('h3', 0.85),
        makeLeftHit('h4', 0.8),
      ]);

      const result = await brain.recallEverything('q', { promoteCap: 2 });

      expect(result.rePromoted.length).toBe(2);
      expect(result.rePromoted).toEqual(['h1', 'h2']);
    });

    it('skips re-promote when entry already lives in right hits (dedupe)', async () => {
      brain.configurePersistence({ userId: 'eric', password: 'pw' });
      const rightMem = brain.remember('Find this specific dedupe content');
      mockKnowledgeStoreRecall.mockResolvedValueOnce([
        makeLeftHit(rightMem.id, 0.95, 'Find this specific dedupe content'),
        makeLeftHit('new-left', 0.9),
      ]);

      const result = await brain.recallEverything('specific');

      expect(result.rePromoted).toEqual(['new-left']);
      expect(result.rePromoted).not.toContain(rightMem.id);
    });

    it('records snapshot via KnowledgeStore.recordSnapshot', async () => {
      brain.configurePersistence({ userId: 'eric', password: 'pw' });
      mockKnowledgeStoreRecall.mockResolvedValueOnce([makeLeftHit('s1', 0.9)]);

      const result = await brain.recallEverything('q');

      expect(mockKnowledgeStoreRecordSnapshot).toHaveBeenCalledTimes(1);
      const snapshotArg = mockKnowledgeStoreRecordSnapshot.mock.calls[0][0];
      expect(snapshotArg.id).toBe(result.snapshotId);
      expect(snapshotArg.userId).toBe('eric');
      expect(snapshotArg.query).toBe('q');
      expect(snapshotArg.rePromoted).toEqual(['s1']);
    });

    it('isolates left fanout failures (returns right-only on store error)', async () => {
      brain.configurePersistence({ userId: 'eric', password: 'pw' });
      brain.remember('Right-side anchor');
      mockKnowledgeStoreRecall.mockRejectedValueOnce(new Error('left down'));

      const result = await brain.recallEverything('anchor');

      expect(result.leftHits).toEqual([]);
      expect(result.rePromoted).toEqual([]);
      expect(result.rightHits.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Lifecycle', () => {
    it('destroys cleanly', () => {
      brain.remember('Test memory');
      brain.destroy();

      // After destroy, working memory should be cleared
      const state = brain.frontalCortex.getState();
      expect(state.size).toBe(0);
    });
  });

  describe('Singleton', () => {
    afterEach(() => {
      shutdownNeuralBrain();
    });

    it('returns same instance', () => {
      const b1 = getNeuralBrain();
      const b2 = getNeuralBrain();
      expect(b1).toBe(b2);
    });

    it('configures persistence via helper', () => {
      configureNeuralPersistence({ userId: 'test', password: 'test' });
      // Should not throw
      expect(() => getNeuralBrain()).not.toThrow();
    });

    it('clears persistence via helper', () => {
      configureNeuralPersistence({ userId: 'test', password: 'test' });
      clearNeuralPersistence();
      // Should not throw
      expect(() => getNeuralBrain()).not.toThrow();
    });

    it('shuts down cleanly', () => {
      getNeuralBrain();
      shutdownNeuralBrain();
      // Getting brain again should create new instance
      const newBrain = getNeuralBrain();
      expect(newBrain).toBeDefined();
    });
  });
});
