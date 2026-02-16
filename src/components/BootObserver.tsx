'use client';

import { useEffect, useRef } from 'react';

const DIAGNOSTICS_TIMEOUT_MS = 8000;

function sendSessionEvent(event: string, details?: string) {
  void fetch('/api/session/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event,
      details,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      timestamp: new Date().toISOString(),
    }),
    keepalive: true,
  });
}

function trace(
  phase: string,
  event: string,
  status: 'start' | 'complete' | 'error',
  details?: Record<string, unknown>
) {
  const tracer = (globalThis as any).__MOLLY_TRACE as
    | ((
        phase: string,
        event: string,
        status: 'start' | 'complete' | 'error',
        details?: Record<string, unknown>
      ) => void)
    | undefined;
  tracer?.(phase, event, status, details);
}

export function BootObserver() {
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    trace('BOOT', 'observer-start', 'start');
    sendSessionEvent('boot-observer-start');

    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      DIAGNOSTICS_TIMEOUT_MS
    );

    fetch('/api/health/full-diagnostics', {
      method: 'GET',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || 'Diagnostics request failed');
        }
        trace('BOOT', 'diagnostics', 'complete', {
          healthy: payload?.summary?.healthy ?? null,
          failedChecks: payload?.summary?.failedChecks ?? [],
        });
        sendSessionEvent(
          'boot-diagnostics',
          JSON.stringify(payload?.summary || {})
        );
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        trace('BOOT', 'diagnostics', 'error', { message });
        sendSessionEvent('boot-diagnostics-error', message);
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });
  }, []);

  return null;
}
