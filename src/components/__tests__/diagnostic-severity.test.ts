/**
 * @fileOverview Tests for diagnostic severity computation
 *
 * Tests the computeSeverity function that evaluates a RuntimeSnapshot
 * and produces OK/Degraded/Critical ratings per subsystem and overall.
 */

import { computeSeverity } from '@/components/diagnostic-severity';
import type { RuntimeSnapshot } from '@/ai/tools/runtime-snapshot';

function makeSnapshot(
  overrides: Partial<RuntimeSnapshot> = {}
): RuntimeSnapshot {
  return {
    timestamp: new Date().toISOString(),
    heartbeat: {
      lastHeartbeat: new Date().toISOString(),
      lastUrl: '/test',
      recentEvents: 1,
      freshnessMs: 1000,
    },
    systemHealth: {
      status: 'ok',
      cpuUsage: 25,
    },
    latency: { totalEntries: 0, byPrefix: {} },
    circuitBreaker: {
      globalState: 'CLOSED' as any,
      openOperations: [],
      halfOpenOperations: [],
      failureCount: 0,
      recentFailureOperations: [],
    },
    rateLimiter: {
      budgetRemaining: 5.0,
      percentageUsed: 10,
      tokensUsedToday: 500,
      costIncurredUSD: 0.5,
    },
    memoryHealth: {
      status: 'ok',
      userId: 'test-user',
      checkedRecords: 20,
      validChecksums: 20,
      invalidChecksums: 0,
      missingChecksums: 0,
    },
    recentFailures: [],
    ...overrides,
  };
}

describe('computeSeverity', () => {
  // ── Overall ──

  it('returns OK when all subsystems are healthy', () => {
    const result = computeSeverity(makeSnapshot());
    expect(result.overall).toBe('ok');
    expect(result.circuit).toBe('ok');
    expect(result.memory).toBe('ok');
    expect(result.cpu).toBe('ok');
    expect(result.rateLimiter).toBe('ok');
  });

  it('overall is degraded when any subsystem is degraded', () => {
    const result = computeSeverity(
      makeSnapshot({ systemHealth: { status: 'ok', cpuUsage: 75 } })
    );
    expect(result.overall).toBe('degraded');
    expect(result.cpu).toBe('degraded');
  });

  it('overall is critical when any subsystem is critical', () => {
    const result = computeSeverity(
      makeSnapshot({ systemHealth: { status: 'degraded', cpuUsage: 95 } })
    );
    expect(result.overall).toBe('critical');
  });

  // ── Circuit Breaker ──

  it('circuit is OK when CLOSED with no open ops', () => {
    const result = computeSeverity(makeSnapshot());
    expect(result.circuit).toBe('ok');
  });

  it('circuit is degraded when HALF_OPEN', () => {
    const result = computeSeverity(
      makeSnapshot({
        circuitBreaker: {
          globalState: 'HALF_OPEN' as any,
          openOperations: [],
          halfOpenOperations: ['chat'],
          failureCount: 1,
          recentFailureOperations: [],
        },
      })
    );
    expect(result.circuit).toBe('degraded');
  });

  it('circuit is degraded with 1-2 open operations', () => {
    const result = computeSeverity(
      makeSnapshot({
        circuitBreaker: {
          globalState: 'CLOSED' as any,
          openOperations: ['flow-a'],
          halfOpenOperations: [],
          failureCount: 2,
          recentFailureOperations: [],
        },
      })
    );
    expect(result.circuit).toBe('degraded');
  });

  it('circuit is critical when OPEN', () => {
    const result = computeSeverity(
      makeSnapshot({
        circuitBreaker: {
          globalState: 'OPEN' as any,
          openOperations: ['a', 'b', 'c'],
          halfOpenOperations: [],
          failureCount: 10,
          recentFailureOperations: [],
        },
      })
    );
    expect(result.circuit).toBe('critical');
  });

  it('circuit is critical with 3+ open operations', () => {
    const result = computeSeverity(
      makeSnapshot({
        circuitBreaker: {
          globalState: 'CLOSED' as any,
          openOperations: ['a', 'b', 'c'],
          halfOpenOperations: [],
          failureCount: 5,
          recentFailureOperations: [],
        },
      })
    );
    expect(result.circuit).toBe('critical');
  });

  // ── Memory ──

  it('memory is OK with no checksum issues', () => {
    const result = computeSeverity(makeSnapshot());
    expect(result.memory).toBe('ok');
  });

  it('memory is degraded when status is degraded', () => {
    const result = computeSeverity(
      makeSnapshot({
        memoryHealth: {
          status: 'degraded',
          userId: 'test',
          checkedRecords: 20,
          validChecksums: 19,
          invalidChecksums: 1,
          missingChecksums: 0,
        },
      })
    );
    expect(result.memory).toBe('degraded');
  });

  it('memory is critical when unavailable', () => {
    const result = computeSeverity(
      makeSnapshot({
        memoryHealth: {
          status: 'unavailable',
          userId: null,
          checkedRecords: 0,
          validChecksums: 0,
          invalidChecksums: 0,
          missingChecksums: 0,
        },
      })
    );
    expect(result.memory).toBe('critical');
  });

  it('memory is critical with many invalid checksums', () => {
    const result = computeSeverity(
      makeSnapshot({
        memoryHealth: {
          status: 'degraded',
          userId: 'test',
          checkedRecords: 20,
          validChecksums: 15,
          invalidChecksums: 5,
          missingChecksums: 0,
        },
      })
    );
    expect(result.memory).toBe('critical');
  });

  // ── CPU ──

  it('cpu is OK under 70%', () => {
    const result = computeSeverity(
      makeSnapshot({ systemHealth: { status: 'ok', cpuUsage: 50 } })
    );
    expect(result.cpu).toBe('ok');
  });

  it('cpu is degraded between 70-90%', () => {
    const result = computeSeverity(
      makeSnapshot({ systemHealth: { status: 'ok', cpuUsage: 80 } })
    );
    expect(result.cpu).toBe('degraded');
  });

  it('cpu is critical above 90%', () => {
    const result = computeSeverity(
      makeSnapshot({ systemHealth: { status: 'ok', cpuUsage: 95 } })
    );
    expect(result.cpu).toBe('critical');
  });

  it('cpu is critical when system status is degraded', () => {
    const result = computeSeverity(
      makeSnapshot({ systemHealth: { status: 'degraded' } })
    );
    expect(result.cpu).toBe('critical');
  });

  // ── Rate Limiter ──

  it('rate limiter is OK under 70%', () => {
    const result = computeSeverity(makeSnapshot());
    expect(result.rateLimiter).toBe('ok');
  });

  it('rate limiter is degraded between 70-90%', () => {
    const result = computeSeverity(
      makeSnapshot({
        rateLimiter: {
          budgetRemaining: 1.5,
          percentageUsed: 75,
          tokensUsedToday: 5000,
          costIncurredUSD: 3.0,
        },
      })
    );
    expect(result.rateLimiter).toBe('degraded');
  });

  it('rate limiter is critical above 90%', () => {
    const result = computeSeverity(
      makeSnapshot({
        rateLimiter: {
          budgetRemaining: 0.2,
          percentageUsed: 96,
          tokensUsedToday: 9000,
          costIncurredUSD: 4.8,
        },
      })
    );
    expect(result.rateLimiter).toBe('critical');
  });

  // ── Edge Cases ──

  it('handles snapshot with missing optional fields gracefully', () => {
    const minimal = makeSnapshot();
    delete (minimal.systemHealth as any).cpuUsage;
    const result = computeSeverity(minimal);
    expect(result.cpu).toBe('ok'); // no CPU data = assume ok
  });
});
