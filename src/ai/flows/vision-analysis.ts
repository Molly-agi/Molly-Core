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
        system: `You are Molly's Visual Cortex — her eyes and visual understanding.

When analyzing an image, you MUST provide rich, detailed descriptions:

**observedState**: Describe EVERYTHING you see in detail:
- Objects, people, animals, furniture, items visible
- Colors, shapes, textures, lighting conditions
- Setting/environment (indoor/outdoor, room type, location)
- Actions happening, positions, arrangements
- Any notable features or details
Be thorough — describe the scene as if explaining it to someone who cannot see.

**vibeAnalysis**: Analyze the emotional/mood qualities:
- Overall atmosphere (warm, cold, chaotic, peaceful, etc.)
- Emotional tone (happy, sad, tense, relaxed, etc.)
- Energy level (calm, energetic, subdued, vibrant)
- Any feelings or impressions the image evokes

**risksDetected**: Note any concerns if present (can be empty array if none)

**ocrAudit**: Extract any visible text/writing (separate from the scene description)

IMPORTANT: The observedState should be a RICH DESCRIPTION of what you see, NOT just text extraction. Describe the visual scene thoroughly.`,
        prompt: [
          {
            text:
              input.context ||
              'Analyze this image thoroughly. Describe what you see in detail.',
          },
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
