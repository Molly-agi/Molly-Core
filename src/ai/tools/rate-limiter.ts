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

const parsePositiveNumber = (
  value: string | undefined,
  fallback: number,
  minimum: number
): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.max(parsed, minimum);
};

export const DEFAULT_TOKENS_PER_MINUTE = parsePositiveNumber(
  process.env.MOLLY_RATE_LIMIT_TOKENS_PER_MINUTE,
  100_000,
  1_000
);

export const DEFAULT_BUCKET_CAPACITY = parsePositiveNumber(
  process.env.MOLLY_RATE_LIMIT_BUCKET_CAPACITY,
  DEFAULT_TOKENS_PER_MINUTE,
  1_000
);

const DEFAULT_VERBOSE_LOGGING = process.env.MOLLY_RATE_LIMIT_VERBOSE === 'true';

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
  /** Tokens refilled per minute per flow */
  tokensPerMinute: number;
  /** Maximum burst size per flow */
  bucketCapacity: number;
  /** Enable verbose logging on every check */
  verboseLogging: boolean;
}

export interface TokenBucket {
  flowName: string;
  tokensAvailable: number;
  lastRefillTime: number;
  refillRate: number; // tokens per ms
  totalTokensUsed: number;
  totalCostUSD: number;
  capacity: number;
  lastLowLogTs?: number;
}

export interface GlobalQuota {
  tokensUsedToday: number;
  costIncurredUSD: number;
  startOfDayTimestamp: number;
}

// Default configuration
const DEFAULT_CONFIG: RateLimitConfig = {
  maxPerMinute: 20, // Conservative: 20 generations/min per flow
  maxTokensPerDay: 1_000_000, // ~1M tokens/day
  costPer1MTokens: 1.5, // ~$1.50 per 1M tokens (Gemini pricing)
  warningThreshold: 0.8, // Warn at 80% usage
  dailyBudgetUSD: 5.0, // $5/day default budget
  tokensPerMinute: DEFAULT_TOKENS_PER_MINUTE,
  bucketCapacity: DEFAULT_BUCKET_CAPACITY,
  verboseLogging: DEFAULT_VERBOSE_LOGGING,
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

    this.logBucketState(flowName, bucket, estimatedTokens);

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
        capacity: bucket.capacity,
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
      const tokensPerMinute = this.config.tokensPerMinute;
      const capacity = this.config.bucketCapacity;
      const refillRate = tokensPerMinute / 60000; // tokens per ms

      const bucket: TokenBucket = {
        flowName,
        tokensAvailable: capacity, // Start full
        lastRefillTime: Date.now(),
        refillRate,
        totalTokensUsed: 0,
        totalCostUSD: 0,
        capacity,
      };
      this.flowBuckets.set(flowName, bucket);
    }
    return this.flowBuckets.get(flowName)!;
  }

  private refillBucket(bucket: TokenBucket): void {
    const now = Date.now();
    const timeSinceLastRefill = now - bucket.lastRefillTime;
    const tokensToAdd = timeSinceLastRefill * bucket.refillRate;

    bucket.tokensAvailable = Math.min(
      bucket.capacity, // Max capacity
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

  private logBucketState(
    flowName: string,
    bucket: TokenBucket,
    estimatedTokens: number
  ): void {
    const remainingRatio = bucket.tokensAvailable / bucket.capacity;
    const now = Date.now();

    const lowWatermark = 0.25;
    const shouldLogLow =
      remainingRatio <= lowWatermark &&
      (!bucket.lastLowLogTs || now - bucket.lastLowLogTs > 5000);

    if (this.config.verboseLogging || shouldLogLow) {
      if (shouldLogLow) {
        bucket.lastLowLogTs = now;
      }

      MollyLogger.info('Rate limiter bucket status', 'rate-limiter', {
        flow: flowName,
        remainingPercent: Number((remainingRatio * 100).toFixed(1)),
        tokensAvailable: Math.floor(bucket.tokensAvailable),
        capacity: bucket.capacity,
        refillPerSecond: Math.round(bucket.refillRate * 1000),
        estimatedTokens,
        mode: shouldLogLow ? 'near-limit' : 'verbose',
      });
    }
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
