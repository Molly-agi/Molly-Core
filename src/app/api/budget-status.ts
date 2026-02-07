'use server';
/**
 * @fileOverview Budget Monitoring & Metrics API
 *
 * Server action to check rate limiting and cost status
 * Can be called from components, flows, or frontend
 */

import { getRateLimiter } from '@/ai/tools/rate-limiter';
import { getCostTracker } from '@/ai/tools/cost-tracker';

export interface BudgetStatus {
  rateLimitStatus: {
    budgetRemaining: string;
    percentageUsed: number;
    globalQuota: {
      tokensUsedToday: number;
      costIncurredUSD: string;
    };
    flowStatus: Record<
      string,
      {
        tokensAvailable: number;
        totalCostUSD: string;
      }
    >;
  };
  costTrackerStatus: {
    todaysCost: string;
    recordCount: number;
    byFlow: Record<string, string>;
    byModel: Record<string, string>;
  };
  timestamp: string;
  warnings: string[];
}

/**
 * Get current budget and rate limit status
 * Called periodically to monitor Molly's financial health
 */
export async function getBudgetStatus(): Promise<BudgetStatus> {
  const rateLimiter = getRateLimiter();
  const costTracker = getCostTracker();

  const rateLimitStatus = rateLimiter.getStatus();
  const costTrackerStatus = costTracker.getTodaysSummary();

  const warnings: string[] = [];

  // Check for critical budget state
  if (rateLimitStatus.percentageUsed > 95) {
    warnings.push(
      `🔴 CRITICAL: Budget 95%+ used ($${rateLimitStatus.globalQuota.costIncurredUSD.toFixed(2)} of $${rateLimiter['config'].dailyBudgetUSD})`
    );
  } else if (rateLimitStatus.percentageUsed > 80) {
    warnings.push(
      `🟡 WARNING: Budget 80%+ used ($${rateLimitStatus.globalQuota.costIncurredUSD.toFixed(2)})`
    );
  }

  // Check for high per-flow costs
  for (const [flow, bucket] of Object.entries(rateLimitStatus.buckets)) {
    if (bucket.totalCostUSD > 1.0) {
      warnings.push(
        `⚠️ High cost in flow "${flow}": $${bucket.totalCostUSD.toFixed(2)}`
      );
    }
  }

  const formattedBuckets: Record<
    string,
    {
      tokensAvailable: number;
      totalCostUSD: string;
    }
  > = {};

  for (const [flow, bucket] of Object.entries(rateLimitStatus.buckets)) {
    formattedBuckets[flow] = {
      tokensAvailable: bucket.tokensAvailable,
      totalCostUSD: bucket.totalCostUSD.toFixed(4),
    };
  }

  const formattedByFlow: Record<string, string> = {};
  for (const [flow, cost] of Object.entries(costTrackerStatus.byFlow)) {
    formattedByFlow[flow] = cost.toFixed(4);
  }

  const formattedByModel: Record<string, string> = {};
  for (const [model, cost] of Object.entries(costTrackerStatus.byModel)) {
    formattedByModel[model] = cost.toFixed(4);
  }

  return {
    rateLimitStatus: {
      budgetRemaining: rateLimitStatus.budgetRemaining.toFixed(4),
      percentageUsed: parseFloat(rateLimitStatus.percentageUsed.toFixed(1)),
      globalQuota: {
        tokensUsedToday: rateLimitStatus.globalQuota.tokensUsedToday,
        costIncurredUSD: rateLimitStatus.globalQuota.costIncurredUSD.toFixed(4),
      },
      flowStatus: formattedBuckets,
    },
    costTrackerStatus: {
      todaysCost: costTrackerStatus.totalCostUSD.toFixed(4),
      recordCount: costTrackerStatus.recordCount,
      byFlow: formattedByFlow,
      byModel: formattedByModel,
    },
    timestamp: new Date().toISOString(),
    warnings,
  };
}

/**
 * Reset daily budget (for testing or new day)
 * Only callable with proper authorization
 */
export async function resetDailyBudget(): Promise<{
  success: boolean;
  message: string;
}> {
  const rateLimiter = getRateLimiter();
  rateLimiter.resetDaily();

  return {
    success: true,
    message: 'Daily budget reset successfully',
  };
}

/**
 * Check if a generation is allowed
 * Used by flows before calling GenAI
 */
export async function canProceedWithGeneration(
  flowName: string,
  estimatedTokens: number = 500
): Promise<{
  allowed: boolean;
  reason?: string;
  budgetRemaining?: string;
}> {
  const rateLimiter = getRateLimiter();

  try {
    await rateLimiter.checkLimit(flowName, estimatedTokens);
    const status = rateLimiter.getStatus();
    return {
      allowed: true,
      budgetRemaining: status.budgetRemaining.toFixed(4),
    };
  } catch (error) {
    const err = error as Error;
    return {
      allowed: false,
      reason: err.message,
    };
  }
}
