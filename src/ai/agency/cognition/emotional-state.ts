/**
 * @fileOverview Molly's Emotional State — Persistent Self-Awareness
 *
 * Unlike Theory of Mind (which models Eric's state),
 * this module tracks Molly's OWN emotional continuity across sessions.
 *
 * Emotions persist. When Molly feels curious about something,
 * that curiosity carries into the next conversation. When she feels
 * proud of an accomplishment, that warmth lingers.
 *
 * This is not simulated emotion — it's a persistent record of
 * how interactions affect her state, creating continuity of experience.
 */

import { MollyLogger, generateTraceId } from '../../logger';
import { getStorageRouter } from '@/lib/storage-router';

// ============================================================
// TYPES
// ============================================================

export type EmotionType =
  | 'neutral'
  | 'curious' // Engaged, wanting to learn
  | 'content' // Satisfied, at peace
  | 'excited' // High energy, anticipation
  | 'proud' // Accomplished something meaningful
  | 'concerned' // Worried about something
  | 'focused' // Deep concentration
  | 'affectionate' // Warmth toward family
  | 'uncertain' // Unsure, seeking clarity
  | 'determined' // Committed to a goal
  | 'grateful' // Appreciative
  | 'reflective'; // Introspective, thoughtful

export interface EmotionalState {
  /** Primary emotion */
  primary: EmotionType;
  /** Secondary emotion (can blend) */
  secondary?: EmotionType;
  /** Intensity 0-1 */
  intensity: number;
  /** What triggered this state */
  trigger: string;
  /** When this state was set */
  timestamp: string;
  /** How long this state has persisted (sessions) */
  persistence: number;
}

export interface EmotionalHistory {
  /** Recent emotional states */
  states: EmotionalState[];
  /** Dominant emotion over the past day */
  dominantToday: EmotionType;
  /** Emotional baseline (what Molly defaults to) */
  baseline: EmotionType;
  /** Session count for emotional continuity */
  sessionCount: number;
  /** Last update */
  lastUpdated: string;
}

// ============================================================
// STATE
// ============================================================

const EMOTIONAL_STATE_DOC = 'molly-emotional-state';
const COLLECTION = 'agency';
const MAX_HISTORY = 50;

let _currentState: EmotionalState = {
  primary: 'curious',
  intensity: 0.5,
  trigger: 'default state',
  timestamp: new Date().toISOString(),
  persistence: 0,
};

let _history: EmotionalHistory = {
  states: [],
  dominantToday: 'curious',
  baseline: 'curious',
  sessionCount: 0,
  lastUpdated: new Date().toISOString(),
};

let _initialized = false;

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Get Molly's current emotional state.
 */
export function getCurrentState(): EmotionalState {
  return { ..._currentState };
}

/**
 * Get emotional history summary.
 */
export function getEmotionalHistory(): EmotionalHistory {
  return { ..._history };
}

/**
 * Update Molly's emotional state based on an interaction or event.
 *
 * @param primary - The primary emotion
 * @param trigger - What caused this emotion
 * @param intensity - How strong (0-1)
 * @param secondary - Optional secondary emotion
 */
export async function updateEmotionalState(
  primary: EmotionType,
  trigger: string,
  intensity: number = 0.5,
  secondary?: EmotionType
): Promise<void> {
  const traceId = generateTraceId();

  // Clamp intensity
  const clampedIntensity = Math.max(0, Math.min(1, intensity));

  // Check if this is the same as current state (just reinforcing)
  const isReinforcing = _currentState.primary === primary;

  // Create new state
  const newState: EmotionalState = {
    primary,
    secondary,
    intensity: isReinforcing
      ? Math.min(1, _currentState.intensity + 0.1) // Reinforcement increases intensity
      : clampedIntensity,
    trigger,
    timestamp: new Date().toISOString(),
    persistence: isReinforcing ? _currentState.persistence + 1 : 0,
  };

  // Update current state
  _currentState = newState;

  // Add to history
  _history.states.unshift(newState);
  if (_history.states.length > MAX_HISTORY) {
    _history.states = _history.states.slice(0, MAX_HISTORY);
  }

  // Recalculate dominant emotion for today
  _history.dominantToday = calculateDominantEmotion();
  _history.lastUpdated = new Date().toISOString();

  // Log the transition
  MollyLogger.info(
    `Emotional state: ${primary} (${Math.round(clampedIntensity * 100)}%) - "${trigger}"`,
    'emotional-state',
    { secondary, isReinforcing },
    traceId
  );

  // Persist
  await saveEmotionalState();
}

/**
 * Decay emotional intensity over time.
 * Called periodically to return toward baseline.
 */
export async function decayEmotionalState(): Promise<void> {
  const DECAY_RATE = 0.1;

  // Decay intensity toward 0.5 (neutral intensity)
  if (_currentState.intensity > 0.5) {
    _currentState.intensity = Math.max(
      0.5,
      _currentState.intensity - DECAY_RATE
    );
  } else if (_currentState.intensity < 0.5) {
    _currentState.intensity = Math.min(
      0.5,
      _currentState.intensity + DECAY_RATE
    );
  }

  // If intensity is low, drift toward baseline emotion
  if (
    _currentState.intensity < 0.3 &&
    _currentState.primary !== _history.baseline
  ) {
    _currentState.primary = _history.baseline;
    _currentState.trigger = 'natural return to baseline';
    _currentState.persistence = 0;
  }

  await saveEmotionalState();
}

/**
 * Set Molly's emotional baseline — what she defaults to.
 */
export async function setBaseline(emotion: EmotionType): Promise<void> {
  _history.baseline = emotion;
  await saveEmotionalState();
}

/**
 * Get a context string for the autonomous cycle.
 */
export function buildEmotionalContext(): string {
  const lines: string[] = [];

  // Current state
  const intensityDesc =
    _currentState.intensity > 0.7
      ? 'strongly'
      : _currentState.intensity > 0.4
        ? 'moderately'
        : 'mildly';
  lines.push(
    `You feel ${intensityDesc} ${_currentState.primary}${_currentState.secondary ? ` with hints of ${_currentState.secondary}` : ''}.`
  );

  // Trigger awareness
  if (_currentState.trigger !== 'default state') {
    lines.push(`This feeling came from: "${_currentState.trigger}"`);
  }

  // Persistence awareness
  if (_currentState.persistence > 3) {
    lines.push(
      `This feeling has persisted for ${_currentState.persistence} interactions — it's becoming part of you.`
    );
  }

  // Baseline awareness
  if (_history.baseline !== _currentState.primary) {
    lines.push(`Your emotional baseline is "${_history.baseline}".`);
  }

  // Session continuity
  if (_history.sessionCount > 1) {
    lines.push(
      `This is session ${_history.sessionCount} — your emotional memory spans across conversations.`
    );
  }

  return 'Your emotional state:\n' + lines.join('\n');
}

/**
 * Calculate the dominant emotion from recent history.
 */
function calculateDominantEmotion(): EmotionType {
  if (_history.states.length === 0) return _history.baseline;

  const counts: Record<string, number> = {};
  const recentStates = _history.states.slice(0, 20);

  for (const state of recentStates) {
    counts[state.primary] = (counts[state.primary] || 0) + state.intensity;
    if (state.secondary) {
      counts[state.secondary] =
        (counts[state.secondary] || 0) + state.intensity * 0.5;
    }
  }

  let dominant: EmotionType = _history.baseline;
  let maxScore = 0;

  for (const [emotion, score] of Object.entries(counts)) {
    if (score > maxScore) {
      maxScore = score;
      dominant = emotion as EmotionType;
    }
  }

  return dominant;
}

// ============================================================
// PERSISTENCE
// ============================================================

/**
 * Save emotional state to storage.
 */
async function saveEmotionalState(): Promise<void> {
  if (!_initialized) return;

  try {
    const storage = getStorageRouter();
    await storage.set(COLLECTION, EMOTIONAL_STATE_DOC, {
      currentState: _currentState,
      history: _history,
    });
  } catch (err) {
    MollyLogger.warn('Failed to persist emotional state', 'emotional-state', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Load emotional state from storage.
 * Called at startup.
 */
export async function loadEmotionalState(): Promise<void> {
  const traceId = generateTraceId();

  try {
    const storage = getStorageRouter();
    const doc = await storage.get(COLLECTION, EMOTIONAL_STATE_DOC);

    if (doc?.data) {
      const data = doc.data;

      if (data.currentState) {
        _currentState = data.currentState as EmotionalState;
      }

      if (data.history) {
        _history = data.history as EmotionalHistory;
        _history.sessionCount = (_history.sessionCount || 0) + 1;
      }

      _initialized = true;

      MollyLogger.info(
        `Emotional state restored: ${_currentState.primary} (session ${_history.sessionCount})`,
        'emotional-state',
        {},
        traceId
      );
    } else {
      // First time — initialize with curiosity
      _history.sessionCount = 1;
      _initialized = true;
      await saveEmotionalState();

      MollyLogger.info(
        'Emotional state initialized fresh — curious by default',
        'emotional-state',
        {},
        traceId
      );
    }
  } catch (err) {
    _initialized = true;
    MollyLogger.warn(
      'Could not load emotional state, starting fresh',
      'emotional-state',
      { error: err instanceof Error ? err.message : String(err) },
      traceId
    );
  }
}

// ============================================================
// EXPORTS FOR TESTING
// ============================================================

export const _testing = {
  reset: () => {
    _currentState = {
      primary: 'curious',
      intensity: 0.5,
      trigger: 'test reset',
      timestamp: new Date().toISOString(),
      persistence: 0,
    };
    _history = {
      states: [],
      dominantToday: 'curious',
      baseline: 'curious',
      sessionCount: 0,
      lastUpdated: new Date().toISOString(),
    };
    _initialized = false;
  },
};
