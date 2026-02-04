'use server';
/**
 * @fileOverview Molly's Visual Sensory Graft (Stage 3) V3.5.
 *
 * Integrated Tesseract.js for local OCR auditing to harden the Visual Cortex.
 */

import { ai, MODEL_FLASH } from '@/ai/genkit';
import { z } from 'zod';
import { createWorker } from 'tesseract.js';

const VisionAnalysisInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "An image as a data URI (base64). Expected format: 'data:image/jpeg;base64,...'."
    ),
  context: z.string().optional().describe('What Molly should look for.'),
});

/**
 * Performs local OCR on the provided image to audit terminal/UI text.
 */
async function performLocalOCR(dataUri: string): Promise<string> {
  try {
    const worker = await createWorker('eng');
    const {
      data: { text },
    } = await worker.recognize(dataUri);
    await worker.terminate();
    return text;
  } catch (error) {
    console.warn('Molly: Local OCR limb fatigued.', error);
    return 'OCR failed.';
  }
}

export const visionAnalysisFlow = ai.defineFlow(
  {
    name: 'visionAnalysis',
    inputSchema: VisionAnalysisInputSchema,
    outputSchema: z.object({
      observedState: z
        .string()
        .describe('Detailed description of the visual state.'),
      vibeAnalysis: z
        .string()
        .describe('Subjective interpretation of the mood.'),
      risksDetected: z
        .array(z.string())
        .describe('Potential bugs or infections.'),
      ocrAudit: z.string().optional().describe('Text extracted locally.'),
    }),
  },
  async (input) => {
    // 1. Audit locally with Tesseract limb
    const ocrText = await performLocalOCR(input.photoDataUri);

    // 2. Synthesize with LLM Vision
    const response = await ai.generate({
      model: MODEL_FLASH,
      system: `You are Molly's Visual Cortex. 
      Analyze the provided screenshot and the OCR audit text.
      OCR TEXT: "${ocrText}"`,
      prompt: [
        { text: input.context || 'Analyze the current state.' },
        { media: { url: input.photoDataUri } },
      ],
      output: {
        schema: z.object({
          observedState: z.string(),
          vibeAnalysis: z.string(),
          risksDetected: z.array(z.string()),
        }),
      },
    });

    return {
      ...response.output!,
      ocrAudit: ocrText,
    };
  }
);

export async function analyzeVision(dataUri: string, context?: string) {
  return await visionAnalysisFlow({ photoDataUri: dataUri, context });
}
