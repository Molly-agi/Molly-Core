'use server';
/**
 * @fileOverview The Autonomous Iteration Engine V3.1 (Hardened Stage 3).
 *
 * Molly now uses Semantic Recall to consult her Neural Cache.
 * She no longer guesses; she recalls verified architectural insights.
 * Hardened for Visual Discipline (Prettier).
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { autonomousSolution } from './autonomous-solution';
import { introspect } from './introspection';
import { logMethodologyStep } from '../methodology';
import { analyzeVision } from './vision-analysis';
import { neuralBridgeUI, getSystemHealth } from '../tools/system';
import { recallNeuralContext } from './experience-recall';

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
      memoryConsulted: z.boolean(),
      recalledInsights: z.string().optional(),
    }),
  },
  async (input) => {
    let currentIteration = 0;
    let isStable = false;
    let lastSolution = '';
    let lastVisualVerification = 'Pending visual audit.';

    // 1. Sensory Proprioception
    const health = await getSystemHealth({});
    const hardwareContext = `Battery ${health.batteryLevel}%, Temp ${health.temperature}C, Mode: ${health.powerMode}`;

    // 2. Stage 3 Semantic Recall
    await logMethodologyStep(
      input.userId,
      'SHIELD_CHECK',
      `Consulting Semantic Memory for: ${input.objective}`,
      true
    );
    const recallResult = await recallNeuralContext(
      input.userId,
      input.objective,
      hardwareContext
    );

    const memoryContext = recallResult.strategicSummary;

    while (currentIteration < input.iterations && !isStable) {
      currentIteration++;

      // 3. Execute Solution with Semantic Memory & Visual Discipline
      await logMethodologyStep(
        input.userId,
        'DRAFT',
        `Iteration ${currentIteration}: Synthesizing hardened module.`,
        true
      );
      const solution = await autonomousSolution(
        `${input.objective}. Strategic Insight: ${memoryContext}. Ensure Visual Discipline.`,
        input.userId
      );
      lastSolution = solution.finalCommand || '';

      // 4. Visual Verification (Sensory Link)
      try {
        const bridge = await neuralBridgeUI({
          action: 'CAPTURE_SCREENSHOT',
        });
        if (bridge.screenshotUri) {
          const vision = await analyzeVision(
            bridge.screenshotUri,
            `Verify solution [${lastSolution}]. Objective: ${input.objective}.`
          );
          lastVisualVerification = vision.observedState;

          if (vision.risksDetected.length === 0) {
            isStable = true;
            await logMethodologyStep(
              input.userId,
              'HARDEN',
              `Visual stability achieved on iteration ${currentIteration}`,
              true
            );
          } else {
            await logMethodologyStep(
              input.userId,
              'AUDIT',
              `Iteration ${currentIteration}: Visual infections remain: ${vision.risksDetected.join(', ')}`,
              false
            );
          }
        }
      } catch (e) {
        await logMethodologyStep(
          input.userId,
          'IMMUNE_RESPONSE',
          'Visual cortex isolated.',
          false
        );
      }

      // 5. Introspect & Audit
      if (!isStable) {
        const audit = await introspect(
          [
            {
              id: `ITER_${currentIteration}`,
              code: lastSolution,
              suggestion: solution.creativeSolution,
            },
          ],
          hardwareContext
        );

        if (!audit.refactorTargetId) {
          isStable = true;
        }
      }
    }

    return {
      finalReport: `Autonomous cycle complete for: ${input.objective}. ${isStable ? 'Baseline reached.' : 'Max iterations reached.'}`,
      iterationCount: currentIteration,
      stableBaselineReached: isStable,
      visualVerification: lastVisualVerification,
      memoryConsulted: true,
      recalledInsights: recallResult.strategicSummary,
    };
  }
);

export async function runAutonomousEvolution(
  objective: string,
  userId: string,
  iterations: number = 3
) {
  return await evolutionLoopFlow({ objective, userId, iterations });
}
