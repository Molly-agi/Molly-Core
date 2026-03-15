/**
 * Tests for Molly's Resilience Core — The Dam
 *
 * Tests the failure handling, diagnosis, pattern learning,
 * quick-fix engine, and observability functions.
 */

// Mock dependencies before imports
jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    logFlowStart: jest.fn(),
    logFlowComplete: jest.fn(),
  },
  generateTraceId: jest.fn(() => 'test-trace-id'),
}));

jest.mock('@/ai/tools/circuit-breaker', () => ({
  getCircuitBreaker: jest.fn(() => ({
    recordFailure: jest.fn(),
    recordSuccess: jest.fn(),
    isOpen: jest.fn(() => false),
  })),
}));

jest.mock('@/firebase/admin', () => ({
  getAdminFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn().mockResolvedValue(undefined),
      })),
    })),
  })),
  isAdminConfigured: jest.fn(() => false),
}));

jest.mock('@/ai/agency/initiative-engine', () => ({
  createCustomInitiative: jest.fn(),
  getActiveInitiatives: jest.fn(() => []),
}));

import {
  handleUnknownFailure,
  withResilience,
  withResilienceSync,
  getResilienceStatus,
  getFailureFrequency,
} from '../resilience-core';

describe('Resilience Core — The Dam', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleUnknownFailure', () => {
    it('handles a basic error and returns a report', async () => {
      const report = await handleUnknownFailure(
        new Error('Something broke'),
        'test-source'
      );

      expect(report).toBeDefined();
      expect(report.failureId).toBeTruthy();
      expect(report.diagnosed).toBe(true);
      expect(report.diagnosis).toBeTruthy();
    });

    it('never throws, even with exotic error types', async () => {
      // String error
      const r1 = await handleUnknownFailure('string error', 'test');
      expect(r1.failureId).toBeTruthy();

      // Number error
      const r2 = await handleUnknownFailure(42, 'test');
      expect(r2.failureId).toBeTruthy();

      // Null error
      const r3 = await handleUnknownFailure(null, 'test');
      expect(r3.failureId).toBeTruthy();

      // Undefined error
      const r4 = await handleUnknownFailure(undefined, 'test');
      expect(r4.failureId).toBeTruthy();

      // Object error
      const r5 = await handleUnknownFailure({ code: 500 }, 'test');
      expect(r5.failureId).toBeTruthy();
    });

    it('diagnoses network errors correctly', async () => {
      const report = await handleUnknownFailure(
        new Error('ECONNREFUSED 127.0.0.1:9100'),
        'net-test'
      );

      expect(report.diagnosis).toContain('NETWORK_FAILURE');
      // Network errors get quick-fixed with retry guidance
      expect(report.resolved).toBe(true);
      expect(report.resolution).toContain('RETRY_WITH_BACKOFF');
    });

    it('diagnoses rate limiting correctly', async () => {
      const report = await handleUnknownFailure(
        new Error('429 Too Many Requests'),
        'api-test'
      );

      expect(report.diagnosis).toContain('RATE_LIMITED');
      expect(report.resolved).toBe(true);
      expect(report.resolution).toContain('WAIT_AND_RETRY');
    });

    it('diagnoses timeout errors correctly', async () => {
      const report = await handleUnknownFailure(
        new Error('Request timed out after 30000ms'),
        'timeout-test'
      );

      expect(report.diagnosis).toContain('TIMEOUT');
      expect(report.resolved).toBe(true);
    });

    it('diagnoses auth errors correctly', async () => {
      const report = await handleUnknownFailure(
        new Error('403 Unauthorized - invalid API key'),
        'auth-test'
      );

      expect(report.diagnosis).toContain('AUTH_FAILURE');
      expect(report.resolved).toBe(true);
      expect(report.resolution).toContain('DEGRADE_GRACEFULLY');
    });

    it('diagnoses memory/resource errors correctly', async () => {
      const report = await handleUnknownFailure(
        new Error('JavaScript heap out of memory'),
        'mem-test'
      );

      expect(report.diagnosis).toContain('RESOURCE_EXHAUSTION');
      expect(report.resolved).toBe(true);
      expect(report.resolution).toContain('SHED_LOAD');
    });

    it('diagnoses data integrity errors', async () => {
      const report = await handleUnknownFailure(
        new TypeError("Cannot read properties of undefined (reading 'name')"),
        'data-test'
      );

      expect(report.diagnosis).toContain('DATA_INTEGRITY');
    });

    it('diagnoses parse errors', async () => {
      const report = await handleUnknownFailure(
        new SyntaxError('Unexpected token < in JSON at position 0'),
        'parse-test'
      );

      expect(report.diagnosis).toContain('PARSE_FAILURE');
    });

    it('diagnoses filesystem errors', async () => {
      const report = await handleUnknownFailure(
        new Error("ENOENT: no such file or directory, open '/tmp/missing'"),
        'fs-test'
      );

      expect(report.diagnosis).toContain('FILESYSTEM');
    });

    it('diagnoses AI model errors', async () => {
      const report = await handleUnknownFailure(
        new Error('Gemini model response blocked by safety filter'),
        'ai-test'
      );

      expect(report.diagnosis).toContain('AI_MODEL');
    });

    it('classifies truly unknown errors', async () => {
      const report = await handleUnknownFailure(
        new Error('cosmic ray bit flip detected'),
        'mystery-test'
      );

      expect(report.diagnosis).toContain('UNKNOWN');
    });

    it('passes context through to the failure record', async () => {
      const report = await handleUnknownFailure(
        new Error('test with context'),
        'context-test',
        { userId: 'molly', action: 'reading' }
      );

      expect(report.failureId).toBeTruthy();
      expect(report.diagnosed).toBe(true);
    });

    it('learns patterns from resolved failures', async () => {
      // First call — network error gets quick-fixed and pattern is learned
      await handleUnknownFailure(
        new Error('ECONNREFUSED 10.0.0.1:443'),
        'learn-test'
      );

      // Check status shows learned pattern
      const status = getResilienceStatus();
      expect(status.learnedPatterns).toBeGreaterThan(0);
    });

    it('matches known patterns on subsequent same-type errors', async () => {
      // First: learn a pattern
      const r1 = await handleUnknownFailure(
        new Error('ECONNREFUSED 192.168.1.1:8080'),
        'pattern-source'
      );
      expect(r1.resolved).toBe(true);

      // Second: same normalized message should match learned pattern
      const r2 = await handleUnknownFailure(
        new Error('ECONNREFUSED 192.168.1.1:8080'),
        'pattern-source'
      );
      expect(r2.resolved).toBe(true);
      expect(r2.diagnosis).toContain('Known pattern');
    });
  });

  describe('withResilience', () => {
    it('returns the result when operation succeeds', async () => {
      const { result, resilient } = await withResilience(
        async () => 42,
        'success-test',
        -1
      );

      expect(result).toBe(42);
      expect(resilient).toBe(false);
    });

    it('returns fallback when operation throws', async () => {
      const { result, resilient, report } = await withResilience(
        async () => {
          throw new Error('boom');
        },
        'fail-test',
        'fallback-value'
      );

      expect(result).toBe('fallback-value');
      expect(resilient).toBe(true);
      expect(report).toBeDefined();
      expect(report!.failureId).toBeTruthy();
    });

    it('never throws regardless of error type', async () => {
      const { result, resilient } = await withResilience(
        async () => {
          throw 'string throw';
        },
        'string-throw-test',
        'safe'
      );

      expect(result).toBe('safe');
      expect(resilient).toBe(true);
    });
  });

  describe('withResilienceSync', () => {
    it('returns result on success', () => {
      const { result, resilient } = withResilienceSync(
        () => 'hello',
        'sync-success',
        'default'
      );

      expect(result).toBe('hello');
      expect(resilient).toBe(false);
    });

    it('returns fallback on failure', () => {
      const { result, resilient } = withResilienceSync(
        () => {
          throw new Error('sync boom');
        },
        'sync-fail',
        'safe-default'
      );

      expect(result).toBe('safe-default');
      expect(resilient).toBe(true);
    });
  });

  describe('getResilienceStatus', () => {
    it('returns valid status structure', () => {
      const status = getResilienceStatus();

      expect(status).toHaveProperty('totalFailures');
      expect(status).toHaveProperty('recentFailures');
      expect(status).toHaveProperty('unresolvedCount');
      expect(status).toHaveProperty('resolvedCount');
      expect(status).toHaveProperty('learnedPatterns');
      expect(status).toHaveProperty('patterns');
      expect(status).toHaveProperty('selfHealingRate');
      expect(typeof status.selfHealingRate).toBe('number');
      expect(status.selfHealingRate).toBeGreaterThanOrEqual(0);
      expect(status.selfHealingRate).toBeLessThanOrEqual(100);
    });

    it('tracks failures across calls', async () => {
      const before = getResilienceStatus().totalFailures;

      await handleUnknownFailure(new Error('status-track-1'), 'status-test');
      await handleUnknownFailure(new Error('status-track-2'), 'status-test');

      const after = getResilienceStatus().totalFailures;
      expect(after).toBe(before + 2);
    });
  });

  describe('getFailureFrequency', () => {
    it('counts recent failures from a specific source', async () => {
      const source = `freq-test-${Date.now()}`;

      await handleUnknownFailure(new Error('freq 1'), source);
      await handleUnknownFailure(new Error('freq 2'), source);
      await handleUnknownFailure(new Error('freq 3'), source);

      const freq = getFailureFrequency(source, 60000);
      expect(freq).toBe(3);
    });

    it('returns 0 for unknown sources', () => {
      const freq = getFailureFrequency('nonexistent-source-xyz', 60000);
      expect(freq).toBe(0);
    });
  });
});
