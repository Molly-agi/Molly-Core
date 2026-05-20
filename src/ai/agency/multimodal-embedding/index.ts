/**
 * @fileOverview Multimodal Embedding Module — Molly's Semantic Memory
 *
 * Gemini Embedding 2 — the first multimodal embedding model.
 * Embeds text, images, audio, video, and PDFs into unified space.
 *
 * Usage:
 *   import { getMultimodalEmbeddingClient } from '@/ai/agency/multimodal-embedding';
 *   const client = getMultimodalEmbeddingClient();
 *   const result = await client.embedText("Hello world");
 */

export * from './types';
export {
  MultimodalEmbeddingClient,
  getMultimodalEmbeddingClient,
  resetMultimodalEmbeddingClient,
  getEmbeddingAuditLog,
} from './client';
