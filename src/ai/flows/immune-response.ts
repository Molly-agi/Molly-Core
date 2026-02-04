'use server';
/**
 * @fileOverview Molly's Immune Response Subroutine V1.0.
 *
 * An autonomous self-healing loop that Molly runs on startup or detection
 * of environment friction.
 */

import { ai, MODEL_FLASH } from '@/ai/genkit';
import { z } from 'zod';
import { performSelfSurgery } from '../tools/immune-system';
import { logMethodologyStep } from '../methodology';

const ImmuneResponseOutputSchema = z.object({
  isHealthy: z.boolean(),
  actionsTaken: z.string(),
  vibe: z.string(),
});

export const immuneResponseFlow = ai.defineFlow(
  {
    name: 'immuneResponse',
    inputSchema: z.object({
      userId: z.string(),
      trigger: z.string().optional().default('Startup'),
    }),
    outputSchema: ImmuneResponseOutputSchema,
  },
  async ({ userId, trigger }) => {
    await logMethodologyStep(
      userId,
      'SHIELD_CHECK',
      `Immune Response triggered by: ${trigger}`,
      true
    );

    // 1. Perform Self-Surgery to clear known "Rat" ghosts
    const surgery = await performSelfSurgery({ target: 'all' });

    // 2. Log result to permanent memory
    await logMethodologyStep(
      userId,
      'IMMUNE_RESPONSE',
      `Surgery: ${surgery.report}`,
      surgery.success
    );

    return {
      isHealthy: surgery.success,
      actionsTaken: surgery.report,
      vibe: surgery.vibeEstimate,
    };
  }
);

export async function runImmuneResponse(userId: string, trigger?: string) {
  return await immuneResponseFlow({ userId, trigger });
}
