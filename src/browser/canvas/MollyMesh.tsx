'use client';

/**
 * @fileOverview Primary 3D avatar mesh driver for Molly's GLB bust model.
 *
 * Each render frame:
 *   1. Asks AvatarDirector for a merged AvatarFrame (voice + robotics + network)
 *   2. Drives neck bone pitch/yaw toward targets via lerp
 *   3. Drives arm bones via KinematicsCore.calculateFromBones (GLB rig)
 *   4. Applies FacialMorphOverrides to the SkinnedMesh morph targets
 *
 * Mount inside MollyCanvas — it manages <Canvas> and the Suspense boundary.
 * Expects /public/models/molly.glb (Avaturn export, Mixamo rig by default).
 */

import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useMollyGLB } from './useMollyGLB';
import {
  KinematicsCore,
  AVATURN_RIG,
  type GLBRigMap,
} from '@/ai/agency/embodied/KinematicsCore';
import type { AvatarDirector } from '@/ai/agency/embodied/AvatarDirector';
import type { FacialMorphOverrides } from '@/ai/agency/embodied/AvatarStateBridge';
import type * as THREE from 'three';

/**
 * Maps FacialMorphOverrides keys → actual morph target names baked into the GLB.
 * Avaturn uses ARKit-style blendshape names. Update if your export differs.
 */
const MORPH_MAP: Partial<Record<keyof FacialMorphOverrides, string>> = {
  jawOpen: 'jawOpen',
  browInnerUp: 'browInnerUp',
  browDownLeft: 'browDownLeft',
  browDownRight: 'browDownRight',
  eyeWideLeft: 'eyeWideLeft',
  eyeWideRight: 'eyeWideRight',
  mouthSmileLeft: 'mouthSmileLeft',
  mouthSmileRight: 'mouthSmileRight',
  mouthFunnel: 'mouthFunnel',
};

const LERP = 0.18;

type BoneDict = Record<
  string,
  { rotation: { x: number; y: number; z: number } }
>;

function applyMorphs(
  mesh: THREE.SkinnedMesh | null,
  overrides: FacialMorphOverrides
): void {
  if (!mesh?.morphTargetInfluences || !mesh.morphTargetDictionary) return;

  for (const [key, targetValue] of Object.entries(overrides) as [
    keyof FacialMorphOverrides,
    unknown,
  ][]) {
    if (typeof targetValue !== 'number') continue;
    const morphName = MORPH_MAP[key];
    if (!morphName) continue;
    const index = mesh.morphTargetDictionary[morphName];
    if (index === undefined) continue;
    const current = mesh.morphTargetInfluences[index];
    mesh.morphTargetInfluences[index] =
      current + (targetValue - current) * LERP;
  }
}

// --- Props ---

interface MollyMeshProps {
  director: AvatarDirector;
  /** Override if your GLB uses bone names other than Avaturn/Mixamo defaults. */
  rig?: GLBRigMap;
}

// --- Component ---

export function MollyMesh({ director, rig = AVATURN_RIG }: MollyMeshProps) {
  const { scene, bones, skinnedMesh } = useMollyGLB();

  // Cache in refs so useFrame mutations don't touch hook return values directly.
  const bonesRef = useRef<BoneDict>({});
  const meshRef = useRef<THREE.SkinnedMesh | null>(null);

  useEffect(() => {
    bonesRef.current = bones as BoneDict;
    meshRef.current = skinnedMesh;
  }, [bones, skinnedMesh]);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    const frame = director.getFrame(time);
    const b = bonesRef.current;

    // 1. Neck orientation
    const neck = b[rig.neck];
    if (neck) {
      neck.rotation.x += (frame.neckPitch - neck.rotation.x) * LERP;
      neck.rotation.y += (frame.neckYaw - neck.rotation.y) * LERP;
    }

    // 2. Arm kinematics
    KinematicsCore.calculateFromBones(b, rig, frame.intent, time);

    // 3. Facial morph targets
    applyMorphs(meshRef.current, frame.morphOverrides);
  });

  return <primitive object={scene} />;
}
