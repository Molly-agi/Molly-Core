/**
 * @fileOverview Rate Limiter Tests
 *
 * Verify rate limiting, cost tracking, and budget enforcement work correctly
 */

import { RateLimiter, type RateLimitConfig } from '../tools/rate-limiter';
import { RateLimitError } from '../errors';

describe('Rate Limiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    // Create a limiter with small limits for testing
    const testConfig: Partial<RateLimitConfig> = {
      maxPerMinute: 20,
      maxTokensPerDay: 50000,
      costPer1MTokens: 1.5,
      dailyBudgetUSD: 10.0, // $10/day for testing
      warningThreshold: 0.7,
    };
    limiter = new RateLimiter(testConfig);
  });

  describe('Token Bucket', () => {
    it('should allow initial generations within budget', async () => {
      expect(() => limiter.checkLimit('test-flow', 1000)).not.toThrow();
    });

    it('should track token usage', async () => {
      await limiter.checkLimit('test-flow', 5000);
      limiter.recordUsage('test-flow', 5000, 0.0075);

      const status = limiter.getStatus();
      expect(status.globalQuota.tokensUsedToday).toBe(5000);
    });
  });

  describe('Budget Enforcement', () => {
    it('should reject generations exceeding daily budget', async () => {
      // Record usage approaching budget limit
      for (let i = 0; i < 5; i++) {
        await limiter.checkLimit('expensive-flow', 1000);
        limiter.recordUsage('expensive-flow', 1000, 1.5); // $1.50 each
      }

      // Next attempt should fail (7.50 + 1.50 > 10)
      expect(() => limiter.checkLimit('expensive-flow', 1000)).toThrow(
        RateLimitError
      );
    });

    it('should return remaining budget', () => {
      limiter.recordUsage('test-flow', 1000, 0.5);

      const remaining = limiter.getRemaining();
      expect(remaining.budgetUSD).toBeLessThan(10);
      expect(remaining.budgetUSD).toBeGreaterThan(9.4);
    });
  });

  describe('Status & Monitoring', () => {
    it('should provide accurate status', () => {
      limiter.recordUsage('test-flow', 5000, 0.0075);

      const status = limiter.getStatus();
      expect(status.globalQuota.tokensUsedToday).toBe(5000);
      expect(status.buckets['test-flow']).toBeDefined();
      expect(status.percentageUsed).toBeGreaterThan(0);
    });

    it('should reset daily quota', () => {
      limiter.recordUsage('test-flow', 5000, 0.0075);
      expect(limiter.getStatus().globalQuota.tokensUsedToday).toBe(5000);

      limiter.resetDaily();
      expect(limiter.getStatus().globalQuota.tokensUsedToday).toBe(0);
    });
  });

  describe('Multi-flow Handling', () => {
    it('should track multiple flows independently', () => {
      limiter.recordUsage('flow-1', 1000, 0.0015);
      limiter.recordUsage('flow-2', 2000, 0.003);

      const status = limiter.getStatus();
      expect(status.buckets['flow-1']).toBeDefined();
      expect(status.buckets['flow-2']).toBeDefined();
      expect(status.globalQuota.tokensUsedToday).toBe(3000);
    });
  });

  describe('Cost Calculation', () => {
    it('should calculate accurate costs', async () => {
      // 100K tokens at $1.5 per 1M = $0.15
      await limiter.checkLimit('test-flow', 100000);
      limiter.recordUsage('test-flow', 100000, 0.15);

      const remaining = limiter.getRemaining();
      expect(remaining.budgetUSD).toBeCloseTo(9.85, 2);
    });
  });
});
