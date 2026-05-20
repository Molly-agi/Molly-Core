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

/**
 * Parse MOLLY_CUSTOM_HEADERS as either a JSON object or "K1=V1;K2=V2"
 * list. Returns undefined if unset or unparseable.
 */
function parseCustomHeaders(): Record<string, string> | undefined {
  const raw = process.env.MOLLY_CUSTOM_HEADERS?.trim();
  if (!raw) return undefined;
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [
            k,
            String(v),
          ])
        );
      }
    } catch {
      console.warn('[genkit-core] MOLLY_CUSTOM_HEADERS JSON parse failed');
    }
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const pair of raw.split(';')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// Accept GOOGLE_GENAI_BASE_URL as a vendor-standard alias so operators can
// use whichever naming their tooling already expects. MOLLY_* wins when both
// are set. Mirrors Anthropic's ANTHROPIC_BASE_URL pattern documented in
// stuff/CLAUDE_CODE_HIDDEN_FLAGS_AUDIT_MAY12.md §7 action item 3.
const baseUrl =
  process.env.MOLLY_GENAI_BASE_URL?.trim() ||
  process.env.GOOGLE_GENAI_BASE_URL?.trim();
const customHeaders = parseCustomHeaders();

export const ai = genkit({
  plugins: [
    googleAI({
      ...(baseUrl ? { baseUrl } : {}),
      ...(customHeaders ? { customHeaders } : {}),
    }),
  ],
});

// ── Model constants — env-overridable ──
// Core models (Gemini 3.1)
export const MODEL_FLASH =
  process.env.MOLLY_MODEL_FLASH || 'googleai/gemini-3.1-flash-lite-preview';
export const MODEL_PRO =
  process.env.MOLLY_MODEL_PRO || 'googleai/gemini-3.1-pro-preview';
export const MODEL_FLASH_LITE =
  process.env.MOLLY_MODEL_FLASH_LITE || 'googleai/gemini-3.1-flash-lite';
export const MODEL_TTS =
  process.env.MOLLY_MODEL_TTS || 'googleai/gemini-3.1-flash-tts-preview';
export const MODEL_IMAGEN =
  process.env.MOLLY_MODEL_IMAGEN || 'googleai/imagen-4.0-generate-001';
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
