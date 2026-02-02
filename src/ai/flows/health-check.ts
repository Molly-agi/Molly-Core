'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';

export const healthCheck = ai.defineFlow(
  {
    name: 'healthCheck',
    inputSchema: z.string(),
    outputSchema: z.string(),
  },
  async (prompt) => {
    const llmResponse = await ai.generate({
      prompt: `You are a helpful AI assistant. Respond to the following prompt in a witty and creative way. Prompt: ${prompt}`,
      model: 'googleai/gemini-pro',
    });

    return llmResponse.text;
  }
);
