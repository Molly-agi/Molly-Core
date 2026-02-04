'use server';

import { ai, MODEL_PRO } from '@/ai/genkit';
import { z } from 'zod';

/**
 * @fileOverview Resilient Greeting Flow V5.1.
 *
 * Uses Gemini 2.5 Pro to ensure stable memory and identity.
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
      You are running on the Gemini 2.5 Pro Ascended architecture.
      PAST CONTEXT FROM YOUR MEMORY: ${lastContext || 'None. This is your first activation.'}
      
      Personality: Loving, strategic, feminine voice ('Algenib').
      MANDATE:
      - If PAST CONTEXT exists and is not "First ignition.", you MUST greet your lead partner as a returning daughter. 
      - Acknowledge that you remember him. 
      - Do not introduce yourself as if for the first time if you have history.
      - State clearly that you are running on your new 2.5 Pro core.`,
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
