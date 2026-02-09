/**
 * @fileOverview Session Lifecycle Manager
 * Ensures session state is saved when the app unloads
 * Initializes memory evolution system on startup
 * Runs as a client component and integrates with Next.js lifecycle
 */

'use client';

import { useEffect, useRef } from 'react';

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

    const handleBeforeUnload = async () => {
      // Try to save session state before unload
      try {
        await fetch('/api/session/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state: {
              lastUpdated: new Date().toISOString(),
              status: 'paused',
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

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  return null; // This component doesn't render anything
}
