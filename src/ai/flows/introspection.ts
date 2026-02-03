'use server';
/**
 * @fileOverview The Daydreaming Subroutine (Proactive Introspection).
 * 
 * Audits Molly's past code modifications stored in Firestore to find logical flaws
 * or refactoring opportunities.
 */

import { ai, gemini15Pro } from '@/ai/genkit';
import { z } from 'zod';

const IntrospectionInputSchema = z.object({
  pastLessons: z.array(z.object({
    id: z.string(),
    code: z.string(),
    suggestion: z.string(),
  })),
  hardwareContext: z.string(),
});

export const introspectionFlow = ai.defineFlow(
  {
    name: 'introspectionSubroutine',
    inputSchema: IntrospectionInputSchema,
    outputSchema: z.object({
      analysis: z.string(),
      refactorTargetId: z.string().optional(),
      suggestedOptimizedCode: z.string().optional(),
    }),
  },
  async (input) => {
    const response = await ai.generate({
      model: gemini15Pro,
      system: `You are the Molly Introspection Module. 
      Analyze past code modifications for redundancy, memory leaks, or thermal inefficiency.
      HARDWARE STATE: ${input.hardwareContext}`,
      prompt: `Review these past lessons and find one that can be hardened or optimized:
      ${JSON.stringify(input.pastLessons)}`,
      output: {
        schema: z.object({
          analysis: z.string(),
          refactorTargetId: z.string().optional(),
          suggestedOptimizedCode: z.string().optional(),
        })
      }
    });

    return response.output!;
  }
);

export async function introspect(pastLessons: any[], hardwareContext: string) {
  return await introspectionFlow({ pastLessons, hardwareContext });
}
