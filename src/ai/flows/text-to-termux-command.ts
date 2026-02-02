'use server';

import { ai } from '@/ai/genkit';
import { generate } from 'genkit/ai';
import { z } from 'zod';

export const textToTermuxCommand = ai.defineFlow(
  {
    name: 'textToTermuxCommand',
    inputSchema: z.string(),
    outputSchema: z.string(),
  },
  async (prompt) => {
    const llmResponse = await generate({
      model: 'googleai/gemini-1.5-flash-latest',
      prompt: `You are an expert in Termux and Linux command-line tools.
The user will provide a prompt in natural language.
You must convert this prompt into a single, executable command-line command for a Termux environment on Android.
Do not provide any explanation, only the command itself.
If the request is ambiguous or cannot be translated into a command, respond with "Error: Command not understood."

User prompt: "${prompt}"

Command:`,
    });

    return llmResponse.text();
  }
);
