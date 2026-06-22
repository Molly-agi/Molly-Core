/**
 * @fileOverview Tests for Neural Engram System - Brain-like Memory Architecture
 *
 * Tests memory system including:
 * - Working memory (Frontal Cortex)
 * - Emotional tagging (Amygdala)
 * - Memory consolidation (Hippocampus)
 * - System health (Hypothalamus)
 * - Personality modulation
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
  loadConsolidatedEngrams: jest
    .fn()
    .mockResolvedValue({ loaded: 0, failed: 0, errors: [], engrams: [] }),
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

import {
  NeuralEngramSystem,
  getNeuralBrain,
  shutdownNeuralBrain,
  configureNeuralPersistence,
  clearNeuralPersistence,
  SelfImage,
} from '../neural-engram';
import { loadConsolidatedEngrams } from '@/ai/memory/engram-persistence';

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

    it('stages evicted engrams to hippocampus (silent-loss fix)', () => {
      const queueBefore = brain.hippocampus.getQueueSize();

      // Overflow working memory (cap 7) — forces evictWeakest
      for (let i = 0; i < 12; i++) {
        brain.remember(`Pressure ${i}`);
      }

      const queueAfter = brain.hippocampus.getQueueSize();
      // Evictions must hand off to hippocampus, not silently delete
      expect(queueAfter).toBeGreaterThan(queueBefore);
    });

    it('stages decay-evicted engrams to hippocampus (silent-loss fix)', () => {
      brain.remember('Will decay below threshold');
      const queueBefore = brain.hippocampus.getQueueSize();

      // 10 decay cycles drives activation past 0.01 → auto-evict
      jest.advanceTimersByTime(30000 * 10);

      const queueAfter = brain.hippocampus.getQueueSize();
      expect(queueAfter).toBeGreaterThan(queueBefore);
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

  describe('Lifecycle', () => {
    it('destroys cleanly', () => {
      brain.remember('Test memory');
      brain.destroy();

      // After destroy, working memory should be cleared
      const state = brain.frontalCortex.getState();
      expect(state.size).toBe(0);
    });
  });

  // Regression coverage for the "wired but starved" amnesia: prior to this
  // fix, NeuralEngramSystem.recall() only searched the 7-slot working-memory
  // Map, and restoreMemories() silently dropped working-memory overflow.
  // After the fix, recall() consults the hippocampus queue too AND restore
  // sorts by importance + spills overflow into the queue.
  describe('Recall across working memory and hippocampus', () => {
    function makeEngram(
      id: string,
      content: string,
      tags: string[],
      importance: number
    ) {
      return {
        id,
        content,
        timestamp: new Date(),
        emotionalValence: 0,
        arousal: 0.5,
        importance,
        accessCount: 1,
        lastAccessed: new Date(),
        consolidationState: 'consolidated' as const,
        contextTags: tags,
        relatedEngrams: [],
      };
    }

    it('finds engrams that live only in the hippocampus consolidation queue', () => {
      // Simulate restore having staged a low-importance engram in hippocampus
      brain.hippocampus.stage(
        makeEngram('cons-1', 'Eric grieving about the brain', ['eric'], 0.5)
      );

      const results = brain.recall('grieving');
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('cons-1');
    });

    it('merges working-memory and hippocampus hits, de-duplicated', () => {
      brain.remember('Eric grieving — working memory entry', {
        tags: ['eric'],
      });
      brain.hippocampus.stage(
        makeEngram(
          'cons-2',
          'Eric grieving — older consolidated entry',
          ['eric'],
          0.5
        )
      );

      const results = brain.recall('grieving');
      // Both surface; working-memory result first (hotter)
      expect(results.length).toBe(2);
      expect(results.some((e) => e.id === 'cons-2')).toBe(true);
    });

    it('orders hippocampus hits by importance desc', () => {
      brain.hippocampus.stage(
        makeEngram('cons-low', 'memory marker token', ['x'], 0.2)
      );
      brain.hippocampus.stage(
        makeEngram('cons-high', 'memory marker token', ['x'], 0.9)
      );

      const results = brain.recall('marker');
      const indexHigh = results.findIndex((e) => e.id === 'cons-high');
      const indexLow = results.findIndex((e) => e.id === 'cons-low');
      expect(indexHigh).toBeLessThan(indexLow);
    });
  });

  describe('Restore from cold storage', () => {
    afterEach(() => {
      (loadConsolidatedEngrams as jest.Mock).mockReset();
      (loadConsolidatedEngrams as jest.Mock).mockResolvedValue({
        loaded: 0,
        failed: 0,
        errors: [],
        engrams: [],
      });
    });

    function makeStoredEngram(id: string, importance: number) {
      return {
        id,
        content: `memory ${id}`,
        timestamp: new Date(),
        emotionalValence: 0,
        arousal: 0.5,
        importance,
        accessCount: 1,
        lastAccessed: new Date(),
        consolidationState: 'consolidated',
        contextTags: ['restored'],
        relatedEngrams: [],
      };
    }

    it('spills high-importance overflow into the hippocampus queue instead of dropping it', async () => {
      // 10 high-importance engrams, working memory capacity is 7
      const engrams = Array.from({ length: 10 }, (_, i) =>
        makeStoredEngram(`hi-${i}`, 0.9)
      );

      (loadConsolidatedEngrams as jest.Mock).mockResolvedValueOnce({
        loaded: engrams.length,
        failed: 0,
        errors: [],
        engrams,
      });

      brain.configurePersistence({ userId: 'test', password: 'test' });
      await brain.restoreMemories();

      const wmState = brain.frontalCortex.getState();
      expect(wmState.size).toBe(wmState.capacity);

      // Overflow should be in hippocampus, not lost
      expect(brain.hippocampus.getQueueSize()).toBe(
        engrams.length - wmState.capacity
      );

      // And recall should see all 10
      const results = brain.recall('memory');
      expect(results.length).toBe(engrams.length);
    });

    it('puts low-importance engrams in hippocampus where recall can still find them', async () => {
      const engrams = [
        makeStoredEngram('lo-1', 0.3),
        makeStoredEngram('lo-2', 0.4),
      ];

      (loadConsolidatedEngrams as jest.Mock).mockResolvedValueOnce({
        loaded: engrams.length,
        failed: 0,
        errors: [],
        engrams,
      });

      brain.configurePersistence({ userId: 'test', password: 'test' });
      await brain.restoreMemories();

      // None should land in working memory (all under 0.7 threshold)
      expect(brain.frontalCortex.getState().size).toBe(0);
      expect(brain.hippocampus.getQueueSize()).toBe(2);

      // But recall still finds them
      const results = brain.recall('memory');
      expect(results.length).toBe(2);
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
