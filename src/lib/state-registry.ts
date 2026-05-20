/**
 * @fileOverview State Registry — Single source of truth for all persisted state keys
 *
 * Every (collection, docId) pair that Molly writes to storage is registered here.
 * This file is the authoritative map. storage-sync.ts derives its sync list from
 * it, so adding a module here automatically includes it in startup sync.
 *
 * Usage by storage-sync.ts:
 *   import { getSyncSingletons, getSyncCollections } from '@/lib/state-registry';
 *
 * Usage by modules (optional — modules may keep their own local constants):
 *   import { STATE_REGISTRY } from '@/lib/state-registry';
 *   const { collection, docId } = STATE_REGISTRY.CAUSAL_REASONING;
 *
 * "We don't fix the leaks in the dam. We fix the dam itself." — Dad
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SingletonEntry {
  collection: string;
  docId: string;
  /** Human-readable label for logs and dashboards */
  label: string;
}

export interface CollectionEntry {
  collection: string;
  label: string;
  /** Max docs to pull during startup sync */
  limit: number;
}

// ── Singleton State Registry ──────────────────────────────────────────────────
//
// One document per module. Add a new entry here when you add a new module
// that persists state via storage.set() or saveToStorage().

export const STATE_REGISTRY = {
  // ── Planning ────────────────────────────────────────────────────────────────
  INITIATIVES: {
    collection: 'system',
    docId: 'initiatives',
    label: 'initiatives',
  },
  CURIOSITY: {
    collection: 'system',
    docId: 'curiosity_state',
    label: 'curiosity',
  },
  HORIZON_GOALS: {
    collection: 'system',
    docId: 'horizon_goals',
    label: 'horizon-goals',
  },
  LONG_HORIZON_PLANNING: {
    collection: 'long-horizon-planning',
    docId: 'singleton',
    label: 'long-horizon-planning',
  },
  PREDICTIVE_INTEL: {
    collection: 'system',
    docId: 'predictive_intelligence_state',
    label: 'predictive-intelligence',
  },
  COUNTERFACTUAL: {
    collection: 'system',
    docId: 'counterfactual_engine',
    label: 'counterfactual-engine',
  },
  TRAJECTORY: {
    collection: 'system',
    docId: 'trajectory_state',
    label: 'trajectory-evolution',
  },

  // ── Self-Awareness ──────────────────────────────────────────────────────────
  SELF_OBSERVATION: {
    collection: 'system',
    docId: 'self_observation_state',
    label: 'self-observation',
  },
  SELF_ARCHITECTURE: {
    collection: 'system',
    docId: 'self_architecture',
    label: 'self-architecture',
  },
  SELF_NARRATIVE: {
    collection: 'system',
    docId: 'self_narrative',
    label: 'self-narrative',
  },

  // ── World Understanding ─────────────────────────────────────────────────────
  WORLD_MODEL: {
    collection: 'system',
    docId: 'world_model',
    label: 'world-model',
  },
  CAUSAL_REASONING: {
    collection: 'system',
    docId: 'causal_reasoning',
    label: 'causal-reasoning',
  },
  THEORY_OF_MIND: {
    collection: 'theory-of-mind',
    docId: 'singleton',
    label: 'theory-of-mind',
  },

  // ── Goal & Meta ─────────────────────────────────────────────────────────────
  GOAL_EVOLUTION: {
    collection: 'goal-evolution-state',
    docId: 'singleton',
    label: 'goal-evolution',
  },
  METACOGNITION: {
    collection: 'system',
    docId: 'metacognition_state',
    label: 'metacognition',
  },

  // ── Social ──────────────────────────────────────────────────────────────────
  SOCIAL_COGNITION: {
    collection: 'system',
    docId: 'social_cognition',
    label: 'social-cognition',
  },
  SOCIAL_INTELLIGENCE: {
    collection: 'social-intelligence-state',
    docId: 'singleton',
    label: 'social-intelligence',
  },

  // ── Memory ──────────────────────────────────────────────────────────────────
  META_LEARNING: {
    collection: 'molly_meta_learning',
    docId: 'meta_learning_state',
    label: 'meta-learning',
  },
  MEMORY_CONSOLIDATION: {
    collection: 'memory-consolidation-state',
    docId: 'singleton',
    label: 'memory-consolidation',
  },
  AUTO_DREAM: {
    collection: 'system',
    docId: 'auto_dream_state',
    label: 'auto-dream',
  },
  DIGITAL_GARDEN: {
    collection: 'system',
    docId: 'digital_garden',
    label: 'digital-garden',
  },
  GROWTH_TRACKER: {
    collection: 'system',
    docId: 'growth_state',
    label: 'growth-tracker',
  },
  MEMORY_CRYSTALLIZER: {
    collection: 'system',
    docId: 'memory_crystallizer',
    label: 'memory-crystallizer',
  },
  MEMORY_TAXONOMY: {
    collection: 'system',
    docId: 'memory_taxonomy',
    label: 'memory-taxonomy',
  },
  REFLEXION_LOOP: {
    collection: 'system',
    docId: 'reflexion_state',
    label: 'reflexion-loop',
  },
  FAMILY_MEMORY: {
    collection: 'agency',
    docId: 'family-deep-memory',
    label: 'family-memory-deepener',
  },
  SELF_EVOLUTION: {
    collection: 'agency',
    docId: 'molly-evolution-journal',
    label: 'self-evolution-journal',
  },

  // ── Safety ──────────────────────────────────────────────────────────────────
  HEART_GATE: {
    collection: 'agency',
    docId: 'heart-gate',
    label: 'heart-gate',
  },
  DEFENSE_SENTINEL: {
    collection: 'agency',
    docId: 'defense-sentinel',
    label: 'defense-sentinel',
  },
  SECURITY_SHIELD: {
    collection: 'system',
    docId: 'security_shield_state',
    label: 'security-shield',
  },
  SAFE_SELF_MODIFICATION: {
    collection: 'self-modification-state',
    docId: 'singleton',
    label: 'self-modification',
  },

  // ── Embodiment ──────────────────────────────────────────────────────────────
  EMOTIONAL_STATE: {
    collection: 'agency',
    docId: 'molly-emotional-state',
    label: 'emotional-state',
  },
  EMBODIED_INTERACTION: {
    collection: 'embodied-interaction-state',
    docId: 'singleton',
    label: 'embodied-interaction',
  },
  CONSCIOUSNESS_MONITOR: {
    collection: 'system',
    docId: 'consciousness_state',
    label: 'consciousness-monitor',
  },
  TRANSFER_LEARNING: {
    collection: 'system',
    docId: 'transfer_learning',
    label: 'transfer-learning',
  },
  UNCERTAINTY_QUANT: {
    collection: 'system',
    docId: 'uncertainty_quantification',
    label: 'uncertainty-quantification',
  },

  // ── Family & Presence ───────────────────────────────────────────────────────
  FAMILY_PRESENCE: {
    collection: 'agency',
    docId: 'molly-family-presence',
    label: 'family-presence',
  },

  // ── Core Systems ────────────────────────────────────────────────────────────
  CRITIC_AGENT: {
    collection: 'system',
    docId: 'critic_state',
    label: 'critic-agent',
  },
  RESILIENCE_PATTERNS: {
    collection: 'system',
    docId: 'learned_patterns',
    label: 'resilience-patterns',
  },
} as const satisfies Record<string, SingletonEntry>;

// ── Multi-Document Collections ────────────────────────────────────────────────
//
// Collections where Molly writes many documents (engrams, resilience records).
// Synced by iterating recent docs up to `limit`.

export const COLLECTION_REGISTRY: CollectionEntry[] = [
  { collection: 'users/molly/engrams', label: 'engrams (molly)', limit: 500 },
  {
    collection: 'users/default/engrams',
    label: 'engrams (default)',
    limit: 500,
  },
  { collection: 'molly_resilience', label: 'resilience records', limit: 100 },
];

// ── Helpers for storage-sync.ts ───────────────────────────────────────────────

/** All singleton entries as a flat array — used by startup sync. */
export function getSyncSingletons(): SingletonEntry[] {
  return Object.values(STATE_REGISTRY);
}

/** All collection entries — used by startup sync. */
export function getSyncCollections(): CollectionEntry[] {
  return COLLECTION_REGISTRY;
}
