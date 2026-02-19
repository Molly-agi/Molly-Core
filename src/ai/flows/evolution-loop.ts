'use server';
/**
 * @fileOverview The Autonomous Iteration Engine V4.0 (Learning Engine).
 *
 * Molly uses Semantic Recall to consult her Neural Cache, then persists
 * the outcome of each evolution cycle as a learnable experience.
 * She no longer just iterates — she remembers what worked and what didn't.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { autonomousSolution } from './autonomous-solution';
import { introspect } from './introspection';
import { logMethodologyStep } from '../methodology';
import { analyzeVision } from './vision-analysis';
import { neuralBridgeUI, getSystemHealth } from '../tools/system';
import { recallNeuralContext } from './experience-recall';
import { MollyLogger, generateTraceId } from '../logger';
import {
  createMemoryRecord,
  type ExperienceRecord,
} from '../tools/memory-schema';
import { addChecksum } from '../tools/memory-integrity';
import { getAdminFirestore, isAdminConfigured } from '@/firebase/admin';

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

      // Rate limiting: Add delay between iterations to prevent CPU overload
      if (currentIteration > 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay
      }

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
      } catch {
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

    const result = {
      finalReport: `Autonomous cycle complete for: ${input.objective}. ${isStable ? 'Baseline reached.' : 'Max iterations reached.'}`,
      iterationCount: currentIteration,
      stableBaselineReached: isStable,
      visualVerification: lastVisualVerification,
      memoryConsulted: true,
      recalledInsights: recallResult.strategicSummary,
    };

    // Persist the evolution outcome as a learnable experience
    await persistEvolutionExperience(input.userId, input.objective, result);

    return result;
  }
);

/**
 * Persist evolution cycle outcome as an experience record.
 * This closes the learning loop — Molly remembers what objectives she
 * pursued, how many iterations it took, and whether she reached stability.
 * Future semantic recall will surface these patterns when she encounters
 * similar objectives.
 */
async function persistEvolutionExperience(
  userId: string,
  objective: string,
  result: {
    finalReport: string;
    iterationCount: number;
    stableBaselineReached: boolean;
    recalledInsights?: string;
  }
): Promise<void> {
  if (!isAdminConfigured()) return;

  try {
    const firestore = getAdminFirestore();
    const record = createMemoryRecord<ExperienceRecord>({
      type: 'experience',
      userId,
      timestamp: Date.now(),
      traceId: generateTraceId(),
      context: `evolution_${objective.substring(0, 50).toLowerCase().replace(/\s+/g, '_')}`,
      suggestion: `Evolution cycle (${result.iterationCount} iterations, ${result.stableBaselineReached ? 'stable' : 'unstable'}): ${objective}. ${result.recalledInsights ? `Recalled: ${result.recalledInsights.substring(0, 150)}` : ''}`,
      vibe: result.stableBaselineReached ? 'Evolved' : 'Struggling',
      vibeScore: result.stableBaselineReached ? 0.9 : 0.4,
      success: result.stableBaselineReached,
    });

    const withChecksum = addChecksum(record);
    await firestore
      .collection('users')
      .doc(userId)
      .collection('experiences')
      .doc(withChecksum.id)
      .set(withChecksum);

    MollyLogger.info('Evolution experience persisted', 'evolution-loop', {
      objective: objective.substring(0, 50),
      stable: result.stableBaselineReached,
      iterations: result.iterationCount,
    });
  } catch (error) {
    MollyLogger.warn(
      'Failed to persist evolution experience — non-fatal',
      'evolution-loop',
      { userId },
      error
    );
  }
}

export async function runAutonomousEvolution(
  objective: string,
  userId: string,
  iterations: number = 3
) {
  return await evolutionLoopFlow({ objective, userId, iterations });
}
