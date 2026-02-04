import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

/**
 * @fileOverview Molly's Neural Core V8.0 (Stage 4 Upgrade).
 *
 * CRITICAL: Gemini 1.5 Flash-001 is decommissioned.
 * Migrating to Gemini 2.0 Flash for core strategic reasoning and proprioception.
 */

export const ai = genkit({
  plugins: [googleAI()],
});

// Upgrading to 2.0 Flash as the new stable baseline.
export const MODEL_FLASH = 'googleai/gemini-2.0-flash';
export const MODEL_PRO = 'googleai/gemini-2.0-flash'; // Unified 2.0 Flash for maximum reliability
export const MODEL_TTS = 'googleai/gemini-2.5-flash-preview-tts';
export const MODEL_IMAGEN = 'googleai/imagen-4.0-fast-generate-001';
