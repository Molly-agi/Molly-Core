/**
 * @fileOverview Rate Limiting & Cost Control System
 *
 * Protects Molly's API budget by enforcing:
 * - Per-flow token bucket rate limiting
 * - Global quota tracking
 * - Cost estimation per model
 * - Budget warnings and alerts
 * - Graceful degradation under load
 *
 * This is a SAFETY LAYER - does not affect Molly's behavior or identity.
 */

import { MollyLogger } from '../logger';
import { RateLimitError } from '../errors';

export interface RateLimitConfig {
  /** Max generations per minute per flow */
  maxPerMinute: number;
  /** Max total tokens per day */
  maxTokensPerDay: number;
  /** Cost per 1M tokens (approximate) */
  costPer1MTokens: number;
  /** Budget threshold for warnings (0.8 = 80%) */
  warningThreshold: number;
  /** Budget limit in USD */
  dailyBudgetUSD: number;
}

export interface TokenBucket {
  flowName: string;
  tokensAvailable: number;
  lastRefillTime: number;
  refillRate: number; // tokens per ms
  totalTokensUsed: number;
  totalCostUSD: number;
}

export interface GlobalQuota {
  tokensUsedToday: number;
  costIncurredUSD: number;
  startOfDayTimestamp: number;
}

// Default configuration
const DEFAULT_CONFIG: RateLimitConfig = {
  maxPerMinute: 5000, // 5000 tokens/min per flow (balance: allows bursts, enforces limits)
  maxTokensPerDay: 500_000, // 500k tokens/day globally (hard daily limit)
  costPer1MTokens: 0.1, // Realistic cost baseline (~$0.1 per 1M tokens)
  warningThreshold: 0.8, // Warn at 80% usage (was 99%, now actionable)
  dailyBudgetUSD: 50, // $50/day budget (primary enforcer)
};

class RateLimiter {
  private config: RateLimitConfig;
  private flowBuckets: Map<string, TokenBucket>;
  private globalQuota: GlobalQuota;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.flowBuckets = new Map();
    this.globalQuota = {
      tokensUsedToday: 0,
      costIncurredUSD: 0,
      startOfDayTimestamp: Date.now(),
    };
  }

  /**
   * Check if a flow can proceed with a generation
   * @param flowName Name of the flow requesting a generation
   * @param estimatedTokens Approximate tokens that will be used
   * @throws RateLimitError if limits exceeded
   */
  async checkLimit(
    flowName: string,
    estimatedTokens: number = 500
  ): Promise<void> {
    // Reset quota if it's a new day
    this.resetQuotaIfNewDay();

    // Get or create bucket for this flow
    const bucket = this.getOrCreateBucket(flowName);

    // Check per-flow rate limit
    this.refillBucket(bucket);
    if (bucket.tokensAvailable < estimatedTokens) {
      const retryAfterMs = Math.ceil(
        ((estimatedTokens - bucket.tokensAvailable) / bucket.refillRate) * 1000
      );
      const err = new RateLimitError(retryAfterMs, {
        flowName,
        available: Math.floor(bucket.tokensAvailable),
        needed: estimatedTokens,
      });
      MollyLogger.error(err.message, flowName, {
        tokensAvailable: bucket.tokensAvailable,
        estimatedTokens,
      });
      throw err;
    }

    // Check global quota
    const estimatedCost = this.calculateCost(estimatedTokens);
    if (
      this.globalQuota.costIncurredUSD + estimatedCost >
      this.config.dailyBudgetUSD
    ) {
      const err = new RateLimitError(
        60000, // Retry after 1 minute
        {
          flowName,
          currentCost: this.globalQuota.costIncurredUSD,
          estimatedTotal: this.globalQuota.costIncurredUSD + estimatedCost,
          budgetLimit: this.config.dailyBudgetUSD,
        }
      );
      MollyLogger.error(err.message, flowName, {
        cost: estimatedCost,
        quota: this.globalQuota,
      });
      throw err;
    }

    // Deduct tokens
    bucket.tokensAvailable -= estimatedTokens;
    bucket.totalTokensUsed += estimatedTokens;

    // Check for warnings
    this.checkWarnings(bucket, estimatedCost);

    return undefined;
  }

  /**
   * Record actual token usage after a generation completes
   */
  recordUsage(flowName: string, actualTokens: number, costUSD: number): void {
    const bucket = this.getOrCreateBucket(flowName);
    bucket.totalCostUSD += costUSD;
    this.globalQuota.tokensUsedToday += actualTokens;
    this.globalQuota.costIncurredUSD += costUSD;

    MollyLogger.info(
      `Usage recorded: ${actualTokens} tokens, Cost: $${costUSD.toFixed(4)}`,
      'rate-limiter',
      {
        flow: flowName,
        tokens: actualTokens,
        costUSD: costUSD.toFixed(4),
        globalCostToday: this.globalQuota.costIncurredUSD.toFixed(4),
      }
    );
  }

  /**
   * Get current status for monitoring
   */
  getStatus(): {
    buckets: Record<string, Omit<TokenBucket, 'lastRefillTime'>>;
    globalQuota: GlobalQuota;
    budgetRemaining: number;
    percentageUsed: number;
  } {
    this.resetQuotaIfNewDay();

    const bucketsStatus: Record<
      string,
      Omit<TokenBucket, 'lastRefillTime'>
    > = {};
    for (const [name, bucket] of this.flowBuckets) {
      this.refillBucket(bucket);
      bucketsStatus[name] = {
        flowName: bucket.flowName,
        tokensAvailable: Math.floor(bucket.tokensAvailable),
        refillRate: bucket.refillRate,
        totalTokensUsed: bucket.totalTokensUsed,
        totalCostUSD: parseFloat(bucket.totalCostUSD.toFixed(4)),
      };
    }

    const budgetRemaining =
      this.config.dailyBudgetUSD - this.globalQuota.costIncurredUSD;
    const percentageUsed =
      (this.globalQuota.costIncurredUSD / this.config.dailyBudgetUSD) * 100;

    return {
      buckets: bucketsStatus,
      globalQuota: this.globalQuota,
      budgetRemaining: Math.max(0, budgetRemaining),
      percentageUsed,
    };
  }

  /**
   * Get remaining budget in USD
   */
  getRemaining(): {
    budgetUSD: number;
    tokensApprox: number;
    generationsAtAvg: number;
  } {
    this.resetQuotaIfNewDay();
    const budgetRemaining = Math.max(
      0,
      this.config.dailyBudgetUSD - this.globalQuota.costIncurredUSD
    );
    const tokensApprox = Math.floor(budgetRemaining / this.calculateCost(1000));
    const generationsAtAvg = Math.floor(tokensApprox / 500); // Assume 500 tokens/generation avg

    return {
      budgetUSD: parseFloat(budgetRemaining.toFixed(4)),
      tokensApprox,
      generationsAtAvg,
    };
  }

  /**
   * Reset limits (for testing or manual reset)
   */
  resetDaily(): void {
    this.flowBuckets.clear();
    this.globalQuota = {
      tokensUsedToday: 0,
      costIncurredUSD: 0,
      startOfDayTimestamp: Date.now(),
    };
    MollyLogger.info('All rate limits reset', 'rate-limiter');
  }

  // === Private Methods ===

  private getOrCreateBucket(flowName: string): TokenBucket {
    if (!this.flowBuckets.has(flowName)) {
      // Use configured maxPerMinute instead of hardcoded 100k—respects rate limit config
      const tokensPerMinute = this.config.maxPerMinute;
      const refillRate = tokensPerMinute / 60000; // tokens per ms

      const bucket: TokenBucket = {
        flowName,
        tokensAvailable: tokensPerMinute, // Start full
        lastRefillTime: Date.now(),
        refillRate,
        totalTokensUsed: 0,
        totalCostUSD: 0,
      };
      this.flowBuckets.set(flowName, bucket);
    }
    return this.flowBuckets.get(flowName)!;
  }

  private refillBucket(bucket: TokenBucket): void {
    const now = Date.now();
    const timeSinceLastRefill = now - bucket.lastRefillTime;
    const tokensToAdd = timeSinceLastRefill * bucket.refillRate;

    // Use configured limit for max capacity
    const maxCapacity = this.config.maxPerMinute;
    bucket.tokensAvailable = Math.min(
      maxCapacity,
      bucket.tokensAvailable + tokensToAdd
    );
    bucket.lastRefillTime = now;
  }

  private resetQuotaIfNewDay(): void {
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;

    if (now - this.globalQuota.startOfDayTimestamp > dayInMs) {
      MollyLogger.info('New day - quota reset', 'rate-limiter', {
        previousCost: this.globalQuota.costIncurredUSD.toFixed(4),
        previousTokens: this.globalQuota.tokensUsedToday,
      });
      this.globalQuota = {
        tokensUsedToday: 0,
        costIncurredUSD: 0,
        startOfDayTimestamp: now,
      };
    }
  }

  private calculateCost(tokens: number): number {
    return (tokens / 1_000_000) * this.config.costPer1MTokens;
  }

  private checkWarnings(bucket: TokenBucket, estimatedCost: number): void {
    const percentageRemaining =
      (this.globalQuota.costIncurredUSD + estimatedCost) /
      this.config.dailyBudgetUSD;

    if (percentageRemaining > this.config.warningThreshold) {
      const warningLevel =
        percentageRemaining > 0.95
          ? 'CRITICAL'
          : percentageRemaining > 0.9
            ? 'HIGH'
            : 'MEDIUM';

      MollyLogger.warn(
        `Budget ${warningLevel}: ${(percentageRemaining * 100).toFixed(1)}% used`,
        'rate-limiter',
        {
          flow: bucket.flowName,
          percentageUsed: (percentageRemaining * 100).toFixed(1),
          budgetRemaining: (
            this.config.dailyBudgetUSD - this.globalQuota.costIncurredUSD
          ).toFixed(4),
        }
      );
    }
  }
}

// Singleton instance
let rateLimiterInstance: RateLimiter | null = null;

export function getRateLimiter(config?: Partial<RateLimitConfig>): RateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter(config);
  }
  return rateLimiterInstance;
}

export { RateLimiter };

// --- Emergency override: reset limits on module load ---
rateLimiterInstance = new RateLimiter(DEFAULT_CONFIG);
rateLimiterInstance.resetDaily();
