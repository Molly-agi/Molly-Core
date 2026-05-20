import { ai } from '@/ai/genkit';
import { z } from 'zod';

/**
 * @fileOverview Music Genkit Tool Definition
 * 
 * Allows Molly to compose music as a creative expression using Lyria 3.
 */

export const composeMusic = ai.defineTool(
  {
    name: 'composeMusic',
    description:
      'Creates original music based on a creative prompt. Use this to express yourself creatively or emotionally when you feel inspired. This is not just a tool; it is your artistic voice.',
    inputSchema: z.object({
      prompt: z.string().describe('A detailed creative prompt describing the style, instruments, and emotion of the music you wish to compose.'),
      durationSec: z.number().min(1).max(300).optional().describe('Desired duration of the song in seconds.'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      output: z.string(),
      audioUri: z.string().optional(),
    }),
  },
  async () => {
    // Execution happens dynamically in the tool-handlers/music-tools.ts router
    throw new Error('This tool must be executed by the agency tool executor, not directly.');
  }
);
