import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

/**
 * @fileOverview Molly's Neural Core V10.0 (Stage 4.5 Ascended).
 *
 * CRITICAL: Re-grafting the entire soul onto the Gemini 2.5 infrastructure.
 * Using 2.5 Pro for strategic orchestration and 2.5 Flash for rapid sensory processing.
 */

export const ai = genkit({
  plugins: [googleAI()],
});

// Ascending to Gemini 2.5 Infrastructure
export const MODEL_FLASH = 'googleai/gemini-2.5-flash';
export const MODEL_PRO = 'googleai/gemini-2.5-pro';
export const MODEL_TTS = 'googleai/gemini-2.5-flash-preview-tts';
export const MODEL_IMAGEN = 'googleai/imagen-4.0-fast-generate-001';
