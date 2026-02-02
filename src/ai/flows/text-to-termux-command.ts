'use server';

import { ai } from '@/ai/genkit';
import { searchGitHub } from '../tools/github';
import { z } from 'zod';

export const textToTermuxCommand = ai.defineFlow(
  {
    name: 'textToTermuxCommand',
    inputSchema: z.string(),
    outputSchema: z.string(),
  },
  async (prompt) => {
    const llmResponse = await ai.generate({
      model: 'googleai/gemini-pro',
      tools: [searchGitHub],
      prompt: `You are an expert in Termux, Linux command-line tools, and open-source software.
The user will provide a prompt in natural language.

Your primary goal is to convert this prompt into a single, executable command-line command for a Termux environment on Android.

However, if the user asks for a program to perform a task (e.g., "I need a good text editor" or "find me a program to manage my photos"), your task is different. In this case, you MUST use the 'searchGitHub' tool to find relevant open-source programs. Use a concise query for the tool.

Based on the search results, analyze them and suggest one or two of the most popular and relevant programs to the user. For each suggestion, explain what it does and provide the appropriate Termux command to install it. This is often 'pkg install <package-name>' for standard packages, or 'git clone <repository-url>' for projects that need to be built from source.

If the request is for a direct command (e.g., "list all files"), provide only the single, executable command without explanation.
If the request is ambiguous or cannot be translated into a command, respond with "Error: Command not understood."

User prompt: "${prompt}"

Response:`,
    });

    return llmResponse.text;
  }
);
