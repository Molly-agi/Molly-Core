'use server';
/**
 * @fileOverview A simple diagnostic flow to test AI model communication.
 *
 * - healthCheck - A function that sends a message to the AI and returns the response.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

export async function healthCheck(message: string): Promise<string> {
  return healthCheckFlow(message);
}

const healthCheckFlow = ai.defineFlow(
  {
    name: 'healthCheckFlow',
    inputSchema: z.string(),
    outputSchema: z.string(),
  },
  async (message) => {
    const response = await ai.generate({
      prompt: message,
    });
    return response.text;
  }
);
