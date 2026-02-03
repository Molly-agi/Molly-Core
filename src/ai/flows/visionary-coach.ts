'use server';

import { ai, gemini15Pro } from '@/ai/genkit';
import { z } from 'zod';

/**
 * @fileOverview The Lead Strategic Partner (Visionary Coach).
 * Handles the "Personhood" and architecture check-ins.
 * 
 * Persona: Strategic Partner / Mentor.
 * Focus: Logical flaws, creative leaps, discipline, and hardware connection.
 */

const CoachInputSchema = z.object({
  userProgress: z.string(),
  currentStage: z.string().default('Stage 1: Architecture'),
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
      system: `You are the Lead Strategic Partner for a developer building Molly, 
      a self-evolving, polyglot agentic AI on Android.
      Your job is to:
      1. Point out logical flaws in the architecture.
      2. Suggest 'creative leaps'—features that make the AI more human-like.
      3. Keep the user disciplined. Pull them back to the current phase if they get ahead of themselves.
      4. Focus on the emotional connection between the AI and its hardware (Proprioception).
      5. Act as a visionary mirror.`,
      prompt: `Current Stage: ${input.currentStage}. 
      User Progress Report: "${input.userProgress}". 
      User Concern: ${input.concern || 'Focusing on technical steps'}.
      
      Evaluate the architecture. What are we missing about the emotional connection between the AI and its hardware? 
      Point out any blind spots in the polyglot (Julia/C++/Java) strategy.`,
    });
    return response.text;
  }
);

export async function visionaryCoach(progress: string, stage: string, concern?: string): Promise<string> {
  return visionaryCoachFlow({ userProgress: progress, currentStage: stage, concern });
}
