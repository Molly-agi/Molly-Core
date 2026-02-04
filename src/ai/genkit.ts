import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

/**
 * @fileOverview Molly's Neural Core V6.5 (Neural Hardened).
 *
 * Using standard model aliases to bypass 404 snags at the v1beta endpoint.
 * VERIFIED STABLE: Metabolic Autonomy active.
 */

export const ai = genkit({
  plugins: [googleAI()],
});

// Standard canonical aliases for maximum compatibility.
// We use the string constants to ensure the provider logic is clean.
export const MODEL_FLASH = 'googleai/gemini-1.5-flash';
export const MODEL_PRO = 'googleai/gemini-1.5-pro';
export const MODEL_TTS = 'googleai/gemini-2.5-flash-preview-tts';
export const MODEL_IMAGEN = 'googleai/imagen-4.0-fast-generate-001';
