'use server';

import { ai, molly, TaskType } from '@/ai/genkit';
import { z } from 'zod';

const textToTermuxCommandFlow = ai.defineFlow(
  {
    name: 'textToTermuxCommand',
    inputSchema: z.string(),
    outputSchema: z.string(),
  },
  async (prompt) => {
    const llmResponse = await molly.generate(TaskType.CHAT, {
      prompt: `You are an expert in Termux and Linux command-line tools.
Your ONLY goal is to convert a natural language prompt into a single, executable command-line command for a Termux environment on Android.
- Provide ONLY the single, executable command.
- Do NOT provide any explanation.
- Do NOT add any introductory text like "Here is the command:".
- If the request is ambiguous or cannot be translated into a direct command, respond with the exact phrase "Error: Command not understood."

User prompt: "${prompt}"

Command:`,
      config: {
        temperature: 0.0,
      },
    });

    return llmResponse.text;
  }
);

export async function textToTermuxCommand(prompt: string): Promise<string> {
  return await textToTermuxCommandFlow(prompt);
}
