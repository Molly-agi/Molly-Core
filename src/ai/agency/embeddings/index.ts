/**
 * @fileOverview Multimodal Embedding Module — Molly's Semantic Memory
 *
 * Gemini Embedding 2 capabilities for multimodal semantic understanding.
 * Maps text, images, video, audio, and PDFs into a unified vector space.
 *
 * Usage:
 *   import { getEmbeddingClient } from '@/ai/agency/embeddings';
 *
 *   const client = getEmbeddingClient();
 *
 *   // Embed text
 *   const textResult = await client.embed("Hello world");
 *
 *   // Embed image
 *   const imageResult = await client.embed({
 *     type: 'image',
 *     uri: 'https://example.com/image.jpg'
 *   });
 *
 *   // Search similar items
 *   const results = await client.search("Find similar images", {
 *     topK: 5,
 *     contentTypes: ['image']
 *   });
 */

// Types
export * from './types';

// Client
export {
  MultimodalEmbeddingClient,
  getEmbeddingClient,
  resetEmbeddingClient,
  getEmbeddingAuditLog,
  storeEmbedding,
  getStoredEmbedding,
  deleteStoredEmbedding,
  getAllStoredEmbeddings,
  clearVectorStore,
} from './client';
