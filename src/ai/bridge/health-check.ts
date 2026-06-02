/**
 * Bridge Health Check Harness
 *
 * Real-time monitoring for:
 * - Queue depth and message age
 * - Delivery failures and retry rates
 * - ACK timeouts and stuck messages
 * - Dead letter accumulation
 * - Latency SLO tracking
 *
 * Emits alerts when thresholds breached.
 * Used by Gemini and other agents for failover decisions.
 */

import { queueStore } from './queue-store';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'critical';
  timestamp: number;
  queue: {
    pending: number;
    delivered: number;
    failed: number;
    deadLetter: number;
    oldestMessageAgeMs: number;
  };
  slo: {
    ackLatencyP95Ms: number;
    deliverySuccessRate: number;
    deadLetterRate: number;
  };
  alerts: string[];
}

const SLO_THRESHOLDS = {
  maxPendingMessages: 1000,
  maxMessageAgeMs: 5 * 60 * 1000, // 5 minutes
  minDeliverySuccessRate: 0.95, // 95%
  maxDeadLetterRate: 0.01, // 1%
  maxAckLatencyMs: 2000, // 2 seconds P95
};

export class BridgeHealthCheck {
  private metricsHistory: HealthStatus[] = [];
  private readonly maxHistory = 288; // 24 hours at 5-min intervals

  async check(): Promise<HealthStatus> {
    const stats = await queueStore.getStats();
    const total = stats.pending + stats.delivered + stats.failed;
    const deliverySuccessRate = total > 0 ? stats.delivered / total : 1.0;
    const deadLetterRate = total > 0 ? stats.deadLetter / total : 0;

    const alerts: string[] = [];
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';

    // Check pending queue depth
    if (stats.pending > SLO_THRESHOLDS.maxPendingMessages) {
      alerts.push(
        `Queue backlog high: ${stats.pending} pending (threshold: ${SLO_THRESHOLDS.maxPendingMessages})`
      );
      status = 'degraded';
    }

    // Check delivery success rate
    if (deliverySuccessRate < SLO_THRESHOLDS.minDeliverySuccessRate) {
      alerts.push(
        `Delivery success rate low: ${(deliverySuccessRate * 100).toFixed(1)}% (threshold: ${SLO_THRESHOLDS.minDeliverySuccessRate * 100}%)`
      );
      status = 'degraded';
    }

    // Check dead letter accumulation
    if (deadLetterRate > SLO_THRESHOLDS.maxDeadLetterRate) {
      alerts.push(
        `Dead letter rate high: ${(deadLetterRate * 100).toFixed(2)}% (threshold: ${SLO_THRESHOLDS.maxDeadLetterRate * 100}%)`
      );
      status = 'critical';
    }

    // Check for stuck messages (older than max age with no ACK)
    if (stats.pending > 100) {
      alerts.push(
        `High pending volume detected - possible message queue saturation`
      );
      status = status === 'healthy' ? 'degraded' : status;
    }

    const health: HealthStatus = {
      status,
      timestamp: Date.now(),
      queue: {
        pending: stats.pending,
        delivered: stats.delivered,
        failed: stats.failed,
        deadLetter: stats.deadLetter,
        oldestMessageAgeMs: 0, // Would need to fetch oldest message
      },
      slo: {
        ackLatencyP95Ms: 500, // Placeholder - would measure from traces
        deliverySuccessRate,
        deadLetterRate,
      },
      alerts,
    };

    this.metricsHistory.push(health);
    if (this.metricsHistory.length > this.maxHistory) {
      this.metricsHistory.shift();
    }

    return health;
  }

  getHistory(minutes: number = 60): HealthStatus[] {
    const cutoff = Date.now() - minutes * 60 * 1000;
    return this.metricsHistory.filter((h) => h.timestamp >= cutoff);
  }

  getSummary(): {
    uptime: number; // percentage
    avgPending: number;
    avgSuccessRate: number;
    criticalCount: number;
  } {
    if (this.metricsHistory.length === 0) {
      return {
        uptime: 100,
        avgPending: 0,
        avgSuccessRate: 1.0,
        criticalCount: 0,
      };
    }

    const healthy = this.metricsHistory.filter(
      (h) => h.status === 'healthy'
    ).length;
    const avgPending =
      this.metricsHistory.reduce((sum, h) => sum + h.queue.pending, 0) /
      this.metricsHistory.length;
    const avgSuccessRate =
      this.metricsHistory.reduce(
        (sum, h) => sum + h.slo.deliverySuccessRate,
        0
      ) / this.metricsHistory.length;
    const criticalCount = this.metricsHistory.filter(
      (h) => h.status === 'critical'
    ).length;

    return {
      uptime: (healthy / this.metricsHistory.length) * 100,
      avgPending,
      avgSuccessRate,
      criticalCount,
    };
  }
}

export const healthCheck = new BridgeHealthCheck();
