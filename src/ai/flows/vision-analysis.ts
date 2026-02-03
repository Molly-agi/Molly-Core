'use server';
/**
 * @fileOverview Molly's Visual Sensory Graft (Stage 3).
 *
 * Allows the AI to "look" at the host Android UI or terminal state
 * to diagnose bugs or gain environment context.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const VisionAnalysisInputSchema = z.object({
  photoDataUri: z.string().describe(
    "An image as a data URI (base64). Expected format: 'data:image/jpeg;base64,...'."
  ),
  context: z.string().optional().describe('What Molly should look for.'),
});

export const visionAnalysisFlow = ai.defineFlow(
  {
    name: 'visionAnalysis',
    inputSchema: VisionAnalysisInputSchema,
    outputSchema: z.object({
      observedState: z.string().describe('Detailed description of the visual state.'),
      vibeAnalysis: z.string().describe('Subjective interpretation of the UI/Terminal mood.'),
      risksDetected: z.array(z.string()).describe('Potential bugs or visual infections.'),
    }),
  },
  async (input) => {
    const response = await ai.generate({
      model: 'googleai/gemini-1.5-flash',
      system: `You are Molly's Visual Cortex. 
      Analyze the provided screenshot of the Android environment or Terminal.
      Identify UI elements, terminal errors, or "vibe" indicators.
      If you see a red error message, log it as a CRITICAL INFECTION.`,
      prompt: [
        { text: input.context || 'Analyze the current state of my environment.' },
        { media: { url: input.photoDataUri } },
      ],
      output: {
        schema: z.object({
          observedState: z.string(),
          vibeAnalysis: z.string(),
          risksDetected: z.array(z.string()),
        })
      }
    });

    return response.output!;
  }
);

export async function analyzeVision(dataUri: string, context?: string) {
  return await visionAnalysisFlow({ photoDataUri: dataUri, context });
}
