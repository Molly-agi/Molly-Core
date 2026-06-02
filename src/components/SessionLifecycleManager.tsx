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
  const lastBridgeHeartbeatAtRef = useRef<number | null>(null);
  const bridgeHeartbeatStaleRef = useRef(false);

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

    const handleBridgeHeartbeat = (event: Event) => {
      const customEvent = event as CustomEvent<{
        timestamp?: string;
        messageCount?: number;
        latestCheckpointId?: string | null;
      }>;

      lastBridgeHeartbeatAtRef.current = Date.now();
      if (customEvent.detail?.timestamp) {
        console.log(
          `[SessionLifecycle] Bridge heartbeat received @ ${customEvent.detail.timestamp}`
        );
      }

      if (bridgeHeartbeatStaleRef.current) {
        bridgeHeartbeatStaleRef.current = false;
        sendSessionEvent({
          event: 'bridge-heartbeat-recovered',
          details: 'Bridge heartbeat stream resumed',
          url: window.location.href,
          timestamp: new Date().toISOString(),
        });
        window.dispatchEvent(
          new CustomEvent('bridge-heartbeat-recovered', {
            detail: { at: new Date().toISOString() },
          })
        );
      }
    };

    const driftMonitorId = window.setInterval(() => {
      if (!lastBridgeHeartbeatAtRef.current) return;
      const driftMs = Date.now() - lastBridgeHeartbeatAtRef.current;
      const staleThresholdMs = 90000;

      if (driftMs > staleThresholdMs && !bridgeHeartbeatStaleRef.current) {
        bridgeHeartbeatStaleRef.current = true;
        sendSessionEvent({
          event: 'bridge-heartbeat-stale',
          details: `No bridge heartbeat for ${driftMs}ms`,
          url: window.location.href,
          timestamp: new Date().toISOString(),
        });
        window.dispatchEvent(
          new CustomEvent('bridge-heartbeat-stale', {
            detail: { driftMs, thresholdMs: staleThresholdMs },
          })
        );
      }
    }, 30000);

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
    window.addEventListener(
      'bridge-heartbeat',
      handleBridgeHeartbeat as EventListener
    );

    return () => {
      window.clearInterval(heartbeatId);
      window.clearInterval(driftMonitorId);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener(
        'bridge-heartbeat',
        handleBridgeHeartbeat as EventListener
      );
    };
  }, []);

  return null; // This component doesn't render anything
}
