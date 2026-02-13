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
    // Create a limiter with reasonable limits for testing
    const testConfig: Partial<RateLimitConfig> = {
      maxPerMinute: 20,
      maxTokensPerDay: 10_000_000,
      costPer1MTokens: 1.5, // Gemini pricing: $1.50 per 1M tokens
      dailyBudgetUSD: 10.0, // $10.00 budget for testing
      warningThreshold: 0.7,
    };
    limiter = new RateLimiter(testConfig);
  });

  describe('Token Bucket', () => {
    it('should allow initial generations within budget', async () => {
      await expect(
        limiter.checkLimit('test-flow', 1000)
      ).resolves.toBeUndefined();
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
      // Directly record usage to approach budget limit without hitting bucket rate limits
      // 10k tokens at a time: 667 calls * 10k = 6.67M tokens = $10.005
      for (let i = 0; i < 667; i++) {
        limiter.recordUsage('expensive-flow', 10000, 0.015); // $1.50 per 1M = $0.015 per 10k
      }

      // After 667 calls = $10.005 spent. Next checkLimit should fail due to budget
      await expect(limiter.checkLimit('expensive-flow', 10000)).rejects.toThrow(
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
      // 10k tokens at $1.5 per 1M = $0.015
      await limiter.checkLimit('test-flow', 10000);
      limiter.recordUsage('test-flow', 10000, 0.015);

      const remaining = limiter.getRemaining();
      expect(remaining.budgetUSD).toBeCloseTo(9.985, 2);
    });
  });
});
