'use client';

import { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type HealthState = 'healthy' | 'degraded' | 'critical';

interface HealthData {
  state: HealthState;
  lastChecked: string;
  circuitBreaker?: string;
  message?: string;
}

const POLL_INTERVAL_MS = 60_000;
const BACKOFF_INTERVAL_MS = 120_000; // 2 min backoff after failure

export function SystemHealthDot() {
  const [health, setHealth] = useState<HealthData>({
    state: 'healthy',
    lastChecked: new Date().toISOString(),
  });
  const [pollInterval, setPollInterval] = useState(POLL_INTERVAL_MS);

  const checkHealth = useCallback(async () => {
    try {
      const [heartbeatRes, circuitRes] = await Promise.allSettled([
        fetch('/api/heartbeat', { signal: AbortSignal.timeout(5000) }),
        fetch('/api/diagnostics/circuit-status', {
          signal: AbortSignal.timeout(5000),
        }),
      ]);

      const now = new Date().toISOString();

      // If heartbeat fails entirely, mark degraded (not critical) for transient network issues
      if (heartbeatRes.status === 'rejected' || !heartbeatRes.value.ok) {
        setPollInterval(BACKOFF_INTERVAL_MS);
        setHealth({
          state: 'degraded',
          lastChecked: now,
          message: 'Server unreachable — retrying',
        });
        return;
      }

      // Check circuit breaker state
      if (circuitRes.status === 'fulfilled' && circuitRes.value.ok) {
        const data = await circuitRes.value.json();
        const globalStats = data.globalStats;

        if (globalStats?.state === 'OPEN') {
          setHealth({
            state: 'critical',
            lastChecked: now,
            circuitBreaker: 'OPEN',
            message: 'Circuit breaker tripped',
          });
          return;
        }

        if (globalStats?.state === 'HALF_OPEN') {
          setHealth({
            state: 'degraded',
            lastChecked: now,
            circuitBreaker: 'HALF_OPEN',
            message: 'Circuit breaker recovering',
          });
          return;
        }

        setPollInterval(POLL_INTERVAL_MS); // reset backoff on success
        setHealth({
          state: 'healthy',
          lastChecked: now,
          circuitBreaker: globalStats?.state || 'CLOSED',
        });
      } else {
        // Heartbeat ok but circuit status failed — degraded
        setHealth({
          state: 'degraded',
          lastChecked: now,
          message: 'Diagnostics unavailable',
        });
      }
    } catch {
      setPollInterval(BACKOFF_INTERVAL_MS);
      setHealth({
        state: 'degraded',
        lastChecked: new Date().toISOString(),
        message: 'Health check failed — retrying',
      });
    }
  }, []);

  useEffect(() => {
    // Defer initial check to avoid synchronous setState cascade
    queueMicrotask(() => {
      checkHealth();
    });
    const interval = setInterval(checkHealth, pollInterval);
    return () => clearInterval(interval);
  }, [checkHealth, pollInterval]);

  const dotClass = cn('h-2.5 w-2.5 rounded-full inline-block', {
    'bg-green-500': health.state === 'healthy',
    'bg-yellow-500 animate-pulse': health.state === 'degraded',
    'bg-red-500 animate-ping': health.state === 'critical',
  });

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString();
    } catch {
      return 'unknown';
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="relative flex items-center justify-center h-4 w-4 cursor-default">
            <span className={dotClass} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs space-y-1">
          <p className="font-semibold capitalize">Status: {health.state}</p>
          {health.circuitBreaker && (
            <p>Circuit Breaker: {health.circuitBreaker}</p>
          )}
          {health.message && <p>{health.message}</p>}
          <p className="text-muted-foreground">
            Last checked: {formatTime(health.lastChecked)}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
