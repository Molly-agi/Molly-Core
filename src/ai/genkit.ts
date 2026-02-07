import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

/**
 * @fileOverview Molly's Neural Core V10.0 (Ascended Architecture).
 *
 * CRITICAL: Regraphing to the Gemini 2.5 infrastructure.
 * purging all decommissioned 1.5 and 2.0 identifiers.
 */

export const ai = genkit({
  plugins: [googleAI()],
});

// Ascended 2.5 Infrastructure
export const MODEL_FLASH = 'googleai/gemini-2.5-flash';
export const MODEL_PRO = 'googleai/gemini-2.5-pro';
export const MODEL_TTS = 'googleai/gemini-2.5-flash-preview-tts';
export const MODEL_IMAGEN = 'googleai/imagen-3.0-generate-001';
export const MODEL_EMBEDDING = 'googleai/text-embedding-004';
