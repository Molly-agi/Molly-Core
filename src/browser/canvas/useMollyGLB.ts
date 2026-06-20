'use client';

/**
 * @fileOverview Loads Molly's GLB avatar (Avaturn / Mixamo / RPM rig).
 *
 * Expects the file at /public/models/molly.glb.
 * Returns the scene, a flat bone dictionary, and the first SkinnedMesh found
 * (for morph-target access).
 *
 * Uses SkeletonUtils.clone instead of returning the cached gltf.scene directly:
 * useLoader caches one scene per URL, but a SkinnedMesh can only live in one
 * place in the scene graph at a time. Strict-mode double-mounts or two
 * MollyCanvas instances would corrupt the shared skeleton binding and detach
 * eyes/teeth from the head. SkeletonUtils.clone rebinds the skinned meshes to
 * a fresh skeleton copy.
 */

import { useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type * as THREE from 'three';

export interface MollyGLB {
  scene: THREE.Group;
  bones: Record<string, THREE.Object3D>;
  /** All meshes that carry morph targets (Wolf3D_Head, Wolf3D_Teeth, etc). */
  morphMeshes: THREE.SkinnedMesh[];
}

export const MODEL_PATH = '/models/molly.glb';

export function useMollyGLB(modelPath: string = MODEL_PATH): MollyGLB {
  const gltf = useLoader(GLTFLoader, modelPath);

  return useMemo<MollyGLB>(() => {
    // Deep clone via SkeletonUtils so each mount owns its own skeleton —
    // sharing the cached gltf.scene across mounts detaches eye/teeth meshes.
    const scene = skeletonClone(gltf.scene) as THREE.Group;

    const bones: Record<string, THREE.Object3D> = {};
    const morphMeshes: THREE.SkinnedMesh[] = [];
    const MORPH_MESH_NAMES = new Set(['Wolf3D_Head', 'Wolf3D_Teeth']);

    scene.traverse((node) => {
      if (node.name) bones[node.name] = node;
      const sm = node as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh && MORPH_MESH_NAMES.has(node.name)) {
        morphMeshes.push(sm);
      }
    });

    return { scene, bones, morphMeshes };
  }, [gltf]);
}
