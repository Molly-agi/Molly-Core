/**
 * @fileOverview Multimodal Embedding Types — Molly's Semantic Memory
 *
 * Type definitions for Gemini Embedding 2 — the first multimodal embedding model.
 * Supports text, images, video, audio, and PDFs in a unified embedding space.
 *
 * Based on Gemini Embedding 2 API (April 2026)
 */

// ============================================================
// MODALITIES — What can be embedded
// ============================================================

/**
 * Supported modalities for embedding.
 */
export type EmbeddingModality = 'text' | 'image' | 'audio' | 'video' | 'pdf';

/**
 * MIME types supported for each modality.
 */
export const SUPPORTED_MIME_TYPES: Record<EmbeddingModality, string[]> = {
  text: ['text/plain'],
  image: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/mp3'],
  video: ['video/mp4', 'video/mov', 'video/webm'],
  pdf: ['application/pdf'],
};

/**
 * Limits per modality.
 */
export const MODALITY_LIMITS: Record<EmbeddingModality, string> = {
  text: '8,192 tokens',
  image: 'Max 6 images per request',
  audio: 'Max 80 seconds',
  video: 'Max 120 seconds (32 frames)',
  pdf: 'Max 6 pages',
};

// ============================================================
// INPUT — Content to embed
// ============================================================

/**
 * Text content for embedding.
 */
export interface TextContent {
  type: 'text';
  text: string;
  /** Optional task prefix for better embeddings */
  taskPrefix?: string;
}

/**
 * Binary content (image, audio, video, pdf).
 */
export interface BinaryContent {
  type: 'image' | 'audio' | 'video' | 'pdf';
  /** Binary data as base64 string or Buffer */
  data: string | Buffer;
  /** MIME type */
  mimeType: string;
}

/**
 * URL-based content.
 */
export interface UrlContent {
  type: 'url';
  url: string;
  /** Inferred or explicit MIME type */
  mimeType?: string;
}

/**
 * Union of all content types.
 */
export type EmbeddingContent = TextContent | BinaryContent | UrlContent;

/**
 * A single embedding request.
 */
export interface EmbedRequest {
  /** Content to embed */
  content: EmbeddingContent | EmbeddingContent[];
  /** Output dimensionality (128-3072, default 3072) */
  outputDimensionality?: number;
}

/**
 * Batch embedding request.
 */
export interface BatchEmbedRequest {
  /** Multiple contents to embed */
  requests: EmbedRequest[];
}

// ============================================================
// TASK PREFIXES — For better retrieval
// ============================================================

/**
 * Task types for embedding (used as prefixes).
 */
export type EmbeddingTaskType =
  | 'search'
  | 'question_answering'
  | 'fact_checking'
  | 'code_retrieval'
  | 'classification'
  | 'clustering'
  | 'similarity';

/**
 * Task prefix formats for queries and documents.
 */
export const TASK_PREFIXES: Record<
  EmbeddingTaskType,
  { query: string; document: string }
> = {
  search: {
    query: 'task: search result | query:',
    document: 'title: {title} | text:',
  },
  question_answering: {
    query: 'task: question answering | query:',
    document: 'title: {title} | text:',
  },
  fact_checking: {
    query: 'task: fact checking | query:',
    document: 'title: {title} | text:',
  },
  code_retrieval: {
    query: 'task: code retrieval | query:',
    document: 'title: {title} | text:',
  },
  classification: {
    query: 'task: classification | query:',
    document: 'task: classification | query:',
  },
  clustering: {
    query: 'task: clustering | query:',
    document: 'task: clustering | query:',
  },
  similarity: {
    query: 'task: sentence similarity | query:',
    document: 'task: sentence similarity | query:',
  },
};

/**
 * Format text with task prefix.
 */
export function formatWithTaskPrefix(
  text: string,
  taskType: EmbeddingTaskType,
  isQuery: boolean,
  title?: string
): string {
  const prefix = isQuery
    ? TASK_PREFIXES[taskType].query
    : TASK_PREFIXES[taskType].document.replace('{title}', title || '');

  return `${prefix} ${text}`;
}

// ============================================================
// OUTPUT — Embedding vectors
// ============================================================

/**
 * A single embedding result.
 */
export interface Embedding {
  /** The embedding vector */
  values: number[];
  /** Dimensionality of the embedding */
  dimensions: number;
  /** Modality of the embedded content */
  modality: EmbeddingModality | 'multimodal';
  /** Whether the embedding is normalized */
  normalized: boolean;
}

/**
 * Result of an embedding request.
 */
export interface EmbedResult {
  /** Whether embedding succeeded */
  success: boolean;
  /** The embedding(s) */
  embeddings: Embedding[];
  /** Error if failed */
  error?: string;
  /** Processing time in ms */
  processingTimeMs: number;
}

/**
 * Result of a batch embedding request.
 */
export interface BatchEmbedResult {
  /** Whether all embeddings succeeded */
  success: boolean;
  /** Results for each request */
  results: EmbedResult[];
  /** Overall error if completely failed */
  error?: string;
  /** Total processing time in ms */
  processingTimeMs: number;
}

// ============================================================
// SIMILARITY — Vector operations
// ============================================================

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions must match: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Compute dot product similarity (for normalized vectors).
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions must match: ${a.length} vs ${b.length}`);
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Compute Euclidean distance between two vectors.
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions must match: ${a.length} vs ${b.length}`);
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Normalize a vector to unit length.
 */
export function normalizeVector(v: number[]): number[] {
  let norm = 0;
  for (const val of v) {
    norm += val * val;
  }
  norm = Math.sqrt(norm);

  if (norm === 0) return v;

  return v.map((val) => val / norm);
}

// ============================================================
// CONFIG — Runtime configuration
// ============================================================

/**
 * Multimodal embedding configuration.
 */
export interface MultimodalEmbeddingConfig {
  /** Model ID */
  model: string;
  /** Default output dimensionality */
  defaultDimensions: number;
  /** Whether to auto-normalize reduced-dimension embeddings */
  autoNormalize: boolean;
}

/**
 * Default configuration.
 */
export const DEFAULT_CONFIG: MultimodalEmbeddingConfig = {
  model: 'gemini-embedding-2-preview',
  defaultDimensions: 3072,
  autoNormalize: true,
};

// ============================================================
// AUDIT — Observability
// ============================================================

/**
 * Audit log entry for embedding activity.
 */
export interface EmbeddingAuditEntry {
  /** Unique entry ID */
  entryId: string;
  /** Modality embedded */
  modality: EmbeddingModality | 'multimodal' | 'batch';
  /** Number of items embedded */
  itemCount: number;
  /** Output dimensions */
  dimensions: number;
  /** Processing time in ms */
  processingTimeMs: number;
  /** Error if failed */
  error?: string;
  /** Timestamp */
  timestamp: number;
}
