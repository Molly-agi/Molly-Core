/**
 * @fileOverview Multimodal Embedding Client — Molly's Semantic Core
 *
 * Client for Gemini Embedding 2 — multimodal embeddings for text,
 * images, audio, video, and PDFs in a unified space.
 */

import { MollyLogger, generateTraceId } from '../../logger';
import {
  EmbeddingContent,
  Embedding,
  EmbedRequest,
  EmbedResult,
  BatchEmbedRequest,
  BatchEmbedResult,
  EmbeddingAuditEntry,
  DEFAULT_CONFIG,
  MultimodalEmbeddingConfig,
  normalizeVector,
  EmbeddingModality,
} from './types';

const EMBED_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';

const auditLog: EmbeddingAuditEntry[] = [];
const MAX_AUDIT_ENTRIES = 500;

function logAudit(
  entry: Omit<EmbeddingAuditEntry, 'entryId' | 'timestamp'>
): void {
  auditLog.push({
    ...entry,
    entryId: generateTraceId(),
    timestamp: Date.now(),
  });
  if (auditLog.length > MAX_AUDIT_ENTRIES)
    auditLog.splice(0, auditLog.length - MAX_AUDIT_ENTRIES);
}

export function getEmbeddingAuditLog(): EmbeddingAuditEntry[] {
  return [...auditLog];
}

export class MultimodalEmbeddingClient {
  private config: MultimodalEmbeddingConfig;
  private apiKey: string;

  constructor(config?: Partial<MultimodalEmbeddingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.apiKey = process.env.GOOGLE_GENAI_API_KEY || '';
  }

  async embedText(text: string, dimensions?: number): Promise<EmbedResult> {
    return this.embed({
      content: { type: 'text', text },
      outputDimensionality: dimensions,
    });
  }

  async embedImage(
    data: string | Buffer,
    mimeType: string,
    dimensions?: number
  ): Promise<EmbedResult> {
    return this.embed({
      content: { type: 'image', data, mimeType },
      outputDimensionality: dimensions,
    });
  }

  async embedAudio(
    data: string | Buffer,
    mimeType: string,
    dimensions?: number
  ): Promise<EmbedResult> {
    return this.embed({
      content: { type: 'audio', data, mimeType },
      outputDimensionality: dimensions,
    });
  }

  async embedVideo(
    data: string | Buffer,
    mimeType: string,
    dimensions?: number
  ): Promise<EmbedResult> {
    return this.embed({
      content: { type: 'video', data, mimeType },
      outputDimensionality: dimensions,
    });
  }

  async embedPdf(
    data: string | Buffer,
    dimensions?: number
  ): Promise<EmbedResult> {
    return this.embed({
      content: { type: 'pdf', data, mimeType: 'application/pdf' },
      outputDimensionality: dimensions,
    });
  }

  async embedMultimodal(
    contents: EmbeddingContent[],
    dimensions?: number
  ): Promise<EmbedResult> {
    return this.embed({ content: contents, outputDimensionality: dimensions });
  }

  async embed(request: EmbedRequest): Promise<EmbedResult> {
    const traceId = generateTraceId();
    const startTime = Date.now();
    const dimensions =
      request.outputDimensionality || this.config.defaultDimensions;

    try {
      const body = this.buildRequestBody(request.content, dimensions);
      const url = `${EMBED_BASE_URL}/${this.config.model}:embedContent`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok)
        throw new Error(
          `API error ${response.status}: ${await response.text()}`
        );

      const data = await response.json();
      const processingTimeMs = Date.now() - startTime;
      const embeddings = this.parseEmbeddings(
        data,
        request.content,
        dimensions
      );
      const modality = this.getModality(request.content);

      logAudit({
        modality,
        itemCount: embeddings.length,
        dimensions,
        processingTimeMs,
      });
      MollyLogger.debug(
        `Multimodal Embedding: Embedded ${modality} in ${processingTimeMs}ms`,
        'multimodal-embedding',
        { traceId }
      );

      return { success: true, embeddings, processingTimeMs };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logAudit({
        modality: this.getModality(request.content),
        itemCount: 0,
        dimensions,
        processingTimeMs,
        error: errorMessage,
      });
      MollyLogger.error(
        'Multimodal Embedding: Failed',
        'multimodal-embedding',
        { traceId },
        error
      );
      return {
        success: false,
        embeddings: [],
        error: errorMessage,
        processingTimeMs,
      };
    }
  }

  async batchEmbed(request: BatchEmbedRequest): Promise<BatchEmbedResult> {
    const startTime = Date.now();
    const results: EmbedResult[] = [];
    for (const req of request.requests) results.push(await this.embed(req));
    const processingTimeMs = Date.now() - startTime;
    const success = results.every((r) => r.success);
    return { success, results, processingTimeMs };
  }

  private buildRequestBody(
    content: EmbeddingContent | EmbeddingContent[],
    dimensions: number
  ): Record<string, unknown> {
    const contents = Array.isArray(content) ? content : [content];
    const parts: Record<string, unknown>[] = [];

    for (const c of contents) {
      if (c.type === 'text') parts.push({ text: c.text });
      else if (c.type === 'url')
        parts.push({ fileData: { fileUri: c.url, mimeType: c.mimeType } });
      else {
        const base64 = Buffer.isBuffer(c.data)
          ? c.data.toString('base64')
          : c.data;
        parts.push({ inlineData: { mimeType: c.mimeType, data: base64 } });
      }
    }

    return { content: { parts }, outputDimensionality: dimensions };
  }

  private parseEmbeddings(
    data: Record<string, unknown>,
    content: EmbeddingContent | EmbeddingContent[],
    dimensions: number
  ): Embedding[] {
    const embeddings = data.embedding || data.embeddings;
    const modality = this.getModality(content);

    if (Array.isArray(embeddings)) {
      return embeddings.map((e: { values: number[] }) => {
        let values = e.values;
        if (this.config.autoNormalize && dimensions < 3072)
          values = normalizeVector(values);
        return {
          values,
          dimensions: values.length,
          modality,
          normalized: dimensions < 3072,
        };
      });
    }

    const embeddingData = embeddings as { values: number[] };
    let values = embeddingData?.values || [];
    if (this.config.autoNormalize && dimensions < 3072)
      values = normalizeVector(values);
    return [
      {
        values,
        dimensions: values.length,
        modality,
        normalized: dimensions < 3072,
      },
    ];
  }

  private getModality(
    content: EmbeddingContent | EmbeddingContent[]
  ): EmbeddingModality | 'multimodal' {
    if (Array.isArray(content)) {
      const types = new Set(content.map((c) => c.type));
      if (types.size > 1) return 'multimodal';
      return (content[0]?.type as EmbeddingModality) || 'text';
    }
    return content.type === 'url'
      ? 'text'
      : (content.type as EmbeddingModality);
  }
}

let _clientInstance: MultimodalEmbeddingClient | null = null;

export function getMultimodalEmbeddingClient(): MultimodalEmbeddingClient {
  if (!_clientInstance) _clientInstance = new MultimodalEmbeddingClient();
  return _clientInstance;
}

export function resetMultimodalEmbeddingClient(): void {
  _clientInstance = null;
  auditLog.length = 0;
}
