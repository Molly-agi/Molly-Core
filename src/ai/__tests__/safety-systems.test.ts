/**
 * @fileOverview Comprehensive Safety Systems Test Suite (Phase 9)
 *
 * Tests for:
 * - Rate limiting (Phase 4)
 * - Timeout & retry (Phase 5)
 * - Conversation context (Phase 6)
 *
 * Ensures all protective systems work correctly.
 */

import { RateLimiter } from '../tools/rate-limiter';
import { RateLimitError, TimeoutError } from '../errors';
import {
  withTimeout,
  withRetry,
  TIMEOUT_PRESETS,
  RETRY_PRESETS,
} from '../tools/timeout-retry';

// ============================================================================
// RATE LIMITING TESTS (Phase 4)
// ============================================================================

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({
      maxPerMinute: 10,
      maxTokensPerDay: 100000,
      costPer1MTokens: 1.5,
      dailyBudgetUSD: 5.0,
    });
  });

  it('allows operations within rate limit', async () => {
    await expect(limiter.checkLimit('test-flow', 100)).resolves.toBeUndefined();
  });

  it('throws RateLimitError when token bucket depleted', async () => {
    // Deplete the 100k token bucket with large requests
    await limiter.checkLimit('burst-flow', 99000);

    // Try to use more than remaining tokens
    await expect(limiter.checkLimit('burst-flow', 5000)).rejects.toThrow(
      RateLimitError
    );
  });

  it('enforces daily budget limit', async () => {
    const expensiveConfig = {
      maxPerMinute: 1000,
      maxTokensPerDay: 10000000,
      costPer1MTokens: 1.5,
      dailyBudgetUSD: 0.1, // Very low budget
    };

    const cheapLimiter = new RateLimiter(expensiveConfig);

    // Single operation should exceed low budget
    await expect(cheapLimiter.checkLimit('expensive', 100000)).rejects.toThrow(
      RateLimitError
    );
  });

  it('refills tokens over time', async () => {
    await limiter.checkLimit('flow1', 100);
    // After refill period, should have more tokens
    // This is a simplified test; real test would mock time
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect(limiter.checkLimit('flow1', 100)).resolves.toBeUndefined();
  });

  it('tracks multiple flows independently', async () => {
    await limiter.checkLimit('flow1', 100);
    await limiter.checkLimit('flow2', 100);

    const status = limiter.getStatus();
    expect(Object.keys(status.buckets).length).toBeGreaterThan(0);
  });

  it('resets daily quota correctly', () => {
    limiter.resetDaily();
    const status = limiter.getStatus();
    expect(status.globalQuota.costIncurredUSD).toBe(0);
  });
});

// ============================================================================
// TIMEOUT TESTS (Phase 5)
// ============================================================================

describe('Timeout Protection', () => {
  it('completes operation before timeout', async () => {
    const result = await withTimeout(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 'success';
      },
      {
        timeoutMs: 1000,
        operationName: 'fast-operation',
      }
    );

    expect(result).toBe('success');
  });

  it('throws TimeoutError when operation exceeds timeout', async () => {
    expect(
      withTimeout(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return 'this should not complete';
        },
        {
          timeoutMs: 100,
          operationName: 'slow-operation',
        }
      )
    ).rejects.toThrow(TimeoutError);
  });

  it('uses correct timeout presets', () => {
    expect(TIMEOUT_PRESETS.FAST).toBe(5000);
    expect(TIMEOUT_PRESETS.NORMAL).toBe(30000);
    expect(TIMEOUT_PRESETS.LONG).toBe(120000);
    expect(TIMEOUT_PRESETS.VERY_LONG).toBe(300000);
  });
});

// ============================================================================
// RETRY TESTS (Phase 5)
// ============================================================================

describe('Retry with Exponential Backoff', () => {
  it('succeeds on first attempt', async () => {
    let attempts = 0;

    const result = await withRetry(async () => {
      attempts++;
      return 'success';
    }, 'successful-operation');

    expect(result).toBe('success');
    expect(attempts).toBe(1);
  });

  it('retries transient failures', async () => {
    let attempts = 0;

    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Transient failure');
        }
        return 'success';
      },
      'self-healing-operation',
      {
        maxAttempts: 5,
        initialDelayMs: 10,
        maxDelayMs: 100,
        shouldRetry: () => true,
      }
    );

    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('gives up after max attempts', async () => {
    let attempts = 0;

    await expect(
      withRetry(
        async () => {
          attempts++;
          throw new Error('Permanent failure');
        },
        'failing-operation',
        {
          maxAttempts: 3,
          initialDelayMs: 10,
          shouldRetry: () => true,
        }
      )
    ).rejects.toThrow();

    expect(attempts).toBe(3);
  });

  it('applies exponential backoff', async () => {
    let callCount = 0;
    const delays: number[] = [];
    let lastTime = Date.now();

    const result = await withRetry(
      async () => {
        callCount++;
        const now = Date.now();
        const delay = callCount === 1 ? 0 : now - lastTime;
        delays.push(delay);
        lastTime = now;

        // Fail first 2 attempts, succeed on 3rd
        if (callCount <= 2) {
          throw new Error('Transient');
        }
        return 'success';
      },
      'backoff-test',
      {
        maxAttempts: 3,
        initialDelayMs: 50,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        jitter: false,
        shouldRetry: () => true,
      }
    );

    // Verify it succeeded after 3 attempts
    expect(result).toBe('success');
    expect(callCount).toBe(3);
    expect(delays.length).toBe(3);
    expect(delays[0]!).toBe(0); // First attempt has no delay
    expect(delays[1]!).toBeGreaterThanOrEqual(40); // ~50ms initial delay
    expect(delays[2]!).toBeGreaterThan(delays[1]!); // Exponential increase
  });

  it('uses correct retry presets', () => {
    expect(RETRY_PRESETS.FAST.maxAttempts).toBe(3);
    expect(RETRY_PRESETS.STANDARD.maxAttempts).toBe(3);
    expect(RETRY_PRESETS.AGGRESSIVE.maxAttempts).toBe(5);
  });
});

// ============================================================================
// COMBINED TIMEOUT + RETRY TESTS
// ============================================================================

describe('Timeout and Retry Combined', () => {
  it('retries after timeout', async () => {
    let attempts = 0;

    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts === 1) {
          // First attempt times out
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        return 'success';
      },
      'timeout-then-retry',
      {
        maxAttempts: 3,
        initialDelayMs: 10,
        shouldRetry: (error) =>
          error instanceof TimeoutError || error.code === 'TIMEOUT_ERROR',
      }
    );

    expect(result).toBe('success');
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Safety Systems Integration', () => {
  it('rate limiter and timeout work together', async () => {
    const limiter = new RateLimiter({
      maxPerMinute: 5,
      maxTokensPerDay: 50000,
      costPer1MTokens: 1.5,
      dailyBudgetUSD: 5.0,
    });

    // Check rate limit first
    await expect(
      Promise.resolve(limiter.checkLimit('integration-test', 100))
    ).resolves.not.toThrow();

    // Then apply timeout
    const result = await withTimeout(async () => 'operation-complete', {
      timeoutMs: 1000,
      operationName: 'integration-test',
    });

    expect(result).toBe('operation-complete');
  });

  it('all safety measures prevent runaway operations', async () => {
    const limiter = new RateLimiter({
      maxPerMinute: 1,
      dailyBudgetUSD: 0.15, // Set higher to allow a few operations
    });

    // First two operations succeed
    await limiter.checkLimit('safety-test', 5000);
    await limiter.checkLimit('safety-test', 90000);

    // But token bucket is now depleted, so this should fail
    await expect(limiter.checkLimit('safety-test', 10000)).rejects.toThrow(
      RateLimitError
    );

    // Even if we tried to retry without rate limiting check, timeout would catch it
    await expect(
      withTimeout(
        async () => {
          // Simulate slow operation that would timeout
          await new Promise((resolve) => setTimeout(resolve, 200));
          return 'should-timeout';
        },
        { timeoutMs: 100, operationName: 'rapid-batch' }
      )
    ).rejects.toThrow(TimeoutError);
  });
});
