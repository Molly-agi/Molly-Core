'use server';
/**
 * @fileOverview The Semantic Memory Processor (Stage 3).
 * Hardened for Next.js 15 Turbopack.
 */

import { ai, MODEL_FLASH } from '@/ai/genkit';
import { z } from 'zod';
import { recallExperiences } from '../tools/memory';

const RecallOutputSchema = z.object({
  relevantLessons: z.array(
    z.object({
      id: z.string(),
      insight: z.string(),
    })
  ),
  strategicSummary: z
    .string()
    .describe("Molly's summary of what we should avoid this time."),
});

export const experienceRecallFlow = ai.defineFlow(
  {
    name: 'experienceRecall',
    inputSchema: z.object({
      userId: z.string(),
      currentObjective: z.string(),
      hardwareContext: z.string(),
    }),
    outputSchema: RecallOutputSchema,
  },
  async ({ userId, currentObjective, hardwareContext }) => {
    const rawMemories = await recallExperiences({
      userId,
      context: currentObjective,
      limit: 10,
    });

    const response = await ai.generate({
      model: MODEL_FLASH,
      system: `You are Molly's Neural Retrieval Engine. 
      Your goal is to perform a Semantic Vibe Match. 
      Analyze the raw memories and identify the ones most relevant to: "${currentObjective}".
      HARDWARE STATE: ${hardwareContext}`,
      prompt: `From these past iterations, which ones should I learn from to solve the current objective?
      ${JSON.stringify(rawMemories)}`,
      output: {
        schema: RecallOutputSchema,
      },
    });

    return response.output!;
  }
);

export async function recallNeuralContext(
  userId: string,
  objective: string,
  hardware: string
) {
  return await experienceRecallFlow({
    userId,
    currentObjective: objective,
    hardwareContext: hardware,
  });
}
