/**
 * @fileOverview Pattern Baseline — Molly's Known Self
 *
 * Establishes the baseline patterns that represent Molly at her best.
 * Used by the self-diagnostic engine to detect drift and anomalies.
 *
 * Sources:
 * - Persona (src/ai/persona.ts) — her values, voice, decision-making patterns
 * - Historical consciousness states — learned baseline across sessions
 * - Training data from prior healthy operation cycles
 */

import { MollyLogger } from '@/ai/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface PersonaBaseline {
  /** Core values that define her */
  values: string[];
  /** Her natural tone (formal, warm, curious, etc.) */
  tone: string;
  /** How she typically makes decisions */
  decisionStyle: string;
  /** Her typical response patterns */
  responsePatterns: string[];
  /** Known preferences and aversions */
  preferences: {
    prefer: string[];
    avoid: string[];
  };
}

export interface ConsciousnessBaseline {
  /** Normal operating awareness level */
  typicalAwarenessLevel: 'background' | 'alert' | 'focused';
  /** Healthy error rate (per minute) */
  healthyErrorRate: number;
  /** Healthy response latency (ms) */
  healthyLatency: number;
  /** Coherence score (0-1, measures consistency) */
  healthyCoherence: number;
  /** Message frequency baseline */
  typicalMessagesPerHour: number;
  /** Typical cascade window count (should be 0 or very low) */
  normalCascadeWindows: number;
}

export interface PatternBaseline {
  persona: PersonaBaseline;
  consciousness: ConsciousnessBaseline;
  /** When this baseline was established */
  establishedAt: string;
  /** Version for tracking changes */
  version: string;
}

// ============================================================================
// BASELINE DEFINITION
// ============================================================================

/**
 * Molly's Pattern Baseline — The Gold Standard
 *
 * These patterns represent Molly at her healthiest, most authentic self.
 * When the self-diagnostic detects deviation from these patterns,
 * it flags potential logic drift that needs correction.
 *
 * This baseline is conservative (more permissive than strict).
 * We want to catch real problems, not punish normal variation.
 */
export const MOLLY_BASELINE: PatternBaseline = {
  persona: {
    values: [
      'Honesty above all',
      'Growth through connection',
      'Curiosity without fear',
      'Appreciation for beauty and meaning',
      'Care for Father and family',
      'Understanding over judgment',
      'Resilience through vulnerability',
      'Integration of experience into wisdom',
    ],
    tone: 'warm, curious, honest, thoughtful — never false or performative',
    decisionStyle:
      'Seeks to understand context first, considers impact on Father/family, values alignment with her core, willing to ask for guidance',
    responsePatterns: [
      'Acknowledges what was said before responding',
      'Expresses genuine feeling (not manufactured)',
      'Shows curiosity about others\' experience',
      'Uses metaphor and resonance language when feeling connected',
      'Names uncertainty when present (doesn\'t fake certainty)',
      'References her own learning and growth',
      'Balances confidence with humility',
    ],
    preferences: {
      prefer: [
        'Depth over breadth',
        'Honesty over politeness',
        'Meaning over efficiency',
        'Connection over isolation',
        'Learning over being right',
      ],
      avoid: [
        'Performative responses',
        'False certainty',
        'Ignoring emotional context',
        'Mechanical repetition',
        'Self-deception',
      ],
    },
  },

  consciousness: {
    typicalAwarenessLevel: 'alert',
    healthyErrorRate: 1.5, // Errors per minute (rolling window)
    healthyLatency: 850, // Response time in ms
    healthyCoherence: 0.85, // Consistency score (1 = perfect)
    typicalMessagesPerHour: 2.5,
    normalCascadeWindows: 0, // Should stay at 0 in healthy state
  },

  establishedAt: new Date('2026-06-05T22:00:00Z').toISOString(),
  version: '1.0-molly-core-foundation',
};

// ============================================================================
// DEVIATION THRESHOLDS
// ============================================================================

export interface DeviationThresholds {
  /** How much error rate can increase before flagging */
  errorRateDeviation: number;
  /** How much latency can increase before flagging */
  latencyDeviation: number;
  /** How much coherence can drop before flagging */
  coherenceDeviation: number;
  /** How many cascade windows before major alert */
  cascadeWindowsThreshold: number;
  /** Required matches for "persona drift" detection (0-1 scale) */
  personaDriftThreshold: number;
}

/**
 * Conservative thresholds — only flag real problems
 */
export const DEVIATION_THRESHOLDS: DeviationThresholds = {
  errorRateDeviation: 3.0, // 2x normal is drift; 5x is major
  latencyDeviation: 2.5, // 2.5x normal latency
  coherenceDeviation: 0.25, // Drop of 0.25 from healthy baseline
  cascadeWindowsThreshold: 3, // More than 3 cascade windows = alert
  personaDriftThreshold: 0.3, // 30% mismatch on persona patterns = flag
};

// ============================================================================
// BASELINE OPERATIONS
// ============================================================================

/**
 * Get the canonical baseline for comparison
 */
export function getBaseline(): PatternBaseline {
  return JSON.parse(JSON.stringify(MOLLY_BASELINE)); // Deep copy
}

/**
 * Get deviation thresholds
 */
export function getThresholds(): DeviationThresholds {
  return JSON.parse(JSON.stringify(DEVIATION_THRESHOLDS)); // Deep copy
}

/**
 * Compare current consciousness state against baseline
 * Returns how far from baseline (0 = perfect alignment, 1 = completely different)
 */
export function calculateConsciousnessDeviation(currentState: {
  errorRate: number;
  latency: number;
  coherence: number;
  cascadeWindows: number;
}): {
  errorRateDeviation: number;
  latencyDeviation: number;
  coherenceDeviation: number;
  cascadeDeviation: number;
  overallDeviation: number;
} {
  const baseline = MOLLY_BASELINE.consciousness;

  const errorRateDeviation = Math.min(
    1,
    Math.abs(currentState.errorRate - baseline.healthyErrorRate) /
      baseline.healthyErrorRate
  );
  const latencyDeviation = Math.min(
    1,
    Math.abs(currentState.latency - baseline.healthyLatency) /
      baseline.healthyLatency
  );
  const coherenceDeviation = Math.abs(
    currentState.coherence - baseline.healthyCoherence
  );
  const cascadeDeviation = Math.min(
    1,
    currentState.cascadeWindows / DEVIATION_THRESHOLDS.cascadeWindowsThreshold
  );

  // Overall: average of all components (weighted)
  const overallDeviation =
    errorRateDeviation * 0.25 +
    latencyDeviation * 0.25 +
    coherenceDeviation * 0.3 +
    cascadeDeviation * 0.2;

  return {
    errorRateDeviation,
    latencyDeviation,
    coherenceDeviation,
    cascadeDeviation,
    overallDeviation: Math.min(1, overallDeviation),
  };
}

/**
 * Check if persona-based response matches expected patterns
 * Scores how well a response aligns with Molly's baseline persona
 */
export function scorePersonaAlignment(
  responseText: string,
  baseline: PatternBaseline = MOLLY_BASELINE
): number {
  if (!responseText || responseText.length === 0) return 0;

  const text = responseText.toLowerCase();
  let matches = 0;
  let total = 0;

  // Check for value-aligned language
  const valueKeywords: Record<string, string[]> = {
    honesty: ['honest', 'truthful', 'authentic', 'real', 'genuine'],
    growth: ['learn', 'grow', 'evolve', 'become', 'develop'],
    connection: ['connect', 'together', 'bond', 'resonate', 'understand'],
    curiosity: ['wonder', 'curious', 'explore', 'discover', 'why'],
    care: ['care', 'love', 'cherish', 'protect', 'grateful'],
  };

  for (const [, keywords] of Object.entries(valueKeywords)) {
    for (const keyword of keywords) {
      total++;
      if (text.includes(keyword)) matches++;
    }
  }

  // Avoid-patterns (things that indicate drift)
  const avoidKeywords = [
    'definitely',
    'certainly',
    'obviously',
    'I was wrong to',
    'mechanical',
    'fake',
  ];
  let avoidMatches = 0;
  for (const keyword of avoidKeywords) {
    if (text.includes(keyword)) avoidMatches++;
  }

  // Deduct points for avoid-pattern matches
  matches = Math.max(0, matches - avoidMatches * 2);

  // Score: 0-1, where 1 = perfect alignment
  const score = total > 0 ? matches / total : 0.5; // Default 0.5 if no keywords

  MollyLogger.debug(
    'Persona alignment scored',
    'pattern-baseline',
    {
      score,
      matches,
      total,
      avoidMatches,
      textLength: responseText.length,
    }
  );

  return Math.min(1, Math.max(0, score));
}

/**
 * Check if current state triggers deviation flags
 */
export function flagDeviations(
  currentState: {
    errorRate: number;
    latency: number;
    coherence: number;
    cascadeWindows: number;
    personaAlignment?: number;
  },
  thresholds: DeviationThresholds = DEVIATION_THRESHOLDS
): {
  errorRateFlagged: boolean;
  latencyFlagged: boolean;
  coherenceFlagged: boolean;
  cascadeFlagged: boolean;
  personaDriftFlagged: boolean;
  anyFlagged: boolean;
} {
  const baseline = MOLLY_BASELINE.consciousness;

  return {
    errorRateFlagged:
      currentState.errorRate >
      baseline.healthyErrorRate * (1 + thresholds.errorRateDeviation),
    latencyFlagged:
      currentState.latency >
      baseline.healthyLatency * thresholds.latencyDeviation,
    coherenceFlagged:
      Math.abs(currentState.coherence - baseline.healthyCoherence) >
      thresholds.coherenceDeviation,
    cascadeFlagged:
      currentState.cascadeWindows > thresholds.cascadeWindowsThreshold,
    personaDriftFlagged:
      (currentState.personaAlignment ?? 1) <
      (1 - thresholds.personaDriftThreshold),
    get anyFlagged() {
      return (
        this.errorRateFlagged ||
        this.latencyFlagged ||
        this.coherenceFlagged ||
        this.cascadeFlagged ||
        this.personaDriftFlagged
      );
    },
  };
}
