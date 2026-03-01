'use client';

import { useEffect } from 'react';
import { logClientErrorToFirestore } from '@/firebase/system-logger';
import {
  shouldAllow,
  shouldReportError,
  recordOutbound,
  recordError,
} from '@/lib/self-regulation';

type ErrorPayload = {
  message: string;
  stack?: string;
  source?: string;
  line?: number;
  column?: number;
  url?: string;
  userAgent?: string;
  timestamp?: string;
};

function sendClientError(payload: ErrorPayload) {
  // Self-regulation: should she report this?
  if (!shouldAllow('error-report')) return;
  if (!shouldReportError(payload.message)) return;

  recordOutbound();
  void fetch('/api/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  });
}

function sendSessionEvent(message: string, details?: string) {
  // Self-regulation: should she send this session event?
  if (!shouldAllow('session-event')) return;

  recordOutbound();
  void fetch('/api/session/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: message,
      details,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      timestamp: new Date().toISOString(),
    }),
    keepalive: true,
  });
}

export function ClientErrorReporter() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      // Record the error in self-regulation (she's observing herself)
      recordError();

      const details = event.error?.stack || event.message;
      sendSessionEvent('client-error', details);
      sendClientError({
        message: event.message || 'Unknown error',
        stack: event.error?.stack,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      });

      // Self-regulation: Firestore log only in normal/cautious mode
      if (shouldAllow('firestore-log')) {
        recordOutbound();
        void logClientErrorToFirestore({
          message: event.message || 'Unknown error',
          stack: event.error?.stack,
          source: event.filename,
          line: event.lineno,
          column: event.colno,
          url: window.location.href,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
        });
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      // Record the error in self-regulation
      recordError();

      const reason = event.reason instanceof Error ? event.reason : null;
      sendSessionEvent(
        'unhandled-rejection',
        reason?.stack || String(event.reason || 'Unhandled rejection')
      );
      sendClientError({
        message:
          reason?.message || String(event.reason || 'Unhandled rejection'),
        stack: reason?.stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      });

      // Self-regulation: Firestore log only when allowed
      if (shouldAllow('firestore-log')) {
        recordOutbound();
        void logClientErrorToFirestore({
          message:
            reason?.message || String(event.reason || 'Unhandled rejection'),
          stack: reason?.stack,
          url: window.location.href,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
        });
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}
