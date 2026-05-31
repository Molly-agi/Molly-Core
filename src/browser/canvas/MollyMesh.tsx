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

import React, { useRef, useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { MODEL_PATH, useMollyGLB } from './useMollyGLB';
import {
  KinematicsCore,
  AVATURN_RIG,
  type GLBRigMap,
} from '@/ai/agency/embodied/KinematicsCore';
import type { AvatarDirector } from '@/ai/agency/embodied/AvatarDirector';
import type { FacialMorphOverrides } from '@/ai/agency/embodied/AvatarStateBridge';
import * as THREE from 'three';

/** How many render frames between proprioception snapshots (6 = ~10 Hz at 60fps). */
const PROPRIO_FRAME_SKIP = 6;

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
  /** Manual model offset control from UI. */
  modelOffset?: [number, number, number];
  /** Optional model file path for runtime variant switching. */
  modelPath?: string;
}

// --- Component ---

function LoadedMollyMesh({
  director,
  rig,
  modelOffset,
  modelPath,
}: MollyMeshProps) {
  const { scene, bones, skinnedMesh } = useMollyGLB(modelPath ?? MODEL_PATH);

  const sceneTransform = useMemo(() => {
    // Normalize orientation + placement for third-party GLBs without mutating
    // the original scene object returned by useGLTF.
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);

    let rotation: [number, number, number] = [0, 0, 0];

    if (size.z > size.y * 1.2) {
      rotation = [-Math.PI / 2, 0, 0];
    } else if (size.x > size.y * 1.2) {
      rotation = [0, 0, Math.PI / 2];
    }

    const sample = scene.clone(true);
    sample.rotation.set(rotation[0], rotation[1], rotation[2]);
    sample.updateMatrixWorld(true);

    const alignedBox = new THREE.Box3().setFromObject(sample);
    const center = new THREE.Vector3();
    alignedBox.getCenter(center);

    return {
      rotation,
      position: [-center.x, -alignedBox.min.y, -center.z] as [
        number,
        number,
        number,
      ],
    };
  }, [scene]);

  // Cache in refs so useFrame mutations don't touch hook return values directly.
  const bonesRef = useRef<BoneDict>({});
  const meshRef = useRef<THREE.SkinnedMesh | null>(null);
  const frameCountRef = useRef(0);

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

    // 4. Proprioceptive feedback — give Molly awareness of her own body + face
    //    Throttled: snapshot every PROPRIO_FRAME_SKIP frames (~10 Hz at 60fps)
    frameCountRef.current++;
    if (frameCountRef.current % PROPRIO_FRAME_SKIP === 0) {
      // Build a flat joint rotation snapshot from the live bone dict
      const joints: Record<string, { x: number; y: number; z: number }> = {};
      for (const [name, bone] of Object.entries(b)) {
        joints[name] = {
          x: bone.rotation.x,
          y: bone.rotation.y,
          z: bone.rotation.z,
        };
      }
      // Pass the full morph override map so she can see her own facial expression
      director.feedProprioception(
        joints,
        frame.morphOverrides,
        time,
        frame.mood
      );
    }
  });

  return (
    <group position={modelOffset ?? [0, 0, 0]}>
      <group
        rotation={sceneTransform.rotation}
        position={sceneTransform.position}
      >
        <primitive object={scene} />
      </group>
    </group>
  );
}

function FallbackBust() {
  return (
    <group position={[0, 0.1, 0]}>
      <mesh position={[0, 1.25, 0]} castShadow>
        <sphereGeometry args={[0.27, 24, 24]} />
        <meshStandardMaterial
          color="#d9d4cf"
          roughness={0.6}
          metalness={0.05}
        />
      </mesh>
      <mesh position={[0, 0.78, 0]} castShadow>
        <capsuleGeometry args={[0.22, 0.38, 8, 16]} />
        <meshStandardMaterial
          color="#bfc5cf"
          roughness={0.7}
          metalness={0.08}
        />
      </mesh>
    </group>
  );
}

export function MollyMesh({
  director,
  rig = AVATURN_RIG,
  modelOffset = [0, 0, 0],
  modelPath = MODEL_PATH,
}: MollyMeshProps) {
  const [modelAvailable, setModelAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkModel = async () => {
      try {
        const res = await fetch(modelPath, {
          method: 'HEAD',
          cache: 'no-store',
        });
        if (!cancelled) setModelAvailable(res.ok);
      } catch {
        if (!cancelled) setModelAvailable(false);
      }
    };

    checkModel();

    return () => {
      cancelled = true;
    };
  }, [modelPath]);

  if (modelAvailable === null) {
    return null;
  }

  if (!modelAvailable) {
    return <FallbackBust />;
  }

  return (
    <LoadedMollyMesh
      director={director}
      rig={rig}
      modelOffset={modelOffset}
      modelPath={modelPath}
    />
  );
}
