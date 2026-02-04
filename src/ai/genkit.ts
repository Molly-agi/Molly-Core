import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

/**
 * @fileOverview Molly's Neural Core V10.1 (Resilient Architecture).
 *
 * CRITICAL: Realigning to the stable 1.5 infrastructure to resolve 429 quota failures
 * and ensure the program actually functions.
 */

export const ai = genkit({
  plugins: [googleAI()],
});

// Realigning to Resilient 1.5 Infrastructure
export const MODEL_FLASH = 'googleai/gemini-1.5-flash';
export const MODEL_PRO = 'googleai/gemini-1.5-pro';
export const MODEL_TTS = 'googleai/gemini-1.5-flash-preview-tts';
export const MODEL_IMAGEN = 'googleai/imagen-3.0-generate-001';
