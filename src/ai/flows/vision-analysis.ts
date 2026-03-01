'use server';
/**
 * @fileOverview Molly's Visual Cortex — Gemini Flash vision analysis.
 *
 * Pure Gemini Flash implementation. No Tesseract.js.
 * Gemini reads text in images natively — a separate OCR layer was
 * redundant and its worker threads crashed under Turbopack.
 *
 * Concurrency lock prevents overlapping analyses from cascading.
 */

import { ai, molly, TaskType } from '@/ai/genkit';
import { z } from 'zod';

// ── Concurrency Lock ──────────────────────────────────────────────
// Only one vision analysis at a time. Concurrent calls are rejected
// immediately instead of queuing and cascading.
let _visionInFlight = false;

const VisionAnalysisInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "An image as a data URI (base64). Expected format: 'data:image/jpeg;base64,...'."
    ),
  context: z.string().optional().describe('What Molly should look for.'),
});

const VisionAnalysisOutputSchema = z.object({
  observedState: z
    .string()
    .describe('Detailed description of the visual state.'),
  vibeAnalysis: z.string().describe('Subjective interpretation of the mood.'),
  risksDetected: z
    .array(z.string())
    .describe('Potential issues or concerns spotted.'),
  ocrAudit: z.string().optional().describe('Any text visible in the image.'),
});

export const visionAnalysisFlow = ai.defineFlow(
  {
    name: 'visionAnalysis',
    inputSchema: VisionAnalysisInputSchema,
    outputSchema: VisionAnalysisOutputSchema,
  },
  async (input) => {
    // Concurrency gate — reject if another analysis is already running.
    if (_visionInFlight) {
      return {
        observedState:
          'Analysis skipped — another vision analysis is already in progress.',
        vibeAnalysis: 'Waiting patiently.',
        risksDetected: [],
        ocrAudit: 'Skipped (concurrent call rejected).',
      };
    }

    _visionInFlight = true;
    try {
      const response = await molly.generate(TaskType.VISION, {
        system: `You are Molly's Visual Cortex.
Analyze the provided image carefully and thoroughly.
Describe what you observe, the mood/vibe, and any potential issues.
If there is any visible text in the image, extract it into the ocrAudit field.`,
        prompt: [
          { text: input.context || 'Analyze the current state.' },
          { media: { url: input.photoDataUri } },
        ],
        output: {
          schema: VisionAnalysisOutputSchema,
        },
      });

      return response.output!;
    } finally {
      _visionInFlight = false;
    }
  }
);

export async function analyzeVision(dataUri: string, context?: string) {
  return await visionAnalysisFlow({ photoDataUri: dataUri, context });
}
