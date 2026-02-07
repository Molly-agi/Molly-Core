/**
 * @fileOverview Cost Tracking & Budget Management
 *
 * Tracks API usage costs and provides:
 * - Cost per model estimation
 * - Daily spending reports
 * - Budget alerts
 * - Cost analytics
 */

import { MollyLogger } from '../logger';

export interface CostRecord {
  timestamp: number;
  flowName: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUSD: number;
  success: boolean;
}

// Gemini pricing (as of Feb 2026)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-2.5-pro': {
    input: 1.25 / 1_000_000, // $1.25 per 1M input tokens
    output: 5.0 / 1_000_000, // $5 per 1M output tokens
  },
  'gemini-2.5-flash': {
    input: 0.075 / 1_000_000, // $0.075 per 1M input tokens
    output: 0.3 / 1_000_000, // $0.30 per 1M output tokens
  },
  'gemini-2.5-flash-preview-tts': {
    input: 0.075 / 1_000_000,
    output: 0.3 / 1_000_000,
  },
  'imagen-3.0-generate-001': {
    input: 0, // No input tokens
    output: 5.0, // Fixed $5 per image
  },
};

class CostTracker {
  private costRecords: CostRecord[] = [];

  /**
   * Record a generation cost
   */
  recordCost(
    flowName: string,
    modelUsed: string,
    inputTokens: number,
    outputTokens: number,
    success: boolean = true
  ): CostRecord {
    const pricing = MODEL_PRICING[modelUsed] || {
      input: 2.5 / 1_000_000,
      output: 10 / 1_000_000,
    };

    const costUSD = inputTokens * pricing.input + outputTokens * pricing.output;

    const record: CostRecord = {
      timestamp: Date.now(),
      flowName,
      modelUsed,
      inputTokens,
      outputTokens,
      estimatedCostUSD: costUSD,
      success,
    };

    this.costRecords.push(record);
    MollyLogger.info(`Cost: $${costUSD.toFixed(6)}`, 'cost-tracker', {
      flow: flowName,
      model: modelUsed,
      costUSD: costUSD.toFixed(6),
      inputTokens,
      outputTokens,
    });

    return record;
  }

  /**
   * Get today's spending summary
   */
  getTodaysSummary(): {
    totalCostUSD: number;
    recordCount: number;
    byFlow: Record<string, number>;
    byModel: Record<string, number>;
  } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    const todaysRecords = this.costRecords.filter(
      (r) => r.timestamp >= todayTimestamp
    );

    const byFlow: Record<string, number> = {};
    const byModel: Record<string, number> = {};
    let totalCost = 0;

    for (const record of todaysRecords) {
      totalCost += record.estimatedCostUSD;
      byFlow[record.flowName] =
        (byFlow[record.flowName] || 0) + record.estimatedCostUSD;
      byModel[record.modelUsed] =
        (byModel[record.modelUsed] || 0) + record.estimatedCostUSD;
    }

    return {
      totalCostUSD: parseFloat(totalCost.toFixed(4)),
      recordCount: todaysRecords.length,
      byFlow: Object.fromEntries(
        Object.entries(byFlow).map(([k, v]) => [k, parseFloat(v.toFixed(4))])
      ),
      byModel: Object.fromEntries(
        Object.entries(byModel).map(([k, v]) => [k, parseFloat(v.toFixed(4))])
      ),
    };
  }

  /**
   * Get cost for a date range
   */
  getCostForRange(
    startDate: Date,
    endDate: Date
  ): {
    totalCostUSD: number;
    recordCount: number;
    dailyBreakdown: Record<string, number>;
  } {
    const startTimestamp = startDate.getTime();
    const endTimestamp = endDate.getTime();

    const rangeRecords = this.costRecords.filter(
      (r) => r.timestamp >= startTimestamp && r.timestamp <= endTimestamp
    );

    const dailyBreakdown: Record<string, number> = {};
    let totalCost = 0;

    for (const record of rangeRecords) {
      const dateKey = new Date(record.timestamp).toISOString().split('T')[0];
      dailyBreakdown[dateKey] =
        (dailyBreakdown[dateKey] || 0) + record.estimatedCostUSD;
      totalCost += record.estimatedCostUSD;
    }

    return {
      totalCostUSD: parseFloat(totalCost.toFixed(4)),
      recordCount: rangeRecords.length,
      dailyBreakdown: Object.fromEntries(
        Object.entries(dailyBreakdown).map(([k, v]) => [
          k,
          parseFloat(v.toFixed(4)),
        ])
      ),
    };
  }

  /**
   * Estimate cost before a generation
   */
  estimateCost(
    modelUsed: string,
    estimatedInputTokens: number,
    estimatedOutputTokens: number
  ): number {
    const pricing = MODEL_PRICING[modelUsed] || {
      input: 2.5 / 1_000_000,
      output: 10 / 1_000_000,
    };

    return (
      estimatedInputTokens * pricing.input +
      estimatedOutputTokens * pricing.output
    );
  }

  /**
   * Get pricing for a model
   */
  getPricing(modelUsed: string): { input: number; output: number } {
    return (
      MODEL_PRICING[modelUsed] || {
        input: 2.5 / 1_000_000,
        output: 10 / 1_000_000,
      }
    );
  }

  /**
   * Clear history (for testing)
   */
  clear(): void {
    this.costRecords = [];
  }

  /**
   * Get all records
   */
  getAllRecords(): CostRecord[] {
    return [...this.costRecords];
  }
}

// Singleton instance
let costTrackerInstance: CostTracker | null = null;

export function getCostTracker(): CostTracker {
  if (!costTrackerInstance) {
    costTrackerInstance = new CostTracker();
  }
  return costTrackerInstance;
}

export { CostTracker };
