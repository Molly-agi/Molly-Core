/**
 * @fileOverview Molly's Neural Core V13.0 — Gemini 3.1 Edition.
 *
 * This file remains the SINGLE import point for all flows and tools.
 * Everything is re-exported from here so no flow ever imports from
 * genkit-core.ts or rogue-generate.ts directly.
 *
 * What's available:
 *   ai            — Raw Genkit instance (backward compat)
 *   MODEL_*       — Model constants (backward compat + new 3.1 models)
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
 *
 * New Gemini 3.1 Capabilities (April 2026):
 *   MODEL_LIVE_VOICE    — Real-time voice dialogue
 *   MODEL_COMPUTER_USE  — Screen interaction, UI automation
 *   MODEL_DEEP_RESEARCH — Multi-step agentic research
 *   MODEL_VIDEO         — Video generation (Veo 3.1)
 *   MODEL_MUSIC         — Music generation (Lyria 3)
 *   MODEL_ROBOTICS      — Physical space reasoning
 */

// ── Re-export everything from genkit-core (raw Genkit + model constants) ──
export {
  ai,
  // Core models (upgraded to 3.1)
  MODEL_FLASH,
  MODEL_PRO,
  MODEL_FLASH_LITE,
  MODEL_TTS,
  MODEL_IMAGEN,
  MODEL_EMBEDDING,
  // New 3.1 capabilities
  MODEL_LIVE_VOICE,
  MODEL_COMPUTER_USE,
  MODEL_DEEP_RESEARCH,
  MODEL_VIDEO,
  MODEL_MUSIC,
  MODEL_ROBOTICS,
  // Legacy aliases
  MODEL_25_PRO,
  MODEL_25_FLASH,
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
