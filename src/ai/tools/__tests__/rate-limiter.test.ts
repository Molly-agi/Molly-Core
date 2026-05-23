/**
 * @fileOverview Tests for Rate Limiting & Cost Control System
 *
 * Tests rate limiting operations including:
 * - Token bucket rate limiting
 * - Global quota tracking
 * - Budget warnings
 * - Daily reset
 * - Cost estimation
 */

// Mock logger and errors
jest.mock('../../logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../errors', () => {
  class RateLimitError extends Error {
    retryAfterMs: number;
    context: Record<string, unknown>;

    constructor(retryAfterMs: number, context: Record<string, unknown>) {
      super(`Rate limit exceeded. Retry after ${retryAfterMs}ms`);
      this.name = 'RateLimitError';
      this.retryAfterMs = retryAfterMs;
      this.context = context;
    }
  }

  return { RateLimitError };
});

import { RateLimiter, getRateLimiter } from '../rate-limiter';
import { MollyLogger } from '../../logger';

const mockLogger = MollyLogger as jest.Mocked<typeof MollyLogger>;

describe('Rate Limiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    jest.clearAllMocks();
    // Create fresh instance with explicit test config so tests are isolated from DEFAULT_CONFIG
    limiter = new RateLimiter({ dailyBudgetUSD: 50.0, warningThreshold: 0.8 });
  });

  describe('Basic Operation', () => {
    it('allows requests within limits', async () => {
      await expect(
        limiter.checkLimit('testFlow', 500)
      ).resolves.toBeUndefined();
    });

    it('creates bucket for new flows', async () => {
      await limiter.checkLimit('newFlow', 100);
      const status = limiter.getStatus();
      expect(status.buckets).toHaveProperty('newFlow');
    });

    it('tracks multiple flows independently', async () => {
      await limiter.checkLimit('flow1', 1000);
      await limiter.checkLimit('flow2', 2000);

      const status = limiter.getStatus();
      expect(status.buckets['flow1'].totalTokensUsed).toBe(1000);
      expect(status.buckets['flow2'].totalTokensUsed).toBe(2000);
    });
  });

  describe('Token Bucket Rate Limiting', () => {
    it('deducts tokens from bucket', async () => {
      await limiter.checkLimit('testFlow', 10000);
      const status = limiter.getStatus();

      // Started with ~100k, used 10k
      expect(status.buckets['testFlow'].tokensAvailable).toBeLessThan(100000);
    });

    it('refills tokens over time', async () => {
      await limiter.checkLimit('testFlow', 50000);
      const statusBefore = limiter.getStatus();

      // Simulate time passing (refill happens on next check)
      await new Promise((resolve) => setTimeout(resolve, 100));

      await limiter.checkLimit('testFlow', 1);
      const statusAfter = limiter.getStatus();

      // Should have more tokens due to refill
      expect(statusAfter.buckets['testFlow'].tokensAvailable).toBeGreaterThan(
        statusBefore.buckets['testFlow'].tokensAvailable - 1
      );
    });

    it('throws when bucket is empty', async () => {
      // Use all tokens
      await limiter.checkLimit('testFlow', 99000);

      // Try to use more than available
      await expect(limiter.checkLimit('testFlow', 50000)).rejects.toThrow(
        'Rate limit exceeded'
      );
    });
  });

  describe('Global Quota', () => {
    it('tracks global cost', () => {
      limiter.recordUsage('flow1', 1000, 0.01);
      limiter.recordUsage('flow2', 2000, 0.02);

      const status = limiter.getStatus();
      expect(status.globalQuota.tokensUsedToday).toBe(3000);
      expect(status.globalQuota.costIncurredUSD).toBeCloseTo(0.03);
    });

    it('calculates budget remaining', () => {
      limiter.recordUsage('testFlow', 10000, 10.0);

      const status = limiter.getStatus();
      // Default budget is $50, used $10
      expect(status.budgetRemaining).toBeCloseTo(40.0);
      expect(status.percentageUsed).toBeCloseTo(20);
    });

    it('throws when budget exceeded', async () => {
      // Record usage over budget limit
      limiter.recordUsage('expensive', 1000000, 50.01);

      // Next request exceeds $50 budget
      await expect(limiter.checkLimit('testFlow', 100000)).rejects.toThrow(
        'Rate limit exceeded'
      );
    });
  });

  describe('Budget Warnings', () => {
    it('warns at warning threshold', async () => {
      // Use 85% of budget
      limiter.recordUsage('expensive', 100000, 42.5);

      // Next request triggers warning (>80%)
      await limiter.checkLimit('testFlow', 100);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Budget'),
        'rate-limiter',
        expect.any(Object)
      );
    });

    it('warns CRITICAL at 95%+', async () => {
      limiter.recordUsage('expensive', 100000, 47.5);
      await limiter.checkLimit('testFlow', 100);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('CRITICAL'),
        'rate-limiter',
        expect.any(Object)
      );
    });

    it('warns HIGH at 90%+', async () => {
      limiter.recordUsage('expensive', 100000, 45.0);
      await limiter.checkLimit('testFlow', 100);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('HIGH'),
        'rate-limiter',
        expect.any(Object)
      );
    });
  });

  describe('Usage Recording', () => {
    it('records token usage', () => {
      limiter.recordUsage('testFlow', 1500, 0.0023);

      const status = limiter.getStatus();
      expect(status.globalQuota.tokensUsedToday).toBe(1500);
    });

    it('records cost', () => {
      limiter.recordUsage('testFlow', 1000, 0.05);

      const status = limiter.getStatus();
      expect(status.globalQuota.costIncurredUSD).toBe(0.05);
    });

    it('logs usage info', () => {
      limiter.recordUsage('testFlow', 500, 0.01);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Usage recorded'),
        'rate-limiter',
        expect.objectContaining({
          flow: 'testFlow',
          tokens: 500,
        })
      );
    });

    it('accumulates usage per flow', () => {
      limiter.recordUsage('testFlow', 1000, 0.01);
      limiter.recordUsage('testFlow', 2000, 0.02);

      const status = limiter.getStatus();
      expect(status.buckets['testFlow'].totalCostUSD).toBeCloseTo(0.03);
    });
  });

  describe('Daily Reset', () => {
    it('resets all limits on resetDaily', () => {
      limiter.recordUsage('flow1', 10000, 1.0);
      limiter.recordUsage('flow2', 20000, 2.0);

      limiter.resetDaily();

      const status = limiter.getStatus();
      expect(status.globalQuota.tokensUsedToday).toBe(0);
      expect(status.globalQuota.costIncurredUSD).toBe(0);
      expect(Object.keys(status.buckets)).toHaveLength(0);
    });

    it('logs reset', () => {
      limiter.resetDaily();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'All rate limits reset',
        'rate-limiter'
      );
    });
  });

  describe('getRemaining', () => {
    it('returns remaining budget', () => {
      limiter.recordUsage('testFlow', 10000, 10.0);

      const remaining = limiter.getRemaining();
      expect(remaining.budgetUSD).toBeCloseTo(40.0);
    });

    it('estimates remaining tokens', () => {
      const remaining = limiter.getRemaining();
      expect(remaining.tokensApprox).toBeGreaterThan(0);
    });

    it('estimates remaining generations', () => {
      const remaining = limiter.getRemaining();
      expect(remaining.generationsAtAvg).toBeGreaterThan(0);
    });

    it('returns zero when budget exhausted', () => {
      limiter.recordUsage('expensive', 1000000, 60.0); // Over budget

      const remaining = limiter.getRemaining();
      expect(remaining.budgetUSD).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('returns comprehensive status', () => {
      const status = limiter.getStatus();

      expect(status).toHaveProperty('buckets');
      expect(status).toHaveProperty('globalQuota');
      expect(status).toHaveProperty('budgetRemaining');
      expect(status).toHaveProperty('percentageUsed');
    });

    it('includes bucket info without lastRefillTime', () => {
      limiter.recordUsage('testFlow', 1000, 0.01);
      const status = limiter.getStatus();

      const bucket = status.buckets['testFlow'];
      expect(bucket).toHaveProperty('flowName');
      expect(bucket).toHaveProperty('tokensAvailable');
      expect(bucket).toHaveProperty('refillRate');
      expect(bucket).not.toHaveProperty('lastRefillTime');
    });
  });

  describe('Custom Configuration', () => {
    it('accepts custom maxPerMinute', async () => {
      const customLimiter = new RateLimiter({ maxPerMinute: 2000 });
      // Should still work - maxPerMinute affects bucket capacity
      await expect(
        customLimiter.checkLimit('testFlow', 100)
      ).resolves.toBeUndefined();
    });

    it('accepts custom dailyBudgetUSD', async () => {
      const customLimiter = new RateLimiter({ dailyBudgetUSD: 1.0 });

      // Under $1 budget
      await expect(
        customLimiter.checkLimit('testFlow', 100)
      ).resolves.toBeUndefined();

      // Exceed $1 budget
      customLimiter.recordUsage('expensive', 100000, 0.99);
      await expect(
        customLimiter.checkLimit('testFlow', 100000)
      ).rejects.toThrow();
    });

    it('accepts custom warningThreshold', async () => {
      const customLimiter = new RateLimiter({ warningThreshold: 0.5, dailyBudgetUSD: 5.0 });

      // 60% usage (3/5 = 60%) should trigger warning with 0.5 threshold
      customLimiter.recordUsage('flow', 10000, 3.0);
      await customLimiter.checkLimit('testFlow', 100);

      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('accepts custom costPer1MTokens', () => {
      const customLimiter = new RateLimiter({ costPer1MTokens: 3.0 });
      customLimiter.recordUsage('flow', 1000000, 3.0);

      const status = customLimiter.getStatus();
      expect(status.globalQuota.costIncurredUSD).toBe(3.0);
    });
  });

  describe('Edge Cases', () => {
    it('handles default estimated tokens', async () => {
      // Should use 500 as default
      await expect(limiter.checkLimit('testFlow')).resolves.toBeUndefined();
    });

    it('handles zero token requests', async () => {
      await expect(limiter.checkLimit('testFlow', 0)).resolves.toBeUndefined();
    });

    it('handles very large token requests', async () => {
      // Exceeds bucket capacity
      await expect(limiter.checkLimit('testFlow', 1000000)).rejects.toThrow();
    });

    it('handles operations with special characters in name', async () => {
      await limiter.checkLimit('flow/with/slashes', 100);
      await limiter.checkLimit('flow:with:colons', 100);

      const status = limiter.getStatus();
      expect(status.buckets).toHaveProperty('flow/with/slashes');
      expect(status.buckets).toHaveProperty('flow:with:colons');
    });

    it('handles rapid consecutive requests', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        limiter.checkLimit(`flow-${i}`, 100)
      );

      await expect(Promise.all(promises)).resolves.toBeDefined();
    });
  });

  describe('Singleton Pattern', () => {
    it('getRateLimiter returns instance', () => {
      const instance = getRateLimiter();
      expect(instance).toBeDefined();
    });

    it('getRateLimiter returns same instance', () => {
      const instance1 = getRateLimiter();
      const instance2 = getRateLimiter();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Error Logging', () => {
    it('logs error when rate limit exceeded', async () => {
      // Use up tokens
      await limiter.checkLimit('testFlow', 99000);

      try {
        await limiter.checkLimit('testFlow', 50000);
      } catch {
        // Expected
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit exceeded'),
        'testFlow',
        expect.any(Object)
      );
    });

    it('logs error when budget exceeded', async () => {
      limiter.recordUsage('expensive', 100000, 50.01);

      try {
        await limiter.checkLimit('testFlow', 100000);
      } catch {
        // Expected
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit exceeded'),
        'testFlow',
        expect.any(Object)
      );
    });
  });
});
