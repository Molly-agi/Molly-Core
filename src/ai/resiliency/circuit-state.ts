/**
 * @fileOverview Shared Circuit State Types
 *
 * SINGLE SOURCE OF TRUTH for circuit breaker state.
 * Both the operation-tracking circuit breaker (tools/circuit-breaker.ts)
 * and the execution-wrapper circuit breaker (agency/core/resiliency.ts)
 * MUST import from here to stay in sync.
 */

/**
 * Circuit breaker states
 *
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Too many failures, requests rejected immediately
 * - HALF_OPEN: Testing if system recovered, limited requests allowed
 */
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Base circuit breaker configuration shared by all implementations
 */
export interface BaseCircuitBreakerConfig {
  /** Failure threshold to trip circuit */
  failureThreshold: number;
  /** Time in ms before attempting recovery */
  resetTimeoutMs: number;
}

/**
 * Base circuit stats shared by all implementations
 */
export interface BaseCircuitStats {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number | null;
}
