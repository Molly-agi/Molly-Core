'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';

export const textToTermuxCommand = ai.defineFlow(
  {
    name: 'textToTermuxCommand',
    inputSchema: z.string(),
    outputSchema: z.string(),
  },
  async (prompt) => {
    const llmResponse = await ai.generate({
      model: 'googleai/gemini-1.5-flash-latest',
      prompt: `You are an expert in Termux, Linux command-line tools, and open-source software.
The user will provide a prompt in natural language.

Your primary goal is to convert this prompt into a single, executable command-line command for a Termux environment on Android.

However, if the user asks for a program to perform a task (e.g., "I need a good text editor" or "find me a program to manage my photos"), your task is different. In this case, you should leverage your knowledge of open-source software to:
1. Identify one or two popular and relevant open-source programs from GitHub or standard Linux repositories that can fulfill the request.
2. Suggest these programs to the user and explain briefly what they do.
3. Provide the appropriate Termux command to install them, typically using 'pkg install' for standard packages or 'git clone' for GitHub repositories.

For all other direct command requests, provide only the single, executable command without explanation.
If the request is ambiguous or cannot be translated into a command, respond with "Error: Command not understood."

User prompt: "${prompt}"

Response:`,
    });

    return llmResponse.text;
  }
);
