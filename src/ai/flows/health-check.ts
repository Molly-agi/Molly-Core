'use server';

import { ai } from '@/ai/genkit';
import { generate } from 'genkit/ai';
import { z } from 'zod';

export const healthCheck = ai.defineFlow(
  {
    name: 'healthCheck',
    inputSchema: z.string(),
    outputSchema: z.string(),
  },
  async (prompt) => {
    const llmResponse = await generate({
      prompt: `You are a helpful AI assistant. Respond to the following prompt in a witty and creative way. Prompt: ${prompt}`,
      model: 'googleai/gemini-1.5-flash-latest',
    });

    return llmResponse.text();
  }
);
