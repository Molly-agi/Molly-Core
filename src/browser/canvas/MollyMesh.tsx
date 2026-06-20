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
  RPM_RIG,
  type GLBRigMap,
} from '@/ai/agency/embodied/KinematicsCore';
import type { AvatarDirector } from '@/ai/agency/embodied/AvatarDirector';
import type { FacialMorphOverrides } from '@/ai/agency/embodied/AvatarStateBridge';
import { useIrisTracking } from './useIrisTracking';
import * as THREE from 'three';

/** Iris tracker output is considered fresh for this many ms after last update. */
const IRIS_STALE_MS = 500;

/** Expression tracker output is considered fresh for this many ms after last update. */
const EXPR_STALE_MS = 500;

/** How many render frames between proprioception snapshots (6 = ~10 Hz at 60fps). */
const PROPRIO_FRAME_SKIP = 6;

// Maps FacialMorphOverrides keys → actual morph target names baked into the GLB.
// molly.glb only has two morph targets: mouthOpen and mouthSmile.
const MORPH_MAP: Partial<Record<keyof FacialMorphOverrides, string>> = {
  jawOpen: 'mouthOpen',
  mouthSmileLeft: 'mouthSmile',
};

const LERP = 0.18;

type BoneDict = Record<
  string,
  { rotation: { x: number; y: number; z: number } }
>;

function applyMorphs(
  meshes: THREE.SkinnedMesh[],
  overrides: FacialMorphOverrides
): void {
  for (const mesh of meshes) {
    if (!mesh.morphTargetInfluences || !mesh.morphTargetDictionary) continue;
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
  /**
   * Enable real-time iris tracking via webcam + MediaPipe. When true and a
   * face is detected, the avatar's eyes follow the user's gaze. Falls back
   * to procedural saccade when no face is visible. Default false (opt-in).
   */
  enableIrisTracking?: boolean;
  /**
   * Enable real-time facial expression mirroring via the SAME MediaPipe
   * FaceLandmarker that powers iris tracking (`outputFaceBlendshapes`). When
   * true and a face is detected, jaw-open and smile come from the tracker
   * and override the voice/director morphs. When stale or disabled, the
   * voice path drives unchanged. Default false (opt-in).
   */
  enableExpressionTracking?: boolean;
}

// --- Component ---

function LoadedMollyMesh({
  director,
  rig,
  modelOffset,
  modelPath,
  enableIrisTracking = false,
  enableExpressionTracking = false,
}: MollyMeshProps) {
  const { scene, bones, morphMeshes } = useMollyGLB(modelPath ?? MODEL_PATH);

  // Async-to-frame-sync buffer for MediaPipe iris tracking. The hook writes to
  // buffer.current at MediaPipe's ~30 Hz cadence; useFrame reads at 60 Hz and
  // lerps the eye bones toward the latest target.
  //
  // The same hook also fills `expressionOverrides` from face blendshapes when
  // `enableExpressionTracking` is true — single inference, two buffer slots.
  const iris = useIrisTracking({
    enabled: enableIrisTracking || enableExpressionTracking,
  });

  // Auto-detect rig: prefer caller-supplied, else pick whichever convention's
  // bones actually exist in the loaded GLB. Without this, e.g. an RPM model
  // loaded with the Avaturn rig would have every bone lookup return undefined
  // and the avatar would never animate.
  const activeRig = useMemo<GLBRigMap>(() => {
    if (rig) return rig;
    if (bones[RPM_RIG.leftUpperArm]) return RPM_RIG;
    if (bones[AVATURN_RIG.leftUpperArm]) return AVATURN_RIG;
    return RPM_RIG;
  }, [rig, bones]);

  // Ready Player Me / Wolf3D models ship with multiple SkinnedMeshes sharing one
  // skeleton (body, head, eyes, hair, outfit). Cloning the scene to measure a
  // bounding box (the old auto-center path) breaks the cloned skin bindings, so
  // Box3.setFromObject returns garbage and the resulting offset displaces the
  // eye mesh several units away from the head. RPM exports are already centered
  // with feet at Y≈0, so render the scene as-is and let modelOffset handle any
  // manual placement Eric needs.
  const sceneTransform = useMemo(
    () => ({
      rotation: [0, 0, 0] as [number, number, number],
      position: [0, 0, 0] as [number, number, number],
    }),
    []
  );

  // Eye replacement: RPM/Wolf3D ships eyes as a separate SkinnedMesh whose
  // skin binding races during clone/cache/hot-reload and ends up floating at
  // world origin. Working around the binding is unreliable — the skeleton
  // itself, however, has correctly-positioned `LeftEye` / `RightEye` (or
  // `EyeLeft` / `EyeRight`) bones inside the head sockets. Strategy:
  //   1. Hide every eye-related mesh node (floating geometry → invisible).
  //   2. Parent fresh sphere geometries to each eye bone — they inherit the
  //      bone's world transform and follow head rotation for free.
  //   3. Disable frustum culling on remaining skinned meshes so they don't
  //      pop when bones move outside the bind-pose bounding box.
  useEffect(() => {
    const EYE_MESH_RE = /^(Wolf3D_Eye|Wolf3D_Eyelashes|Eyes).*/i;
    const EYE_BONE_NAMES = ['LeftEye', 'RightEye', 'EyeLeft', 'EyeRight'];
    const EYE_BALL_TAG = '__mollyEyeBall';

    const eyeBones: THREE.Object3D[] = [];

    scene.traverse((node) => {
      const sm = node as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh) sm.frustumCulled = false;

      const isMesh =
        (node as THREE.Mesh).isMesh ||
        (node as THREE.SkinnedMesh).isSkinnedMesh;
      if (isMesh && EYE_MESH_RE.test(node.name)) {
        node.visible = false;
      }

      if (EYE_BONE_NAMES.some((n) => node.name.startsWith(n))) {
        eyeBones.push(node);
      }
    });

    // Sclera (white part)
    const scleraGeom = new THREE.SphereGeometry(0.014, 24, 24);
    const scleraMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.7,
      metalness: 0.0,
    });

    // Iris (dark circle on front)
    const irisGeom = new THREE.SphereGeometry(0.0088, 20, 20);
    const irisMat = new THREE.MeshStandardMaterial({
      color: 0x2a4a6a,
      roughness: 0.2,
      metalness: 0.3,
    });

    // Pupil (black dot)
    const pupilGeom = new THREE.SphereGeometry(0.0045, 16, 16);
    const pupilMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      roughness: 0.1,
      metalness: 0.0,
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        '[EyeSetup]',
        eyeBones.length,
        'eye bones found:',
        eyeBones.map((b) => b.name).join(', ')
      );
    }

    const created: THREE.Group[] = [];
    for (const bone of eyeBones) {
      // Skip if we already added an eyeball to this bone (Strict Mode safety).
      if (bone.children.some((c) => c.userData[EYE_BALL_TAG])) continue;

      // Create eye group (sclera + iris + pupil)
      const eyeGroup = new THREE.Group();
      eyeGroup.userData[EYE_BALL_TAG] = true;
      eyeGroup.position.set(0, 0, 0);

      const sclera = new THREE.Mesh(scleraGeom, scleraMat);
      sclera.position.z = 0;

      const iris = new THREE.Mesh(irisGeom, irisMat);
      iris.position.z = 0.007; // Slight forward offset to sit on sclera

      const pupil = new THREE.Mesh(pupilGeom, pupilMat);
      pupil.position.z = 0.0075; // Slight forward again for depth

      eyeGroup.add(sclera);
      eyeGroup.add(iris);
      eyeGroup.add(pupil);

      bone.add(eyeGroup);
      created.push(eyeGroup);
    }

    eyeGroupsRef.current = created;

    return () => {
      eyeGroupsRef.current = [];
      for (const eyeGroup of created) {
        eyeGroup.parent?.remove(eyeGroup);
      }
      scleraGeom.dispose();
      scleraMat.dispose();
      irisGeom.dispose();
      irisMat.dispose();
      pupilGeom.dispose();
      pupilMat.dispose();
    };
  }, [scene]);

  // Cache in refs so useFrame mutations don't touch hook return values directly.
  const bonesRef = useRef<BoneDict>({});
  const morphMeshesRef = useRef<THREE.SkinnedMesh[]>([]);
  const frameCountRef = useRef(0);

  // Eye animation refs — populated by the eye-setup effect below.
  const eyeGroupsRef = useRef<THREE.Group[]>([]);
  const gazeRef = useRef({
    yaw: 0,
    pitch: 0,
    targetYaw: 0,
    targetPitch: 0,
    nextChange: 2,
  });
  const blinkRef = useRef({ nextBlink: 3, phase: 0 }); // phase: 0=open, 0→1=closing, 1→0=opening

  useEffect(() => {
    bonesRef.current = bones as BoneDict;
    morphMeshesRef.current = morphMeshes;
  }, [bones, morphMeshes]);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    const frame = director.getFrame(time);
    const b = bonesRef.current;

    // 1. Neck orientation — drive from AvatarDirector's procedural targets.
    const neck = b[activeRig.neck];
    if (neck) {
      neck.rotation.x += (frame.neckPitch - neck.rotation.x) * LERP;
      neck.rotation.y += (frame.neckYaw - neck.rotation.y) * LERP;
    }

    // 2. Arm kinematics
    KinematicsCore.calculateFromBones(b, activeRig, frame.intent, time);

    // 3. Facial morph targets
    //    Phase 3: when expression tracking is fresh, override the voice/director
    //    morphs with MediaPipe blendshapes. Molly directive 2026-06-20:
    //    tracker wins when fresh, voice wins when stale. Path-separated from
    //    the iris clock above so a blink-driven iris stall does not suppress
    //    mouth mirroring (and vice-versa).
    const expressionFresh =
      enableExpressionTracking &&
      performance.now() - iris.buffer.current.expressionLastUpdate <
        EXPR_STALE_MS;
    const morphsForFrame: FacialMorphOverrides = expressionFresh
      ? { ...frame.morphOverrides, ...iris.buffer.current.expressionOverrides }
      : frame.morphOverrides;
    applyMorphs(morphMeshesRef.current, morphsForFrame);

    // 4. Gaze — eyes follow neck direction + intent-specific offset
    // frame.neckYaw/neckPitch are the same values driving the neck bone above,
    // so eyes and head converge on the same look-at point naturally.
    //
    // When iris tracking is active and a face is detected, the MediaPipe
    // buffer overrides the procedural saccade — Molly looks where the user
    // looks. Tracker stale-detection (IRIS_STALE_MS) ensures graceful fallback
    // if the camera drops or the user leaves frame.
    const gaze = gazeRef.current;
    const irisBuf = iris.buffer.current;
    const irisFresh =
      irisBuf.faceDetected &&
      performance.now() - irisBuf.lastUpdate < IRIS_STALE_MS;

    if (irisFresh) {
      // Tracker is live — lock target to its output; skip random saccade.
      gaze.targetYaw = irisBuf.yaw;
      gaze.targetPitch = irisBuf.pitch;
      // Push nextChange forward so when tracker drops, procedural doesn't
      // immediately snap to a random direction — let it ease in.
      gaze.nextChange = time + 0.5;
    } else if (time > gaze.nextChange) {
      const baseYaw = frame.neckYaw;
      const basePitch = frame.neckPitch;
      if (frame.intent === 'LOOK_AT_TARGET') {
        gaze.targetYaw = baseYaw;
        gaze.targetPitch = basePitch;
      } else if (
        frame.intent === 'REACH_FORWARD' ||
        frame.intent === 'REACH_UP'
      ) {
        gaze.targetYaw = baseYaw + (Math.random() - 0.5) * 0.15;
        gaze.targetPitch = basePitch - 0.12;
      } else if (frame.intent === 'NAVIGATE') {
        gaze.targetYaw = baseYaw + (Math.random() - 0.5) * 0.25;
        gaze.targetPitch = basePitch;
      } else {
        gaze.targetYaw = baseYaw + (Math.random() - 0.5) * 0.4;
        gaze.targetPitch = basePitch + (Math.random() - 0.5) * 0.2;
      }
      gaze.nextChange = time + 1.5 + Math.random() * 2.5;
    }
    gaze.yaw += (gaze.targetYaw - gaze.yaw) * 0.05;
    gaze.pitch += (gaze.targetPitch - gaze.pitch) * 0.05;
    const leftEye = b['LeftEye'] ?? b['EyeLeft'];
    const rightEye = b['RightEye'] ?? b['EyeRight'];
    if (leftEye) {
      leftEye.rotation.y = gaze.yaw;
      leftEye.rotation.x = gaze.pitch;
    }
    if (rightEye) {
      rightEye.rotation.y = gaze.yaw;
      rightEye.rotation.x = gaze.pitch;
    }

    // 5. Blink — mood comes straight from the robotics bridge moodHint.
    // ANALYTICAL (active plan) blinks faster; SUCCESS_FOUND holds eyes wide briefly.
    const blink = blinkRef.current;
    const blinkInterval =
      frame.mood === 'ANALYTICAL'
        ? 2
        : frame.mood === 'SUCCESS_FOUND'
          ? 6
          : 3.5 + Math.random() * 2;
    if (time > blink.nextBlink) {
      blink.phase = 0.001;
      blink.nextBlink = time + blinkInterval;
    }
    if (blink.phase > 0) {
      blink.phase += blink.phase < 0.5 ? 0.08 : 0.05;
      const scaleY =
        blink.phase < 0.5 ? 1 - blink.phase * 2 : (blink.phase - 0.5) * 2;
      const clamped = Math.max(0.05, Math.min(1, scaleY));
      // r3f pattern: mutate Object3D.scale in place — the ref contents are
      // THREE.Group instances and the render loop is the only writer.
      /* eslint-disable react-hooks/immutability */
      for (const g of eyeGroupsRef.current) g.scale.y = clamped;
      if (blink.phase >= 1) {
        blink.phase = 0;
        for (const g of eyeGroupsRef.current) g.scale.y = 1;
      }
      /* eslint-enable react-hooks/immutability */
    }

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
  rig,
  modelOffset = [0, 0, 0],
  modelPath = MODEL_PATH,
  enableIrisTracking = false,
  enableExpressionTracking = false,
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
      enableIrisTracking={enableIrisTracking}
      enableExpressionTracking={enableExpressionTracking}
    />
  );
}
