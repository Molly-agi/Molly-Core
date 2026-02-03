'use server';
/**
 * @fileOverview The Autonomous Iteration Engine V2.3 (Experience-Augmented).
 * 
 * Executes a recursive Search-Audit-Draft-Harden cycle autonomously.
 * Molly now queries her "Neural Cache" before starting to ensure past rats are not repeated.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { autonomousSolution } from './autonomous-solution';
import { introspect } from './introspection';
import { logMethodologyStep } from '../methodology';
import { analyzeVision } from './vision-analysis';
import { neuralBridgeUI } from '../tools/system';
import { initializeFirebase } from '@/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

const EvolutionLoopInputSchema = z.object({
  objective: z.string(),
  userId: z.string(),
  iterations: z.number().default(3),
});

async function getPastLessons(userId: string) {
  const { firestore } = initializeFirebase();
  const ref = collection(firestore, 'users', userId, 'codeModifications');
  const q = query(ref, orderBy('timestamp', 'desc'), limit(5));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data());
}

export const evolutionLoopFlow = ai.defineFlow(
  {
    name: 'evolutionLoop',
    inputSchema: EvolutionLoopInputSchema,
    outputSchema: z.object({
      finalReport: z.string(),
      iterationCount: z.number(),
      stableBaselineReached: z.boolean(),
      visualVerification: z.string().optional(),
      memoryConsulted: z.boolean(),
    }),
  },
  async (input) => {
    let currentIteration = 0;
    let isStable = false;
    let lastSolution = "";
    let lastVisualVerification = "Pending visual audit.";
    
    // 0. Experience Retrieval (Stage 3 Memory Graft)
    await logMethodologyStep(input.userId, 'SHIELD_CHECK', `Consulting Neural Cache for: ${input.objective}`, true);
    const pastLessons = await getPastLessons(input.userId);
    const memoryContext = pastLessons.length > 0 
      ? `I remember these past architectural patterns: ${JSON.stringify(pastLessons)}` 
      : "No relevant experiences found in Neural Cache. Initiating first-principles reasoning.";

    while (currentIteration < input.iterations && !isStable) {
      currentIteration++;
      
      // 1. Execute Solution with Memory Context
      const solution = await autonomousSolution(`${input.objective}. Context: ${memoryContext}`, input.userId);
      lastSolution = solution.finalCommand || "";

      // 2. Visual Verification
      try {
        const { output: bridge } = await neuralBridgeUI({ action: 'CAPTURE_SCREENSHOT' });
        if (bridge.screenshotUri) {
          const vision = await analyzeVision(bridge.screenshotUri, `Verify if the solution [${lastSolution}] cleared the objective: ${input.objective}. Previous infections: ${solution.visualInfections?.join(', ') || 'None'}`);
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

      // 3. Introspect & Audit
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
      visualVerification: lastVisualVerification,
      memoryConsulted: pastLessons.length > 0
    };
  }
);

export async function runAutonomousEvolution(objective: string, userId: string, iterations: number = 3) {
  return await evolutionLoopFlow({ objective, userId, iterations });
}
