import { ai } from '@/ai/genkit';
import { z } from 'zod';

/**
 * @fileOverview Computer Use Genkit Tool Definition
 */

export const operateComputer = ai.defineTool(
  {
    name: 'operateComputer',
    description:
      'Take control of a web browser or the Android device to accomplish a task. This initiates a multi-step agentic loop where you will see the screen, click, type, and navigate autonomously until the task is done.',
    inputSchema: z.object({
      task: z.string().describe('The goal you want to accomplish on the computer (e.g., "Find a recipe for lasagna and save it to a file").'),
      environment: z.enum(['browser', 'android']).optional().describe('Which environment to use. Use "browser" for web tasks, "android" for device tasks.'),
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
