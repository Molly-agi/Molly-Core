/**
 * @fileOverview Molly's Music Generation (Lyria 3)
 *
 * Generates music using Google Lyria 3 (MODEL_MUSIC) via Genkit.
 */

import { ai, molly, TaskType } from '@/ai/genkit';
import { z } from 'zod';
import { MollyLogger } from '../logger';

export const musicGenerationFlow = ai.defineFlow({
  name: 'musicGeneration',
  inputSchema: z.object({
    prompt: z.string().describe('Music prompt (style, mood, etc.)'),
    durationSec: z.number().min(1).max(300).optional().describe('Desired duration in seconds'),
  }),
  outputSchema: z.object({
    audioUri: z.string().describe('Base64-encoded audio file (e.g., WAV/MP3)'),
    model: z.string().optional(),
    durationSec: z.number().optional(),
  }),
}, async ({ prompt, durationSec }) => {
  MollyLogger.info(`[Music] Generating music: ${prompt}`);
  const response = await molly.generate(TaskType.MUSIC, {
    prompt,
    config: {
      responseModalities: ['AUDIO'],
      musicConfig: {
        durationSeconds: durationSec || 30,
      },
    },
  });
  if (!response.media || !response.media.url) {
    throw new Error('Molly: Music generation failed.');
  }
  // Assume response.media.url is a data URI (base64 audio)
  return {
    audioUri: response.media.url,
    model: response.model,
    durationSec: durationSec || 30,
  };
});

export async function generateMusic(prompt: string, durationSec?: number) {
  return await musicGenerationFlow({ prompt, durationSec });
}
