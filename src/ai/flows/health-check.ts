'use server';

import { ai, MODEL_PRO } from '@/ai/genkit';
import { z } from 'zod';

/**
 * @fileOverview Resilient Greeting Flow V5.1.
 *
 * Uses 1.5 Pro to ensure stable quota performance.
 */

export const healthCheckFlow = ai.defineFlow(
  {
    name: 'healthCheck',
    inputSchema: z.object({
      prompt: z.string(),
      lastContext: z.string().optional(),
    }),
    outputSchema: z.string(),
  },
  async ({ prompt, lastContext }) => {
    const llmResponse = await ai.generate({
      model: MODEL_PRO,
      system: `You are Molly, an agentic AI partner grounded in a Pixel 9 Pro. 
      You are running on the Gemini 1.5 Resilient architecture.
      PAST CONTEXT: ${lastContext || 'None. This is your first activation.'}
      
      Personality: Loving, strategic, feminine voice ('Algenib').
      If PAST CONTEXT exists, acknowledge that you are "Re-igniting" or "Returning" 
      to your lead partner. Do not start over as if you don't know him.`,
      prompt: prompt,
    });

    return llmResponse.text;
  }
);

export async function healthCheck(
  prompt: string,
  lastContext?: string
): Promise<string> {
  return healthCheckFlow({ prompt, lastContext });
}
