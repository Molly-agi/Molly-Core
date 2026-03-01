/**
 * @fileOverview Molly's Neural Core V12.0 — Rogue Protocol Live Edition.
 *
 * This file remains the SINGLE import point for all flows and tools.
 * Everything is re-exported from here so no flow ever imports from
 * genkit-core.ts or rogue-generate.ts directly.
 *
 * What's available:
 *   ai            — Raw Genkit instance (backward compat)
 *   MODEL_*       — Model constants (backward compat)
 *   molly         — Rogue-aware generate wrapper (new)
 *   TaskType      — What kind of thinking is needed (new)
 *   getModelRouter — Access the router directly (advanced)
 *
 * Migration path for flows:
 *   Before:  import { ai, MODEL_FLASH } from '@/ai/genkit';
 *            await ai.generate({ model: MODEL_FLASH, prompt });
 *
 *   After:   import { molly, TaskType } from '@/ai/genkit';
 *            await molly.generate(TaskType.CHAT, { prompt });
 */

// ── Re-export everything from genkit-core (raw Genkit + model constants) ──
export {
  ai,
  MODEL_FLASH,
  MODEL_PRO,
  MODEL_TTS,
  MODEL_IMAGEN,
  MODEL_EMBEDDING,
} from './genkit-core';

// ── Rogue Protocol — Model Abstraction Layer ──
export {
  TaskType,
  getModelRouter,
  type ModelProvider,
  type RoutingDecision,
  type RoutingConfig,
} from './model-router';

// ── Rogue-Aware Generate Wrapper ──
export { molly } from './rogue-generate';
