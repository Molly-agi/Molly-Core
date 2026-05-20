/**
 * @fileOverview Advanced time-factored facial expression state bridge.
 * Maps network isolation events and cognitive mood changes to smooth, timed
 * blendshape transitions on Molly's 3D avatar mesh.
 *
 * Expression lifecycle:
 *   ISOLATED_FALLBACK → wide-eye shock (0 s) → analytical concentration (2.5 s)
 *   SUCCESS_FOUND     → confident smile + validation nod (0–1.2 s) → neutral (4 s)
 *   ANALYTICAL        → focused brow-down (instant, held)
 */

import type { NetworkState } from '../security/CircuitBreaker';

export type CognitiveMood =
  | 'DEFAULT'
  | 'SHOCK'
  | 'ANALYTICAL'
  | 'SUCCESS_FOUND';

export interface FacialMorphOverrides {
  jawOpen: number;
  browInnerUp: number;
  eyeWideLeft: number;
  eyeWideRight: number;
  mouthFunnel: number;
  browDownLeft: number;
  browDownRight: number;
  mouthSmileLeft: number;
  mouthSmileRight: number;
  /** Trigger a brief downward head-nod animation in the render loop. */
  triggerNod: boolean;
}

const NEUTRAL: FacialMorphOverrides = {
  jawOpen: 0,
  browInnerUp: 0,
  eyeWideLeft: 0,
  eyeWideRight: 0,
  mouthFunnel: 0,
  browDownLeft: 0,
  browDownRight: 0,
  mouthSmileLeft: 0,
  mouthSmileRight: 0,
  triggerNod: false,
};

const STABILIZATION_WINDOW_SEC = 2.5;

// Module-level timestamps track when triggering events began
let disconnectTimestamp: number | null = null;
let successTimestamp: number | null = null;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

export class AvatarStateBridge {
  /**
   * Compute facial morph targets for the current render frame.
   *
   * @param networkState  Live NetworkState from CircuitBreaker.getInstance()
   * @param mood          Cognitive mood from the execution pipeline
   * @param elapsedTime   Seconds since scene start (state.clock.getElapsedTime())
   */
  public static getExpressionModifiers(
    networkState: NetworkState,
    mood: CognitiveMood,
    elapsedTime: number
  ): FacialMorphOverrides {
    // SUCCESS_FOUND: smile + validation nod, fading over 4 seconds
    if (mood === 'SUCCESS_FOUND') {
      if (successTimestamp === null) successTimestamp = elapsedTime;
      const age = elapsedTime - successTimestamp;
      const fade = Math.max(0, 1.0 - age / 4.0);

      return {
        ...NEUTRAL,
        browDownLeft: 0.2 * fade,
        browDownRight: 0.2 * fade,
        mouthSmileLeft: 0.45 * fade,
        mouthSmileRight: 0.45 * fade,
        triggerNod: age < 1.2,
      };
    }

    successTimestamp = null;

    // ISOLATED_FALLBACK: shock expression transitions to analytical focus over 2.5 s
    if (networkState === 'ISOLATED_FALLBACK') {
      if (disconnectTimestamp === null) disconnectTimestamp = elapsedTime;
      const progress = Math.min(
        (elapsedTime - disconnectTimestamp) / STABILIZATION_WINDOW_SEC,
        1.0
      );

      return {
        ...NEUTRAL,
        jawOpen: lerp(0.35, 0.0, progress),
        browInnerUp: lerp(0.85, 0.0, progress),
        eyeWideLeft: lerp(0.9, 0.0, progress),
        eyeWideRight: lerp(0.9, 0.0, progress),
        mouthFunnel: lerp(0.2, 0.0, progress),
        browDownLeft: lerp(0.0, 0.65, progress),
        browDownRight: lerp(0.0, 0.65, progress),
        triggerNod: false,
      };
    }

    disconnectTimestamp = null;

    // ANALYTICAL: connected but deeply focused
    if (mood === 'ANALYTICAL') {
      return { ...NEUTRAL, browDownLeft: 0.3, browDownRight: 0.3 };
    }

    return { ...NEUTRAL };
  }

  /** Reset timestamp state when starting a new hunt session. */
  public static resetTimestamps(): void {
    disconnectTimestamp = null;
    successTimestamp = null;
  }
}
