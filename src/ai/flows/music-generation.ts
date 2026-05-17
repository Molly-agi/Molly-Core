/**
 * @fileOverview Molly's Music Generation (Lyria 3)
 *
 * Generates music using Google Lyria 3 (MODEL_MUSIC) via Genkit.
 */

import { ai, molly, TaskType } from '@/ai/genkit';
import { z } from 'zod';
import { MollyLogger } from '../logger';

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

async function generateMusicWithRetry(prompt: string, attempt = 1): Promise<{
  audioUri: string;
  model?: string;
}> {
  try {
    MollyLogger.info(`[Music] Attempt ${attempt}: Generating music: ${prompt}`);
    
    const response = await molly.generate(TaskType.MUSIC, {
      prompt,
    });
    
    if (!response.media || !response.media.url) {
      MollyLogger.error('[Music] No media URL in response', 'musicGeneration', {
        hasMedia: !!response.media,
        response: JSON.stringify(response).substring(0, 200),
      });
      throw new Error('Molly: Music generation returned no audio URL.');
    }
    
    return {
      audioUri: response.media.url,
      model: response.model,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    // If it's a timeout and we have retries left, retry
    if ((errorMsg.includes('timeout') || errorMsg.includes('DEADLINE') || errorMsg.includes('policy')) && attempt < MAX_RETRIES) {
      MollyLogger.info(`[Music] Timeout on attempt ${attempt}, retrying in ${RETRY_DELAY_MS}ms...`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      return generateMusicWithRetry(prompt, attempt + 1);
    }
    
    // Otherwise, enhance the error message and rethrow
    if (errorMsg.includes('policy')) {
      throw new Error(`Music API policy block: "${errorMsg}". This might be a content filter. Try a simpler prompt.`);
    }
    if (errorMsg.includes('timeout') || errorMsg.includes('DEADLINE')) {
      throw new Error(`Music generation timed out after ${attempt} attempts. System might be busy. Try a shorter prompt.`);
    }
    throw error;
  }
}

export const musicGenerationFlow = ai.defineFlow({
  name: 'musicGeneration',
  inputSchema: z.object({
    prompt: z.string().describe('Music prompt (style, mood, etc.)'),
  }),
  outputSchema: z.object({
    audioUri: z.string().describe('Base64-encoded audio data URI (WAV/MP3)'),
    model: z.string().optional(),
  }),
}, async ({ prompt }) => {
  return await generateMusicWithRetry(prompt);
});

export async function generateMusic(prompt: string) {
  return await musicGenerationFlow({ prompt });
}
