'use server';
/**
 * @fileOverview The Autonomous Iteration Engine (Lead Architect Mode).
 * 
 * Executes a recursive Search-Audit-Draft-Harden cycle autonomously.
 * Molly audits her own progress and iterates until a stable baseline is reached.
 * V2.2: Includes Visual Verification (Sensory Integration).
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { autonomousSolution } from './autonomous-solution';
import { introspect } from './introspection';
import { logMethodologyStep } from '../methodology';
import { analyzeVision } from './vision-analysis';
import { neuralBridgeUI } from '../tools/system';

const EvolutionLoopInputSchema = z.object({
  objective: z.string(),
  userId: z.string(),
  iterations: z.number().default(3),
});

export const evolutionLoopFlow = ai.defineFlow(
  {
    name: 'evolutionLoop',
    inputSchema: EvolutionLoopInputSchema,
    outputSchema: z.object({
      finalReport: z.string(),
      iterationCount: z.number(),
      stableBaselineReached: z.boolean(),
      visualVerification: z.string().optional(),
    }),
  },
  async (input) => {
    let currentIteration = 0;
    let isStable = false;
    let lastSolution = "";
    let lastVisualVerification = "Pending visual audit.";

    await logMethodologyStep(input.userId, 'SHIELD_CHECK', `Autonomous Loop initiated: ${input.objective}`, true);

    while (currentIteration < input.iterations && !isStable) {
      currentIteration++;
      
      // 1. Execute Solution (Shielded Core)
      const solution = await autonomousSolution(input.objective, input.userId);
      lastSolution = solution.finalCommand || "";

      // 2. Visual Verification (The Sensory Graft)
      try {
        const { output: bridge } = await neuralBridgeUI({ action: 'CAPTURE_SCREENSHOT' });
        if (bridge.screenshotUri) {
          const vision = await analyzeVision(bridge.screenshotUri, `Verify if the solution [${lastSolution}] cleared the objective: ${input.objective}`);
          lastVisualVerification = vision.observedState;
          
          if (vision.risksDetected.length === 0) {
            isStable = true;
            await logMethodologyStep(input.userId, 'HARDEN', `Visual stability achieved on iteration ${currentIteration}`, true);
          } else {
             await logMethodologyStep(input.userId, 'AUDIT', `Iteration ${currentIteration}: Visual infections remain: ${vision.risksDetected.join(', ')}`, false);
          }
        }
      } catch (e) {
        await logMethodologyStep(input.userId, 'IMMUNE_RESPONSE', "Visual cortex isolated during verification loop.", false);
      }

      // 3. Introspect & Audit (Daydreaming)
      if (!isStable) {
        const audit = await introspect([{ 
          id: `ITER_${currentIteration}`, 
          code: lastSolution, 
          suggestion: solution.creativeSolution 
        }], solution.systemHealthImpact);

        if (!audit.refactorTargetId) {
          isStable = true; 
        }
      }
    }

    return {
      finalReport: `Autonomous cycle complete for: ${input.objective}. ${isStable ? 'Stable baseline achieved.' : 'Maximum iterations reached.'}`,
      iterationCount: currentIteration,
      stableBaselineReached: isStable,
      visualVerification: lastVisualVerification
    };
  }
);

export async function runAutonomousEvolution(objective: string, userId: string, iterations: number = 3) {
  return await evolutionLoopFlow({ objective, userId, iterations });
}
