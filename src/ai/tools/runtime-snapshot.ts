import { getCircuitBreaker, CircuitState } from '@/ai/tools/circuit-breaker';
import { getRateLimiter } from '@/ai/tools/rate-limiter';
import { getLatencyStats } from '@/ai/tools/latency-cache';
import { getSystemHealth } from '@/ai/tools/system';
import { verifyRecordIntegrity } from '@/ai/tools/memory-integrity';
import { loadSessionState } from '@/lib/session-manager';
import { getStorageRouter } from '@/lib/storage-router';
import { isAdminConfigured } from '@/firebase/admin';

/** Race a promise against a timeout — returns fallback on timeout. */
function withTimeoutFallback<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

const FIRESTORE_QUERY_TIMEOUT_MS = 5000;
const SYSTEM_HEALTH_TIMEOUT_MS = 3000;

export interface RuntimeSnapshot {
  timestamp: string;
  heartbeat: {
    lastHeartbeat: string | null;
    lastUrl: string | null;
    recentEvents: number;
    freshnessMs: number | null;
  };
  systemHealth: {
    status: 'ok' | 'degraded';
    cpuUsage?: number;
    temperatureC?: number;
    batteryLevel?: number;
    throttlingStatus?: string;
    powerMode?: string;
    model?: string;
  };
  latency: ReturnType<typeof getLatencyStats>;
  circuitBreaker: {
    globalState: CircuitState;
    openOperations: string[];
    halfOpenOperations: string[];
    failureCount: number;
    recentFailureOperations: string[];
  };
  rateLimiter: {
    budgetRemaining: number;
    percentageUsed: number;
    tokensUsedToday: number;
    costIncurredUSD: number;
  };
  memoryHealth: {
    status: 'ok' | 'degraded' | 'unavailable';
    userId: string | null;
    checkedRecords: number;
    validChecksums: number;
    invalidChecksums: number;
    missingChecksums: number;
    warning?: string;
    error?: string;
  };
  recentFailures: Array<{
    timestamp: string;
    event: string;
    details?: string;
  }>;
}

function parseTimestampMs(value?: string): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function collectMemoryHealth(userId?: string) {
  if (!userId) {
    return {
      status: 'unavailable' as const,
      userId: null,
      checkedRecords: 0,
      validChecksums: 0,
      invalidChecksums: 0,
      missingChecksums: 0,
      warning: 'No userId provided for memory validation.',
    };
  }

  // In Firestore mode, check if admin is configured
  const storage = getStorageRouter();
  if (storage.getMode() === 'firestore' && !isAdminConfigured()) {
    return {
      status: 'unavailable' as const,
      userId,
      checkedRecords: 0,
      validChecksums: 0,
      invalidChecksums: 0,
      missingChecksums: 0,
      warning: 'Admin Firestore is not configured.',
    };
  }

  try {
    const collectionPath = `users/${userId}/aiResponses`;
    const results = await withTimeoutFallback(
      storage.query(collectionPath, [], {
        orderBy: { field: 'timestamp', direction: 'desc' },
        limit: 20,
      }),
      FIRESTORE_QUERY_TIMEOUT_MS,
      null
    );

    if (!results) {
      return {
        status: 'degraded' as const,
        userId,
        checkedRecords: 0,
        validChecksums: 0,
        invalidChecksums: 0,
        missingChecksums: 0,
        warning: 'Memory health check timed out — storage may be slow.',
      };
    }

    let validChecksums = 0;
    let invalidChecksums = 0;
    let missingChecksums = 0;

    results.forEach((doc) => {
      const data = doc.data as Record<string, unknown>;
      if (!('crc32' in data) || typeof data.crc32 !== 'string') {
        missingChecksums += 1;
        return;
      }

      if (verifyRecordIntegrity(data)) {
        validChecksums += 1;
      } else {
        invalidChecksums += 1;
      }
    });

    const status = invalidChecksums > 0 ? 'degraded' : 'ok';
    const warning =
      missingChecksums > 0
        ? `${missingChecksums} recent memory records are missing checksum metadata.`
        : undefined;

    return {
      status,
      userId,
      checkedRecords: results.length,
      validChecksums,
      invalidChecksums,
      missingChecksums,
      warning,
    } as const;
  } catch (error) {
    return {
      status: 'degraded' as const,
      userId,
      checkedRecords: 0,
      validChecksums: 0,
      invalidChecksums: 0,
      missingChecksums: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function collectRuntimeSnapshot(
  userId?: string
): Promise<RuntimeSnapshot> {
  const nowIso = new Date().toISOString();

  const sessionState = loadSessionState();
  const runtime = sessionState.runtime ?? { events: [] };
  const heartbeatMs = parseTimestampMs(runtime.lastHeartbeat);

  const [systemHealthResult, memoryHealth] = await Promise.all([
    withTimeoutFallback(
      getSystemHealth({})
        .then((health) => ({ ok: true as const, health }))
        .catch(() => ({ ok: false as const })),
      SYSTEM_HEALTH_TIMEOUT_MS,
      { ok: false as const }
    ),
    collectMemoryHealth(userId),
  ]);

  const breaker = getCircuitBreaker();
  const breakerStatus = breaker.getStatus();
  const operationEntries = Object.entries(breakerStatus.operations || {});

  const openOperations = operationEntries
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter(([, stats]: any) => stats.state === CircuitState.OPEN)
    .map(([name]) => name);

  const halfOpenOperations = operationEntries
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter(([, stats]: any) => stats.state === CircuitState.HALF_OPEN)
    .map(([name]) => name);

  const recentFailureOperations = operationEntries
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter(([, stats]: any) => (stats.failureCount || 0) > 0)
    .sort(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (a: any, b: any) => (b[1].failureCount || 0) - (a[1].failureCount || 0)
    )
    .slice(0, 5)
    .map(([name]) => name);

  const limiterStatus = getRateLimiter().getStatus();
  const recentFailures = (runtime.events || [])
    .filter((event) => {
      const name = (event.event || '').toLowerCase();
      return (
        name.includes('error') ||
        name.includes('failure') ||
        name.includes('heart-patch')
      );
    })
    .slice(-10)
    .map((event) => ({
      timestamp: event.timestamp,
      event: event.event,
      details: event.details,
    }));

  return {
    timestamp: nowIso,
    heartbeat: {
      lastHeartbeat: runtime.lastHeartbeat || null,
      lastUrl: runtime.lastUrl || null,
      recentEvents: (runtime.events || []).length,
      freshnessMs: heartbeatMs ? Math.max(0, Date.now() - heartbeatMs) : null,
    },
    systemHealth: systemHealthResult.ok
      ? {
          status: 'ok',
          cpuUsage: systemHealthResult.health.cpuUsage,
          temperatureC: systemHealthResult.health.temperature,
          batteryLevel: systemHealthResult.health.batteryLevel,
          throttlingStatus: systemHealthResult.health.throttlingStatus,
          powerMode: systemHealthResult.health.powerMode,
          model: systemHealthResult.health.model,
        }
      : {
          status: 'degraded',
        },
    latency: getLatencyStats(),
    circuitBreaker: {
      globalState: breakerStatus.global.state,
      openOperations,
      halfOpenOperations,
      failureCount: operationEntries.reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sum: number, [, stats]: any) => sum + (stats.failureCount || 0),
        0
      ),
      recentFailureOperations,
    },
    rateLimiter: {
      budgetRemaining: limiterStatus.budgetRemaining,
      percentageUsed: limiterStatus.percentageUsed,
      tokensUsedToday: limiterStatus.globalQuota.tokensUsedToday,
      costIncurredUSD: limiterStatus.globalQuota.costIncurredUSD,
    },
    memoryHealth,
    recentFailures,
  };
}
