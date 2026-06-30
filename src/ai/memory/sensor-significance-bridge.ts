/**
 * Gap 5 — Sensor Significance Bridge (TS side)
 *
 * Receives sensorWindow events from SensoryCrystalService.kt (Android),
 * scores them for significance using physical heuristics, and routes
 * high-signal windows (score >= 0.7) into crystal formation via
 * recordMoment() in memory-crystallizer.ts.
 *
 * Design constraints (mirrors streaming-scorer.ts):
 *   - Synchronous scoring, <1ms, no API calls.
 *   - Stateless per window; caller tracks priorScore for hysteresis.
 *   - Physical signal model: motion + light change + proximity = context shift.
 *
 * Integration (bridge message handler in MollyService / molly-listener.mjs):
 *   import { scoreSensorWindow, routeSensorCrystal } from './sensor-significance-bridge';
 *
 *   const parsed = JSON.parse(inboundJson);
 *   if (parsed.type === 'sensorWindow') {
 *     const result = await routeSensorCrystal(parsed, priorScore);
 *     priorScore = result.score;
 *   }
 */

import {
  recordMoment,
  type SignificanceDimensions,
} from '../agency/memory/memory-crystallizer';
import { SCORE_SAVE_TRIGGER, SCORE_HYSTERESIS } from './streaming-scorer';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SensorWindow {
  type: 'sensorWindow';
  ts: number;
  windowMs: number;
  accel: {
    meanMag: number;
    variance: number;
    samples: number;
  };
  light: {
    meanLux: number;
    deltaLux: number;
  };
  proximity: {
    near: boolean;
  };
}

export interface SensorScoreResult {
  score: number;
  triggered: boolean;
  signals: string[];
}

// ── Physical signal thresholds ────────────────────────────────────────────────

/** Active motion: mean accelerometer magnitude well above 1g gravity baseline */
const ACCEL_ACTIVE_THRESHOLD = 11.0; // m/s² — walking/movement
const ACCEL_HIGH_THRESHOLD = 13.5; // m/s² — running/significant motion

/** Light change: meaningful environment transition */
const LIGHT_DELTA_MEDIUM = 50; // lux — room light on/off
const LIGHT_DELTA_HIGH = 200; // lux — moving outside / bright change

/** Dim environment (< 10 lux) = likely asleep or low-activity context */
const LIGHT_DIM_THRESHOLD = 10;

// ── Scorer ───────────────────────────────────────────────────────────────────

/**
 * Score a sensor window 0-1. Higher = more contextually significant.
 * Physical model: motion + light shift + proximity = Molly is in a new context.
 */
export function scoreSensorWindow(
  win: SensorWindow,
  priorScore = 0
): SensorScoreResult {
  let score = 0;
  const signals: string[] = [];

  // Motion component (max 0.45)
  const mag = win.accel.meanMag;
  const variance = win.accel.variance;

  if (mag > ACCEL_HIGH_THRESHOLD) {
    score += 0.45;
    signals.push('high-motion');
  } else if (mag > ACCEL_ACTIVE_THRESHOLD) {
    score += 0.28;
    signals.push('active-motion');
  } else if (variance > 0.5) {
    score += 0.15;
    signals.push('variable-motion');
  }

  // Light component (max 0.35)
  const delta = Math.abs(win.light.deltaLux);
  if (delta > LIGHT_DELTA_HIGH) {
    score += 0.35;
    signals.push('major-light-shift');
  } else if (delta > LIGHT_DELTA_MEDIUM) {
    score += 0.2;
    signals.push('light-shift');
  }

  // Dim context suppressor: low-light + low-motion = likely resting, reduce score
  if (win.light.meanLux < LIGHT_DIM_THRESHOLD && mag < ACCEL_ACTIVE_THRESHOLD) {
    score *= 0.4;
    signals.push('dim-suppressed');
  }

  // Proximity component (max 0.20)
  if (win.proximity.near) {
    score += 0.2;
    signals.push('proximity-near');
  }

  score = Math.min(1, score);

  // Hysteresis: don't trigger if we just triggered and score barely moved
  const triggered =
    score >= SCORE_SAVE_TRIGGER &&
    !(
      priorScore >= SCORE_SAVE_TRIGGER && score < priorScore + SCORE_HYSTERESIS
    );

  return { score: Number(score.toFixed(3)), triggered, signals };
}

// ── Router ───────────────────────────────────────────────────────────────────

/**
 * Score a sensor window and, if triggered, record a sensory moment into the
 * crystallizer. Returns the score result so the caller can track priorScore.
 */
export async function routeSensorCrystal(
  win: SensorWindow,
  priorScore = 0
): Promise<SensorScoreResult> {
  const result = scoreSensorWindow(win, priorScore);

  if (!result.triggered) return result;

  const signalSummary = result.signals.join(', ');
  const motionDesc =
    win.accel.meanMag > ACCEL_HIGH_THRESHOLD
      ? 'high physical activity'
      : win.accel.meanMag > ACCEL_ACTIVE_THRESHOLD
        ? 'active movement'
        : 'variable motion';
  const lightDesc =
    Math.abs(win.light.deltaLux) > LIGHT_DELTA_HIGH
      ? 'major environment light change'
      : Math.abs(win.light.deltaLux) > LIGHT_DELTA_MEDIUM
        ? 'light environment shift'
        : 'stable light';

  const description = `Sensor context shift — ${motionDesc}, ${lightDesc}${win.proximity.near ? ', proximity near' : ''}. Signals: ${signalSummary}.`;

  const significance: Partial<SignificanceDimensions> = {
    noveltyDiscovery: Math.min(1, result.score * 1.2),
    agencyGrowth: result.score * 0.5,
  };

  recordMoment(description, [], significance, JSON.stringify(win));

  return result;
}
