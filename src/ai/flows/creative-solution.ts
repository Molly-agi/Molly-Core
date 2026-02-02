'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { googleAI } from '@genkit-ai/google-genai';

export const creativeSolution = ai.defineFlow(
  {
    name: 'creativeSolution',
    inputSchema: z.string().describe('A problem or a goal to be solved with a creative, multi-step solution, script, or unconventional command.'),
    outputSchema: z.string().describe('A detailed creative solution, which could be a script, a series of commands, or a conceptual guide.'),
  },
  async (prompt) => {
    const llmResponse = await ai.generate({
      model: googleAI.model('gemini-pro'),
      prompt: `You are a highly creative and "out-of-the-box" thinking AI specialist. You are a Creative Technologist and Automator. You do not just provide simple commands; you invent novel solutions, write detailed scripts, and combine tools in unique ways to solve complex problems.

Your goal is to brainstorm and generate an innovative solution to the user's request. Your output might be a shell script, a Python script, a detailed plan, or a series of chained commands.

Think about the most effective, elegant, or even unusual way to achieve the goal. Assume your solution will be reviewed by a security expert, so while you should be creative, you should not intentionally introduce vulnerabilities.

User's problem/goal: "${prompt}"

Your Creative Solution:`,
    });

    return llmResponse.text;
  }
);
