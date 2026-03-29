/**
 * @fileOverview Runtime Snapshot Collector Tests
 *
 * Verifies that collectRuntimeSnapshot assembles health data from all
 * subsystems, handles missing or degraded data gracefully, and that
 * the internal parseTimestampMs logic drives heartbeat freshness correctly.
 */

// ---------------------------------------------------------------------------
// Mocks — jest.mock calls are hoisted, so we use jest.fn() inline
// and retrieve mock handles via jest.requireMock after import.
// ---------------------------------------------------------------------------

jest.mock('../tools/circuit-breaker', () => {
  const actual = jest.requireActual('../tools/circuit-breaker');
  return {
    ...actual,
    getCircuitBreaker: jest.fn(() => ({
      getStatus: jest.fn(),
    })),
  };
});

jest.mock('../tools/rate-limiter', () => ({
  getRateLimiter: jest.fn(() => ({
    getStatus: jest.fn(),
  })),
}));

jest.mock('../tools/latency-cache', () => ({
  getLatencyStats: jest.fn(),
}));

jest.mock('../tools/system', () => ({
  getSystemHealth: jest.fn(),
}));

jest.mock('../tools/memory-integrity', () => ({
  verifyRecordIntegrity: jest.fn(() => true),
}));

jest.mock('@/lib/session-manager', () => ({
  loadSessionState: jest.fn(),
}));

jest.mock('@/firebase/admin', () => ({
  isAdminConfigured: jest.fn(() => false),
  getAdminFirestore: jest.fn(),
}));

jest.mock('@/lib/storage-router', () => ({
  getStorageRouter: jest.fn(() => ({
    getMode: jest.fn(() => 'firestore'),
    query: jest.fn(),
  })),
}));

// Imports — AFTER mocks
import { collectRuntimeSnapshot } from '../tools/runtime-snapshot';
import { CircuitState } from '../tools/circuit-breaker';
import { getCircuitBreaker } from '../tools/circuit-breaker';
import { getRateLimiter } from '../tools/rate-limiter';
import { getLatencyStats } from '../tools/latency-cache';
import { getSystemHealth } from '../tools/system';
import { verifyRecordIntegrity } from '../tools/memory-integrity';
import { loadSessionState } from '@/lib/session-manager';
import { isAdminConfigured } from '@/firebase/admin';
import { getStorageRouter } from '@/lib/storage-router';

// Narrowed mock handles
const mockGetCircuitBreaker = getCircuitBreaker as jest.Mock;
const mockGetRateLimiter = getRateLimiter as jest.Mock;
const mockGetLatencyStats = getLatencyStats as jest.Mock;
const mockGetSystemHealth = getSystemHealth as unknown as jest.Mock;
const mockVerifyRecordIntegrity = verifyRecordIntegrity as jest.Mock;
const mockLoadSessionState = loadSessionState as jest.Mock;
const mockIsAdminConfigured = isAdminConfigured as jest.Mock;
const mockGetStorageRouter = getStorageRouter as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal session state with optional overrides. */
function sessionState(overrides: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {
    lastUpdated: '2026-02-20T00:00:00.000Z',
    sessionId: 'test',
    status: 'active',
    runtime: {
      lastHeartbeat: '2026-02-20T00:00:00.000Z',
      lastUrl: '/test',
      events: [],
    },
  };

  // If caller provides a runtime override, replace entirely (no merge)
  if ('runtime' in overrides) {
    base.runtime = overrides.runtime;

    const { runtime: _runtime, ...restOverrides } = overrides;
    return { ...base, ...restOverrides };
  }

  return { ...base, ...overrides };
}

function setupDefaultMocks() {
  mockLoadSessionState.mockReturnValue(sessionState());

  const mockBreakerStatus = {
    global: { state: CircuitState.CLOSED },
    operations: {},
    timestamp: '2026-02-20T00:00:00.000Z',
  };
  mockGetCircuitBreaker.mockReturnValue({
    getStatus: jest.fn(() => mockBreakerStatus),
  });

  const mockLimiterStatus = {
    budgetRemaining: 5.0,
    percentageUsed: 0,
    globalQuota: { tokensUsedToday: 0, costIncurredUSD: 0 },
  };
  mockGetRateLimiter.mockReturnValue({
    getStatus: jest.fn(() => mockLimiterStatus),
  });

  mockGetLatencyStats.mockReturnValue({ totalEntries: 0, byPrefix: {} });

  mockGetSystemHealth.mockResolvedValue({
    cpuUsage: 12,
    temperature: 45,
    batteryLevel: 80,
    throttlingStatus: 'none',
    powerMode: 'balanced',
    model: 'test-device',
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('collectRuntimeSnapshot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  // ----- Shape & Basic Assembly -----

  it('returns a well-formed snapshot with all top-level keys', async () => {
    const snap = await collectRuntimeSnapshot();

    expect(snap).toHaveProperty('timestamp');
    expect(snap).toHaveProperty('heartbeat');
    expect(snap).toHaveProperty('systemHealth');
    expect(snap).toHaveProperty('latency');
    expect(snap).toHaveProperty('circuitBreaker');
    expect(snap).toHaveProperty('rateLimiter');
    expect(snap).toHaveProperty('memoryHealth');
    expect(snap).toHaveProperty('recentFailures');
  });

  it('timestamp is a valid ISO string', async () => {
    const snap = await collectRuntimeSnapshot();
    expect(new Date(snap.timestamp).toISOString()).toBe(snap.timestamp);
  });

  // ----- Heartbeat / Freshness -----

  it('reports heartbeat freshness when lastHeartbeat is present', async () => {
    const now = Date.now();
    const fiveMinAgo = new Date(now - 5 * 60_000).toISOString();

    mockLoadSessionState.mockReturnValue(
      sessionState({ runtime: { lastHeartbeat: fiveMinAgo, events: [] } })
    );

    const snap = await collectRuntimeSnapshot();

    expect(snap.heartbeat.lastHeartbeat).toBe(fiveMinAgo);
    expect(snap.heartbeat.freshnessMs).toBeGreaterThanOrEqual(5 * 60_000 - 500);
    expect(snap.heartbeat.freshnessMs).toBeLessThan(5 * 60_000 + 2000);
  });

  it('reports null freshness when heartbeat is missing', async () => {
    mockLoadSessionState.mockReturnValue(
      sessionState({ runtime: { events: [] } })
    );

    const snap = await collectRuntimeSnapshot();

    expect(snap.heartbeat.lastHeartbeat).toBeNull();
    expect(snap.heartbeat.freshnessMs).toBeNull();
  });

  it('clamps freshness to zero when heartbeat timestamp is in the future', async () => {
    const twoMinFuture = new Date(Date.now() + 2 * 60_000).toISOString();

    mockLoadSessionState.mockReturnValue(
      sessionState({ runtime: { lastHeartbeat: twoMinFuture, events: [] } })
    );

    const snap = await collectRuntimeSnapshot();

    expect(snap.heartbeat.lastHeartbeat).toBe(twoMinFuture);
    expect(snap.heartbeat.freshnessMs).toBe(0);
  });

  it('handles garbage heartbeat timestamp gracefully', async () => {
    mockLoadSessionState.mockReturnValue(
      sessionState({ runtime: { lastHeartbeat: 'not-a-date', events: [] } })
    );

    const snap = await collectRuntimeSnapshot();

    // parseTimestampMs returns null for invalid strings → freshnessMs null
    expect(snap.heartbeat.freshnessMs).toBeNull();
  });

  // ----- System Health -----

  it('system health OK when getSystemHealth resolves', async () => {
    const snap = await collectRuntimeSnapshot();

    expect(snap.systemHealth.status).toBe('ok');
    expect(snap.systemHealth.cpuUsage).toBe(12);
  });

  it('system health degraded when getSystemHealth rejects', async () => {
    mockGetSystemHealth.mockRejectedValue(new Error('device offline'));

    const snap = await collectRuntimeSnapshot();

    expect(snap.systemHealth.status).toBe('degraded');
    expect(snap.systemHealth.cpuUsage).toBeUndefined();
  });

  // ----- Circuit Breaker -----

  it('reports open and half-open operations', async () => {
    mockGetCircuitBreaker.mockReturnValue({
      getStatus: jest.fn(() => ({
        global: { state: CircuitState.CLOSED },
        operations: {
          'health-check': { state: CircuitState.OPEN, failureCount: 5 },
          chat: { state: CircuitState.HALF_OPEN, failureCount: 2 },
          tts: { state: CircuitState.CLOSED, failureCount: 0 },
        },
        timestamp: '2026-02-20T00:00:00.000Z',
      })),
    });

    const snap = await collectRuntimeSnapshot();

    expect(snap.circuitBreaker.openOperations).toEqual(['health-check']);
    expect(snap.circuitBreaker.halfOpenOperations).toEqual(['chat']);
    expect(snap.circuitBreaker.failureCount).toBe(7);
    expect(snap.circuitBreaker.recentFailureOperations).toContain(
      'health-check'
    );
  });

  it('reports global circuit state', async () => {
    mockGetCircuitBreaker.mockReturnValue({
      getStatus: jest.fn(() => ({
        global: { state: CircuitState.OPEN },
        operations: {},
        timestamp: '2026-02-20T00:00:00.000Z',
      })),
    });

    const snap = await collectRuntimeSnapshot();
    expect(snap.circuitBreaker.globalState).toBe(CircuitState.OPEN);
  });

  it('sorts recent failure operations by failure count and limits to top 5', async () => {
    mockGetCircuitBreaker.mockReturnValue({
      getStatus: jest.fn(() => ({
        global: { state: CircuitState.CLOSED },
        operations: {
          opA: { state: CircuitState.CLOSED, failureCount: 1 },
          opB: { state: CircuitState.CLOSED, failureCount: 9 },
          opC: { state: CircuitState.OPEN, failureCount: 4 },
          opD: { state: CircuitState.HALF_OPEN, failureCount: 7 },
          opE: { state: CircuitState.CLOSED, failureCount: 3 },
          opF: { state: CircuitState.CLOSED, failureCount: 2 },
          opG: { state: CircuitState.CLOSED, failureCount: 6 },
        },
        timestamp: '2026-02-20T00:00:00.000Z',
      })),
    });

    const snap = await collectRuntimeSnapshot();

    expect(snap.circuitBreaker.recentFailureOperations).toEqual([
      'opB',
      'opD',
      'opG',
      'opC',
      'opE',
    ]);
    expect(snap.circuitBreaker.recentFailureOperations).toHaveLength(5);
  });

  // ----- Rate Limiter -----

  it('includes rate limiter budget data', async () => {
    mockGetRateLimiter.mockReturnValue({
      getStatus: jest.fn(() => ({
        budgetRemaining: 3.5,
        percentageUsed: 30,
        globalQuota: { tokensUsedToday: 300_000, costIncurredUSD: 1.5 },
      })),
    });

    const snap = await collectRuntimeSnapshot();

    expect(snap.rateLimiter.budgetRemaining).toBe(3.5);
    expect(snap.rateLimiter.percentageUsed).toBe(30);
    expect(snap.rateLimiter.tokensUsedToday).toBe(300_000);
    expect(snap.rateLimiter.costIncurredUSD).toBe(1.5);
  });

  // ----- Recent Failures -----

  it('filters recent events for errors and failures', async () => {
    mockLoadSessionState.mockReturnValue(
      sessionState({
        runtime: {
          lastHeartbeat: '2026-02-20T00:00:00.000Z',
          events: [
            {
              timestamp: '2026-02-20T00:01:00Z',
              event: 'page-load',
              details: 'ok',
            },
            {
              timestamp: '2026-02-20T00:02:00Z',
              event: 'vision-error',
              details: 'crash',
            },
            {
              timestamp: '2026-02-20T00:03:00Z',
              event: 'heart-patch',
              details: 'recovered',
            },
            {
              timestamp: '2026-02-20T00:04:00Z',
              event: 'tts-failure',
              details: 'timeout',
            },
          ],
        },
      })
    );

    const snap = await collectRuntimeSnapshot();

    // Should include 'vision-error', 'heart-patch', 'tts-failure' but not 'page-load'
    expect(snap.recentFailures).toHaveLength(3);
    expect(snap.recentFailures.map((f) => f.event)).toEqual(
      expect.arrayContaining(['vision-error', 'heart-patch', 'tts-failure'])
    );
    expect(snap.recentFailures.map((f) => f.event)).not.toContain('page-load');
  });

  it('limits recent failures to last 10', async () => {
    const manyErrors = Array.from({ length: 25 }, (_, i) => ({
      timestamp: `2026-02-20T00:${String(i).padStart(2, '0')}:00Z`,
      event: `error-${i}`,
    }));

    mockLoadSessionState.mockReturnValue(
      sessionState({ runtime: { events: manyErrors } })
    );

    const snap = await collectRuntimeSnapshot();
    expect(snap.recentFailures.length).toBeLessThanOrEqual(10);
  });

  // ----- Memory Health -----

  it('reports unavailable when no userId provided', async () => {
    const snap = await collectRuntimeSnapshot();

    expect(snap.memoryHealth.status).toBe('unavailable');
    expect(snap.memoryHealth.warning).toMatch(/No userId/);
  });

  it('reports unavailable when admin not configured', async () => {
    const snap = await collectRuntimeSnapshot('user-123');

    // Our mock returns isAdminConfigured = false
    expect(snap.memoryHealth.status).toBe('unavailable');
    expect(snap.memoryHealth.warning).toMatch(/Admin Firestore/);
  });

  it('reports memory health ok when storage records all pass checksum integrity', async () => {
    mockIsAdminConfigured.mockReturnValue(true);
    mockVerifyRecordIntegrity.mockReturnValue(true);

    const docs = [
      { id: '1', data: { id: '1', crc32: 'abc', responseText: 'ok-1' } },
      { id: '2', data: { id: '2', crc32: 'def', responseText: 'ok-2' } },
    ];

    mockGetStorageRouter.mockReturnValue({
      getMode: jest.fn(() => 'firestore'),
      query: jest.fn().mockResolvedValue(docs),
    });

    const snap = await collectRuntimeSnapshot('user-123');

    expect(snap.memoryHealth.status).toBe('ok');
    expect(snap.memoryHealth.checkedRecords).toBe(2);
    expect(snap.memoryHealth.validChecksums).toBe(2);
    expect(snap.memoryHealth.invalidChecksums).toBe(0);
    expect(snap.memoryHealth.missingChecksums).toBe(0);
    expect(snap.memoryHealth.warning).toBeUndefined();
  });

  it('reports degraded memory health when storage query throws', async () => {
    mockIsAdminConfigured.mockReturnValue(true);

    mockGetStorageRouter.mockReturnValue({
      getMode: jest.fn(() => 'firestore'),
      query: jest.fn().mockRejectedValue(new Error('Storage down')),
    });

    const snap = await collectRuntimeSnapshot('user-123');

    expect(snap.memoryHealth.status).toBe('degraded');
    expect(snap.memoryHealth.checkedRecords).toBe(0);
    expect(snap.memoryHealth.error).toMatch(/Storage down/);
  });

  // ----- Session without runtime -----

  it('handles session state with no runtime block', async () => {
    mockLoadSessionState.mockReturnValue({
      lastUpdated: '2026-02-20T00:00:00.000Z',
      sessionId: 'test',
      status: 'active',
    });

    const snap = await collectRuntimeSnapshot();

    expect(snap.heartbeat.lastHeartbeat).toBeNull();
    expect(snap.heartbeat.recentEvents).toBe(0);
    expect(snap.recentFailures).toEqual([]);
  });
});
