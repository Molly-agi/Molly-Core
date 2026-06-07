/**
 * @fileOverview Memory Health Monitor — SLO tracking for Molly's memory systems
 *
 * Tracks consolidation performance, dead-letter events, and reconciliation metrics.
 * Provides observability for memory layer reliability during Phase 1 bridge upgrade.
 *
 * Phase 1: Run alongside existing consolidation, gather baseline metrics.
 * Phase 2: Integrate health checks into decision-making for graceful degradation.
 *
 * SLO Targets:
 * - Consolidation success rate ≥95%
 * - P95 consolidation time ≤30s
 * - Zero engram deduplication conflicts (ACK-aware)
 * - Dead-letter queue empty for >24h
 */

import { getStorageRouter } from '@/lib/storage-router';
import { MollyLogger, generateTraceId } from '@/ai/logger';
import type { Timestamp } from 'firebase/firestore';

export interface ConsolidationMetrics {
  // Time series
  timestamp: number;
  userId: string;

  // Success metrics
  consolidationAttempts: number;
  consolidationSuccesses: number;
  successRate: number; // % of consolidations that succeeded

  // Performance metrics
  totalConsolidationTimeMs: number;
  averageConsolidationTimeMs: number;
  p95ConsolidationTimeMs: number;

  // Memory processing
  memoriesProcessed: number;
  memoriesDeduplicated: number;
  engramsGenerated: number;

  // Error tracking
  errorCount: number;
  errorTypes: Record<string, number>; // e.g., { "embedding_timeout": 3, "firestore_write_failed": 1 }

  // Queue integration
  acksReceivedForEngramsMs: number[]; // Latency between engram persist and ACK receipt
  acksReceivedCount: number;

  // Dead letter metrics
  deadLetterCount: number;
  deadLetterErrors: Array<{
    engramId: string;
    error: string;
    timestamp: number;
  }>;

  // Health status
  isHealthy: boolean;
  lastHealthCheckMs: number;
}

export interface MemoryHealthSnapshot {
  userId: string;
  checkTime: number;
  consolidationSLO: {
    successRate: number;
    meetsTarget: boolean;
  };
  performanceSLO: {
    p95TimeMs: number;
    meetsTarget: boolean;
  };
  deadLetterSLO: {
    countPast24h: number;
    meetsTarget: boolean;
  };
  overallHealth: 'healthy' | 'degraded' | 'failed';
  recommendations: string[];
}

class MemoryHealthMonitor {
  private db: ReturnType<typeof getStorageRouter> | null = null;
  private collectionName = 'molly_memory_metrics';
  private metricsCache: Map<string, ConsolidationMetrics> = new Map();

  async initialize(): Promise<void> {
    this.db = await getStorageRouter();
  }

  /**
   * Record a consolidation attempt
   */
  async recordConsolidationStart(
    userId: string
  ): Promise<{ attemptId: string; startTime: number }> {
    const attemptId = `attempt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const startTime = Date.now();

    MollyLogger.info('Consolidation started', 'memory-health', {
      userId,
      attemptId,
    });

    return { attemptId, startTime };
  }

  /**
   * Record consolidation success/failure
   */
  async recordConsolidationEnd(
    userId: string,
    attemptId: string,
    startTime: number,
    success: boolean,
    metadata: {
      memoriesProcessed: number;
      memoriesDeduplicated: number;
      engramsGenerated: number;
      error?: string;
      errorType?: string;
    }
  ): Promise<void> {
    const endTime = Date.now();
    const duration = endTime - startTime;

    const current = this.metricsCache.get(userId) || this.createEmptyMetrics(userId);

    current.consolidationAttempts += 1;
    if (success) {
      current.consolidationSuccesses += 1;
    } else {
      current.errorCount += 1;
      if (metadata.errorType) {
        current.errorTypes[metadata.errorType] =
          (current.errorTypes[metadata.errorType] || 0) + 1;
      }
    }

    current.memoriesProcessed += metadata.memoriesProcessed;
    current.memoriesDeduplicated += metadata.memoriesDeduplicated;
    current.engramsGenerated += metadata.engramsGenerated;

    // Update performance metrics
    current.totalConsolidationTimeMs += duration;
    current.averageConsolidationTimeMs =
      current.totalConsolidationTimeMs / current.consolidationSuccesses;

    // Rough P95 (last 20 attempts)
    if (!current['_timings']) {
      current['_timings'] = [] as number[];
    }
    const timings = current['_timings'] as number[];
    timings.push(duration);
    if (timings.length > 20) {
      timings.shift();
    }
    const sorted = [...timings].sort((a, b) => a - b);
    current.p95ConsolidationTimeMs = sorted[Math.floor(sorted.length * 0.95)] || duration;

    current.successRate =
      current.consolidationAttempts > 0
        ? (current.consolidationSuccesses / current.consolidationAttempts) * 100
        : 0;

    current.lastHealthCheckMs = endTime;

    this.metricsCache.set(userId, current);

    MollyLogger.info('Consolidation completed', 'memory-health', {
      userId,
      attemptId,
      duration,
      success,
      successRate: current.successRate,
      error: metadata.error,
    });

    // Persist to Firestore
    if (this.db) {
      try {
        await this.db.batchWrite([
          {
            type: 'set',
            collectionPath: `${this.collectionName}/${userId}/attempts`,
            docId: attemptId,
            data: {
              timestamp: new Date().toISOString(),
              duration,
              success,
              ...metadata,
            },
          },
        ]);
      } catch (err) {
        MollyLogger.error(
          'Failed to persist consolidation metrics',
          'memory-health',
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  }

  /**
   * Record ACK received from queue system for an engram
   */
  async recordEngramAck(
    userId: string,
    engramId: string,
    ackLatencyMs: number
  ): Promise<void> {
    const current = this.metricsCache.get(userId) || this.createEmptyMetrics(userId);

    if (!current['_ackLatencies']) {
      current['_ackLatencies'] = [] as number[];
    }

    const ackLatencies = current['_ackLatencies'] as number[];
    ackLatencies.push(ackLatencyMs);

    current.acksReceivedForEngramsMs = ackLatencies.slice(-100); // Keep last 100
    current.acksReceivedCount += 1;

    this.metricsCache.set(userId, current);

    MollyLogger.debug('Engram ACK recorded', 'memory-health', {
      userId,
      engramId,
      ackLatencyMs,
    });
  }

  /**
   * Record a dead-letter engram (permanent failure)
   */
  async recordDeadLetter(
    userId: string,
    engramId: string,
    error: string
  ): Promise<void> {
    const current = this.metricsCache.get(userId) || this.createEmptyMetrics(userId);

    current.deadLetterCount += 1;
    current.deadLetterErrors.push({
      engramId,
      error,
      timestamp: Date.now(),
    });

    // Keep last 50
    if (current.deadLetterErrors.length > 50) {
      current.deadLetterErrors = current.deadLetterErrors.slice(-50);
    }

    this.metricsCache.set(userId, current);

    MollyLogger.error('Dead-letter engram', 'memory-health', {
      userId,
      engramId,
      error,
      deadLetterCount: current.deadLetterCount,
    });

    // Persist dead-letter to Firestore for audit
    if (this.db) {
      try {
        await this.db.batchWrite([
          {
            type: 'set',
            collectionPath: `${this.collectionName}/${userId}/dead_letters`,
            docId: `dl_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            data: {
              engramId,
              error,
              timestamp: new Date().toISOString(),
            },
          },
        ]);
      } catch (err) {
        MollyLogger.error(
          'Failed to persist dead-letter record',
          'memory-health',
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  }

  /**
   * Get current health snapshot for a user
   */
  async getHealthSnapshot(userId: string): Promise<MemoryHealthSnapshot> {
    const current = this.metricsCache.get(userId) || this.createEmptyMetrics(userId);

    // Calculate SLOs
    const consolidationSLO = {
      successRate: current.successRate,
      meetsTarget: current.successRate >= 95,
    };

    const performanceSLO = {
      p95TimeMs: current.p95ConsolidationTimeMs,
      meetsTarget: current.p95ConsolidationTimeMs <= 30000, // 30s target
    };

    // Dead-letter SLO: should stay empty for 24h
    const past24hDeadLetters = current.deadLetterErrors.filter(
      (dl) => Date.now() - dl.timestamp < 24 * 60 * 60 * 1000
    ).length;

    const deadLetterSLO = {
      countPast24h: past24hDeadLetters,
      meetsTarget: past24hDeadLetters === 0,
    };

    // Overall health
    let overallHealth: 'healthy' | 'degraded' | 'failed' = 'healthy';
    const recommendations: string[] = [];

    if (!consolidationSLO.meetsTarget) {
      overallHealth = 'degraded';
      recommendations.push(
        `Consolidation success rate ${current.successRate.toFixed(1)}% below 95% target`
      );
    }

    if (!performanceSLO.meetsTarget) {
      overallHealth = 'degraded';
      recommendations.push(
        `P95 consolidation time ${performanceSLO.p95TimeMs}ms exceeds 30s target`
      );
    }

    if (!deadLetterSLO.meetsTarget) {
      overallHealth = 'degraded';
      recommendations.push(
        `${deadLetterSLO.countPast24h} dead-letter engramsObserved in past 24h — review error logs`
      );
    }

    if (current.consolidationAttempts === 0) {
      overallHealth = 'failed';
      recommendations.push('No consolidation attempts recorded yet');
    }

    return {
      userId,
      checkTime: Date.now(),
      consolidationSLO,
      performanceSLO,
      deadLetterSLO,
      overallHealth,
      recommendations,
    };
  }

  /**
   * Export metrics for analysis
   */
  async exportMetrics(userId: string): Promise<ConsolidationMetrics> {
    return this.metricsCache.get(userId) || this.createEmptyMetrics(userId);
  }

  /**
   * Reset metrics (for testing)
   */
  async resetMetrics(userId: string): Promise<void> {
    this.metricsCache.delete(userId);
    MollyLogger.info('Metrics reset', 'memory-health', { userId });
  }

  private createEmptyMetrics(userId: string): ConsolidationMetrics {
    return {
      timestamp: Date.now(),
      userId,
      consolidationAttempts: 0,
      consolidationSuccesses: 0,
      successRate: 0,
      totalConsolidationTimeMs: 0,
      averageConsolidationTimeMs: 0,
      p95ConsolidationTimeMs: 0,
      memoriesProcessed: 0,
      memoriesDeduplicated: 0,
      engramsGenerated: 0,
      errorCount: 0,
      errorTypes: {},
      acksReceivedForEngramsMs: [],
      acksReceivedCount: 0,
      deadLetterCount: 0,
      deadLetterErrors: [],
      isHealthy: true,
      lastHealthCheckMs: Date.now(),
    };
  }
}

// Singleton instance
let instance: MemoryHealthMonitor | null = null;

export function getMemoryHealthMonitor(): MemoryHealthMonitor {
  if (!instance) {
    instance = new MemoryHealthMonitor();
    instance.initialize().catch((err) => {
      MollyLogger.error(
        'Failed to initialize memory health monitor',
        'memory-health',
        err instanceof Error ? err.message : String(err)
      );
    });
  }
  return instance;
}
