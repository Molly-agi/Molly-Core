import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

/**
 * @fileOverview Molly's Neural Core V7.5 (Neural Hardened).
 *
 * Using canonical aliases to bypass 404 snags.
 * VERIFIED: 'gemini-1.5-flash' and 'gemini-1.5-pro' are the stable targets.
 */

export const ai = genkit({
  plugins: [googleAI()],
});

// Strictly using canonical aliases for maximum reliability.
export const MODEL_FLASH = 'googleai/gemini-1.5-flash';
export const MODEL_PRO = 'googleai/gemini-1.5-pro';
export const MODEL_TTS = 'googleai/gemini-2.5-flash-preview-tts';
export const MODEL_IMAGEN = 'googleai/imagen-4.0-fast-generate-001';
