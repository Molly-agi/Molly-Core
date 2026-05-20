/**
 * @fileOverview Gemini Embedding 2 Provider — Multimodal Semantic Memory
 *
 * Adapter that wraps the Gemini Embedding 2 client to implement the
 * IEmbeddingProvider interface, enabling multimodal semantic recall.
 *
 * New capabilities over the original embedding provider:
 * - Text embeddings (improved model)
 * - Image embeddings (JPEG, PNG, GIF, WebP)
 * - Audio embeddings (MP3, WAV, OGG)
 * - Video embeddings (MP4, WebM)
 * - PDF embeddings (documents)
 *
 * All modalities map to the same unified vector space, enabling
 * cross-modal searches like "find images similar to this text".
 */

import {
  BaseEmbeddingProvider,
  type EmbeddingResult,
  type BatchEmbeddingResult,
} from './embedding-provider';
import type { EmbeddingInput as GeminiEmbeddingInput } from '@/ai/agency/embeddings/types';
import { MollyLogger, generateTraceId } from '../logger';

/**
 * Multimodal input types
 */
export type MultimodalInput =
  | string // Plain text
  | { type: 'text'; content: string }
  | { type: 'image'; uri?: string; data?: string }
  | { type: 'audio'; uri?: string; data?: string }
  | { type: 'video'; uri?: string; data?: string }
  | { type: 'pdf'; uri?: string; data?: string };

/**
 * Multimodal embedding result
 */
export interface MultimodalEmbeddingResult extends EmbeddingResult {
  inputType: 'text' | 'image' | 'audio' | 'video' | 'pdf';
  processingTimeMs: number;
}

/**
 * Gemini Embedding 2 Provider
 *
 * Uses the new Gemini Embedding 2 model for unified multimodal embeddings.
 * Implements IEmbeddingProvider for compatibility with semantic recall.
 */
export class Gemini2EmbeddingProvider extends BaseEmbeddingProvider {
  private client: Awaited<
    ReturnType<typeof import('@/ai/agency/embeddings').getEmbeddingClient>
  > | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    super();
    // Gemini Embedding 2 uses 3072 dimensions
    this.dimensions = 3072;
  }

  getName(): string {
    return 'Gemini Embedding 2 (Multimodal)';
  }

  /**
   * Lazy initialization of the embedding client
   */
  private async ensureInitialized(): Promise<void> {
    if (this.client) return;

    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      const traceId = generateTraceId();
      MollyLogger.info(
        'Initializing Gemini Embedding 2 provider',
        'gemini2-embedding',
        {},
        traceId
      );

      try {
        const { getEmbeddingClient } = await import('@/ai/agency/embeddings');
        this.client = getEmbeddingClient();

        MollyLogger.info(
          'Gemini Embedding 2 provider initialized',
          'gemini2-embedding',
          {},
          traceId
        );
      } catch {
        MollyLogger.error(
          'Failed to initialize Gemini Embedding 2 provider',
          'gemini2-embedding',
          {},
          error,
          traceId
        );
        throw error;
      }
    })();

    await this.initPromise;
  }

  /**
   * Embed a single text string (IEmbeddingProvider interface)
   */
  async embed(text: string): Promise<EmbeddingResult> {
    await this.ensureInitialized();

    const traceId = generateTraceId();
    const _startTime = Date.now();

    try {
      const result = await this.client!.embed(text);

      return {
        text,
        vector: result.embedding.values,
        model: 'gemini-embedding-2',
        timestamp: Date.now(),
      };
    } catch {
      MollyLogger.error(
        'Gemini Embedding 2 failed',
        'gemini2-embedding',
        { textLength: text.length },
        error,
        traceId
      );
      throw error;
    }
  }

  /**
   * Embed multimodal content (text, image, audio, video, PDF)
   */
  async embedMultimodal(
    input: MultimodalInput
  ): Promise<MultimodalEmbeddingResult> {
    await this.ensureInitialized();

    const traceId = generateTraceId();
    const _startTime = Date.now();

    let inputType: 'text' | 'image' | 'audio' | 'video' | 'pdf';
    let clientInput: string | { type: string; uri?: string; data?: string };

    // Normalize input
    if (typeof input === 'string') {
      inputType = 'text';
      clientInput = input;
    } else {
      inputType = input.type;
      if (input.type === 'text') {
        clientInput = input.content;
      } else {
        clientInput = {
          type: input.type,
          uri: input.uri,
          data: input.data,
        };
      }
    }

    try {
      MollyLogger.debug(
        `Embedding ${inputType} content`,
        'gemini2-embedding',
        { inputType },
        traceId
      );

      const result = await this.client!.embed(
        clientInput as GeminiEmbeddingInput
      );
      const processingTimeMs = Date.now() - startTime;

      return {
        text: typeof input === 'string' ? input : `[${inputType}]`,
        vector: result.embedding.values,
        model: 'gemini-embedding-2',
        timestamp: Date.now(),
        inputType,
        processingTimeMs,
      };
    } catch {
      MollyLogger.error(
        `Gemini Embedding 2 failed for ${inputType}`,
        'gemini2-embedding',
        { inputType },
        error,
        traceId
      );
      throw error;
    }
  }

  /**
   * Embed multiple texts (IEmbeddingProvider interface)
   */
  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    await this.ensureInitialized();

    const traceId = generateTraceId();
    const _startTime = Date.now();

    MollyLogger.debug(
      `Batch embedding ${texts.length} texts`,
      'gemini2-embedding',
      { count: texts.length },
      traceId
    );

    const embeddings: EmbeddingResult[] = [];

    // Process in sequence (could be parallelized with rate limiting)
    for (const text of texts) {
      try {
        const result = await this.embed(text);
        embeddings.push(result);
      } catch {
        MollyLogger.warn(
          'Batch embedding item failed, skipping',
          'gemini2-embedding',
          { textPreview: text.substring(0, 50) },
          traceId
        );
        // Continue with next item
      }
    }

    return {
      embeddings,
      batchSize: texts.length,
      model: 'gemini-embedding-2',
    };
  }

  /**
   * Health check (IEmbeddingProvider interface)
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.ensureInitialized();

      // Do a quick test embedding
      const result = await this.embed('health check');
      return result.vector.length === this.dimensions;
    } catch {
      return false;
    }
  }

  /**
   * Search across stored multimodal embeddings
   */
  async searchMultimodal(
    query: string,
    options: {
      topK?: number;
      minScore?: number;
      contentTypes?: ('text' | 'image' | 'audio' | 'video' | 'pdf')[];
    } = {}
  ): Promise<
    Array<{
      id: string;
      score: number;
      metadata: Record<string, unknown>;
    }>
  > {
    await this.ensureInitialized();

    const results = await this.client!.search(query, {
      topK: options.topK || 5,
      minScore: options.minScore,
      contentTypes: options.contentTypes,
    });

    return results.map((r) => ({
      id: r.item.id,
      score: r.score,
      metadata: r.item.metadata || {},
    }));
  }
}

/**
 * Create a Gemini Embedding 2 provider instance
 */
export async function createGemini2EmbeddingProvider(): Promise<Gemini2EmbeddingProvider> {
  const provider = new Gemini2EmbeddingProvider();
  // Trigger initialization
  await provider.healthCheck();
  return provider;
}

/**
 * Helper: Detect content type from URL or data prefix
 */
export function detectContentType(
  input: string
): 'text' | 'image' | 'audio' | 'video' | 'pdf' {
  const lower = input.toLowerCase();

  // Check URL extensions
  if (
    lower.includes('.jpg') ||
    lower.includes('.jpeg') ||
    lower.includes('.png') ||
    lower.includes('.gif') ||
    lower.includes('.webp')
  ) {
    return 'image';
  }

  if (
    lower.includes('.mp3') ||
    lower.includes('.wav') ||
    lower.includes('.ogg')
  ) {
    return 'audio';
  }

  if (lower.includes('.mp4') || lower.includes('.webm')) {
    return 'video';
  }

  if (lower.includes('.pdf')) {
    return 'pdf';
  }

  // Check base64 prefixes
  if (lower.startsWith('data:image/')) return 'image';
  if (lower.startsWith('data:audio/')) return 'audio';
  if (lower.startsWith('data:video/')) return 'video';
  if (lower.startsWith('data:application/pdf')) return 'pdf';

  return 'text';
}
