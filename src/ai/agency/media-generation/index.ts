/**
 * @fileOverview Media Generation Module — Molly's Creative Engine
 *
 * Video (Veo 3.1), Image (Imagen 4), and Music (Lyria 3) generation.
 *
 * Usage:
 *   import { getMediaGenerationClient } from '@/ai/agency/media-generation';
 *   const client = getMediaGenerationClient();
 *   const video = await client.generateVideo({ prompt: "A cat playing piano" });
 *   const image = await client.generateImage({ prompt: "A sunset over mountains" });
 *   const music = await client.generateMusic({ prompt: "Upbeat electronic track" });
 */

export * from './types';
export {
  MediaGenerationClient,
  getMediaGenerationClient,
  resetMediaGenerationClient,
  getMediaAuditLog,
} from './client';
