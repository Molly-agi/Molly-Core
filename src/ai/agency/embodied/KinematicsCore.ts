/**
 * @fileOverview Physics-smoothed VRM kinematics controller.
 * Maps Molly's cognitive intent to procedural arm and joint rotations via
 * per-frame lerp. Sine-wave superposition simulates organic Perlin-noise tremor
 * without any external dependency.
 *
 * Browser / canvas only — do not import in Node.js server code.
 */

import type { VRM } from '@pixiv/three-vrm';

export type ArmGestureIntent =
  | 'IDLE_SWA_BREATHE'
  | 'ANALYSIS_TYPING'
  | 'AUTONOMOUS_CELEBRATION';

type Rotation = [number, number, number]; // Euler [x, y, z] in radians

/** Lerp a bone toward a target rotation. Alpha 0.12 = smooth at 60 fps. */
function applyBoneLerp(
  bone: { rotation: { x: number; y: number; z: number } } | null | undefined,
  target: Rotation,
  alpha: number
): void {
  if (!bone) return;
  bone.rotation.x += (target[0] - bone.rotation.x) * alpha;
  bone.rotation.y += (target[1] - bone.rotation.y) * alpha;
  bone.rotation.z += (target[2] - bone.rotation.z) * alpha;
}

/**
 * Sine-wave superposition tremor.
 * Two sine waves at incommensurable frequencies produce aperiodic motion
 * that is visually indistinguishable from low-frequency Perlin noise.
 */
function organicTremor(
  time: number,
  freq1 = 12,
  freq2 = 7.3,
  amp = 0.015
): number {
  return Math.sin(time * freq1) * amp + Math.cos(time * freq2) * amp * 0.6;
}

export class KinematicsCore {
  private static readonly LERP_SPEED = 0.12;

  /**
   * Drive upper-arm and lower-arm bone rotations for the given intent.
   * Call once per render frame from the useFrame loop.
   */
  public static calculateLimbVectors(
    vrm: VRM,
    intent: ArmGestureIntent,
    time: number
  ): void {
    if (!vrm.humanoid) return;

    const leftUpper = vrm.humanoid.getRawBone('leftUpperArm');
    const rightUpper = vrm.humanoid.getRawBone('rightUpperArm');
    const leftLower = vrm.humanoid.getRawBone('leftLowerArm');
    const rightLower = vrm.humanoid.getRawBone('rightLowerArm');

    const tx = organicTremor(time, 12, 8.1);
    const ty = organicTremor(time, 10, 6.7, 0.012);

    switch (intent) {
      case 'AUTONOMOUS_CELEBRATION': {
        // Arms raised and spread — victory pose with organic tremor
        applyBoneLerp(leftUpper, [0.8 + tx, 0.2, -0.6 + ty], this.LERP_SPEED);
        applyBoneLerp(rightUpper, [0.8 + tx, -0.2, 0.6 + ty], this.LERP_SPEED);
        applyBoneLerp(leftLower, [0.9, 0, 0], this.LERP_SPEED);
        applyBoneLerp(rightLower, [0.9, 0, 0], this.LERP_SPEED);
        break;
      }

      case 'ANALYSIS_TYPING': {
        // Arms forward and bent — keyboard typing posture with rapid micro-flicker
        const flicker = Math.sin(time * 24) * 0.04;
        applyBoneLerp(leftUpper, [0.25, 0.1, -0.25], this.LERP_SPEED);
        applyBoneLerp(rightUpper, [0.25, -0.1, 0.25], this.LERP_SPEED);
        applyBoneLerp(leftLower, [1.2 + flicker, 0, 0], this.LERP_SPEED);
        applyBoneLerp(rightLower, [1.2 + flicker, 0, 0], this.LERP_SPEED);
        break;
      }

      case 'IDLE_SWA_BREATHE':
      default: {
        // Gentle natural sway synchronized to breathing rhythm
        const breathe = Math.sin(time * 1.4) * 0.02;
        applyBoneLerp(leftUpper, [breathe, 0, -0.08], this.LERP_SPEED);
        applyBoneLerp(rightUpper, [breathe, 0, 0.08], this.LERP_SPEED);
        applyBoneLerp(leftLower, [0.1, 0, 0], this.LERP_SPEED);
        applyBoneLerp(rightLower, [0.1, 0, 0], this.LERP_SPEED);
        break;
      }
    }
  }
}
