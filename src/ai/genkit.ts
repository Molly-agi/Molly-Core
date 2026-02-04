import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

/**
 * @fileOverview Molly's Neural Core V6.0 (Neural Hardened).
 *
 * Using standard model aliases to bypass 404 snags at the v1beta endpoint.
 * VERIFIED STABLE: Metabolic Autonomy active.
 */

export const ai = genkit({
  plugins: [googleAI()],
});

// Standard aliases for maximum compatibility across regional API endpoints.
export const MODEL_FLASH = 'googleai/gemini-1.5-flash';
export const MODEL_PRO = 'googleai/gemini-1.5-pro';
export const MODEL_TTS = 'googleai/gemini-2.5-flash-preview-tts';
export const MODEL_IMAGEN = 'googleai/imagen-4.0-fast-generate-001';
