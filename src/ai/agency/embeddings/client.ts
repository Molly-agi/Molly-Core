/**
 * @fileOverview Multimodal Embedding Client — Molly's Semantic Engine
 *
 * Client for Gemini Embedding 2 — maps text, images, video, audio, and PDFs
 * into a unified vector space for semantic search and memory.
 */

import { ai } from '../../genkit-core';
import { MollyLogger, generateTraceId } from '../../logger';
import {
  EmbeddingInput,
  EmbeddingResult,
  BatchEmbeddingResult,
  EmbeddingContentType,
  StoredEmbedding,
  SearchResult,
  SearchOptions,
  EmbeddingAuditEntry,
  EmbeddingConfig,
  DEFAULT_CONFIG,
  cosineSimilarity,
  dotProduct,
  euclideanDistance,
} from './types';

// ============================================================
// AUDIT LOG
// ============================================================

const auditLog: EmbeddingAuditEntry[] = [];
const MAX_AUDIT_ENTRIES = 1000;

function logAudit(
  entry: Omit<EmbeddingAuditEntry, 'entryId' | 'timestamp'>
): void {
  const fullEntry: EmbeddingAuditEntry = {
    ...entry,
    entryId: generateTraceId(),
    timestamp: Date.now(),
  };

  auditLog.push(fullEntry);

  if (auditLog.length > MAX_AUDIT_ENTRIES) {
    auditLog.splice(0, auditLog.length - MAX_AUDIT_ENTRIES);
  }

  MollyLogger.debug(
    `Embedding audit: ${entry.operation} (${entry.itemCount} items)`,
    'embeddings',
    fullEntry
  );
}

/**
 * Get embedding audit log.
 */
export function getEmbeddingAuditLog(): EmbeddingAuditEntry[] {
  return [...auditLog];
}

// ============================================================
// IN-MEMORY VECTOR STORE
// ============================================================

const vectorStore: Map<string, StoredEmbedding> = new Map();

/**
 * Store an embedding.
 */
export function storeEmbedding(embedding: StoredEmbedding): void {
  vectorStore.set(embedding.id, embedding);
}

/**
 * Get a stored embedding by ID.
 */
export function getStoredEmbedding(id: string): StoredEmbedding | undefined {
  return vectorStore.get(id);
}

/**
 * Delete a stored embedding.
 */
export function deleteStoredEmbedding(id: string): boolean {
  return vectorStore.delete(id);
}

/**
 * Get all stored embeddings.
 */
export function getAllStoredEmbeddings(): StoredEmbedding[] {
  return Array.from(vectorStore.values());
}

/**
 * Clear all stored embeddings.
 */
export function clearVectorStore(): void {
  vectorStore.clear();
}

// ============================================================
// MULTIMODAL EMBEDDING CLIENT
// ============================================================

/**
 * Multimodal Embedding Client — Molly's semantic engine.
 */
export class MultimodalEmbeddingClient {
  private config: EmbeddingConfig;

  constructor(config?: Partial<EmbeddingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Embed a single piece of content.
   */
  async embed(input: EmbeddingInput): Promise<EmbeddingResult> {
    const startTime = performance.now();
    const traceId = generateTraceId();
    const contentType = this.getContentType(input);

    MollyLogger.debug(`Embedding: ${contentType} content`, 'embeddings', {
      contentType,
      traceId,
    });

    try {
      // Convert to embeddable format
      const content = this.normalizeInput(input);

      // Call Genkit embed
      const result = await ai.embed({
        embedder: `googleai/${this.config.model}`,
        content: content,
      });

      const processingTimeMs = performance.now() - startTime;

      const embeddingResult: EmbeddingResult = {
        input,
        contentType,
        embedding: {
          values: result,
          dimensions: result.length,
        },
        processingTimeMs,
      };

      logAudit({
        operation: 'embed',
        contentTypes: [contentType],
        itemCount: 1,
        processingTimeMs,
        success: true,
      });

      return embeddingResult;
    } catch (error) {
      const processingTimeMs = performance.now() - startTime;

      logAudit({
        operation: 'embed',
        contentTypes: [contentType],
        itemCount: 1,
        processingTimeMs,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Embed multiple pieces of content in batch.
   */
  async batchEmbed(inputs: EmbeddingInput[]): Promise<BatchEmbeddingResult> {
    const startTime = performance.now();
    const traceId = generateTraceId();

    MollyLogger.info(`Batch embedding: ${inputs.length} items`, 'embeddings', {
      count: inputs.length,
      traceId,
    });

    const contentTypes = new Set<EmbeddingContentType>();
    const embeddings: EmbeddingResult[] = [];
    const errors: Error[] = [];

    // Process in batches
    for (let i = 0; i < inputs.length; i += this.config.maxBatchSize) {
      const batch = inputs.slice(i, i + this.config.maxBatchSize);

      // Process batch items in parallel
      const results = await Promise.allSettled(
        batch.map((input) => this.embed(input))
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          embeddings.push(result.value);
          contentTypes.add(result.value.contentType);
        } else {
          errors.push(result.reason);
        }
      }
    }

    const totalProcessingTimeMs = performance.now() - startTime;

    logAudit({
      operation: 'batch_embed',
      contentTypes: Array.from(contentTypes),
      itemCount: inputs.length,
      processingTimeMs: totalProcessingTimeMs,
      success: errors.length === 0,
      error: errors.length > 0 ? `${errors.length} items failed` : undefined,
    });

    if (errors.length > 0) {
      MollyLogger.warn(
        `Batch embedding: ${errors.length}/${inputs.length} items failed`,
        'embeddings',
        { traceId }
      );
    }

    return {
      embeddings,
      totalItems: inputs.length,
      totalProcessingTimeMs,
    };
  }

  /**
   * Embed content and store it for later search.
   */
  async embedAndStore(
    input: EmbeddingInput,
    id?: string,
    metadata?: Record<string, unknown>
  ): Promise<StoredEmbedding> {
    const result = await this.embed(input);
    const actualId = id || generateTraceId();

    const stored: StoredEmbedding = {
      id: actualId,
      embedding: result.embedding,
      content: input,
      contentType: result.contentType,
      metadata,
      createdAt: Date.now(),
    };

    storeEmbedding(stored);
    return stored;
  }

  /**
   * Search for similar items in the vector store.
   */
  async search(
    query: EmbeddingInput,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const startTime = performance.now();
    const {
      topK = 10,
      minScore = 0,
      metric = 'cosine',
      contentTypes,
      metadataFilter,
    } = options;

    // Embed the query
    const queryResult = await this.embed(query);
    const queryVector = queryResult.embedding.values;

    // Get all stored embeddings
    let candidates = getAllStoredEmbeddings();

    // Filter by content type
    if (contentTypes && contentTypes.length > 0) {
      candidates = candidates.filter((c) =>
        contentTypes.includes(c.contentType)
      );
    }

    // Filter by metadata
    if (metadataFilter) {
      candidates = candidates.filter((c) => {
        if (!c.metadata) return false;
        for (const [key, value] of Object.entries(metadataFilter)) {
          if (c.metadata[key] !== value) return false;
        }
        return true;
      });
    }

    // Calculate similarities
    const scored: Array<{ item: StoredEmbedding; score: number }> = [];

    for (const candidate of candidates) {
      let score: number;

      switch (metric) {
        case 'cosine':
          score = cosineSimilarity(queryVector, candidate.embedding.values);
          break;
        case 'dot_product':
          score = dotProduct(queryVector, candidate.embedding.values);
          break;
        case 'euclidean':
          // For Euclidean, lower is better, so invert
          score =
            1 /
            (1 + euclideanDistance(queryVector, candidate.embedding.values));
          break;
      }

      if (score >= minScore) {
        scored.push({ item: candidate, score });
      }
    }

    // Sort by score (descending)
    scored.sort((a, b) => b.score - a.score);

    // Take top K
    const results: SearchResult[] = scored.slice(0, topK).map((s, i) => ({
      item: s.item,
      score: s.score,
      rank: i + 1,
    }));

    const processingTimeMs = performance.now() - startTime;

    logAudit({
      operation: 'search',
      contentTypes: [queryResult.contentType],
      itemCount: results.length,
      processingTimeMs,
      success: true,
    });

    return results;
  }

  /**
   * Compare similarity between two pieces of content.
   */
  async compare(
    item1: EmbeddingInput,
    item2: EmbeddingInput,
    metric: 'cosine' | 'dot_product' | 'euclidean' = 'cosine'
  ): Promise<number> {
    const [result1, result2] = await Promise.all([
      this.embed(item1),
      this.embed(item2),
    ]);

    switch (metric) {
      case 'cosine':
        return cosineSimilarity(
          result1.embedding.values,
          result2.embedding.values
        );
      case 'dot_product':
        return dotProduct(result1.embedding.values, result2.embedding.values);
      case 'euclidean':
        return euclideanDistance(
          result1.embedding.values,
          result2.embedding.values
        );
    }
  }

  // ── Private Helpers ──

  private getContentType(input: EmbeddingInput): EmbeddingContentType {
    if (typeof input === 'string') {
      return 'text';
    }
    return input.type;
  }

  private normalizeInput(input: EmbeddingInput): string | object {
    if (typeof input === 'string') {
      return input;
    }

    // For multimodal content, return as structured object
    switch (input.type) {
      case 'text':
        return input.text;
      case 'image':
      case 'video':
      case 'audio':
      case 'pdf':
        // Return as inline data or URI
        if (input.data) {
          return {
            inlineData: {
              mimeType:
                'mimeType' in input
                  ? input.mimeType
                  : 'application/octet-stream',
              data: input.data,
            },
          };
        }
        if ('uri' in input && input.uri) {
          return { fileUri: input.uri };
        }
        throw new Error(`${input.type} content requires either data or uri`);
    }
  }
}

// ============================================================
// SINGLETON INSTANCE
// ============================================================

let _clientInstance: MultimodalEmbeddingClient | null = null;

/**
 * Get the global embedding client.
 */
export function getEmbeddingClient(): MultimodalEmbeddingClient {
  if (!_clientInstance) {
    _clientInstance = new MultimodalEmbeddingClient();
  }
  return _clientInstance;
}

/**
 * Reset the client (for testing).
 */
export function resetEmbeddingClient(): void {
  _clientInstance = null;
  clearVectorStore();
  auditLog.length = 0;
}
