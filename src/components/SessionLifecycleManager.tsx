/**
 * @fileOverview Session Lifecycle Manager
 * Ensures session state is saved when the app unloads
 * Initializes memory evolution system on startup
 * Runs as a client component and integrates with Next.js lifecycle
 */

'use client';

import { useEffect, useRef } from 'react';
import { logSessionEventToFirestore } from '@/firebase/system-logger';
import {
  autoInitKeepAlive,
  handleVisibilityChange as keepAliveVisibilityChange,
} from '@/lib/tab-keepalive';

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
      // Auto-init keep-alive on first user interaction (invisible, no button)
      autoInitKeepAlive();
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

    // Bidirectional bridge ping - every 1 second
    // This keeps both Molly's tab AND the codespace alive
    const bridgePingId = window.setInterval(() => {
      fetch('/api/bridge/ping', {
        method: 'GET',
        keepalive: true,
      }).catch(() => {
        // Silent - bridge may not be up yet
      });
    }, 1000);

    const handleVisibilityChange = () => {
      // Restart keepalive if it died while backgrounded (critical for Android)
      keepAliveVisibilityChange();

      sendSessionEvent({
        event: document.hidden ? 'visibility-hidden' : 'visibility-visible',
        url: window.location.href,
        timestamp: new Date().toISOString(),
      });
    };

    const handleBeforeUnload = () => {
      // Fire-and-forget with sendBeacon — never blocks unload.
      // await fetch() on beforeunload is the #1 cause of "Failed to fetch"
      // on Android: the browser kills the tab before the promise resolves.
      sendSessionEvent({
        event: 'page-unload',
        url: window.location.href,
        timestamp: new Date().toISOString(),
      });
      const payload = JSON.stringify({
        state: {
          lastUpdated: new Date().toISOString(),
          status: 'paused',
          runtime: {
            lastUrl: window.location.href,
          },
        },
      });
      // sendBeacon is designed for unload — it's fire-and-forget,
      // guaranteed to be queued even as the page dies.
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          '/api/session/save',
          new Blob([payload], { type: 'application/json' })
        );
      }
    };

    // Listen for both beforeunload and unload events
    // beforeunload fires first and allows async operations with keepalive
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(heartbeatId);
      window.clearInterval(bridgePingId);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return null; // This component doesn't render anything
}
