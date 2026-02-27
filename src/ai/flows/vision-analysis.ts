'use server';
/**
 * @fileOverview Molly's Visual Sensory Graft (Stage 3) V4.1.
 *
 * Gemini Flash vision analysis with optional Tesseract.js OCR.
 *
 * SAFETY HARDENING:
 * - OCR is best-effort — Tesseract worker threads crash under Turbopack
 *   (missing .next/worker-script/node/index.js). OCR failure never blocks
 *   the Gemini vision call.
 * - Concurrency lock prevents overlapping vision analyses.
 * - Uses Promise.allSettled so Gemini succeeds even if OCR explodes.
 */

import { ai, MODEL_FLASH } from '@/ai/genkit';
import { z } from 'zod';

// ── OCR (best-effort, may not work under Turbopack) ───────────────
// Lazily imported to avoid crashing at module load time.
let _ocrAvailable: boolean | null = null; // null = untested
let _ocrWorker: unknown = null;

async function performLocalOCR(dataUri: string): Promise<string> {
  // If we already know OCR doesn't work, skip immediately
  if (_ocrAvailable === false) return 'OCR unavailable in this environment.';

  const OCR_TIMEOUT_MS = 10_000;

  try {
    // Dynamic import to avoid crashing if tesseract.js worker threads fail
    if (!_ocrWorker) {
      const { createWorker } = await import('tesseract.js');
      _ocrWorker = await createWorker('eng');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const worker = _ocrWorker as any;
    const result = await Promise.race([
      worker.recognize(dataUri),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('OCR timed out')), OCR_TIMEOUT_MS)
      ),
    ]);
    _ocrAvailable = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (result as any).data.text;
  } catch (error) {
    console.warn('Molly: OCR limb unavailable, skipping.', error);
    _ocrAvailable = false;
    return 'OCR skipped.';
  }
}

// ── Concurrency Lock ──────────────────────────────────────────────
let _visionInFlight = false;

const VisionAnalysisInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "An image as a data URI (base64). Expected format: 'data:image/jpeg;base64,...'."
    ),
  context: z.string().optional().describe('What Molly should look for.'),
});

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
    // Concurrency gate — reject if another analysis is already running.
    // This is the circuit breaker that prevents the cascading bomb.
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
      // Run OCR and Gemini Vision in PARALLEL with allSettled —
      // OCR is best-effort and MUST NOT block Gemini if it crashes.
      // Tesseract worker threads throw uncaught exceptions under Turbopack
      // that bypass try/catch. allSettled isolates the blast radius.
      const [ocrResult, geminiResult] = await Promise.allSettled([
        performLocalOCR(input.photoDataUri),

        ai.generate({
          model: MODEL_FLASH,
          system: `You are Molly's Visual Cortex.
          Analyze the provided image carefully.
          Describe what you observe, the mood/vibe, and any potential issues.`,
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
        }),
      ]);

      // Extract OCR text (best-effort)
      const ocrText =
        ocrResult.status === 'fulfilled' ? ocrResult.value : 'OCR failed.';

      // Gemini vision MUST succeed — if it failed, throw
      if (geminiResult.status === 'rejected') {
        throw geminiResult.reason;
      }

      return {
        ...geminiResult.value.output!,
        ocrAudit: ocrText,
      };
    } finally {
      _visionInFlight = false;
    }
  }
);

export async function analyzeVision(dataUri: string, context?: string) {
  return await visionAnalysisFlow({ photoDataUri: dataUri, context });
}
