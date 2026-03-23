/**
 * @fileOverview Tests for Embedding Provider — Vector Similarity Interface
 *
 * Tests embedding provider functionality including:
 * - Provider initialization
 * - Cosine similarity calculation
 * - k-nearest neighbor search
 * - Singleton management
 */

import {
  BaseEmbeddingProvider,
  setEmbeddingProvider,
  getEmbeddingProvider,
  isEmbeddingProviderReady,
  resetEmbeddingProvider,
  EmbeddingResult,
  BatchEmbeddingResult,
  EmbeddingVector,
} from '../embedding-provider';

// Test implementation of BaseEmbeddingProvider
class TestEmbeddingProvider extends BaseEmbeddingProvider {
  private mockDimensions: number;

  constructor(dimensions: number = 3072) {
    super();
    this.mockDimensions = dimensions;
    this.dimensions = dimensions;
  }

  getName(): string {
    return 'test-provider';
  }

  async embed(text: string): Promise<EmbeddingResult> {
    return {
      text,
      vector: Array(this.mockDimensions).fill(0.1),
      model: 'test-model',
      tokensUsed: text.split(' ').length,
      timestamp: Date.now(),
    };
  }

  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    const embeddings = await Promise.all(texts.map((t) => this.embed(t)));
    return {
      embeddings,
      totalTokensUsed: embeddings.reduce(
        (sum, e) => sum + (e.tokensUsed || 0),
        0
      ),
      batchSize: texts.length,
      model: 'test-model',
    };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

describe('Embedding Provider', () => {
  beforeEach(() => {
    resetEmbeddingProvider();
  });

  describe('BaseEmbeddingProvider', () => {
    let provider: TestEmbeddingProvider;

    beforeEach(() => {
      provider = new TestEmbeddingProvider();
    });

    describe('getName()', () => {
      it('returns provider name', () => {
        expect(provider.getName()).toBe('test-provider');
      });
    });

    describe('getDimensions()', () => {
      it('returns default dimensions', () => {
        expect(provider.getDimensions()).toBe(3072);
      });

      it('returns custom dimensions', () => {
        const customProvider = new TestEmbeddingProvider(1536);
        expect(customProvider.getDimensions()).toBe(1536);
      });
    });

    describe('embed()', () => {
      it('embeds text and returns result', async () => {
        const result = await provider.embed('hello world');

        expect(result.text).toBe('hello world');
        expect(result.vector).toHaveLength(3072);
        expect(result.model).toBe('test-model');
        expect(result.timestamp).toBeDefined();
      });

      it('calculates tokens used', async () => {
        const result = await provider.embed('one two three four');

        expect(result.tokensUsed).toBe(4);
      });
    });

    describe('embedBatch()', () => {
      it('embeds multiple texts', async () => {
        const result = await provider.embedBatch(['text one', 'text two']);

        expect(result.embeddings).toHaveLength(2);
        expect(result.batchSize).toBe(2);
        expect(result.model).toBe('test-model');
      });

      it('calculates total tokens', async () => {
        const result = await provider.embedBatch(['a b', 'c d e']);

        expect(result.totalTokensUsed).toBe(5);
      });
    });

    describe('healthCheck()', () => {
      it('returns health status', async () => {
        const healthy = await provider.healthCheck();
        expect(healthy).toBe(true);
      });
    });
  });

  describe('similarity()', () => {
    let provider: TestEmbeddingProvider;

    beforeEach(() => {
      provider = new TestEmbeddingProvider();
    });

    it('returns 1 for identical vectors', () => {
      const vector: EmbeddingVector = [1, 2, 3];
      const similarity = provider.similarity(vector, vector);

      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('returns 0 for orthogonal vectors', () => {
      const vector1: EmbeddingVector = [1, 0, 0];
      const vector2: EmbeddingVector = [0, 1, 0];

      const similarity = provider.similarity(vector1, vector2);

      expect(similarity).toBeCloseTo(0.0, 5);
    });

    it('returns -1 for opposite vectors', () => {
      const vector1: EmbeddingVector = [1, 2, 3];
      const vector2: EmbeddingVector = [-1, -2, -3];

      const similarity = provider.similarity(vector1, vector2);

      expect(similarity).toBeCloseTo(-1.0, 5);
    });

    it('calculates cosine similarity correctly', () => {
      const vector1: EmbeddingVector = [3, 4, 0];
      const vector2: EmbeddingVector = [4, 3, 0];

      const similarity = provider.similarity(vector1, vector2);

      // Cosine of angle between [3,4] and [4,3]
      // dot = 12 + 12 = 24, mag1 = 5, mag2 = 5
      // similarity = 24 / 25 = 0.96
      expect(similarity).toBeCloseTo(0.96, 2);
    });

    it('throws for mismatched dimensions', () => {
      const vector1: EmbeddingVector = [1, 2, 3];
      const vector2: EmbeddingVector = [1, 2];

      expect(() => provider.similarity(vector1, vector2)).toThrow(
        'Vectors must have same dimensions'
      );
    });

    it('returns 0 for zero vectors', () => {
      const vector1: EmbeddingVector = [0, 0, 0];
      const vector2: EmbeddingVector = [1, 2, 3];

      const similarity = provider.similarity(vector1, vector2);

      expect(similarity).toBe(0);
    });

    it('handles sparse vectors', () => {
      const vector1: EmbeddingVector = [1, 0, 0, 0, 0];
      const vector2: EmbeddingVector = [1, 0, 0, 0, 0];

      const similarity = provider.similarity(vector1, vector2);

      expect(similarity).toBeCloseTo(1.0, 5);
    });
  });

  describe('findSimilar()', () => {
    let provider: TestEmbeddingProvider;

    beforeEach(() => {
      provider = new TestEmbeddingProvider();
    });

    it('finds most similar vector', () => {
      const query: EmbeddingVector = [1, 0, 0];
      const candidates: EmbeddingVector[] = [
        [0, 1, 0], // orthogonal
        [0.9, 0.1, 0], // similar
        [-1, 0, 0], // opposite
      ];

      const similar = provider.findSimilar(query, candidates, 1);

      expect(similar).toHaveLength(1);
      expect(similar[0].index).toBe(1);
    });

    it('returns k most similar', () => {
      const query: EmbeddingVector = [1, 1, 0];
      const candidates: EmbeddingVector[] = [
        [1, 0, 0], // somewhat similar
        [0, 1, 0], // somewhat similar
        [1, 1, 0], // identical
        [-1, -1, 0], // opposite
      ];

      const similar = provider.findSimilar(query, candidates, 2);

      expect(similar).toHaveLength(2);
      expect(similar[0].index).toBe(2); // Identical vector
      expect(similar[0].similarity).toBeCloseTo(1.0, 5);
    });

    it('handles k larger than candidates', () => {
      const query: EmbeddingVector = [1, 0, 0];
      const candidates: EmbeddingVector[] = [
        [1, 0, 0],
        [0, 1, 0],
      ];

      const similar = provider.findSimilar(query, candidates, 10);

      expect(similar).toHaveLength(2);
    });

    it('sorts by similarity descending', () => {
      const query: EmbeddingVector = [1, 0, 0];
      const candidates: EmbeddingVector[] = [
        [0, 1, 0], // 0 similarity
        [1, 0, 0], // 1 similarity
        [0.5, 0.5, 0], // ~0.7 similarity
      ];

      const similar = provider.findSimilar(query, candidates, 3);

      expect(similar[0].similarity).toBeGreaterThan(similar[1].similarity);
      expect(similar[1].similarity).toBeGreaterThan(similar[2].similarity);
    });

    it('includes similarity scores', () => {
      const query: EmbeddingVector = [1, 0];
      const candidates: EmbeddingVector[] = [
        [1, 0],
        [0, 1],
      ];

      const similar = provider.findSimilar(query, candidates, 2);

      expect(similar[0]).toHaveProperty('index');
      expect(similar[0]).toHaveProperty('similarity');
      expect(similar[0].similarity).toBeCloseTo(1.0, 5);
      expect(similar[1].similarity).toBeCloseTo(0.0, 5);
    });

    it('handles empty candidates', () => {
      const query: EmbeddingVector = [1, 0, 0];
      const candidates: EmbeddingVector[] = [];

      const similar = provider.findSimilar(query, candidates, 5);

      expect(similar).toEqual([]);
    });
  });

  describe('Singleton Management', () => {
    describe('setEmbeddingProvider()', () => {
      it('sets the provider', () => {
        const provider = new TestEmbeddingProvider();
        setEmbeddingProvider(provider);

        expect(isEmbeddingProviderReady()).toBe(true);
      });

      it('ignores second provider', () => {
        const provider1 = new TestEmbeddingProvider();
        const provider2 = new TestEmbeddingProvider();

        setEmbeddingProvider(provider1);
        setEmbeddingProvider(provider2);

        expect(getEmbeddingProvider().getName()).toBe('test-provider');
      });
    });

    describe('getEmbeddingProvider()', () => {
      it('returns set provider', () => {
        const provider = new TestEmbeddingProvider();
        setEmbeddingProvider(provider);

        const retrieved = getEmbeddingProvider();

        expect(retrieved).toBe(provider);
      });

      it('throws when not initialized', () => {
        expect(() => getEmbeddingProvider()).toThrow(
          'Embedding provider not initialized'
        );
      });
    });

    describe('isEmbeddingProviderReady()', () => {
      it('returns false before initialization', () => {
        expect(isEmbeddingProviderReady()).toBe(false);
      });

      it('returns true after initialization', () => {
        setEmbeddingProvider(new TestEmbeddingProvider());
        expect(isEmbeddingProviderReady()).toBe(true);
      });
    });

    describe('resetEmbeddingProvider()', () => {
      it('clears the provider', () => {
        setEmbeddingProvider(new TestEmbeddingProvider());
        expect(isEmbeddingProviderReady()).toBe(true);

        resetEmbeddingProvider();

        expect(isEmbeddingProviderReady()).toBe(false);
      });

      it('allows setting new provider after reset', () => {
        const provider1 = new TestEmbeddingProvider(1024);
        const provider2 = new TestEmbeddingProvider(2048);

        setEmbeddingProvider(provider1);
        resetEmbeddingProvider();
        setEmbeddingProvider(provider2);

        expect(getEmbeddingProvider().getDimensions()).toBe(2048);
      });
    });
  });

  describe('Edge Cases', () => {
    let provider: TestEmbeddingProvider;

    beforeEach(() => {
      provider = new TestEmbeddingProvider();
    });

    it('handles high-dimensional vectors', () => {
      const dim = 3072;
      const vector1: EmbeddingVector = Array(dim)
        .fill(0)
        .map(() => Math.random());
      const vector2: EmbeddingVector = Array(dim)
        .fill(0)
        .map(() => Math.random());

      const similarity = provider.similarity(vector1, vector2);

      expect(similarity).toBeGreaterThanOrEqual(-1);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    it('handles very small values', () => {
      const vector1: EmbeddingVector = [1e-10, 1e-10];
      const vector2: EmbeddingVector = [1e-10, 1e-10];

      const similarity = provider.similarity(vector1, vector2);

      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('handles mixed positive and negative values', () => {
      const vector1: EmbeddingVector = [1, -1, 1, -1];
      const vector2: EmbeddingVector = [1, -1, 1, -1];

      const similarity = provider.similarity(vector1, vector2);

      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('handles single element vectors', () => {
      const vector1: EmbeddingVector = [5];
      const vector2: EmbeddingVector = [3];

      const similarity = provider.similarity(vector1, vector2);

      expect(similarity).toBeCloseTo(1.0, 5); // Same direction
    });
  });
});
