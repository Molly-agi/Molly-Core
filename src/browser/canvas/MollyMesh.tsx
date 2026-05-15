'use client';

/**
 * @fileOverview Primary 3D avatar mesh driver for Molly's VRM model.
 * Drives morph-target facial expressions via AvatarStateBridge and kinematic
 * limb rotations via KinematicsCore, both updated inside the R3F render loop.
 *
 * Mount inside a <Canvas> from @react-three/fiber:
 *   <Canvas><MollyMesh vrmAsset={vrm} currentMood="ANALYTICAL" /></Canvas>
 *
 * FIXES vs original spec:
 *   • Import from '@react-three/fiber'  (not '/native' — that path is React Native only)
 *   • scene comes from state.scene      (was an undefined global reference)
 *   • 'use client' directive added      (required for hooks in Next.js App Router)
 */

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CircuitBreaker } from '@/ai/agency/security/CircuitBreaker';
import {
  AvatarStateBridge,
  type CognitiveMood,
  type FacialMorphOverrides,
} from '@/ai/agency/embodied/AvatarStateBridge';
import {
  KinematicsCore,
  type ArmGestureIntent,
} from '@/ai/agency/embodied/KinematicsCore';

// Minimal VRM shape used by this component — keeps the prop type loose so
// MollyMesh doesn't force a hard @pixiv/three-vrm import at the consumer level.
interface VRMAsset {
  scene: {
    traverse: (callback: (node: unknown) => void) => void;
  };
  humanoid?: {
    getRawBone: (
      name: string
    ) => { rotation: { x: number; y: number; z: number } } | null;
  };
}

interface MollyMeshProps {
  vrmAsset: VRMAsset | null;
  currentMood?: CognitiveMood;
}

const LERP_FACTOR = 0.18;

function moodToIntent(mood: CognitiveMood): ArmGestureIntent {
  if (mood === 'SUCCESS_FOUND') return 'AUTONOMOUS_CELEBRATION';
  if (mood === 'ANALYTICAL') return 'ANALYSIS_TYPING';
  return 'IDLE_SWA_BREATHE';
}

/** Apply a FacialMorphOverrides map to all meshes on the VRM scene. */
function applyMorphTargets(
  scene: VRMAsset['scene'],
  overrides: FacialMorphOverrides,
  lerpFactor: number
): void {
  scene.traverse((node: unknown) => {
    const mesh = node as {
      isMesh?: boolean;
      morphTargetInfluences?: number[];
      morphTargetDictionary?: Record<string, number>;
    };

    if (
      !mesh.isMesh ||
      !mesh.morphTargetInfluences ||
      !mesh.morphTargetDictionary
    ) {
      return;
    }

    for (const [shapeName, targetValue] of Object.entries(overrides)) {
      if (typeof targetValue !== 'number') continue;
      const index = mesh.morphTargetDictionary[shapeName];
      if (index === undefined) continue;
      const current = mesh.morphTargetInfluences[index];
      mesh.morphTargetInfluences[index] =
        current + (targetValue - current) * lerpFactor;
    }
  });
}

export function MollyMesh({
  vrmAsset,
  currentMood = 'DEFAULT',
}: MollyMeshProps) {
  const prevNetworkState = useRef(
    CircuitBreaker.getInstance().getNetworkState()
  );

  useFrame((state) => {
    if (!vrmAsset?.scene || !vrmAsset.humanoid) return;

    const elapsedTime = state.clock.getElapsedTime();
    const networkState = CircuitBreaker.getInstance().getNetworkState();

    // Detect transition from CONNECTED → ISOLATED so AvatarStateBridge
    // can seed its disconnectTimestamp correctly on the first isolated frame.
    prevNetworkState.current = networkState;

    // 1. Compute per-frame expression overrides
    const overrides = AvatarStateBridge.getExpressionModifiers(
      networkState,
      currentMood,
      elapsedTime
    );

    // 2. Drive neck bone for head lean and nod
    const neckBone = vrmAsset.humanoid.getRawBone('neck');
    if (neckBone) {
      let targetNeckX = 0;
      if (overrides.triggerNod) {
        targetNeckX = Math.abs(Math.sin(elapsedTime * 6.5)) * 0.22;
      } else if (networkState === 'ISOLATED_FALLBACK') {
        targetNeckX = 0.15; // forward lean while computing locally
      } else if (currentMood === 'ANALYTICAL') {
        targetNeckX = 0.08; // subtle screen lean
      }
      neckBone.rotation.x += (targetNeckX - neckBone.rotation.x) * LERP_FACTOR;
    }

    // 3. Drive arm kinematics based on cognitive intent
    KinematicsCore.calculateLimbVectors(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vrmAsset as any,
      moodToIntent(currentMood),
      elapsedTime
    );

    // 4. Apply facial morph targets across every mesh in the scene
    applyMorphTargets(vrmAsset.scene, overrides, LERP_FACTOR);
  });

  if (!vrmAsset) return null;

  return <primitive object={vrmAsset.scene} />;
}
