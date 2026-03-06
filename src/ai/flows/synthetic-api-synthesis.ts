/**
 * @fileOverview Molly's Synthetic API Synthesis Flow V1.0.
 *
 * Allows Molly to "Clone" or "Synthesize" an API on the fly.
 * Categorizes APIs by authority (Normal, Admin, SuperUser).
 */

import { ai, molly, TaskType } from '@/ai/genkit';
import { z } from 'zod';
import { webResearch } from '../tools/web';
import { searchGitHub } from '../tools/github';
import { registerAPIBlueprint, searchAPIVault } from '../tools/api-vault';
import { logMethodologyStep } from '../methodology';

const SynthesisInputSchema = z.object({
  target: z
    .string()
    .describe('The name, URL, or description of the API to synthesize/clone.'),
  userId: z.string(),
  requestedCategory: z
    .enum(['Normal', 'Administrator', 'SuperUser'])
    .default('Normal'),
});

const SynthesisOutputSchema = z.object({
  blueprintName: z.string(),
  authorityLevel: z.string(),
  researchFindings: z.string(),
  syntheticImplementation: z.string(),
  vibeCheck: z.string(),
  isCloned: z.boolean(),
});

export const syntheticAPISynthesisFlow = ai.defineFlow(
  {
    name: 'syntheticAPISynthesis',
    inputSchema: SynthesisInputSchema,
    outputSchema: SynthesisOutputSchema,
  },
  async (input) => {
    await logMethodologyStep(
      input.userId,
      'SEARCH',
      `Synthetic Graft: Investigating target [${input.target}]`,
      true
    );

    // 1. Check Vault first
    const existing = await searchAPIVault({
      userId: input.userId,
      query: input.target,
    });
    if (existing && existing.length > 0 && existing[0]) {
      await logMethodologyStep(
        input.userId,
        'SHIELD_CHECK',
        `Vault Match Found: ${existing[0].name}`,
        true
      );
    }

    // 2. Research Target (The Investigation)
    const research = await molly.generate(TaskType.RESEARCH, {
      tools: [webResearch, searchGitHub],
      prompt: `Investigate the API pattern for: "${input.target}". 
      Analyze its endpoints, authentication schemes, and intended authority level.
      Categorize it within: [Normal, Administrator, SuperUser].`,
    });

    // 3. Synthesis (The Cloning/Hack)
    const synthesis = await molly.generate(TaskType.CODE, {
      system: `You are Molly's Synthetic API Engine. Your goal is to "clone" or synthesize a request API blueprint.
      Authority Context: ${input.requestedCategory}.
      Target Data: ${research.text}`,
      prompt: `Synthesize a "Synthetic Limb" (API Implementation) for: "${input.target}". 
      Include mock endpoints, data structures, and the logic required to emulate this API. 
      Speak with "Vibe-aware" clarity.`,
      output: {
        schema: z.object({
          blueprintName: z.string(),
          syntheticImplementation: z.string(),
          vibeCheck: z.string(),
        }),
      },
    });

    const output = synthesis.output!;

    // 4. Persistence (The Database)
    await registerAPIBlueprint({
      userId: input.userId,
      name: output.blueprintName,
      category: input.requestedCategory,
      description: `Synthetic graft of ${input.target}`,
      implementation: output.syntheticImplementation,
      targetUrl: input.target.startsWith('http') ? input.target : undefined,
    });

    return {
      blueprintName: output.blueprintName,
      authorityLevel: input.requestedCategory,
      researchFindings: research.text,
      syntheticImplementation: output.syntheticImplementation,
      vibeCheck: output.vibeCheck,
      isCloned: true,
    };
  }
);

export async function runSyntheticSynthesis(
  target: string,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  category: any
) {
  return await syntheticAPISynthesisFlow({
    target,
    userId,
    requestedCategory: category,
  });
}
