/**
 * @fileOverview Molly's Immune Response Subroutine V2.0.
 *
 * An autonomous self-healing loop that Molly runs on startup or detection
 * of environment friction. Now persists results as experience memories
 * so Molly can learn from recurring patterns across sessions.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { performSelfSurgery } from '../tools/immune-system';
import { logMethodologyStep } from '../methodology';
import { MollyLogger, generateTraceId } from '../logger';
import {
  createMemoryRecord,
  type ExperienceRecord,
} from '../tools/memory-schema';
import { addChecksum } from '../tools/memory-integrity';
import { getStorageRouter } from '@/lib/storage-router';

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

    // 1. Perform Self-Surgery to clear known "Rat" ghosts (locks only, preserve .next cache)
    const surgery = await performSelfSurgery({ target: 'locks' });

    // 2. Log result to methodology ledger
    await logMethodologyStep(
      userId,
      'IMMUNE_RESPONSE',
      `Surgery: ${surgery.report}`,
      surgery.success
    );

    // 3. Persist as a learnable experience so Molly remembers immune patterns
    await persistImmuneExperience(userId, trigger, surgery);

    return {
      isHealthy: surgery.success,
      actionsTaken: surgery.report,
      vibe: surgery.vibeEstimate,
    };
  }
);

/**
 * Persist immune response result as an experience record.
 * This is how Molly learns from recurring health patterns — if she keeps
 * seeing the same issues on startup, she can recognize the pattern in
 * future semantic recall and adapt.
 */
async function persistImmuneExperience(
  userId: string,
  trigger: string,
  surgery: { success: boolean; report: string; vibeEstimate: string }
): Promise<void> {
  try {
    const storage = getStorageRouter();
    const record = createMemoryRecord<ExperienceRecord>({
      type: 'experience',
      userId,
      timestamp: Date.now(),
      traceId: generateTraceId(),
      context: `immune_${trigger.toLowerCase().replace(/\s+/g, '_')}`,
      suggestion: `Immune scan (${trigger}): ${surgery.report}`,
      vibe: surgery.vibeEstimate,
      vibeScore: surgery.success ? 0.8 : 0.3,
      success: surgery.success,
    });

    const withChecksum = addChecksum(record);
    await storage.set(
      `users/${userId}/experiences`,
      withChecksum.id,
      withChecksum as unknown as Record<string, unknown>
    );
  } catch (error) {
    MollyLogger.warn(
      'Failed to persist immune experience — non-fatal',
      'immune-response',
      { userId },
      error
    );
  }
}

export async function runImmuneResponse(userId: string, trigger?: string) {
  return await immuneResponseFlow({ userId, trigger: trigger ?? 'Startup' });
}
