import { collectRuntimeSnapshot } from '@/ai/tools/runtime-snapshot';

jest.mock('@/ai/tools/circuit-breaker', () => ({
  CircuitState: {
    CLOSED: 'CLOSED',
    OPEN: 'OPEN',
    HALF_OPEN: 'HALF_OPEN',
  },
  getCircuitBreaker: jest.fn(),
}));

jest.mock('@/ai/tools/rate-limiter', () => ({
  getRateLimiter: jest.fn(),
}));

jest.mock('@/ai/tools/latency-cache', () => ({
  getLatencyStats: jest.fn(),
}));

jest.mock('@/ai/tools/system', () => ({
  getSystemHealth: jest.fn(),
}));

jest.mock('@/ai/tools/memory-integrity', () => ({
  verifyRecordIntegrity: jest.fn(),
}));

jest.mock('@/lib/session-manager', () => ({
  loadSessionState: jest.fn(),
}));

jest.mock('@/firebase/admin', () => ({
  isAdminConfigured: jest.fn(),
  getAdminFirestore: jest.fn(),
}));

jest.mock('@/lib/storage-router', () => ({
  getStorageRouter: jest.fn(),
}));

/* eslint-disable @typescript-eslint/no-require-imports -- Jest mock handles need require() after jest.mock() hoisting */
const { getCircuitBreaker } = require('@/ai/tools/circuit-breaker');
const { getRateLimiter } = require('@/ai/tools/rate-limiter');
const { getLatencyStats } = require('@/ai/tools/latency-cache');
const { getSystemHealth } = require('@/ai/tools/system');
const { verifyRecordIntegrity } = require('@/ai/tools/memory-integrity');
const { loadSessionState } = require('@/lib/session-manager');
const { isAdminConfigured } = require('@/firebase/admin');
const { getStorageRouter } = require('@/lib/storage-router');
/* eslint-enable @typescript-eslint/no-require-imports */

describe('runtime snapshot collector', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    getCircuitBreaker.mockReturnValue({
      getStatus: jest.fn().mockReturnValue({
        global: { state: 'CLOSED' },
        operations: {
          'conversational-chat': { state: 'OPEN', failureCount: 3 },
          'health-check': { state: 'HALF_OPEN', failureCount: 1 },
          'text-to-speech': { state: 'CLOSED', failureCount: 0 },
        },
      }),
    });

    getRateLimiter.mockReturnValue({
      getStatus: jest.fn().mockReturnValue({
        budgetRemaining: 4.2,
        percentageUsed: 16,
        globalQuota: {
          tokensUsedToday: 1234,
          costIncurredUSD: 0.8,
        },
      }),
    });

    getLatencyStats.mockReturnValue({
      totalEntries: 2,
      byPrefix: {
        text: { count: 1, min: 100, max: 100, avg: 100 },
        voice: { count: 1, min: 250, max: 250, avg: 250 },
      },
    });

    getSystemHealth.mockResolvedValue({
      cpuUsage: 42,
      temperature: 45.5,
      batteryLevel: 81,
      throttlingStatus: 'Normal',
      powerMode: 'Balanced',
      model: 'Dev Container',
    });

    loadSessionState.mockReturnValue({
      runtime: {
        lastHeartbeat: new Date(Date.now() - 5000).toISOString(),
        lastUrl: 'https://example.test',
        events: [
          {
            timestamp: new Date().toISOString(),
            event: 'heartbeat',
          },
          {
            timestamp: new Date().toISOString(),
            event: 'client-error',
            details: 'Something failed',
          },
        ],
      },
    });
  });

  it('returns unavailable memory health when no userId is provided', async () => {
    const snapshot = await collectRuntimeSnapshot();

    expect(snapshot.memoryHealth.status).toBe('unavailable');
    expect(snapshot.memoryHealth.userId).toBeNull();
    expect(snapshot.circuitBreaker.openOperations).toContain(
      'conversational-chat'
    );
    expect(snapshot.circuitBreaker.halfOpenOperations).toContain(
      'health-check'
    );
    expect(snapshot.recentFailures.length).toBeGreaterThan(0);
  });

  it('validates checksums for recent aiResponses when userId is provided', async () => {
    isAdminConfigured.mockReturnValue(true);
    verifyRecordIntegrity.mockImplementation(
      (record: Record<string, unknown>) => record.id !== 'bad'
    );

    const docs = [
      { id: 'good', data: { id: 'good', crc32: 'ok', responseText: 'a' } },
      { id: 'bad', data: { id: 'bad', crc32: 'ok', responseText: 'b' } },
      { id: 'missing', data: { id: 'missing', responseText: 'c' } },
    ];

    getStorageRouter.mockResolvedValue({
      getMode: jest.fn(() => 'firestore'),
      query: jest.fn().mockResolvedValue(docs),
    });

    const snapshot = await collectRuntimeSnapshot('user-1');

    expect(snapshot.memoryHealth.status).toBe('degraded');
    expect(snapshot.memoryHealth.checkedRecords).toBe(3);
    expect(snapshot.memoryHealth.validChecksums).toBe(1);
    expect(snapshot.memoryHealth.invalidChecksums).toBe(1);
    expect(snapshot.memoryHealth.missingChecksums).toBe(1);
  });
});
