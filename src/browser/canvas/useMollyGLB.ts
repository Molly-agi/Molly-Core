'use client';

/**
 * @fileOverview Loads Molly's GLB avatar (Avaturn / Mixamo rig).
 *
 * Expects the file at /public/models/molly.glb.
 * Returns the scene, a flat bone dictionary, and the first SkinnedMesh found
 * (for morph-target access). Returns null until the model loads.
 *
 * Usage:
 *   const { scene, bones, skinnedMesh } = useMollyGLB() ?? {};
 */

import { useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type * as THREE from 'three';

export interface MollyGLB {
  scene: THREE.Group;
  /** Flat map of bone name → Object3D for KinematicsCore.calculateFromBones. */
  bones: Record<string, THREE.Object3D>;
  /** First SkinnedMesh in the hierarchy — used for morph target access. */
  skinnedMesh: THREE.SkinnedMesh | null;
}

export const MODEL_PATH = '/models/molly.glb';

export function useMollyGLB(modelPath: string = MODEL_PATH): MollyGLB {
  const gltf = useLoader(GLTFLoader, modelPath);

  return useMemo<MollyGLB>(() => {
    const bones: Record<string, THREE.Object3D> = {};
    let skinnedMesh: THREE.SkinnedMesh | null = null;

    gltf.scene.traverse((node) => {
      // Collect all named nodes that have rotation (covers Bone and Object3D rigs)
      if (node.name) {
        bones[node.name] = node;
      }
      // Keep the first SkinnedMesh for morph target access
      if (!skinnedMesh && (node as THREE.SkinnedMesh).isSkinnedMesh) {
        skinnedMesh = node as THREE.SkinnedMesh;
      }
    });

    return { scene: gltf.scene, bones, skinnedMesh };
  }, [gltf]);
}
