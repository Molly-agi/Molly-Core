'use client';

/**
 * @fileOverview Tab Keep-Alive Button Component
 *
 * A small floating button that activates silent audio to prevent
 * the browser from suspending the tab when you switch away.
 *
 * Shows status: 🔇 = inactive, 🔊 = active (keeping tab alive)
 */

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import {
  startTabKeepAlive,
  stopTabKeepAlive,
  isTabKeepAliveActive,
} from '@/lib/tab-keepalive';

interface TabKeepAliveButtonProps {
  /** Auto-start on mount */
  autoStart?: boolean;
  /** Position: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' */
  position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
}

// Simple store for keep-alive status
let listeners: Array<() => void> = [];
let currentStatus = false;

function subscribe(listener: () => void) {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getSnapshot() {
  return currentStatus;
}

function getServerSnapshot() {
  return false;
}

function updateStatus(newStatus: boolean) {
  currentStatus = newStatus;
  listeners.forEach((l) => l());
}

export function TabKeepAliveButton({
  autoStart = false,
  position = 'bottom-right',
}: TabKeepAliveButtonProps) {
  const active = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );
  const [showTooltip, setShowTooltip] = useState(false);

  // Auto-start if requested
  useEffect(() => {
    // Sync initial status
    updateStatus(isTabKeepAliveActive());

    if (autoStart && !isTabKeepAliveActive()) {
      // Delay to avoid autoplay policy issues
      const timer = setTimeout(() => {
        const started = startTabKeepAlive();
        updateStatus(started);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [autoStart]);

  const toggle = useCallback(() => {
    if (active) {
      stopTabKeepAlive();
      updateStatus(false);
    } else {
      // Need user interaction for AudioContext on some browsers
      const started = startTabKeepAlive();
      updateStatus(started);
      if (!started) {
        alert('Could not start keep-alive. Try clicking again.');
      }
    }
  }, [active]);

  const positionStyles: Record<string, React.CSSProperties> = {
    'bottom-left': { bottom: 16, left: 16 },
    'bottom-right': { bottom: 16, right: 16 },
    'top-left': { top: 16, left: 16 },
    'top-right': { top: 16, right: 16 },
  };

  return (
    <div
      style={{
        position: 'fixed',
        ...positionStyles[position],
        zIndex: 9999,
      }}
    >
      <button
        onClick={toggle}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: 'none',
          background: active ? '#22c55e' : '#374151',
          color: 'white',
          fontSize: 18,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          transition: 'background 0.2s, transform 0.1s',
        }}
        title={active ? 'Tab Keep-Alive: ON' : 'Tab Keep-Alive: OFF'}
      >
        {active ? '🔊' : '🔇'}
      </button>

      {showTooltip && (
        <div
          style={{
            position: 'absolute',
            bottom: 48,
            right: 0,
            background: '#1f2937',
            color: '#f9fafb',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 12,
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          {active ? (
            <>
              <strong>Tab Keep-Alive: ON</strong>
              <br />
              <span style={{ color: '#9ca3af' }}>
                Playing silent audio to prevent tab suspension
              </span>
            </>
          ) : (
            <>
              <strong>Tab Keep-Alive: OFF</strong>
              <br />
              <span style={{ color: '#9ca3af' }}>
                Click to prevent Codespace disconnect
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
