/**
 * @fileOverview Google GenAI Embedding Provider
 *
 * Uses Genkit's native ai.embed() to call Google's gemini-embedding-001 model.
 * This provides REAL semantic similarity — not placeholder hashes.
 */

import { ai, MODEL_EMBEDDING } from '@/ai/genkit';
import {
  BaseEmbeddingProvider,
  EmbeddingResult,
  BatchEmbeddingResult,
} from './embedding-provider';
import { MollyLogger, generateTraceId } from '@/ai/logger';

/**
 * Google GenAI Embedding Provider
 * Uses gemini-embedding-001 model (3072-dimensional vectors) via Genkit's ai.embed()
 */
export class GoogleGenAIEmbeddingProvider extends BaseEmbeddingProvider {
  constructor() {
    super();
    this.dimensions = 3072; // gemini-embedding-001 dimension
  }

  getName(): string {
    return 'GoogleGenAI (gemini-embedding-001)';
  }

  /**
   * Embed a single text string using Google's real embedding API
   */
  async embed(text: string): Promise<EmbeddingResult> {
    const traceId = generateTraceId();

    try {
      MollyLogger.debug(
        `Embedding text (${text.length} chars)`,
        'google-embeddings',
        { textLen: text.length },
        traceId
      );

      // Use Genkit's native embed() — this calls the actual Google API
      // 10s timeout prevents socket hangs from freezing the whole request
      const embedPromise = ai.embed({
        embedder: MODEL_EMBEDDING,
        content: text,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Embedding API call timed out after 10s')),
          10_000
        )
      );
      const result = await Promise.race([embedPromise, timeoutPromise]);

      // ai.embed returns an array of Embedding objects; take the first
      const vector = result[0]?.embedding ?? [];

      if (vector.length === 0) {
        throw new Error('Empty embedding vector returned from API');
      }

      const embedding: EmbeddingResult = {
        text,
        vector,
        model: MODEL_EMBEDDING,
        tokensUsed: Math.ceil(text.length / 4),
        timestamp: Date.now(),
      };

      MollyLogger.debug(
        'Text embedded successfully',
        'google-embeddings',
        {
          vectorDim: embedding.vector.length,
          tokensUsed: embedding.tokensUsed,
        },
        traceId
      );

      return embedding;
    } catch (error) {
      MollyLogger.error(
        'Failed to embed text',
        'google-embeddings',
        { textLen: text.length },
        error,
        traceId
      );
      throw error;
    }
  }

  /**
   * Embed multiple texts in a batch
   */
  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    const traceId = generateTraceId();

    try {
      MollyLogger.info(
        `Batch embedding ${texts.length} texts`,
        'google-embeddings',
        { batchSize: texts.length },
        traceId
      );

      const embeddings: EmbeddingResult[] = [];
      let totalTokens = 0;

      for (const text of texts) {
        const result = await this.embed(text);
        embeddings.push(result);
        totalTokens += result.tokensUsed || 0;
      }

      const batchResult: BatchEmbeddingResult = {
        embeddings,
        totalTokensUsed: totalTokens,
        batchSize: texts.length,
        model: MODEL_EMBEDDING,
      };

      MollyLogger.info(
        `Batch embedding complete: ${embeddings.length} vectors`,
        'google-embeddings',
        {
          batchSize: texts.length,
          totalTokens,
          avgDim: this.dimensions,
        },
        traceId
      );

      return batchResult;
    } catch (error) {
      MollyLogger.error(
        'Failed to batch embed texts',
        'google-embeddings',
        { batchSize: texts.length },
        error,
        traceId
      );
      throw error;
    }
  }

  /**
   * Health check: verify provider is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      const testText = 'Molly is alive and well.';
      const result = await this.embed(testText);
      const isValid =
        result.vector &&
        result.vector.length > 0 &&
        result.model === MODEL_EMBEDDING;

      if (!isValid) {
        MollyLogger.warn(
          'Health check failed: invalid response shape',
          'google-embeddings'
        );
        return false;
      }

      MollyLogger.info(
        'Embedding provider health check passed',
        'google-embeddings'
      );
      return true;
    } catch (error) {
      MollyLogger.error(
        'Embedding provider health check failed',
        'google-embeddings',
        {},
        error
      );
      return false;
    }
  }
}

/**
 * Factory function to create and initialize Google embedding provider
 */
export async function createGoogleEmbeddingProvider(): Promise<GoogleGenAIEmbeddingProvider> {
  const provider = new GoogleGenAIEmbeddingProvider();

  // Verify provider is healthy before returning
  const isHealthy = await provider.healthCheck();
  if (!isHealthy) {
    MollyLogger.warn(
      'Google embedding provider initialized but health check failed',
      'google-embeddings'
    );
  }

  return provider;
}
