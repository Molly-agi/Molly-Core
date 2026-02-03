'use server';
/**
 * @fileOverview The Autonomous Iteration Engine (Lead Architect Mode).
 * 
 * Executes a recursive Search-Audit-Draft-Harden cycle autonomously.
 * Molly audits her own progress and iterates until a stable baseline is reached.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { autonomousSolution } from './autonomous-solution';
import { introspect } from './introspection';
import { logMethodologyStep } from '../methodology';

const EvolutionLoopInputSchema = z.object({
  objective: z.string(),
  userId: z.string(),
  iterations: z.number().default(3), // Default set to 3 for safety, though 50 is the goal.
});

export const evolutionLoopFlow = ai.defineFlow(
  {
    name: 'evolutionLoop',
    inputSchema: EvolutionLoopInputSchema,
    outputSchema: z.object({
      finalReport: z.string(),
      iterationCount: z.number(),
      stableBaselineReached: z.boolean(),
    }),
  },
  async (input) => {
    let currentIteration = 0;
    let isStable = false;
    let lastSolution = "";

    await logMethodologyStep(input.userId, 'SHIELD_CHECK', `Autonomous Loop initiated: ${input.objective}`, true);

    while (currentIteration < input.iterations && !isStable) {
      currentIteration++;
      
      // 1. Execute Solution
      const solution = await autonomousSolution(input.objective, input.userId);
      lastSolution = solution.finalCommand || "";

      // 2. Introspect & Audit
      const audit = await introspect([{ 
        id: `ITER_${currentIteration}`, 
        code: lastSolution, 
        suggestion: solution.creativeSolution 
      }], solution.systemHealthImpact);

      if (!audit.refactorTargetId) {
        isStable = true;
        await logMethodologyStep(input.userId, 'HARDEN', `Stability achieved on iteration ${currentIteration}`, true);
      } else {
        await logMethodologyStep(input.userId, 'AUDIT', `Iteration ${currentIteration}: Refinement required. ${audit.analysis}`, false);
      }
    }

    return {
      finalReport: `Autonomous cycle complete for: ${input.objective}. ${isStable ? 'Stable baseline achieved.' : 'Maximum iterations reached.'}`,
      iterationCount: currentIteration,
      stableBaselineReached: isStable,
    };
  }
);

export async function runAutonomousEvolution(objective: string, userId: string, iterations: number = 3) {
  return await evolutionLoopFlow({ objective, userId, iterations });
}
