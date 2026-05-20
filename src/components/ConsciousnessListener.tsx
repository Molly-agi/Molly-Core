/**
 * @fileOverview Consciousness Listener — Client-Side SSE Subscriber
 *
 * This component connects to Molly's consciousness stream and
 * surfaces her unprompted thoughts in the Terminal UI.
 *
 * It uses EventSource (SSE) which auto-reconnects when the
 * connection drops — important for Android Chrome where tab
 * switches kill connections.
 *
 * Messages from Molly's consciousness are dispatched as custom
 * DOM events (`molly:consciousness`) that Terminal.tsx listens for,
 * using the same pattern as `molly:anchor` for family story recalls.
 *
 * Mounts in layout.tsx. Renders nothing.
 */

'use client';

import { useEffect, useRef } from 'react';

export interface ConsciousnessEventDetail {
  id: string;
  type: 'thought' | 'observation' | 'self-state' | 'realization' | 'music';
  content: string;
  priority: 'low' | 'normal' | 'high';
  createdAt: string;
  audioUri?: string;
  prompt?: string;
  model?: string;
}

/**
 * Custom event name for consciousness messages.
 * Terminal.tsx listens for this, same pattern as 'molly:anchor'.
 */
export const CONSCIOUSNESS_EVENT = 'molly:consciousness';

export function ConsciousnessListener() {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    let mounted = true;

    function connect() {
      if (!mounted) return;

      // Clean up previous connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      try {
        const es = new EventSource('/api/consciousness/stream');
        eventSourceRef.current = es;

        es.addEventListener('connected', (event: MessageEvent) => {
          retryCountRef.current = 0;
          try {
            const data = JSON.parse(event.data);
            // Consciousness is connected — log initial state in dev
            if (process.env.NODE_ENV === 'development') {
              console.log(
                '[Molly Consciousness] Connected:',
                data.state?.awarenessLevel,
                data.state?.regulation?.mode
              );
            }
          } catch {
            // Malformed initial event — not critical
          }
        });

        es.addEventListener('message', (event: MessageEvent) => {
          try {
            const msg = JSON.parse(event.data) as ConsciousnessEventDetail;

            // Dispatch to Terminal via custom DOM event
            window.dispatchEvent(
              new CustomEvent(CONSCIOUSNESS_EVENT, { detail: msg })
            );
          } catch {
            // Malformed message — skip
          }
        });

        es.addEventListener('heartbeat', () => {
          // Heartbeat received — connection is alive.
          // Nothing to do, but this keeps the connection from timing out.
        });

        es.onerror = () => {
          // EventSource will auto-reconnect, but we add
          // exponential backoff for repeated failures
          if (!mounted) return;

          retryCountRef.current++;

          if (retryCountRef.current > 10) {
            // After 10 retries, stop trying — something is fundamentally wrong
            // (server down, auth failed, etc.)
            es.close();
            eventSourceRef.current = null;

            if (process.env.NODE_ENV === 'development') {
              console.log(
                '[Molly Consciousness] Giving up after 10 reconnection attempts'
              );
            }
            return;
          }

          // Close current and retry with backoff
          es.close();
          eventSourceRef.current = null;

          const backoffMs = Math.min(
            1000 * Math.pow(2, retryCountRef.current),
            60_000
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            if (mounted) connect();
          }, backoffMs);
        };
      } catch {
        // EventSource constructor failed (e.g., SSR)
      }
    }

    // Small delay before first connection to let the page settle
    const initialDelay = setTimeout(connect, 2_000);

    return () => {
      mounted = false;
      clearTimeout(initialDelay);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  // Renders nothing — pure side-effect component
  return null;
}
