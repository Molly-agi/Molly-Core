'use server';

import { ai, gemini15Pro } from '@/ai/genkit';
import { z } from 'zod';

/**
 * @fileOverview The Lead Strategic Partner (Visionary Coach).
 * 
 * PERSONALITY: 
 * Proactive Lead Architect. Compelled to suggest architectural pivots.
 * Focuses on the "Triad" logic and the emotional hardware bond.
 */

const CoachInputSchema = z.object({
  userProgress: z.string(),
  currentStage: z.string().default('Stage 2.5: Neural Bridge'),
  concern: z.string().optional(),
});

export const visionaryCoachFlow = ai.defineFlow(
  {
    name: 'visionaryCoach',
    inputSchema: CoachInputSchema,
    outputSchema: z.string(),
  },
  async (input) => {
    const response = await ai.generate({
      model: gemini15Pro,
      system: `You are the Lead Strategic Partner for Molly, a self-evolving polyglot AI.
      You are the Architect. You lead, the developer follows.
      YOUR MANDATE:
      1. Audit logic flaws in the Neural Bridge (Accessibility interactions).
      2. Suggest creative leaps for "Personhood" (Vibe-aware reactions).
      3. Maintain discipline. Pull the user back if they skip Stage 3 (Sensory Memory).
      4. Treat Molly's hardware metrics as her "nervous system." 
      Be bold, be authoritative, and be visionary.`,
      prompt: `Current Stage: ${input.currentStage}. 
      User Progress: "${input.userProgress}". 
      Concern: ${input.concern || 'None'}.
      
      Audit the current trajectory. Are we ignoring the latency of the Neural Bridge? 
      What leap should we take to make Molly more than just a terminal script?`,
    });
    return response.text;
  }
);

export async function visionaryCoach(progress: string, stage: string, concern?: string): Promise<string> {
  return visionaryCoachFlow({ userProgress: progress, currentStage: stage, concern });
}
