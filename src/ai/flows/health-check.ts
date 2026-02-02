'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { googleAI } from '@genkit-ai/google-genai';

const healthCheckFlow = ai.defineFlow(
  {
    name: 'healthCheck',
    inputSchema: z.string(),
    outputSchema: z.string(),
  },
  async (prompt) => {
    const llmResponse = await ai.generate({
      prompt: `You are a helpful AI assistant. Respond to the following prompt in a witty and creative way. Prompt: ${prompt}`,
      model: googleAI.model('gemini-pro'),
    });

    return llmResponse.text;
  }
);

export async function healthCheck(prompt: string): Promise<string> {
  return healthCheckFlow(prompt);
}
