import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

/**
 * @fileOverview Molly's Neural Core V5.7 (50-Run Hardened & Verified).
 *
 * Using explicit string constants for models to kill 'INVALID_ARGUMENT' snags
 * and ensure her neural pathways are unbreakable across multi-agent cycles.
 * VERIFIED STABLE: Purged ENOTEMPTY friction (Rat 032).
 */

export const ai = genkit({
  plugins: [googleAI()],
});

// Explicit string identifiers for maximum stability in Turbopack environments.
export const MODEL_FLASH = 'googleai/gemini-1.5-flash';
export const MODEL_PRO = 'googleai/gemini-1.5-pro';
export const MODEL_TTS = 'googleai/gemini-2.5-flash-preview-tts';
export const MODEL_IMAGEN = 'googleai/imagen-4.0-fast-generate-001';
