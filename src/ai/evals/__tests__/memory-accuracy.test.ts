/**
 * @jest-environment node
 * @fileOverview Tests for Memory Accuracy Evaluation Framework
 *
 * Validates that the memory eval suite correctly:
 * - Defines meaningful test cases with synthetic memories
 * - Scores recall precision and recall accurately
 * - Computes F1 scores
 * - Detects noise in recall results
 */

import {
  MEMORY_TEST_CASES,
  runMemoryAccuracyEval,
  type MemoryTestCase,
} from '@/ai/evals/memory-accuracy.braintrust';

// Mock storage router so tests don't need Firebase
jest.mock('@/lib/storage-router', () => ({
  getStorageRouter: jest.fn().mockResolvedValue({
    getMode: jest.fn().mockReturnValue('local'),
    set: jest.fn().mockResolvedValue(undefined),
    read: jest.fn().mockResolvedValue({
      id: 'test-id',
      content: 'Memory accuracy test entry',
      timestamp: new Date().toISOString(),
      tags: ['eval', 'test'],
    }),
  }),
}));

// Mock logger
jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Memory Accuracy Evaluation Framework', () => {
  describe('Test Case Structure', () => {
    it('should have memory test cases', () => {
      expect(MEMORY_TEST_CASES.length).toBeGreaterThan(0);
    });

    it('each test case should have required fields', () => {
      MEMORY_TEST_CASES.forEach((tc: MemoryTestCase) => {
        expect(tc.id).toBeDefined();
        expect(tc.category).toBeDefined();
        expect(tc.description).toBeDefined();
        expect(tc.syntheticMemories.length).toBeGreaterThan(0);
        expect(tc.queries.length).toBeGreaterThan(0);
      });
    });

    it('each synthetic memory should have required fields', () => {
      MEMORY_TEST_CASES.forEach((tc) => {
        tc.syntheticMemories.forEach((mem) => {
          expect(mem.id).toBeDefined();
          expect(mem.content).toBeDefined();
          expect(mem.tags).toBeDefined();
          expect(typeof mem.relevanceScore).toBe('number');
          expect(mem.relevanceScore).toBeGreaterThanOrEqual(0);
          expect(mem.relevanceScore).toBeLessThanOrEqual(1);
          expect(typeof mem.shouldBeRecalled).toBe('boolean');
        });
      });
    });

    it('each query should have expected and not-expected memory IDs', () => {
      MEMORY_TEST_CASES.forEach((tc) => {
        tc.queries.forEach((query) => {
          expect(query.query.length).toBeGreaterThan(0);
          expect(query.expectedMemoryIds.length).toBeGreaterThan(0);
          expect(query.notExpectedMemoryIds.length).toBeGreaterThan(0);
        });
      });
    });

    it('expected and not-expected IDs should not overlap', () => {
      MEMORY_TEST_CASES.forEach((tc) => {
        tc.queries.forEach((query) => {
          const expectedSet = new Set(query.expectedMemoryIds);
          const notExpectedSet = new Set(query.notExpectedMemoryIds);
          const overlap = [...expectedSet].filter((id) => notExpectedSet.has(id));
          expect(overlap.length).toBe(0);
        });
      });
    });

    it('should cover multiple recall categories', () => {
      const categories = new Set(MEMORY_TEST_CASES.map((tc) => tc.category));
      expect(categories.has('recall')).toBe(true);
    });

    it('high-relevance memories should be in expectedMemoryIds', () => {
      MEMORY_TEST_CASES.forEach((tc) => {
        const highRelevance = tc.syntheticMemories
          .filter((m) => m.relevanceScore > 0.7)
          .map((m) => m.id);

        const allExpected = tc.queries.flatMap((q) => q.expectedMemoryIds);
        const expectedSet = new Set(allExpected);

        highRelevance.forEach((id) => {
          expect(expectedSet.has(id)).toBe(true);
        });
      });
    });

    it('low-relevance memories should be in notExpectedMemoryIds', () => {
      MEMORY_TEST_CASES.forEach((tc) => {
        const lowRelevance = tc.syntheticMemories
          .filter((m) => m.relevanceScore < 0.1)
          .map((m) => m.id);

        const allNotExpected = tc.queries.flatMap((q) => q.notExpectedMemoryIds);
        const notExpectedSet = new Set(allNotExpected);

        lowRelevance.forEach((id) => {
          expect(notExpectedSet.has(id)).toBe(true);
        });
      });
    });
  });

  describe('Evaluation Run', () => {
    it('should run and return a valid result', async () => {
      const result = await runMemoryAccuracyEval();

      expect(result.evaluationId).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.responses.length).toBeGreaterThan(0);
      expect(result.averagePrecision).toBeGreaterThanOrEqual(0);
      expect(result.averagePrecision).toBeLessThanOrEqual(1);
      expect(result.averageRecall).toBeGreaterThanOrEqual(0);
      expect(result.averageRecall).toBeLessThanOrEqual(1);
      expect(result.averageF1).toBeGreaterThanOrEqual(0);
      expect(result.averageF1).toBeLessThanOrEqual(1);
      expect(result.summary).toBeDefined();
    });

    it('each response should have precision and recall values', async () => {
      const result = await runMemoryAccuracyEval();

      result.responses.forEach((r) => {
        expect(r.precision).toBeGreaterThanOrEqual(0);
        expect(r.precision).toBeLessThanOrEqual(1);
        expect(r.recall).toBeGreaterThanOrEqual(0);
        expect(r.recall).toBeLessThanOrEqual(1);
        expect(r.f1Score).toBeGreaterThanOrEqual(0);
        expect(r.f1Score).toBeLessThanOrEqual(1);
        expect(typeof r.noiseIncluded).toBe('boolean');
      });
    });

    it('should report storage backend', async () => {
      const result = await runMemoryAccuracyEval();
      expect(result.storageBackend).toBe('local'); // mocked to local
    });
  });
});
