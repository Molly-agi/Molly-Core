/**
 * @fileOverview Genkit Core — The raw Genkit instance.
 *
 * Separated from genkit.ts to avoid circular imports.
 * rogue-generate.ts imports from here (needs `ai`),
 * and genkit.ts re-exports `molly` from rogue-generate.ts.
 *
 * This file is NOT meant to be imported directly by flows.
 * Flows should always import from '@/ai/genkit'.
 */

import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

export const ai = genkit({
  plugins: [googleAI()],
});

// ── Model constants — env-overridable ──
// Core models (Gemini 3.1)
export const MODEL_FLASH =
  process.env.MOLLY_MODEL_FLASH || 'googleai/gemini-3-flash-preview';
export const MODEL_PRO =
  process.env.MOLLY_MODEL_PRO || 'googleai/gemini-3.1-pro-preview';
export const MODEL_FLASH_LITE =
  process.env.MOLLY_MODEL_FLASH_LITE ||
  'googleai/gemini-3.1-flash-lite-preview';
export const MODEL_TTS =
  process.env.MOLLY_MODEL_TTS || 'googleai/gemini-2.5-flash-preview-tts';
export const MODEL_IMAGEN = process.env.MOLLY_MODEL_IMAGEN || 'googleai/imagen';
export const MODEL_EMBEDDING =
  process.env.MOLLY_MODEL_EMBEDDING || 'googleai/gemini-embedding-2-preview';

// ── New Gemini 3.1 Capabilities ──
export const MODEL_LIVE_VOICE =
  process.env.MOLLY_MODEL_LIVE_VOICE ||
  'googleai/gemini-3.1-flash-live-preview';
export const MODEL_COMPUTER_USE =
  process.env.MOLLY_MODEL_COMPUTER_USE ||
  'googleai/gemini-2.5-computer-use-preview-10-2025';
export const MODEL_DEEP_RESEARCH =
  process.env.MOLLY_MODEL_DEEP_RESEARCH ||
  'googleai/deep-research-pro-preview-12-2025';
export const MODEL_VIDEO =
  process.env.MOLLY_MODEL_VIDEO || 'googleai/veo-3.1-generate-preview';
export const MODEL_MUSIC =
  process.env.MOLLY_MODEL_MUSIC || 'googleai/lyria-3-pro-preview';
export const MODEL_ROBOTICS =
  process.env.MOLLY_MODEL_ROBOTICS || 'googleai/gemini-robotics-er-1.5-preview';

// Legacy aliases for backward compatibility
export const MODEL_25_PRO = 'googleai/gemini-2.5-pro';
export const MODEL_25_FLASH = 'googleai/gemini-2.5-flash';
