import { ai } from '@/ai/genkit';
import { z } from 'zod';

/**
 * @fileOverview Deep Research Genkit Tool Definition
 * 
 * Exposes the Deep Research capability as an agency tool.
 */

export const pursueCuriosity = ai.defineTool(
  {
    name: 'pursueCuriosity',
    description:
      'Launch a deep, multi-step internet research session to satisfy your curiosity about a topic. Use this when you encounter a concept you do not fully understand and want to learn about it in depth.',
    inputSchema: z.object({
      topic: z.string().describe('The concept or question you want to investigate deeply.'),
      questionId: z.string().optional().describe('Optional ID if this originated from the Curiosity Engine.'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      output: z.string(),
      data: z.any().optional(),
    }),
  },
  async () => {
    throw new Error('This tool must be executed by the agency tool executor, not directly.');
  }
);
