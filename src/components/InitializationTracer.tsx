/**
 * @fileOverview Molly Initialization Tracer
 *
 * Maps the ENTIRE initialization sequence with timestamps to identify
 * where the actual bottleneck is (not symptoms, but root cause)
 */

'use client';

import { useEffect, useState } from 'react';

interface TraceEvent {
  timestamp: number;
  phase: string;
  event: string;
  duration?: number;
  status: 'start' | 'complete' | 'error';
  details?: Record<string, any>;
}

const TRACE_EVENTS: TraceEvent[] = [];

// Global trace function - can be called from anywhere
(globalThis as any).__MOLLY_TRACE = (
  phase: string,
  event: string,
  status: 'start' | 'complete' | 'error',
  details?: Record<string, any>
) => {
  const trace: TraceEvent = {
    timestamp: performance.now(),
    phase,
    event,
    status,
    details,
  };
  TRACE_EVENTS.push(trace);

  // Log immediately for visibility
  const color =
    status === 'error' ? 'red' : status === 'complete' ? 'green' : 'yellow';
  console.log(
    `%c[${phase}] ${event} (${status})`,
    `color: ${color}; font-weight: bold`,
    details || ''
  );
};

function TracingPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [events, setEvents] = useState<TraceEvent[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setEvents([
        ...((globalThis as any).__MOLLY_TRACE_EVENTS || TRACE_EVENTS),
      ]);
    }, 500);

    return () => clearInterval(interval);
  }, []);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 10000,
          padding: '8px 12px',
          background: '#222',
          color: '#0f0',
          border: '2px solid #0f0',
          cursor: 'pointer',
          fontSize: '12px',
          fontFamily: 'monospace',
          borderRadius: '4px',
        }}
      >
        🔍 Init Trace ({events.length})
      </button>
    );
  }

  const totalTime =
    events.length > 0
      ? events[events.length - 1].timestamp - events[0].timestamp
      : 0;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 10000,
        width: '600px',
        maxHeight: '500px',
        background: '#1a1a1a',
        color: '#0f0',
        border: '2px solid #0f0',
        borderRadius: '4px',
        padding: '12px',
        fontFamily: 'monospace',
        fontSize: '11px',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '12px',
          paddingBottom: '12px',
          borderBottom: '1px solid #0f088',
        }}
      >
        <div>
          <strong>Molly Initialization Trace</strong>
          <div style={{ fontSize: '10px', color: '#888', marginTop: '4px' }}>
            Total time: {totalTime.toFixed(0)}ms | Events: {events.length}
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          style={{
            background: 'none',
            border: 'none',
            color: '#0f0',
            cursor: 'pointer',
            fontSize: '18px',
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {events.map((event, idx) => {
          const duration = events[idx + 1]?.timestamp - event.timestamp;
          const statusColor =
            event.status === 'error'
              ? '#f00'
              : event.status === 'complete'
                ? '#0f0'
                : '#ff0';

          return (
            <div
              key={idx}
              style={{
                marginBottom: '8px',
                paddingBottom: '8px',
                borderBottom: '1px solid #333',
              }}
            >
              <div style={{ color: statusColor }}>
                [{event.phase}] {event.event}
                {event.status === 'start' &&
                  duration &&
                  ` → +${duration.toFixed(0)}ms`}
              </div>
              {event.details && (
                <div
                  style={{ color: '#666', fontSize: '10px', marginTop: '2px' }}
                >
                  {JSON.stringify(event.details)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function InitializationTracer() {
  useEffect(() => {
    // Store globally so it persists
    (globalThis as any).__MOLLY_TRACE_EVENTS = TRACE_EVENTS;
  }, []);

  return <TracingPanel />;
}
