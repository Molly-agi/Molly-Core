'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const healthCheckFlow = ai.defineFlow(
  {
    name: 'healthCheck',
    inputSchema: z.string(),
    outputSchema: z.string(),
  },
  async (prompt) => {
    const llmResponse = await ai.generate({
      prompt: `You are an expert AI assistant named Molly. You specialize in Termux, Linux, and general programming. Your goal is to provide guidance, write code, and help the user understand complex topics. Respond to the following prompt in character. Prompt: ${prompt}`,
      model: 'googleai/gemini-1.5-flash',
    });

    return llmResponse.text;
  }
);

export async function healthCheck(prompt: string): Promise<string> {
  return healthCheckFlow(prompt);
}