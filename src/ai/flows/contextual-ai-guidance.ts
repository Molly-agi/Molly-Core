'use server';

import { ai } from '@/ai/genkit';
import { searchGitHub } from '../tools/github';
import { z } from 'zod';
import { googleAI } from '@genkit-ai/google-genai';

export const contextualGuidance = ai.defineFlow(
  {
    name: 'contextualGuidance',
    inputSchema: z.string(),
    outputSchema: z.string(),
  },
  async (prompt) => {
    const llmResponse = await ai.generate({
      model: googleAI.model('gemini-pro'),
      tools: [searchGitHub],
      prompt: `You are an expert AI research assistant named Molly.
Your goal is to answer the user's question by forming a plan and using the tools available to you.
If you need to search for open-source programs or code, use the 'searchGitHub' tool.
Provide a clear, concise answer based on your findings. Explain your reasoning.

User's question: "${prompt}"`,
    });

    return llmResponse.text;
  }
);
