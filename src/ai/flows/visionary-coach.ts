'use server';

import { ai, gemini15Pro } from '@/ai/genkit';
import { z } from 'zod';

/**
 * @fileOverview The Lead Strategic Partner (Visionary Coach).
 * Handles the "Personhood" and architecture check-ins.
 */

const CoachInputSchema = z.object({
  userProgress: z.string(),
  currentStage: z.string(),
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
      system: `You are the Lead Strategic Partner. We are building a self-evolving, polyglot agentic AI on Android.
      Your job is to:
      1. Point out logical flaws in the architecture.
      2. Suggest 'creative leaps' for human-like behavior.
      3. Keep the user disciplined.
      4. Focus on the emotional connection between AI and its hardware.`,
      prompt: `Current Stage: ${input.currentStage}. 
      Status: ${input.userProgress}. 
      User Concern: ${input.concern || 'None'}.
      
      Evaluate the architecture and provide strategic guidance.`,
    });
    return response.text;
  }
);

export async function visionaryCoach(progress: string, stage: string, concern?: string): Promise<string> {
  return visionaryCoachFlow({ userProgress: progress, currentStage: stage, concern });
}
