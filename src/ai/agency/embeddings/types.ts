/**
 * @fileOverview Multimodal Embedding Types — Molly's Semantic Memory
 *
 * Type definitions for Gemini Embedding 2 — the first multimodal embedder.
 * Maps text, images, video, audio, and PDFs into a unified vector space.
 *
 * Based on Gemini Embedding 2 API (April 2026)
 */

// ============================================================
// INPUT TYPES — What can be embedded
// ============================================================

/**
 * Supported content types for multimodal embedding.
 */
export type EmbeddingContentType = 'text' | 'image' | 'video' | 'audio' | 'pdf';

/**
 * Text content for embedding.
 */
export interface TextContent {
  type: 'text';
  text: string;
}

/**
 * Image content for embedding.
 */
export interface ImageContent {
  type: 'image';
  /** Base64-encoded image data */
  data?: string;
  /** Image URL */
  uri?: string;
  /** MIME type (image/png, image/jpeg, etc.) */
  mimeType?: string;
}

/**
 * Video content for embedding.
 */
export interface VideoContent {
  type: 'video';
  /** Base64-encoded video data */
  data?: string;
  /** Video URL */
  uri?: string;
  /** MIME type (video/mp4, etc.) */
  mimeType?: string;
}

/**
 * Audio content for embedding.
 */
export interface AudioContent {
  type: 'audio';
  /** Base64-encoded audio data */
  data?: string;
  /** Audio URL */
  uri?: string;
  /** MIME type (audio/wav, audio/mp3, etc.) */
  mimeType?: string;
}

/**
 * PDF content for embedding.
 */
export interface PDFContent {
  type: 'pdf';
  /** Base64-encoded PDF data */
  data?: string;
  /** PDF URL */
  uri?: string;
}

/**
 * Union of all embeddable content types.
 */
export type EmbeddableContent =
  | TextContent
  | ImageContent
  | VideoContent
  | AudioContent
  | PDFContent;

/**
 * Simple string input (converted to TextContent internally).
 */
export type EmbeddingInput = string | EmbeddableContent;

// ============================================================
// OUTPUT — Embedding vectors
// ============================================================

/**
 * A single embedding vector.
 */
export interface EmbeddingVector {
  /** The embedding vector values */
  values: number[];
  /** Dimensionality of the embedding */
  dimensions: number;
}

/**
 * Result of embedding a single piece of content.
 */
export interface EmbeddingResult {
  /** The input that was embedded */
  input: EmbeddingInput;
  /** Content type that was embedded */
  contentType: EmbeddingContentType;
  /** The embedding vector */
  embedding: EmbeddingVector;
  /** Token count (for text) */
  tokenCount?: number;
  /** Processing time in ms */
  processingTimeMs: number;
}

/**
 * Result of batch embedding multiple items.
 */
export interface BatchEmbeddingResult {
  /** Individual embedding results */
  embeddings: EmbeddingResult[];
  /** Total items embedded */
  totalItems: number;
  /** Total processing time in ms */
  totalProcessingTimeMs: number;
}

// ============================================================
// SIMILARITY — Comparing embeddings
// ============================================================

/**
 * Similarity metric types.
 */
export type SimilarityMetric = 'cosine' | 'dot_product' | 'euclidean';

/**
 * Result of similarity comparison.
 */
export interface SimilarityResult {
  /** Similarity score (interpretation depends on metric) */
  score: number;
  /** Metric used */
  metric: SimilarityMetric;
  /** First item */
  item1: EmbeddingInput;
  /** Second item */
  item2: EmbeddingInput;
}

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Compute dot product between two vectors.
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result += a[i] * b[i];
  }
  return result;
}

/**
 * Compute Euclidean distance between two vectors.
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let sumSquares = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sumSquares += diff * diff;
  }
  return Math.sqrt(sumSquares);
}

// ============================================================
// SEARCH — Finding similar items
// ============================================================

/**
 * A stored embedding with metadata.
 */
export interface StoredEmbedding {
  /** Unique ID */
  id: string;
  /** The embedding vector */
  embedding: EmbeddingVector;
  /** Original content (for reference) */
  content: EmbeddingInput;
  /** Content type */
  contentType: EmbeddingContentType;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  /** When embedded */
  createdAt: number;
}

/**
 * Search result with similarity score.
 */
export interface SearchResult {
  /** The stored embedding */
  item: StoredEmbedding;
  /** Similarity score */
  score: number;
  /** Rank (1-indexed) */
  rank: number;
}

/**
 * Search options.
 */
export interface SearchOptions {
  /** Number of results to return */
  topK?: number;
  /** Minimum similarity threshold */
  minScore?: number;
  /** Similarity metric to use */
  metric?: SimilarityMetric;
  /** Filter by content type */
  contentTypes?: EmbeddingContentType[];
  /** Custom metadata filter */
  metadataFilter?: Record<string, unknown>;
}

// ============================================================
// CONFIG — Runtime configuration
// ============================================================

/**
 * Embedding configuration.
 */
export interface EmbeddingConfig {
  /** Model ID */
  model: string;
  /** Default dimensions (if model supports variable) */
  defaultDimensions: number;
  /** Max batch size */
  maxBatchSize: number;
  /** Timeout per embedding in ms */
  timeoutMs: number;
}

/**
 * Default configuration.
 */
export const DEFAULT_CONFIG: EmbeddingConfig = {
  model: 'gemini-embedding-2-preview',
  defaultDimensions: 768, // Standard embedding size
  maxBatchSize: 100,
  timeoutMs: 30_000,
};

// ============================================================
// AUDIT LOG — Observability
// ============================================================

/**
 * Audit log entry for embedding operations.
 */
export interface EmbeddingAuditEntry {
  /** Unique entry ID */
  entryId: string;
  /** Operation type */
  operation: 'embed' | 'batch_embed' | 'search';
  /** Content type(s) embedded */
  contentTypes: EmbeddingContentType[];
  /** Number of items */
  itemCount: number;
  /** Processing time in ms */
  processingTimeMs: number;
  /** Success or failure */
  success: boolean;
  /** Error if failed */
  error?: string;
  /** Timestamp */
  timestamp: number;
}
