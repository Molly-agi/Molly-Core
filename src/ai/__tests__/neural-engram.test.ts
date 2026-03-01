/**
 * @fileOverview Neural Engram System Tests
 *
 * Tests the brain-like memory architecture:
 * - FrontalCortex: Working memory (hold, recall, search, eviction, decay)
 * - Amygdala: Emotional tagging & importance calculation
 * - Hippocampus: Consolidation staging, batching, queue management
 * - Hypothalamus: Health assessment & cleanup recommendations
 * - NeuralEngramSystem: Integration of all subsystems
 */

// Mock the logger to prevent console noise during tests
jest.mock('../../ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  generateTraceId: jest.fn(() => 'test-trace-id'),
}));

// Mock engram persistence so consolidation doesn't hit Firestore
jest.mock('../../ai/memory/engram-persistence', () => ({
  persistEngramBatch: jest.fn().mockResolvedValue(undefined),
}));

import { NeuralEngramSystem } from '../memory/neural-engram';
import type { MemoryEngram } from '../memory/neural-engram';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEngram(overrides: Partial<MemoryEngram> = {}): MemoryEngram {
  return {
    id: `engram-test-${Date.now()}-${Math.random()}`,
    content: 'Test memory content',
    timestamp: new Date(),
    emotionalValence: 0,
    arousal: 0.5,
    importance: 0.5,
    accessCount: 1,
    lastAccessed: new Date(),
    consolidationState: 'working',
    contextTags: [],
    relatedEngrams: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NeuralEngramSystem', () => {
  let brain: NeuralEngramSystem;

  beforeEach(() => {
    brain = new NeuralEngramSystem();
  });

  afterEach(() => {
    // Clean up decay timers to prevent leaks
    brain.frontalCortex.destroy();
  });

  // ===== FRONTAL CORTEX (Working Memory) =====

  describe('FrontalCortex — Working Memory', () => {
    it('stores a memory via remember()', () => {
      const engram = brain.remember('Something important happened');
      expect(engram).toBeDefined();
      expect(engram.id).toBeTruthy();
      expect(engram.content).toBe('Something important happened');
      expect(engram.consolidationState).toBe('working');
    });

    it('retrieves stored memories via recall()', () => {
      brain.remember('The server crashed at 3am', {
        tags: ['crash', 'server'],
      });
      const results = brain.recall('server');
      expect(results.length).toBe(1);
      expect(results[0].content).toContain('server crashed');
    });

    it('recall by tag match works', () => {
      brain.remember('Memory alpha', { tags: ['thermal'] });
      brain.remember('Memory beta', { tags: ['network'] });
      const results = brain.recall('thermal');
      expect(results.length).toBe(1);
      expect(results[0].contextTags).toContain('thermal');
    });

    it("enforces Miller's Law: max 7 working memories", () => {
      // Fill working memory to capacity
      for (let i = 0; i < 8; i++) {
        brain.remember(`Memory ${i}`, { importance: 0.1 + i * 0.1 });
      }

      const state = brain.frontalCortex.getState();
      expect(state.size).toBeLessThanOrEqual(state.capacity);
      expect(state.size).toBe(7);
    });

    it('evicts the weakest memory when at capacity', () => {
      // Add 7 memories with known importance levels
      for (let i = 0; i < 7; i++) {
        brain.remember(`Memory ${i}`, { importance: 0.5 + i * 0.05 });
      }

      // Add one more — should evict the least important
      brain.remember('The important one', { importance: 0.9 });

      const state = brain.frontalCortex.getState();
      expect(state.size).toBe(7);

      // The important one should still be in memory
      const results = brain.recall('important one');
      expect(results.length).toBe(1);
    });

    it('release() removes a specific memory', () => {
      const engram = brain.remember('Temporary thought');
      brain.frontalCortex.release(engram.id);

      const state = brain.frontalCortex.getState();
      expect(state.size).toBe(0);
    });

    it('clear() removes all working memories', () => {
      brain.remember('Memory 1');
      brain.remember('Memory 2');
      brain.remember('Memory 3');

      brain.frontalCortex.clear();
      const state = brain.frontalCortex.getState();
      expect(state.size).toBe(0);
    });

    it('getConsolidationCandidates returns low-activation memories', () => {
      // We can't easily control activation timing in a unit test,
      // but we can verify the method exists and returns an array
      const candidates = brain.frontalCortex.getConsolidationCandidates();
      expect(Array.isArray(candidates)).toBe(true);
    });
  });

  // ===== AMYGDALA (Emotional Tagging) =====

  describe('Amygdala — Emotional Tagging', () => {
    it('success increases positive valence and arousal', () => {
      const engram = brain.remember('Deploy succeeded', { success: true });
      expect(engram.emotionalValence).toBeGreaterThan(0);
      expect(engram.arousal).toBeGreaterThan(0.5);
    });

    it('error decreases valence and increases arousal', () => {
      const engram = brain.remember('Critical error occurred', { error: true });
      expect(engram.emotionalValence).toBeLessThan(0);
      expect(engram.arousal).toBeGreaterThan(0.5);
    });

    it('positive user feedback increases importance', () => {
      const engram = brain.remember('Good response', {
        userFeedback: 'positive',
      });
      expect(engram.importance).toBeGreaterThan(0.5);
      expect(engram.emotionalValence).toBeGreaterThan(0);
    });

    it('negative user feedback increases importance (learn from mistakes)', () => {
      const engram = brain.remember('Bad response', {
        userFeedback: 'negative',
      });
      // Importance should increase because we learn from mistakes
      expect(engram.importance).toBeGreaterThan(0.5);
    });

    it('high novelty increases importance and arousal', () => {
      const engram = brain.remember('Never seen before pattern', {
        novelty: 1.0,
      });
      expect(engram.importance).toBeGreaterThan(0.5);
      expect(engram.arousal).toBeGreaterThan(0.5);
    });

    it('isPriority returns true for high importance memories', () => {
      const highImportance = makeEngram({ importance: 0.9, arousal: 0.5 });
      expect(brain.amygdala.isPriority(highImportance)).toBe(true);
    });

    it('isPriority returns true for high arousal memories', () => {
      const highArousal = makeEngram({ importance: 0.3, arousal: 0.9 });
      expect(brain.amygdala.isPriority(highArousal)).toBe(true);
    });

    it('isPriority returns false for mundane memories', () => {
      const mundane = makeEngram({ importance: 0.3, arousal: 0.3 });
      expect(brain.amygdala.isPriority(mundane)).toBe(false);
    });
  });

  // ===== HIPPOCAMPUS (Consolidation) =====

  describe('Hippocampus — Memory Consolidation', () => {
    it('stages memory for consolidation', () => {
      const engram = makeEngram();
      brain.hippocampus.stage(engram);
      expect(brain.hippocampus.getQueueSize()).toBe(1);
    });

    it('needsConsolidation returns true when queue reaches batch size', () => {
      // Default batch size is 20
      for (let i = 0; i < 20; i++) {
        brain.hippocampus.stage(makeEngram({ content: `Memory ${i}` }));
      }
      expect(brain.hippocampus.needsConsolidation()).toBe(true);
    });

    it('needsConsolidation returns false when queue is small', () => {
      brain.hippocampus.stage(makeEngram());
      expect(brain.hippocampus.needsConsolidation()).toBe(false);
    });

    it('getConsolidationBatch returns sorted-by-importance batch', () => {
      const low = makeEngram({ importance: 0.1, content: 'Low importance' });
      const high = makeEngram({ importance: 0.9, content: 'High importance' });
      const mid = makeEngram({ importance: 0.5, content: 'Mid importance' });

      brain.hippocampus.stage(low);
      brain.hippocampus.stage(high);
      brain.hippocampus.stage(mid);

      // Fill to batch size
      for (let i = 0; i < 17; i++) {
        brain.hippocampus.stage(makeEngram({ importance: 0.4 }));
      }

      const batch = brain.hippocampus.getConsolidationBatch();
      expect(batch.length).toBe(20);
      // First item should be highest importance
      expect(batch[0].importance).toBe(0.9);
      // All should be marked as consolidated
      expect(batch.every((e) => e.consolidationState === 'consolidated')).toBe(
        true
      );
    });

    it('getConsolidationBatch drains the queue', () => {
      for (let i = 0; i < 25; i++) {
        brain.hippocampus.stage(makeEngram());
      }

      const batch = brain.hippocampus.getConsolidationBatch();
      expect(batch.length).toBe(20);
      expect(brain.hippocampus.getQueueSize()).toBe(5);
    });

    it('clear() empties the consolidation queue', () => {
      for (let i = 0; i < 5; i++) {
        brain.hippocampus.stage(makeEngram());
      }
      brain.hippocampus.clear();
      expect(brain.hippocampus.getQueueSize()).toBe(0);
    });
  });

  // ===== HYPOTHALAMUS (Health Assessment) =====

  describe('Hypothalamus — Health Assessment', () => {
    it('reports healthy when system is normal', () => {
      brain.remember('One simple memory');
      const health = brain.checkHealth();
      expect(health.status).toBe('healthy');
    });

    it('reports overloaded when working memory is near capacity', () => {
      // Fill working memory to near capacity (7 slots, 90% = ~6.3)
      for (let i = 0; i < 7; i++) {
        brain.remember(`Memory ${i}`, { importance: 0.9 });
      }
      const health = brain.checkHealth();
      // At 7/7, should be overloaded
      expect(health.status).toBe('overloaded');
    });

    it('reports stressed when consolidation queue is large', () => {
      for (let i = 0; i < 51; i++) {
        brain.hippocampus.stage(makeEngram());
      }
      const health = brain.checkHealth();
      expect(health.status).toBe('stressed');
    });

    it('recommends archiving stale memories', () => {
      const staleMemories = Array.from({ length: 25 }, (_, i) =>
        makeEngram({
          content: `Stale memory ${i}`,
          importance: 0.1,
          accessCount: 1,
          lastAccessed: new Date(Date.now() - 100_000_000), // >24h ago
        })
      );

      const recommendations =
        brain.hypothalamus.recommendCleanup(staleMemories);
      expect(recommendations.some((r) => r.includes('Archive'))).toBe(true);
    });

    it('detects duplicate patterns', () => {
      // Need >5 distinct duplicate GROUPS (content prefix collisions)
      const duplicates: MemoryEngram[] = [];
      for (let g = 0; g < 7; g++) {
        // Each group has 2 items sharing the same first 50 chars
        const sharedContent = `Duplicate group ${g} — this content is long enough to fill the prefix window`;
        duplicates.push(makeEngram({ content: sharedContent }));
        duplicates.push(makeEngram({ content: sharedContent }));
      }

      const recommendations = brain.hypothalamus.recommendCleanup(duplicates);
      expect(recommendations.some((r) => r.includes('similar'))).toBe(true);
    });
  });

  // ===== FULL INTEGRATION =====

  describe('NeuralEngramSystem — Integration', () => {
    it('remember → recall → consolidate lifecycle', async () => {
      // Phase 1: Remember
      brain.remember('Important lesson learned', {
        success: true,
        importance: 0.8,
      });
      brain.remember('Minor observation', { importance: 0.2 });

      // Phase 2: Recall
      const results = brain.recall('lesson');
      expect(results.length).toBe(1);

      // Phase 3: Consolidate (won't actually batch yet, queue too small)
      const result = await brain.consolidate();
      expect(result).toHaveProperty('consolidated');
      expect(result).toHaveProperty('queued');
    });

    it('consolidated memories are marked correctly', async () => {
      // Stage enough memories for a consolidation batch
      for (let i = 0; i < 21; i++) {
        brain.hippocampus.stage(
          makeEngram({ content: `Consolidation test ${i}` })
        );
      }

      const batch = brain.hippocampus.getConsolidationBatch();
      for (const engram of batch) {
        expect(engram.consolidationState).toBe('consolidated');
      }
    });

    it('personality modulation initializes with baseline values', () => {
      const personality = brain.computePersonalityState();
      expect(personality).toBeDefined();
      expect(personality.warmth).toBe(0.8);
      expect(personality.curiosity).toBe(0.8);
      expect(personality.humor).toBe(0.6);
      // Baseline values from getBaselinePersonality
      expect(personality.flirtiness).toBe(0.3);
    });

    it('checkHealth returns valid structure', () => {
      const health = brain.checkHealth();
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('recommendation');
      expect(health).toHaveProperty('stats');
      expect(['healthy', 'stressed', 'overloaded']).toContain(health.status);
    });

    it('persistence can be configured and cleared', () => {
      brain.configurePersistence({
        userId: 'test-user',
        password: 'test-pass',
        source: 'test',
      });
      // Should not throw
      brain.clearPersistence();
    });
  });
});
