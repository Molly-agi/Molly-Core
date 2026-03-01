import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

/**
 * @fileOverview Molly's Neural Core V11.0 — Rogue Protocol Edition.
 *
 * This file remains the single import point for all flows and tools.
 * The MODEL_* constants are preserved for backward compatibility.
 * The ModelRouter (Rogue Protocol) is available for flows that want
 * intelligent multi-provider routing with fallback chains.
 *
 * Migration path:
 *   Phase 1 (current): MODEL_* constants work as before. Router is opt-in.
 *   Phase 2 (future):  Flows call getModelRouter().getModel(TaskType.X)
 *   Phase 3 (future):  MODEL_* constants delegate to router internally
 */

export const ai = genkit({
  plugins: [googleAI()],
});

// ── Ascended 2.5 Infrastructure — env-overridable for fast model migration ──
// These constants are PRESERVED for backward compatibility.
// All 35 existing consumers continue to work unchanged.
export const MODEL_FLASH =
  process.env.MOLLY_MODEL_FLASH || 'googleai/gemini-2.5-flash';
export const MODEL_PRO =
  process.env.MOLLY_MODEL_PRO || 'googleai/gemini-2.5-pro';
export const MODEL_TTS =
  process.env.MOLLY_MODEL_TTS || 'googleai/gemini-2.5-flash-preview-tts';
export const MODEL_IMAGEN =
  process.env.MOLLY_MODEL_IMAGEN || 'googleai/imagen-3.0-generate-001';
export const MODEL_EMBEDDING =
  process.env.MOLLY_MODEL_EMBEDDING || 'googleai/gemini-embedding-001';

// ── Rogue Protocol — Model Abstraction Layer ──
// Re-export everything flows need to opt into intelligent routing.
export {
  TaskType,
  getModelRouter,
  type ModelProvider,
  type RoutingDecision,
  type RoutingConfig,
} from './model-router';
