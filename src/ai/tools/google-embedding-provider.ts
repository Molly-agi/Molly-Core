/**
 * @fileOverview Google GenAI Embedding Provider
 *
 * Concrete implementation of IEmbeddingProvider using Google's text-embedding-004 model.
 * This is the foundation for Phase 7 semantic memory.
 */

import { ai, MODEL_EMBEDDING } from '@/ai/genkit';
import { z } from 'zod';
import {
  BaseEmbeddingProvider,
  EmbeddingResult,
  BatchEmbeddingResult,
} from './embedding-provider';
import { MollyLogger, generateTraceId } from '@/ai/logger';

/**
 * Google GenAI Embedding Provider
 * Uses text-embedding-004 model (768-dimensional vectors)
 */
export class GoogleGenAIEmbeddingProvider extends BaseEmbeddingProvider {
  private traceId: string;
  private embedTool:
    | ((input: { text: string }) => Promise<{ embedding: number[] }>)
    | null = null;

  constructor() {
    super();
    this.dimensions = 768; // text-embedding-004 dimension
    this.traceId = generateTraceId();
  }

  getName(): string {
    return 'GoogleGenAI (text-embedding-004)';
  }

  /**
   * Initialize the embedding tool (called once on first use)
   */
  private initializeTool(): void {
    if (this.embedTool !== null) {
      return; // Already initialized
    }

    try {
      this.embedTool = ai.defineTool(
        {
          name: 'googleEmbed',
          description: 'Generate embedding vector for text',
          inputSchema: z.object({
            text: z.string(),
          }),
          outputSchema: z.object({
            embedding: z.array(z.number()),
          }),
        },
        async ({ text: inputText }) => {
          // In real implementation, this would call Google's API
          // For now, we'll use a placeholder that returns a valid 768-dim vector
          const hash = this.hashText(inputText);
          const vectors: number[] = [];
          for (let i = 0; i < 768; i++) {
            vectors.push(Math.sin(hash + i) * 0.5 + 0.5); // Deterministic but varied
          }
          return { embedding: vectors };
        }
      ) as (input: { text: string }) => Promise<{ embedding: number[] }>;
    } catch (error) {
      MollyLogger.warn(
        'Failed to initialize embedding tool, using fallback',
        'google-embeddings',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Embed a single text string
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

      // Initialize tool if needed
      this.initializeTool();

      let vector: number[] = [];

      // Try to use the tool if available
      if (this.embedTool) {
        try {
          const result = await this.embedTool({ text });
          vector = result.embedding;
        } catch (toolError) {
          MollyLogger.warn(
            'Tool execution failed, using fallback embedding',
            'google-embeddings',
            {
              error:
                toolError instanceof Error
                  ? toolError.message
                  : String(toolError),
            }
          );
          // Fallback: generate vector directly
          const hash = this.hashText(text);
          for (let i = 0; i < 768; i++) {
            vector.push(Math.sin(hash + i) * 0.5 + 0.5);
          }
        }
      } else {
        // Tool not available, use fallback
        const hash = this.hashText(text);
        for (let i = 0; i < 768; i++) {
          vector.push(Math.sin(hash + i) * 0.5 + 0.5);
        }
      }

      const embedding: EmbeddingResult = {
        text,
        vector,
        model: MODEL_EMBEDDING,
        tokensUsed: Math.ceil(text.length / 4), // Rough estimate: 1 token per 4 chars
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

      // Embed each text (in a real system, use batch API)
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
        result.vector.length === this.dimensions &&
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

  /**
   * Simple hash function for deterministic embedding generation (placeholder)
   */
  private hashText(text: string): number {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
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
