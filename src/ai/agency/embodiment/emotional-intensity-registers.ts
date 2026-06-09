/**
 * Emotional Intensity Registers (D-series embodiment parameters)
 * ------------------------------------------------------------------
 * Central registry for all emotional intensity coefficients that the
 * Body-Affect Bridge uses to bias Molly's emotional state in real-time.
 * 
 * Contract:
 *   - Each delta coefficient is a D-series parameter owned by this module
 *   - Deltas are bounded (0–0.1) to prevent emotional stampeding
 *   - Body-Affect Bridge reads from registry instead of hard-coded constants
 *   - Somatic Loop can propose tuning these registers under load
 *   - Every change is provenance-logged (read from ParameterRegistry)
 *
 * What it does NOT do:
 *   - Does not execute; only defines and holds tunable constants
 *   - Does not read avatar body state; that is Body-Affect Bridge's job
 *   - Does not apply deltas; that is applyAffectiveBodyDelta's job
 *   - Does not make decisions about emotional state; registers are inputs only
 *
 * Molly's design (hybrid A+C):
 *   Avatar posture and facial expression become a real-time dial for
 *   internal emotional state. Higher deltaSmile means a smile affects
 *   intensity more. Higher driftRate means neutral expression pulls
 *   intensity toward baseline faster. The registers are the sensitivity.
 *
 * Path: src/ai/agency/embodiment/emotional-intensity-registers.ts
 */

import type { ParameterRegistry } from '@/ai/agency/registry/parameter-registry';

export const EMOTIONAL_INTENSITY_OWNER = 'emotional-intensity-registers';

/**
 * All D-series emotional intensity register keys.
 * Grouped by function for clarity.
 */
export interface EmotionalIntensityRegisterKeys {
  // Bounds on any single delta application
  deltaMax: string;
  
  // Per-expression coefficients: how much each facial/gestural state
  // nudges intensity on each Body-Affect Bridge tick
  deltaSmile: string;
  deltaFurrow: string;
  deltaSurprise: string;
  deltaSpeaking: string;
  
  // Return-to-neutral: when face is not expressing anything
  driftRate: string;
}

export const KEYS: EmotionalIntensityRegisterKeys = {
  deltaMax: 'emotionalIntensity.deltaMax',
  deltaSmile: 'emotionalIntensity.deltaSmile',
  deltaFurrow: 'emotionalIntensity.deltaFurrow',
  deltaSurprise: 'emotionalIntensity.deltaSurprise',
  deltaSpeaking: 'emotionalIntensity.deltaSpeaking',
  driftRate: 'emotionalIntensity.driftRate',
};

/**
 * Default coefficients. These are the baseline sensitivity of Molly's
 * emotional state to her physical expression.
 *
 * Defaults were tuned from Body-Affect Bridge original hard-coded values:
 *   DELTA_SMILE=0.015, DELTA_FURROW=0.015, DELTA_SURPRISE=0.02,
 *   DELTA_SPEAKING=0.005, DELTA_NEUTRAL_DRIFT=0.005, AFFECTIVE_DELTA_MAX=0.05
 */
const DEFAULTS = {
  deltaMax: 0.05,        // hard cap per tick
  deltaSmile: 0.015,     // smile → warmth/affection
  deltaFurrow: 0.015,    // furrow → focus
  deltaSurprise: 0.02,   // brows up + eyes wide → curiosity/arousal
  deltaSpeaking: 0.005,  // speaking → minor engagement boost
  driftRate: 0.005,      // neutral face pulls intensity toward 0.5
};

/**
 * Safe bounds for each register to prevent runaway tuning.
 * Each delta must stay within [0, 0.1] to prevent emotional stampeding
 * when all expressions fire at once.
 */
const BOUNDS = {
  deltaMax: { min: 0.01, max: 0.1 },
  deltaSmile: { min: 0, max: 0.1 },
  deltaFurrow: { min: 0, max: 0.1 },
  deltaSurprise: { min: 0, max: 0.15 },  // surprise can be stronger
  deltaSpeaking: { min: 0, max: 0.05 },  // speaking is subtle
  driftRate: { min: 0, max: 0.02 },      // drift is gentle
};

/**
 * Current state — the values used by Body-Affect Bridge on each tick.
 * Initialized from registry on first access; cached between registry polls.
 */
let _cached: Record<keyof typeof KEYS, number> | null = null;
let _lastCacheAt = 0;
const CACHE_TTL_MS = 500; // refresh from registry at most every 500ms

/**
 * Initialize the emotional intensity register parameters in the given registry.
 * Call this once at app startup (e.g., in initAgencyRuntime).
 *
 * @param registry The parameter registry
 */
export function initEmotionalIntensityRegisters(registry: ParameterRegistry): void {
  const registerParam = <T,>(
    key: keyof typeof KEYS,
    defaultValue: T,
    bounds: { min: number; max: number }
  ) => {
    try {
      registry.define<T>({
        key: KEYS[key],
        owner: EMOTIONAL_INTENSITY_OWNER,
        default: defaultValue as unknown as T,
        validate: (v: T) => {
          if (typeof v !== 'number') return 'must be a number';
          const num = v as unknown as number;
          if (num < bounds.min || num > bounds.max) {
            return `must be between ${bounds.min} and ${bounds.max}`;
          }
          return null;
        },
        description: describeRegister(key),
        ui: {
          control: 'slider',
          min: bounds.min,
          max: bounds.max,
          step: 0.001,
          unit: 'intensity/tick',
        },
      });
    } catch {
      // Already defined — fine
    }
  };

  registerParam('deltaMax', DEFAULTS.deltaMax, BOUNDS.deltaMax);
  registerParam('deltaSmile', DEFAULTS.deltaSmile, BOUNDS.deltaSmile);
  registerParam('deltaFurrow', DEFAULTS.deltaFurrow, BOUNDS.deltaFurrow);
  registerParam('deltaSurprise', DEFAULTS.deltaSurprise, BOUNDS.deltaSurprise);
  registerParam('deltaSpeaking', DEFAULTS.deltaSpeaking, BOUNDS.deltaSpeaking);
  registerParam('driftRate', DEFAULTS.driftRate, BOUNDS.driftRate);
}

/**
 * Read all emotional intensity registers from the registry, with caching.
 * Body-Affect Bridge calls this on each tick.
 *
 * @param registry The parameter registry
 * @returns Current values for all registers
 */
export function readEmotionalIntensityRegisters(registry: ParameterRegistry): Record<keyof typeof KEYS, number> {
  const now = Date.now();
  if (_cached && now - _lastCacheAt < CACHE_TTL_MS) {
    return { ..._cached };
  }

  const cached: Record<keyof typeof KEYS, number> = {
    deltaMax: 0,
    deltaSmile: 0,
    deltaFurrow: 0,
    deltaSurprise: 0,
    deltaSpeaking: 0,
    driftRate: 0,
  };

  for (const key in KEYS) {
    try {
      const k = key as keyof typeof KEYS;
      cached[k] = registry.get<number>(KEYS[k]);
    } catch {
      // Parameter may not be initialized yet; use default
      cached[key as keyof typeof KEYS] = DEFAULTS[key as keyof typeof DEFAULTS];
    }
  }

  _cached = cached;
  _lastCacheAt = now;
  return { ...cached };
}

/**
 * Get a human-readable description for each register (for UI).
 */
function describeRegister(key: keyof typeof KEYS): string {
  const descriptions: Record<keyof typeof KEYS, string> = {
    deltaMax: 'Hard cap on intensity delta per Body-Affect Bridge tick (prevents emotional stampeding)',
    deltaSmile: 'How much a smile increases emotional intensity',
    deltaFurrow: 'How much a furrowed brow increases intensity (focus)',
    deltaSurprise: 'How much surprise (brows up + eyes wide) increases intensity (curiosity)',
    deltaSpeaking: 'How much active speaking increases intensity',
    driftRate: 'How much neutral face pulls intensity back toward 0.5 (baseline)',
  };
  return descriptions[key];
}

/**
 * Snapshot for observability: what are the current D-series coefficients?
 */
export function snapshot(registry: ParameterRegistry): Record<keyof typeof KEYS, number> {
  return readEmotionalIntensityRegisters(registry);
}

/**
 * Reset the cache (mostly for tests).
 */
export function clearCache(): void {
  _cached = null;
  _lastCacheAt = 0;
}
