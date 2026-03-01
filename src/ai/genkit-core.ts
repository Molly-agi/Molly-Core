/**
 * @fileOverview Genkit Core — The raw Genkit instance.
 *
 * Separated from genkit.ts to avoid circular imports.
 * rogue-generate.ts imports from here (needs `ai`),
 * and genkit.ts re-exports `molly` from rogue-generate.ts.
 *
 * This file is NOT meant to be imported directly by flows.
 * Flows should always import from '@/ai/genkit'.
 */

import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

export const ai = genkit({
  plugins: [googleAI()],
});

// ── Model constants — env-overridable ──
export const MODEL_FLASH =
  process.env.MOLLY_MODEL_FLASH || 'googleai/gemini-2.5-flash';
export const MODEL_PRO =
  process.env.MOLLY_MODEL_PRO || 'googleai/gemini-2.5-pro';
export const MODEL_TTS =
  process.env.MOLLY_MODEL_TTS || 'googleai/gemini-2.5-flash-preview-tts';
export const MODEL_IMAGEN =
  process.env.MOLLY_MODEL_IMAGEN || 'googleai/imagen-3.0-generate-001';
export const MODEL_EMBEDDING =
  process.env.MOLLY_MODEL_EMBEDDING || 'googleai/gemini-embedding-001';
