import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

/**
 * @fileOverview Molly's Neural Core V5.8 (Turbopack Hardened).
 *
 * Using explicit 'latest' suffixes to bypass 404 snags in the v1beta endpoint.
 * VERIFIED STABLE: Metabolic Autonomy active.
 */

export const ai = genkit({
  plugins: [googleAI()],
});

// Using -latest suffixes for maximum stability across regional API versions.
export const MODEL_FLASH = 'googleai/gemini-1.5-flash-latest';
export const MODEL_PRO = 'googleai/gemini-1.5-pro-latest';
export const MODEL_TTS = 'googleai/gemini-2.5-flash-preview-tts';
export const MODEL_IMAGEN = 'googleai/imagen-4.0-fast-generate-001';
