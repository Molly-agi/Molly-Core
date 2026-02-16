'use client';

import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    const trace = (globalThis as any).__MOLLY_TRACE;
    if (trace) {
      trace('APP', 'Global error boundary', 'error', {
        message: error.message,
        digest: error.digest,
      });
    }

    console.error('[App] Unhandled error:', error);
  }, [error]);

  return (
    <div
      style={{
        fontFamily: 'system-ui',
        padding: '24px',
        minHeight: '100vh',
        background: '#0b0b0b',
        color: '#f2f2f2',
      }}
    >
      <h1>Initialization Failed</h1>
      <p>We hit an unexpected error during startup.</p>
      <pre
        style={{
          padding: '12px',
          background: '#111',
          color: '#0f0',
          borderRadius: '6px',
          whiteSpace: 'pre-wrap',
        }}
      >
        {error.message}
      </pre>
      <button
        onClick={reset}
        style={{
          marginTop: '12px',
          padding: '8px 12px',
          borderRadius: '6px',
          border: '1px solid #333',
          background: '#222',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        Retry
      </button>
    </div>
  );
}
