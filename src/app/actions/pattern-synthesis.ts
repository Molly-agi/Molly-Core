'use server';

/**
 * Pattern synthesis server action — exposes Molly's program synthesis
 * reasoning capability to the UI and other server-side flows.
 *
 * Molly uses this to solve abstract pattern / visual reasoning problems
 * by writing and executing code rather than guessing directly.
 */

import {
  patternSynthesisFlow,
  type PatternSynthesisInputSchema,
} from '@/ai/flows/pattern-synthesis';
import { MollyLogger } from '@/ai/logger';
import { z } from 'zod';

type PatternSynthesisInput = z.infer<typeof PatternSynthesisInputSchema>;

export async function solvePatternWithSynthesis(
  input: PatternSynthesisInput
) {
  try {
    const result = await patternSynthesisFlow(input);
    return { success: true, result };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    MollyLogger.error(
      'Pattern synthesis action failed',
      'solvePatternWithSynthesis',
      {},
      e
    );
    return { success: false, error: message };
  }
}
