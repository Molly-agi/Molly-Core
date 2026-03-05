/**
 * @fileOverview Session Lifecycle Manager
 * Ensures session state is saved when the app unloads
 * Initializes memory evolution system on startup
 * Runs as a client component and integrates with Next.js lifecycle
 */

'use client';

import { useEffect, useRef } from 'react';
import { logSessionEventToFirestore } from '@/firebase/system-logger';

type SessionEventPayload = {
  event: string;
  url?: string;
  details?: string;
  timestamp: string;
};

function sendSessionEvent(payload: SessionEventPayload) {
  try {
    void fetch('/api/session/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Silently swallow fetch failures (offline, tab-killed, server not ready)
    });
  } catch {
    // Synchronous errors (e.g. fetch not available) — ignore
  }

  if (payload.event !== 'heartbeat') {
    void logSessionEventToFirestore({
      event: payload.event,
      url: payload.url,
      details: payload.details,
      timestamp: payload.timestamp,
    }).catch(() => {
      // Firestore logging failure — non-critical
    });
  }
}

export function SessionLifecycleManager() {
  const initializationAttempted = useRef(false);

  useEffect(() => {
    // Memory evolution system is available via manual trigger
    // NOT automatically initialized to prevent cascade failures
    if (!initializationAttempted.current) {
      initializationAttempted.current = true;
      console.log(
        '[SessionLifecycle] Memory system ready (manual init via /api/memory/init)'
      );
    }

    sendSessionEvent({
      event: 'page-load',
      url: window.location.href,
      timestamp: new Date().toISOString(),
    });

    void fetch('/api/session/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: {
          lastUpdated: new Date().toISOString(),
          status: 'active',
          runtime: {
            lastUrl: window.location.href,
          },
        },
      }),
      keepalive: true,
    }).catch(() => {
      // Session save failure on load — non-critical
    });

    const heartbeatId = window.setInterval(() => {
      sendSessionEvent({
        event: 'heartbeat',
        url: window.location.href,
        timestamp: new Date().toISOString(),
      });
    }, 60000);

    const handleVisibilityChange = () => {
      sendSessionEvent({
        event: document.hidden ? 'visibility-hidden' : 'visibility-visible',
        url: window.location.href,
        timestamp: new Date().toISOString(),
      });
    };

    const handleBeforeUnload = async () => {
      // Try to save session state before unload
      try {
        sendSessionEvent({
          event: 'page-unload',
          url: window.location.href,
          timestamp: new Date().toISOString(),
        });
        await fetch('/api/session/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state: {
              lastUpdated: new Date().toISOString(),
              status: 'paused',
              runtime: {
                lastUrl: window.location.href,
              },
            },
          }),
          // Use keepalive to ensure request completes even if page unloads
          keepalive: true,
        });
      } catch (error) {
        console.error(
          '[SessionLifecycle] Error saving session on unload:',
          error
        );
        // Silently fail - don't block unload
      }
    };

    // Listen for both beforeunload and unload events
    // beforeunload fires first and allows async operations with keepalive
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(heartbeatId);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return null; // This component doesn't render anything
}
