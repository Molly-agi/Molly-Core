/**
 * @fileOverview Molly's Video Generation (Veo 3.1)
 *
 * Generates video clips using Google Veo 3.1 (MODEL_VIDEO) via Genkit.
 */

import { ai, molly, TaskType } from '@/ai/genkit';
import { z } from 'zod';
import { MollyLogger } from '../logger';

export const videoGenerationFlow = ai.defineFlow({
  name: 'videoGeneration',
  inputSchema: z.object({
    prompt: z.string().describe('Video prompt (scene, motion, style, etc.)'),
    durationSec: z.number().min(1).max(60).optional().describe('Desired duration in seconds'),
  }),
  outputSchema: z.object({
    videoUri: z.string().describe('Data URI containing the generated video (e.g., MP4)'),
    model: z.string().optional(),
    durationSec: z.number().optional(),
  }),
}, async ({ prompt, durationSec }) => {
  MollyLogger.info(`[Video] Generating video: ${prompt}`);
  
  // NOTE: This uses the Genkit generate call tailored for the Veo model.
  // The exact config structure depends on the Genkit Google AI plugin's implementation for Veo.
  const response = await molly.generate(TaskType.MODEL_VIDEO, {
    prompt,
    config: {
      responseModalities: ['VIDEO'], // or appropriate Veo config
      // Assuming a generic config for duration, adapt if Genkit Veo schema differs
      videoConfig: {
        durationSeconds: durationSec || 5,
      },
    } as any, 
  });

  if (!response.media || !response.media.url) {
    throw new Error('Molly: Video generation failed. No media returned.');
  }

  return {
    videoUri: response.media.url,
    model: response.model || 'Veo 3.1',
    durationSec: durationSec || 5,
  };
});

export async function generateVideo(prompt: string, durationSec?: number) {
  return await videoGenerationFlow({ prompt, durationSec });
}
