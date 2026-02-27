/**
 * @fileOverview Embedding Service Provider Interface
 *
 * Abstract interface for embedding providers.
 * Enables swapping providers (Google → OpenAI → local models) without changing code.
 * Makes Phase 7 embedding code testable and flexible.
 */

/**
 * Embedding vector (semantic representation of text)
 */
export type EmbeddingVector = number[];

/**
 * Embedding response
 */
export interface EmbeddingResult {
  text: string;
  vector: EmbeddingVector;
  model: string;
  tokensUsed?: number;
  timestamp: number;
}

/**
 * Embedding batch result
 */
export interface BatchEmbeddingResult {
  embeddings: EmbeddingResult[];
  totalTokensUsed?: number;
  batchSize: number;
  model: string;
}

/**
 * Abstract embedding provider interface
 * Implement this to support different embedding services
 */
export interface IEmbeddingProvider {
  /**
   * Get provider name
   */
  getName(): string;

  /**
   * Embed a single text string
   */
  embed(text: string): Promise<EmbeddingResult>;

  /**
   * Embed multiple texts (may be batched for efficiency)
   */
  embedBatch(texts: string[]): Promise<BatchEmbeddingResult>;

  /**
   * Get dimensionality of vectors from this provider
   * E.g., Google embeddings are 3072-dimensional
   */
  getDimensions(): number;

  /**
   * Calculate similarity between two vectors (cosine similarity)
   */
  similarity(vector1: EmbeddingVector, vector2: EmbeddingVector): number;

  /**
   * Find k most similar vectors from a collection
   */
  findSimilar(
    queryVector: EmbeddingVector,
    candidates: EmbeddingVector[],
    k: number
  ): Array<{ index: number; similarity: number }>;

  /**
   * Check if provider is healthy and accessible
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Base implementation of embedding provider
 * Provides utility methods for common operations
 */
export abstract class BaseEmbeddingProvider implements IEmbeddingProvider {
  protected dimensions: number = 3072; // Default for gemini-embedding-001

  abstract getName(): string;
  abstract embed(text: string): Promise<EmbeddingResult>;
  abstract embedBatch(texts: string[]): Promise<BatchEmbeddingResult>;
  abstract healthCheck(): Promise<boolean>;

  getDimensions(): number {
    return this.dimensions;
  }

  /**
   * Cosine similarity between two vectors
   * Range: -1 to 1 (1 = identical, 0 = orthogonal, -1 = opposite)
   */
  similarity(vector1: EmbeddingVector, vector2: EmbeddingVector): number {
    if (vector1.length !== vector2.length) {
      throw new Error('Vectors must have same dimensions');
    }

    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (let i = 0; i < vector1.length; i++) {
      const v1 = vector1[i] || 0;
      const v2 = vector2[i] || 0;
      dotProduct += v1 * v2;
      mag1 += v1 * v1;
      mag2 += v2 * v2;
    }

    mag1 = Math.sqrt(mag1);
    mag2 = Math.sqrt(mag2);

    if (mag1 === 0 || mag2 === 0) {
      return 0; // Avoid division by zero
    }

    return dotProduct / (mag1 * mag2);
  }

  /**
   * Find k most similar vectors
   */
  findSimilar(
    queryVector: EmbeddingVector,
    candidates: EmbeddingVector[],
    k: number
  ): Array<{ index: number; similarity: number }> {
    const similarities = candidates.map((candidate, index) => ({
      index,
      similarity: this.similarity(queryVector, candidate),
    }));

    // Sort by similarity (descending) and take top k
    return similarities.sort((a, b) => b.similarity - a.similarity).slice(0, k);
  }
}

/**
 * Singleton instance of the embedding provider
 * Initialize with your concrete provider implementation
 */
let embeddingProvider: IEmbeddingProvider | null = null;

/**
 * Set the global embedding provider
 */
export function setEmbeddingProvider(provider: IEmbeddingProvider): void {
  if (embeddingProvider === null) {
    embeddingProvider = provider;
    console.log(
      `[EmbeddingService] Initialized with provider: ${provider.getName()}`
    );
  } else {
    console.warn(
      `[EmbeddingService] Provider already set to ${embeddingProvider.getName()}, ignoring new provider`
    );
  }
}

/**
 * Get the current embedding provider
 * Throws if not initialized
 */
export function getEmbeddingProvider(): IEmbeddingProvider {
  if (embeddingProvider === null) {
    throw new Error(
      'Embedding provider not initialized. Call setEmbeddingProvider() first.'
    );
  }
  return embeddingProvider;
}

/**
 * Check if embedding provider is initialized
 */
export function isEmbeddingProviderReady(): boolean {
  return embeddingProvider !== null;
}

/**
 * Reset provider (for testing)
 */
export function resetEmbeddingProvider(): void {
  embeddingProvider = null;
}
