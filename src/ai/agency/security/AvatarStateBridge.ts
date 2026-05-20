/**
 * @fileOverview Simple network-state → facial-morph mapper for the security pipeline.
 * Drives Molly's 3D expression directly in response to CircuitBreaker state.
 *
 * For the full time-factored version with cognitive moods, nods, and smooth
 * expression transitions, see: src/ai/agency/embodied/AvatarStateBridge.ts
 */

import type { NetworkState } from './CircuitBreaker';

export interface FacialMorphOverrides {
  jawOpen: number;
  browInnerUp: number;
  eyeWideLeft: number;
  eyeWideRight: number;
  mouthFunnel: number;
}

const NEUTRAL: FacialMorphOverrides = {
  jawOpen: 0,
  browInnerUp: 0,
  eyeWideLeft: 0,
  eyeWideRight: 0,
  mouthFunnel: 0,
};

const ISOLATED_SHOCK: FacialMorphOverrides = {
  jawOpen: 0.35,
  browInnerUp: 0.85,
  eyeWideLeft: 0.9,
  eyeWideRight: 0.9,
  mouthFunnel: 0.2,
};

export class AvatarStateBridge {
  public static getExpressionModifiers(
    networkState: NetworkState
  ): FacialMorphOverrides {
    return networkState === 'ISOLATED_FALLBACK' ? ISOLATED_SHOCK : NEUTRAL;
  }
}
