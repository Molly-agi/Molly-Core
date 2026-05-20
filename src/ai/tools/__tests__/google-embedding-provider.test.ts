/**
 * @fileOverview Tests for Google Embedding Provider
 *
 * Tests Google GenAI embedding functionality including:
 * - Embed single text
 * - Batch embedding
 * - Health check
 * - Error handling
 */

// Mock logger
jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  generateTraceId: jest.fn(() => 'test-trace-id'),
}));

// Mock genkit - define inline to avoid hoisting issues
jest.mock('@/ai/genkit', () => ({
  ai: {
    embed: jest.fn(),
  },
  MODEL_EMBEDDING: 'gemini-embedding-001',
}));

import * as genkitModule from '@/ai/genkit';

const mockEmbed = genkitModule.ai.embed as jest.MockedFunction<
  typeof genkitModule.ai.embed
>;

import {
  GoogleGenAIEmbeddingProvider,
  createGoogleEmbeddingProvider,
} from '../google-embedding-provider';
import { MollyLogger } from '@/ai/logger';

const mockLogger = MollyLogger as jest.Mocked<typeof MollyLogger>;

describe('Google Embedding Provider', () => {
  let provider: GoogleGenAIEmbeddingProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    provider = new GoogleGenAIEmbeddingProvider();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getName()', () => {
    it('returns provider name', () => {
      expect(provider.getName()).toBe('GoogleGenAI (gemini-embedding-001)');
    });
  });

  describe('getDimensions()', () => {
    it('returns 3072 dimensions for gemini-embedding-001', () => {
      expect(provider.getDimensions()).toBe(3072);
    });
  });

  describe('embed()', () => {
    it('embeds text successfully', async () => {
      const mockVector = Array(3072).fill(0.1);
      mockEmbed.mockResolvedValue([{ embedding: mockVector }]);

      const result = await provider.embed('Hello world');

      expect(result.text).toBe('Hello world');
      expect(result.vector).toEqual(mockVector);
      expect(result.model).toBe('gemini-embedding-001');
      expect(result.timestamp).toBeDefined();
    });

    it('estimates tokens used', async () => {
      mockEmbed.mockResolvedValue([{ embedding: Array(3072).fill(0) }]);

      const text = 'This is a test sentence with some words';
      const result = await provider.embed(text);

      // Tokens estimated as Math.ceil(text.length / 4)
      expect(result.tokensUsed).toBe(Math.ceil(text.length / 4));
    });

    it('logs debug info', async () => {
      mockEmbed.mockResolvedValue([{ embedding: Array(3072).fill(0) }]);

      await provider.embed('Test text');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Embedding text'),
        'google-embeddings',
        expect.any(Object),
        expect.any(String)
      );
    });

    it('throws on empty embedding response', async () => {
      mockEmbed.mockResolvedValue([{ embedding: [] }]);

      await expect(provider.embed('Test')).rejects.toThrow(
        'Empty embedding vector'
      );
    });

    it('throws on null embedding', async () => {
      mockEmbed.mockResolvedValue([{}]);

      await expect(provider.embed('Test')).rejects.toThrow(
        'Empty embedding vector'
      );
    });

    it('logs error on failure', async () => {
      mockEmbed.mockRejectedValue(new Error('API error'));

      await expect(provider.embed('Test')).rejects.toThrow('API error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to embed text',
        'google-embeddings',
        expect.any(Object),
        expect.any(Error),
        expect.any(String)
      );
    });

    it('handles timeout', async () => {
      // Create a slow promise that won't resolve quickly
      mockEmbed.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () => resolve([{ embedding: Array(3072).fill(0) }]),
              15000
            );
          })
      );

      const embedPromise = provider.embed('Slow text');

      // Advance timers past the 10s timeout
      jest.advanceTimersByTime(11000);

      await expect(embedPromise).rejects.toThrow('timed out');
    });
  });

  describe('embedBatch()', () => {
    it('embeds multiple texts', async () => {
      mockEmbed.mockResolvedValue([{ embedding: Array(3072).fill(0.1) }]);

      const result = await provider.embedBatch(['Text 1', 'Text 2', 'Text 3']);

      expect(result.embeddings).toHaveLength(3);
      expect(result.batchSize).toBe(3);
      expect(result.model).toBe('gemini-embedding-001');
    });

    it('calculates total tokens', async () => {
      mockEmbed.mockResolvedValue([{ embedding: Array(3072).fill(0) }]);

      const result = await provider.embedBatch(['Short', 'Medium text here']);

      expect(result.totalTokensUsed).toBeGreaterThan(0);
    });

    it('logs batch progress', async () => {
      mockEmbed.mockResolvedValue([{ embedding: Array(3072).fill(0) }]);

      await provider.embedBatch(['A', 'B']);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Batch embedding'),
        'google-embeddings',
        expect.objectContaining({ batchSize: 2 }),
        expect.any(String)
      );
    });

    it('handles empty batch', async () => {
      const result = await provider.embedBatch([]);

      expect(result.embeddings).toHaveLength(0);
      expect(result.batchSize).toBe(0);
    });

    it('propagates embed errors', async () => {
      mockEmbed.mockRejectedValue(new Error('Batch failed'));

      await expect(provider.embedBatch(['Text'])).rejects.toThrow(
        'Batch failed'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to batch embed texts',
        'google-embeddings',
        expect.any(Object),
        expect.any(Error),
        expect.any(String)
      );
    });
  });

  describe('healthCheck()', () => {
    it('returns true when embedding works', async () => {
      mockEmbed.mockResolvedValue([{ embedding: Array(3072).fill(0.5) }]);

      const healthy = await provider.healthCheck();

      expect(healthy).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('health check passed'),
        'google-embeddings'
      );
    });

    it('returns false for empty embedding from API', async () => {
      // When embedding is null/undefined, it falls through to [] and throws
      mockEmbed.mockResolvedValue([{ embedding: null }]);

      const healthy = await provider.healthCheck();

      expect(healthy).toBe(false);
      // The error path is taken, not the warn path
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('returns false on error', async () => {
      mockEmbed.mockRejectedValue(new Error('Connection failed'));

      const healthy = await provider.healthCheck();

      expect(healthy).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('health check failed'),
        'google-embeddings',
        expect.any(Object),
        expect.any(Error)
      );
    });

    it('uses test text for health check', async () => {
      mockEmbed.mockResolvedValue([{ embedding: Array(3072).fill(0) }]);

      await provider.healthCheck();

      expect(mockEmbed).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Molly is alive and well.',
        })
      );
    });
  });

  describe('Similarity (inherited)', () => {
    it('calculates cosine similarity', () => {
      const vector1 = [1, 0, 0];
      const vector2 = [1, 0, 0];

      const similarity = provider.similarity(vector1, vector2);

      expect(similarity).toBeCloseTo(1.0);
    });

    it('finds similar vectors', () => {
      const query = [1, 0];
      const candidates = [
        [0, 1],
        [1, 0],
        [0.5, 0.5],
      ];

      const similar = provider.findSimilar(query, candidates, 2);

      expect(similar[0].index).toBe(1); // Exact match
    });
  });

  describe('createGoogleEmbeddingProvider()', () => {
    it('creates provider instance', async () => {
      mockEmbed.mockResolvedValue([{ embedding: Array(3072).fill(0) }]);

      const newProvider = await createGoogleEmbeddingProvider();

      expect(newProvider).toBeInstanceOf(GoogleGenAIEmbeddingProvider);
    });

    it('runs health check on creation', async () => {
      mockEmbed.mockResolvedValue([{ embedding: Array(3072).fill(0) }]);

      await createGoogleEmbeddingProvider();

      // Health check should embed test text
      expect(mockEmbed).toHaveBeenCalled();
    });

    it('logs warning if health check fails', async () => {
      mockEmbed.mockRejectedValue(new Error('Startup failed'));

      await createGoogleEmbeddingProvider();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('health check failed'),
        'google-embeddings'
      );
    });
  });
});
