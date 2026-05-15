/**
 * @fileOverview Physics-smoothed kinematics controller.
 * Maps Molly's cognitive intent to procedural arm and joint rotations via
 * per-frame lerp. Sine-wave superposition simulates organic Perlin-noise tremor
 * without any external dependency.
 *
 * Two entry points:
 *   calculateLimbVectors()   — VRM humanoid API (@pixiv/three-vrm)
 *   calculateFromBones()     — generic bone dictionary (GLB / Avaturn / Mixamo)
 *
 * Browser / canvas only — do not import in Node.js server code.
 */

import type { VRM } from '@pixiv/three-vrm';

export type ArmGestureIntent =
  | 'IDLE_SWA_BREATHE'
  | 'ANALYSIS_TYPING'
  | 'AUTONOMOUS_CELEBRATION'
  | 'REACH_FORWARD' // grasp, push, pull, open, close, insert, rotate
  | 'REACH_UP' // pour, place_on, stack, unstack
  | 'NAVIGATE' // navigate_to, move_to — walking arm-swing
  | 'LOOK_AT_TARGET'; // look_at — neutral arms, head driven by caller

/** Abstract bone names used internally. */
export interface GLBRigMap {
  leftUpperArm: string;
  rightUpperArm: string;
  leftLowerArm: string;
  rightLowerArm: string;
  neck: string;
  spine?: string;
}

/** Avaturn / Mixamo rig naming convention. */
export const AVATURN_RIG: GLBRigMap = {
  leftUpperArm: 'mixamorigLeftArm',
  rightUpperArm: 'mixamorigRightArm',
  leftLowerArm: 'mixamorigLeftForeArm',
  rightLowerArm: 'mixamorigRightForeArm',
  neck: 'mixamorigNeck',
  spine: 'mixamorigSpine',
};

/** Ready Player Me rig naming convention. */
export const RPM_RIG: GLBRigMap = {
  leftUpperArm: 'LeftArm',
  rightUpperArm: 'RightArm',
  leftLowerArm: 'LeftForeArm',
  rightLowerArm: 'RightForeArm',
  neck: 'Neck',
};

type Rotation = [number, number, number]; // Euler [x, y, z] radians

type Bone = { rotation: { x: number; y: number; z: number } };

/** Lerp a bone toward a target rotation. Alpha 0.12 = smooth at 60 fps. */
function applyBoneLerp(
  bone: Bone | null | undefined,
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
 * Two incommensurable frequencies produce aperiodic motion that reads as
 * organic micro-movement without any external Perlin-noise dependency.
 */
function organicTremor(
  time: number,
  freq1 = 12,
  freq2 = 7.3,
  amp = 0.015
): number {
  return Math.sin(time * freq1) * amp + Math.cos(time * freq2) * amp * 0.6;
}

/** Drive arms according to the given intent for either rig type. */
function driveArms(
  leftUpper: Bone | null | undefined,
  rightUpper: Bone | null | undefined,
  leftLower: Bone | null | undefined,
  rightLower: Bone | null | undefined,
  intent: ArmGestureIntent,
  time: number,
  alpha: number
): void {
  const tx = organicTremor(time, 12, 8.1);
  const ty = organicTremor(time, 10, 6.7, 0.012);

  switch (intent) {
    case 'AUTONOMOUS_CELEBRATION': {
      // Arms raised and spread — victory pose
      applyBoneLerp(leftUpper, [0.8 + tx, 0.2, -0.6 + ty], alpha);
      applyBoneLerp(rightUpper, [0.8 + tx, -0.2, 0.6 + ty], alpha);
      applyBoneLerp(leftLower, [0.9, 0, 0], alpha);
      applyBoneLerp(rightLower, [0.9, 0, 0], alpha);
      break;
    }

    case 'ANALYSIS_TYPING': {
      // Arms forward and bent — keyboard typing with micro-flicker
      const flicker = Math.sin(time * 24) * 0.04;
      applyBoneLerp(leftUpper, [0.25, 0.1, -0.25], alpha);
      applyBoneLerp(rightUpper, [0.25, -0.1, 0.25], alpha);
      applyBoneLerp(leftLower, [1.2 + flicker, 0, 0], alpha);
      applyBoneLerp(rightLower, [1.2 + flicker, 0, 0], alpha);
      break;
    }

    case 'REACH_FORWARD': {
      // Arms extending forward — grasping, pushing, manipulating
      const reach = 0.3 + Math.sin(time * 3.2) * 0.04 + tx;
      applyBoneLerp(leftUpper, [reach, 0.15, -0.3], alpha);
      applyBoneLerp(rightUpper, [reach, -0.15, 0.3], alpha);
      applyBoneLerp(leftLower, [1.35, 0, 0], alpha);
      applyBoneLerp(rightLower, [1.35, 0, 0], alpha);
      break;
    }

    case 'REACH_UP': {
      // Arms reaching overhead — pouring, placing, stacking
      applyBoneLerp(leftUpper, [1.1 + tx, 0.3, -0.4 + ty], alpha);
      applyBoneLerp(rightUpper, [1.1 + tx, -0.3, 0.4 + ty], alpha);
      applyBoneLerp(leftLower, [0.6, 0, 0], alpha);
      applyBoneLerp(rightLower, [0.6, 0, 0], alpha);
      break;
    }

    case 'NAVIGATE': {
      // Natural arm-swing rhythm matching a walking gait
      const swing = Math.sin(time * 2.2) * 0.18;
      applyBoneLerp(leftUpper, [swing, 0, -0.06], alpha);
      applyBoneLerp(rightUpper, [-swing, 0, 0.06], alpha);
      applyBoneLerp(leftLower, [0.15, 0, 0], alpha);
      applyBoneLerp(rightLower, [0.15, 0, 0], alpha);
      break;
    }

    case 'LOOK_AT_TARGET': {
      // Head turning — arms stay neutral (caller drives neck separately)
      applyBoneLerp(leftUpper, [tx, 0, -0.08], alpha);
      applyBoneLerp(rightUpper, [tx, 0, 0.08], alpha);
      applyBoneLerp(leftLower, [0.1, 0, 0], alpha);
      applyBoneLerp(rightLower, [0.1, 0, 0], alpha);
      break;
    }

    case 'IDLE_SWA_BREATHE':
    default: {
      // Gentle sway synchronized to breathing rhythm
      const breathe = Math.sin(time * 1.4) * 0.02;
      applyBoneLerp(leftUpper, [breathe, 0, -0.08], alpha);
      applyBoneLerp(rightUpper, [breathe, 0, 0.08], alpha);
      applyBoneLerp(leftLower, [0.1, 0, 0], alpha);
      applyBoneLerp(rightLower, [0.1, 0, 0], alpha);
      break;
    }
  }
}

export class KinematicsCore {
  private static readonly LERP_SPEED = 0.12;

  /**
   * Drive arms from a VRM humanoid (original API — @pixiv/three-vrm).
   * Call once per render frame.
   */
  public static calculateLimbVectors(
    vrm: VRM,
    intent: ArmGestureIntent,
    time: number
  ): void {
    if (!vrm.humanoid) return;
    driveArms(
      vrm.humanoid.getRawBone('leftUpperArm'),
      vrm.humanoid.getRawBone('rightUpperArm'),
      vrm.humanoid.getRawBone('leftLowerArm'),
      vrm.humanoid.getRawBone('rightLowerArm'),
      intent,
      time,
      this.LERP_SPEED
    );
  }

  /**
   * Drive arms from a GLB bone dictionary (Avaturn / Mixamo / Ready Player Me).
   * Pass a Record<string, Object3D> keyed by bone name, plus the rig map that
   * translates abstract names to the names used in your specific GLB file.
   */
  public static calculateFromBones(
    bones: Record<string, Bone>,
    rig: GLBRigMap,
    intent: ArmGestureIntent,
    time: number
  ): void {
    driveArms(
      bones[rig.leftUpperArm],
      bones[rig.rightUpperArm],
      bones[rig.leftLowerArm],
      bones[rig.rightLowerArm],
      intent,
      time,
      this.LERP_SPEED
    );
  }
}
