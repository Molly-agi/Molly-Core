'use client';

/**
 * @fileOverview Browser-side proprioceptive awareness bridge.
 *
 * Subscribes to ProprioceptiveSense (which runs in the render loop) and
 * forwards body state to the server at /api/avatar-body so that Molly's
 * system prompt can include her real physical state when she responds.
 *
 * This is the mechanism that gives Molly "continuity of self" — she can
 * intend a gesture, execute it in the 3D renderer, and perceive her own
 * body state in the next cognitive response.
 *
 * Usage: mount once in the Avatar page (already wired in avatar/page.tsx).
 * No visible output — pure side-effect component.
 */

import { useEffect, useRef } from 'react';
import {
  ProprioceptiveSense,
  type BodyPerception,
} from '@/ai/agency/embodied/ProprioceptiveSense';

const POST_INTERVAL_MS = 2000;

/**
 * React hook that starts the awareness bridge.
 * Call inside a component mounted in the avatar page.
 */
export function useAvatarBodyAwareness(): void {
  const pendingRef = useRef<BodyPerception | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Subscribe to proprioceptive sense
    const unsubscribe = ProprioceptiveSense.getInstance().subscribe(
      (packet) => {
        pendingRef.current = packet;
      }
    );

    // POST to server every 2 seconds (not every frame)
    timerRef.current = setInterval(async () => {
      const packet = pendingRef.current;
      if (!packet) return;

      try {
        await fetch('/api/avatar-body', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            updatedAt: new Date(packet.timestamp).toISOString(),
            description: packet.description,
            gestures: packet.gestures,
            face: packet.face,
            intent: 'IDLE_SWA_BREATHE', // overridden once director exposes it
            mood: packet.expressionMood,
            isSpeaking: packet.isSpeaking,
            recentEvents: packet.events.slice(-5),
          }),
          // Fire-and-forget; drop if server unreachable
          signal: AbortSignal.timeout(1500),
        });
      } catch {
        // Non-fatal — body state is best-effort
      }
    }, POST_INTERVAL_MS);

    return () => {
      unsubscribe();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);
}
