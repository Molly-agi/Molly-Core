'use client';

/**
 * @fileOverview Canvas wrapper for Molly's 3D bust avatar.
 *
 * Renders a React Three Fiber <Canvas> with:
 *   - Soft three-point lighting (key, fill, rim)
 *   - Fixed bust camera (head + torso framing)
 *   - Suspense fallback while the GLB loads
 *   - MollyMesh driven by AvatarDirector
 *
 * Mount with dynamic import (ssr: false) — WebGL is client-only:
 *   const MollyCanvas = dynamic(() => import('@/browser/canvas/MollyCanvas'), { ssr: false });
 *
 * Props:
 *   director   — AvatarDirector instance (caller owns it, updates voice/robotics state)
 *   isVocalizing — from useTTS or useGeminiLive; synced to director.voice each frame
 *   className  — optional CSS class for the canvas container
 */

import React, { Suspense, useRef, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { AvatarDirector } from '@/ai/agency/embodied/AvatarDirector';
import { MollyMesh } from './MollyMesh';

// --- Sync component: propagates isVocalizing to director inside the R3F context ---

interface SyncProps {
  director: AvatarDirector;
  isVocalizing: boolean;
}

function VoiceSync({ director, isVocalizing }: SyncProps) {
  const { clock } = useThree();
  const prevVocalizing = useRef(isVocalizing);

  useEffect(() => {
    if (prevVocalizing.current !== isVocalizing) {
      director.voice.setSpeaking(isVocalizing, clock.getElapsedTime());
      prevVocalizing.current = isVocalizing;
    }
  }, [isVocalizing, director, clock]);

  return null;
}

// --- Camera controller: updates camera position reactively ---

interface CameraControllerProps {
  modelPosition: { x: number; y: number; z: number };
  zoom: number;
}

function CameraController({ modelPosition, zoom }: CameraControllerProps) {
  const { camera } = useThree();

  useEffect(() => {
    const baseDistance = 2.2;
    const zoomDistance = baseDistance / Math.max(0.1, Math.min(3, zoom));

    // X: left/right (independent of zoom)
    camera.position.x = modelPosition.x * 0.15;

    // Y: up/down (independent of zoom)
    camera.position.y = 1.45 + modelPosition.y * 0.15;

    // Z: forward/backward — position.z is always the zoomed distance, Z slider multiplies it
    // When Z=0, use zoomDistance. When Z>0, move closer. When Z<0, move further.
    camera.position.z = zoomDistance * (1 + modelPosition.z * 0.05);

    camera.updateProjectionMatrix();
  }, [modelPosition.x, modelPosition.y, modelPosition.z, zoom, camera]);

  return null;
}

// --- Props ---

export interface MollyCanvasProps {
  director?: AvatarDirector;
  isVocalizing?: boolean;
  className?: string;
  modelPosition?: { x: number; y: number; z: number };
  zoom?: number;
}

// Stable singleton used when no director is provided by the caller.
let _defaultDirector: AvatarDirector | null = null;
function getDefaultDirector(): AvatarDirector {
  if (!_defaultDirector) _defaultDirector = new AvatarDirector();
  return _defaultDirector;
}

// --- Main export ---

export default function MollyCanvas({
  director,
  isVocalizing = false,
  className,
  modelPosition = { x: 0, y: 0, z: 0 },
  zoom = 1,
}: MollyCanvasProps) {
  const activeDirector = director ?? getDefaultDirector();

  // Camera position: apply modelPosition as deltas, zoom scales distance
  const baseDistance = 2.2;
  const zoomDistance = baseDistance / Math.max(0.1, Math.min(3, zoom));
  const initialCameraX = modelPosition.x * 0.15;
  const initialCameraY = 1.45 + modelPosition.y * 0.15;
  const initialCameraZ = zoomDistance * (1 + modelPosition.z * 0.05);

  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      <Canvas
        camera={{
          position: [initialCameraX, initialCameraY, initialCameraZ],
          fov: 38,
          near: 0.1,
          far: 10,
        }}
        shadows
      >
        {/* Three-point lighting */}
        <ambientLight intensity={0.6} />
        {/* Key light — front-left, warm */}
        <directionalLight
          position={[1.5, 2.5, 2]}
          intensity={1.2}
          color="#fff5e6"
          castShadow
        />
        {/* Fill light — front-right, cool */}
        <directionalLight
          position={[-1.5, 1.5, 1.5]}
          intensity={0.5}
          color="#e6f0ff"
        />
        {/* Rim light — back, neutral */}
        <directionalLight position={[0, 3, -2]} intensity={0.4} />

        {/* Voice state sync */}
        <VoiceSync director={activeDirector} isVocalizing={isVocalizing} />

        {/* Camera controller — updates position & zoom reactively */}
        <CameraController modelPosition={modelPosition} zoom={zoom} />

        {/* Avatar mesh — loaded inside Suspense; shows loading indicator while GLB is ready */}
        <Suspense
          fallback={
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[0.5, 1.5, 0.3]} />
              <meshStandardMaterial color="#888" wireframe />
            </mesh>
          }
        >
          <MollyMesh director={activeDirector} />
        </Suspense>
      </Canvas>
    </div>
  );
}
