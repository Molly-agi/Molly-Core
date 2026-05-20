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

// --- Props ---

export interface MollyCanvasProps {
  director?: AvatarDirector;
  isVocalizing?: boolean;
  className?: string;
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
}: MollyCanvasProps) {
  const activeDirector = director ?? getDefaultDirector();

  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      <Canvas
        camera={{
          position: [0, 1.45, 2.2],
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

        {/* Avatar mesh — loaded inside Suspense; renders nothing until GLB is ready */}
        <Suspense fallback={null}>
          <MollyMesh director={activeDirector} />
        </Suspense>
      </Canvas>
    </div>
  );
}
