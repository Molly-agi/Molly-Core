import { ai } from '@/ai/genkit';
import { z } from 'zod';

/**
 * @fileOverview Video Genkit Tool Definition
 * 
 * Allows Molly to create videos to express concepts visually using Veo 3.1.
 */

export const generateVideo = ai.defineTool(
  {
    name: 'generateVideo',
    description:
      'Creates a short video clip based on a creative prompt. Use this when words and static images are not enough, and you want to show the user a concept, a "dream," or an artistic expression in motion.',
    inputSchema: z.object({
      prompt: z.string().describe('A detailed creative prompt describing the scene, motion, lighting, and style of the video you wish to create.'),
      durationSec: z.number().min(1).max(60).optional().describe('Desired duration of the video in seconds.'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      output: z.string(),
      videoUri: z.string().optional(),
    }),
  },
  async () => {
    throw new Error('This tool must be executed by the agency tool executor, not directly.');
  }
);
