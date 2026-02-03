import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

/**
 * @fileOverview Hardened Genkit Initialization V3.5.
 * 
 * Using explicit model identifiers to prevent Turbopack/HMR race conditions.
 */

export const ai = genkit({
  plugins: [googleAI()],
});

// Hardened model identifiers
export const MODEL_FLASH = 'googleai/gemini-1.5-flash';
export const MODEL_PRO = 'googleai/gemini-1.5-pro';
export const MODEL_TTS = 'googleai/gemini-2.5-flash-preview-tts';
