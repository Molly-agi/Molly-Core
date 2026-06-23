/**
 * @fileOverview Circuit Breaker Pattern Implementation - Operation Tracking
 *
 * Prevents cascading failures by stopping requests when the system is struggling:
 * - Tracks error rates per operation
 * - Trips on high error rate or consecutive failures
 * - Auto-recovers after cooldown period
 * - Reports system health status
 *
 * This is a CRITICAL SAFETY LAYER for server stability.
 *
 * NOTE: This module uses the OPERATION TRACKING pattern (manual recordSuccess/recordFailure).
 * For the EXECUTION WRAPPER pattern (wrap your function), see resiliency.ts.
 * Both share CircuitState from resiliency/circuit-state.ts to stay in sync.
 */

import { MollyLogger } from '../logger';

// Import shared CircuitState - SINGLE SOURCE OF TRUTH
import { CircuitState } from '../resiliency/circuit-state';
export { CircuitState } from '../resiliency/circuit-state';

export interface CircuitBreakerConfig {
  /** Error threshold percentage (0-100) to trip circuit */
  errorThresholdPercent: number;
  /** Minimum requests before calculating error rate */
  minimumRequests: number;
  /** Consecutive failures to trip circuit */
  consecutiveFailures: number;
  /** Time in ms before attempting recovery */
  cooldownMs: number;
  /** Max time in ms for half-open state before resetting */
  halfOpenTimeoutMs: number;
}

export interface CircuitStats {
  state: CircuitState;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  errorRate: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  tripTime: number | null;
}

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  errorThresholdPercent: 70, // Trip if >70% errors
  minimumRequests: 10, // Need at least 10 requests before judging
  consecutiveFailures: 15, // 15 consecutive failures (mobile-resilient)
  cooldownMs: 5000, // Wait 5s before retry
  halfOpenTimeoutMs: 30000, // 30s to recover
};

class CircuitBreaker {
  private operationBreakers: Map<string, CircuitBreakerInstance>;
  private globalBreaker: CircuitBreakerInstance;

  constructor() {
    this.operationBreakers = new Map();
    this.globalBreaker = new CircuitBreakerInstance(
      'GLOBAL',
      DEFAULT_CIRCUIT_CONFIG
    );
  }

  /**
   * Check if operation can proceed
   */
  canProceed(operationName: string): boolean {
    const opBreaker = this.getOrCreateBreaker(operationName);
    const globalOk = this.globalBreaker.canProceed();
    const opOk = opBreaker.canProceed();

    if (!globalOk || !opOk) {
      const stats = !globalOk
        ? this.globalBreaker.getStats()
        : opBreaker.getStats();
      MollyLogger.warn(
        `Circuit breaker OPEN for ${operationName}`,
        'circuit-breaker',
        { state: stats.state, reason: !globalOk ? 'GLOBAL' : 'OPERATION' }
      );
      return false;
    }

    return true;
  }

  /**
   * Record successful operation
   */
  recordSuccess(operationName: string): void {
    const opBreaker = this.getOrCreateBreaker(operationName);
    opBreaker.recordSuccess();
    this.globalBreaker.recordSuccess();
  }

  /**
   * Record failed operation
   */
  recordFailure(operationName: string, error?: unknown): void {
    const opBreaker = this.getOrCreateBreaker(operationName);
    opBreaker.recordFailure();
    this.globalBreaker.recordFailure();

    const stats = opBreaker.getStats();
    MollyLogger.error(
      `Operation "${operationName}" failed (${stats.failureCount} total)`,
      'circuit-breaker',
      {
        successCount: stats.successCount,
        failureCount: stats.failureCount,
        errorRate: `${stats.errorRate.toFixed(1)}%`,
        state: stats.state,
      },
      error
    );

    // Warn if approaching trip threshold
    if (stats.state === CircuitState.CLOSED && stats.errorRate > 30) {
      MollyLogger.warn(
        `Operation "${operationName}" error rate high (${stats.errorRate.toFixed(1)}%)`,
        'circuit-breaker',
        { operation: operationName }
      );
    }
  }

  /**
   * Get stats for an operation
   */
  getStats(operationName?: string): CircuitStats {
    if (!operationName) {
      return this.globalBreaker.getStats();
    }
    const opBreaker = this.getOrCreateBreaker(operationName);
    return opBreaker.getStats();
  }

  /**
   * Get comprehensive status of all circuit breakers
   */
  getStatus() {
    return {
      global: this.globalBreaker.getStats(),
      operations: Object.fromEntries(
        Array.from(this.operationBreakers.entries()).map(([name, breaker]) => [
          name,
          breaker.getStats(),
        ])
      ),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get the current global circuit state.
   * This provides API consistency with the resiliency module's CircuitBreaker.
   * Use this instead of getStats().state for cleaner code.
   */
  getState(): CircuitState {
    return this.globalBreaker.getStats().state;
  }

  /**
   * Reset a breaker
   */
  reset(operationName?: string): void {
    if (operationName) {
      const opBreaker = this.operationBreakers.get(operationName);
      if (opBreaker) {
        opBreaker.reset();
        MollyLogger.info(
          `Circuit breaker reset for ${operationName}`,
          'circuit-breaker',
          {}
        );
      }
    } else {
      this.globalBreaker.reset();
      this.operationBreakers.forEach((breaker) => breaker.reset());
      MollyLogger.info('All circuit breakers reset', 'circuit-breaker', {});
    }
  }

  private getOrCreateBreaker(operationName: string): CircuitBreakerInstance {
    if (!this.operationBreakers.has(operationName)) {
      this.operationBreakers.set(
        operationName,
        new CircuitBreakerInstance(operationName, DEFAULT_CIRCUIT_CONFIG)
      );
    }
    return this.operationBreakers.get(operationName)!;
  }
}

class CircuitBreakerInstance {
  private name: string;
  private config: CircuitBreakerConfig;
  private state: CircuitState;
  private stats: CircuitStats;

  constructor(name: string, config: CircuitBreakerConfig) {
    this.name = name;
    this.config = config;
    this.state = CircuitState.CLOSED;
    this.stats = {
      state: CircuitState.CLOSED,
      successCount: 0,
      failureCount: 0,
      consecutiveFailures: 0,
      errorRate: 0,
      lastFailureTime: null,
      lastSuccessTime: null,
      tripTime: null,
    };
  }

  canProceed(): boolean {
    // Auto-recover from OPEN state after cooldown
    if (this.state === CircuitState.OPEN) {
      const timeSinceTrip = Date.now() - (this.stats.tripTime || 0);
      if (timeSinceTrip > this.config.cooldownMs) {
        this.state = CircuitState.HALF_OPEN;
        MollyLogger.info(
          `Circuit breaker HALF_OPEN for ${this.name}`,
          'circuit-breaker',
          {}
        );
      } else {
        return false;
      }
    }

    return (
      this.state === CircuitState.CLOSED ||
      this.state === CircuitState.HALF_OPEN
    );
  }

  recordSuccess(): void {
    this.stats.successCount++;
    this.stats.lastSuccessTime = Date.now();
    this.stats.consecutiveFailures = 0;

    // Transition from HALF_OPEN to CLOSED on success
    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.CLOSED;
      MollyLogger.info(
        `Circuit breaker recovered to CLOSED for ${this.name}`,
        'circuit-breaker',
        {}
      );
    }

    this.updateErrorRate();
  }

  recordFailure(): void {
    this.stats.failureCount++;
    this.stats.lastFailureTime = Date.now();
    this.stats.consecutiveFailures++;

    // Trip immediately on consecutive failures
    if (this.stats.consecutiveFailures >= this.config.consecutiveFailures) {
      this.tripCircuit('consecutive failures');
    } else {
      this.updateErrorRate();
      // Check if error rate exceeds threshold
      if (
        this.stats.successCount + this.stats.failureCount >=
          this.config.minimumRequests &&
        this.stats.errorRate >= this.config.errorThresholdPercent
      ) {
        this.tripCircuit('error rate exceeded');
      }
    }
  }

  private tripCircuit(reason: string): void {
    if (this.state !== CircuitState.OPEN) {
      this.state = CircuitState.OPEN;
      this.stats.tripTime = Date.now();
      MollyLogger.error(
        `Circuit breaker TRIPPED for ${this.name}: ${reason}`,
        'circuit-breaker',
        {
          operation: this.name,
          reason,
          errorRate: `${this.stats.errorRate.toFixed(1)}%`,
          consecutiveFailures: this.stats.consecutiveFailures,
        }
      );

      // Item-2: trip is the value-laden moment. Recall-worthy.
      const opName = this.name;
      const tripReason = reason;
      const errorRate = this.stats.errorRate.toFixed(1);
      void (async () => {
        try {
          const { getNeuralBrain } = await import('@/ai/memory/neural-engram');
          getNeuralBrain().remember(
            `[Circuit-breaker TRIP ${opName}] ${tripReason} (errorRate=${errorRate}%)`,
            {
              tags: ['circuit-breaker', 'trip', opName],
              importance: 0.85,
              source: 'tool-call',
              provenance: { source: `tool:circuit-breaker:trip` },
            }
          );
        } catch {
          // Memory-ingest failure must never break the trip path.
        }
      })();
    }
  }

  private updateErrorRate(): void {
    const total = this.stats.successCount + this.stats.failureCount;
    this.stats.errorRate =
      total > 0 ? (this.stats.failureCount / total) * 100 : 0;
    this.stats.state = this.state;
  }

  getStats(): CircuitStats {
    return { ...this.stats };
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.stats = {
      state: CircuitState.CLOSED,
      successCount: 0,
      failureCount: 0,
      consecutiveFailures: 0,
      errorRate: 0,
      lastFailureTime: null,
      lastSuccessTime: null,
      tripTime: null,
    };
  }
}

// Singleton instance
let globalCircuitBreaker: CircuitBreaker;

export function getCircuitBreaker(): CircuitBreaker {
  if (!globalCircuitBreaker) {
    globalCircuitBreaker = new CircuitBreaker();
  }
  return globalCircuitBreaker;
}
