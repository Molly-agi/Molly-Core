'use server';
/**
 * @fileOverview Molly's Visual Sensory Graft (Stage 3) V4.0.
 *
 * Integrated Tesseract.js for local OCR auditing to harden the Visual Cortex.
 *
 * SAFETY HARDENING (Feb 20, 2026):
 * - Tesseract worker is pooled (create once, reuse). No more spawning a
 *   20-40MB WASM worker on every call — that's what caused the OOM bomb.
 * - Concurrency lock prevents overlapping vision analyses on the server.
 *   Only one analysis can run at a time; concurrent calls are rejected
 *   immediately instead of queuing and cascading.
 * - OCR has a timeout — if Tesseract hangs, we move on without it.
 */

import { ai, MODEL_FLASH } from '@/ai/genkit';
import { z } from 'zod';
import { createWorker, type Worker as TesseractWorker } from 'tesseract.js';

// ── Tesseract Worker Pool (singleton) ─────────────────────────────
// One worker, created lazily, reused across all calls.
// Terminated only on process exit (server-side) or never (server actions).
let _ocrWorker: TesseractWorker | null = null;
let _ocrWorkerInitializing = false;

async function getOCRWorker(): Promise<TesseractWorker> {
  if (_ocrWorker) return _ocrWorker;

  // Prevent two simultaneous initializations
  if (_ocrWorkerInitializing) {
    // Wait for the other initialization to finish (poll)
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (_ocrWorker) return _ocrWorker;
    }
    throw new Error('OCR worker initialization timed out');
  }

  _ocrWorkerInitializing = true;
  try {
    _ocrWorker = await createWorker('eng');
    return _ocrWorker;
  } catch (error) {
    _ocrWorkerInitializing = false;
    throw error;
  } finally {
    _ocrWorkerInitializing = false;
  }
}

// ── Concurrency Lock ──────────────────────────────────────────────
// Only one vision analysis can run at a time. This prevents the
// cascading bomb where auto-scan fires faster than analysis completes.
let _visionInFlight = false;

const VisionAnalysisInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "An image as a data URI (base64). Expected format: 'data:image/jpeg;base64,...'."
    ),
  context: z.string().optional().describe('What Molly should look for.'),
});

/**
 * Performs local OCR on the provided image using the pooled worker.
 * Has a 10-second timeout — if Tesseract hangs, we skip OCR gracefully.
 */
async function performLocalOCR(dataUri: string): Promise<string> {
  const OCR_TIMEOUT_MS = 10_000;

  try {
    const worker = await getOCRWorker();
    const result = await Promise.race([
      worker.recognize(dataUri),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('OCR timed out')), OCR_TIMEOUT_MS)
      ),
    ]);
    return result.data.text;
  } catch (error) {
    console.warn('Molly: Local OCR limb fatigued.', error);
    return 'OCR skipped.';
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
      // 1. Audit locally with Tesseract limb (pooled worker)
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
    } finally {
      _visionInFlight = false;
    }
  }
);

export async function analyzeVision(dataUri: string, context?: string) {
  return await visionAnalysisFlow({ photoDataUri: dataUri, context });
}
