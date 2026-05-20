/**
 * @fileOverview Tests for Semantic Recall Tool
 *
 * Tests semantic memory recall including:
 * - Query embedding
 * - Similarity calculation
 * - Filtering
 * - Fallback keyword search
 */

// Mock logger
jest.mock('../../logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  generateTraceId: jest.fn().mockReturnValue('test-trace-id'),
}));

// Mock firebase admin
jest.mock('@/firebase/admin', () => ({
  isAdminConfigured: jest.fn().mockReturnValue(true),
}));

// Mock storage router
jest.mock('@/lib/storage-router', () => ({
  getStorageRouter: jest.fn().mockReturnValue({
    getMode: jest.fn().mockReturnValue('local'),
    query: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue(undefined),
  }),
}));

// Mock embedding provider
jest.mock('../embedding-provider', () => ({
  getEmbeddingProvider: jest.fn().mockReturnValue({
    embed: jest.fn().mockResolvedValue({ vector: [0.1, 0.2, 0.3] }),
    similarity: jest.fn().mockReturnValue(0.85),
  }),
  isEmbeddingProviderReady: jest.fn().mockReturnValue(true),
  setEmbeddingProvider: jest.fn(),
}));

// Mock google embedding provider
jest.mock('../google-embedding-provider', () => ({
  createGoogleEmbeddingProvider: jest.fn().mockResolvedValue({
    embed: jest.fn().mockResolvedValue({ vector: [0.1, 0.2, 0.3] }),
    similarity: jest.fn().mockReturnValue(0.85),
  }),
}));

// Mock memory integrity
jest.mock('../memory-integrity', () => ({
  verifyRecordIntegrity: jest.fn().mockReturnValue(true),
  semanticPriority: jest.fn().mockReturnValue(0.8),
}));

// Mock genkit
jest.mock('@/ai/genkit', () => ({
  ai: {
    defineTool: jest.fn((config, handler) => handler),
  },
}));

import { semanticRecall, recallSimilarMemories } from '../semantic-recall';
import { getStorageRouter } from '@/lib/storage-router';
import {
  getEmbeddingProvider,
  isEmbeddingProviderReady,
} from '../embedding-provider';
import { isAdminConfigured } from '@/firebase/admin';
import { verifyRecordIntegrity } from '../memory-integrity';

describe('Semantic Recall', () => {
  const mockStorage = getStorageRouter() as jest.Mocked<
    ReturnType<typeof getStorageRouter>
  >;
  const mockEmbeddingProvider = getEmbeddingProvider() as jest.Mocked<
    ReturnType<typeof getEmbeddingProvider>
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    (isEmbeddingProviderReady as jest.Mock).mockReturnValue(true);
    (isAdminConfigured as jest.Mock).mockReturnValue(true);
    mockStorage.getMode.mockReturnValue('local');
    mockStorage.query.mockResolvedValue([]);
  });

  describe('semanticRecall', () => {
    it('returns empty array when no memories found', async () => {
      mockStorage.query.mockResolvedValue([]);

      const result = await semanticRecall({
        userId: 'user123',
        queryText: 'test query',
        limit: 5,
        minSimilarity: 0.5,
      });

      expect(result).toEqual([]);
    });

    it('returns memories above similarity threshold', async () => {
      // Mock query to return results for only one collection
      mockStorage.query
        .mockResolvedValueOnce([
          {
            id: 'mem1',
            data: {
              context: 'test',
              suggestion: 'Test suggestion',
              timestamp: Date.now(),
              embeddingVector: [0.1, 0.2, 0.3],
            },
          },
        ])
        .mockResolvedValueOnce([]) // aiResponses
        .mockResolvedValueOnce([]); // codeModifications

      mockEmbeddingProvider.similarity.mockReturnValue(0.8);

      const result = await semanticRecall({
        userId: 'user123',
        queryText: 'test query',
        limit: 5,
        minSimilarity: 0.5,
      });

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('mem1');
      expect(result[0].similarity).toBe(0.8);
    });

    it('filters out memories below similarity threshold', async () => {
      mockStorage.query.mockResolvedValue([
        {
          id: 'mem1',
          data: {
            context: 'test',
            suggestion: 'Low similarity',
            timestamp: Date.now(),
            embeddingVector: [0.1, 0.2, 0.3],
          },
        },
      ]);

      mockEmbeddingProvider.similarity.mockReturnValue(0.3); // Below 0.5 threshold

      const result = await semanticRecall({
        userId: 'user123',
        queryText: 'test query',
        limit: 5,
        minSimilarity: 0.5,
      });

      expect(result).toEqual([]);
    });

    it('filters out family story memories', async () => {
      mockStorage.query
        .mockResolvedValueOnce([
          {
            id: 'story1',
            data: {
              context: 'family story: part 1',
              suggestion: 'Family content',
              timestamp: Date.now(),
              embeddingVector: [0.1, 0.2, 0.3],
            },
          },
          {
            id: 'normal1',
            data: {
              context: 'normal context',
              suggestion: 'Normal content',
              timestamp: Date.now(),
              embeddingVector: [0.1, 0.2, 0.3],
            },
          },
        ])
        .mockResolvedValueOnce([]) // aiResponses
        .mockResolvedValueOnce([]); // codeModifications

      mockEmbeddingProvider.similarity.mockReturnValue(0.9);

      const result = await semanticRecall({
        userId: 'user123',
        queryText: 'test query',
        limit: 5,
        minSimilarity: 0.5,
      });

      // Only normal memory should be returned
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('normal1');
    });

    it('skips corrupted memories', async () => {
      mockStorage.query.mockResolvedValue([
        {
          id: 'corrupted',
          data: {
            context: 'test',
            suggestion: 'Corrupted',
            timestamp: Date.now(),
            embeddingVector: [0.1, 0.2, 0.3],
            crc32: 'invalid-checksum',
          },
        },
      ]);

      (verifyRecordIntegrity as jest.Mock).mockReturnValue(false);
      mockEmbeddingProvider.similarity.mockReturnValue(0.9);

      const result = await semanticRecall({
        userId: 'user123',
        queryText: 'test query',
        limit: 5,
        minSimilarity: 0.5,
      });

      expect(result).toEqual([]);
    });

    it('includes prompt in suggestion when available', async () => {
      mockStorage.query.mockResolvedValue([
        {
          id: 'mem1',
          data: {
            context: 'test',
            prompt: 'What is AI?',
            suggestion: 'AI is artificial intelligence',
            timestamp: Date.now(),
            embeddingVector: [0.1, 0.2, 0.3],
          },
        },
      ]);

      mockEmbeddingProvider.similarity.mockReturnValue(0.9);

      const result = await semanticRecall({
        userId: 'user123',
        queryText: 'test query',
        limit: 5,
        minSimilarity: 0.5,
      });

      expect(result[0].suggestion).toContain('Eric said');
      expect(result[0].suggestion).toContain('What is AI?');
    });

    it('applies context filter', async () => {
      mockStorage.query.mockResolvedValue([]);

      await semanticRecall({
        userId: 'user123',
        queryText: 'test query',
        limit: 5,
        minSimilarity: 0.5,
        contextFilter: 'debugging',
      });

      // Verify filter was passed to query
      expect(mockStorage.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({ field: 'context', value: 'debugging' }),
        ]),
        expect.any(Object)
      );
    });

    it('skips when firestore not configured', async () => {
      mockStorage.getMode.mockReturnValue('firestore');
      (isAdminConfigured as jest.Mock).mockReturnValue(false);

      const result = await semanticRecall({
        userId: 'user123',
        queryText: 'test query',
        limit: 5,
        minSimilarity: 0.5,
      });

      expect(result).toEqual([]);
    });

    it('auto-initializes embedding provider when not ready', async () => {
      (isEmbeddingProviderReady as jest.Mock).mockReturnValue(false);
      mockStorage.query.mockResolvedValue([]);

      const { createGoogleEmbeddingProvider } =
        await import('../google-embedding-provider');

      await semanticRecall({
        userId: 'user123',
        queryText: 'test query',
        limit: 5,
        minSimilarity: 0.5,
      });

      expect(createGoogleEmbeddingProvider).toHaveBeenCalled();
    });

    it('respects result limit', async () => {
      const manyMemories = Array.from({ length: 10 }, (_, i) => ({
        id: `mem${i}`,
        data: {
          context: 'test',
          suggestion: `Memory ${i}`,
          timestamp: Date.now() - i * 1000,
          embeddingVector: [0.1, 0.2, 0.3],
        },
      }));

      mockStorage.query.mockResolvedValue(manyMemories);
      mockEmbeddingProvider.similarity.mockReturnValue(0.9);

      const result = await semanticRecall({
        userId: 'user123',
        queryText: 'test query',
        limit: 3,
        minSimilarity: 0.5,
      });

      expect(result.length).toBe(3);
    });

    it('re-embeds memories with stale embeddings', async () => {
      // Clear prior calls
      mockEmbeddingProvider.embed.mockClear();

      mockStorage.query
        .mockResolvedValueOnce([
          {
            id: 'stale',
            data: {
              context: 'test',
              suggestion: 'Stale embedding',
              timestamp: Date.now(),
              embeddingVector: [0.1], // Wrong dimension
            },
          },
        ])
        .mockResolvedValueOnce([]) // aiResponses
        .mockResolvedValueOnce([]); // codeModifications

      mockEmbeddingProvider.embed.mockResolvedValue({
        vector: [0.1, 0.2, 0.3],
      });
      mockEmbeddingProvider.similarity.mockReturnValue(0.9);

      await semanticRecall({
        userId: 'user123',
        queryText: 'test query',
        limit: 5,
        minSimilarity: 0.5,
      });

      // Should have embedded the query + re-embedded the stale memory
      expect(mockEmbeddingProvider.embed).toHaveBeenCalledTimes(2);
    });
  });

  describe('recallSimilarMemories', () => {
    it('calls semanticRecall with options', async () => {
      mockStorage.query.mockResolvedValue([]);

      const result = await recallSimilarMemories('user123', 'test query', {
        limit: 10,
        minSimilarity: 0.7,
        contextFilter: 'debugging',
      });

      expect(result).toEqual([]);
    });

    it('uses default options', async () => {
      mockStorage.query.mockResolvedValue([]);

      await recallSimilarMemories('user123', 'test query');

      // Should use default limit: 5, minSimilarity: 0.5
      expect(mockStorage.query).toHaveBeenCalled();
    });
  });
});
