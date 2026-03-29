/**
 * @fileOverview Resiliency Module Index
 *
 * CENTRAL EXPORT for all resiliency components.
 * Import from '@/ai/resiliency' for clean access.
 *
 * This module provides:
 * - CircuitState (shared enum - SINGLE SOURCE OF TRUTH)
 * - CircuitBreaker (execution wrapper pattern)
 * - StructuredError (context-preserving errors)
 * - Recovery chains (escalation handling)
 * - Health metrics
 */

// Shared types - ALWAYS import CircuitState from here
export {
  CircuitState,
  type BaseCircuitBreakerConfig,
  type BaseCircuitStats,
} from './circuit-state';

// Full resiliency module (execution wrapper pattern)
export {
  // Circuit breaker
  CircuitBreaker,
  getCircuitBreaker,
  resetAllCircuitBreakers,

  // Structured errors
  createStructuredError,
  wrapError,
  isStructuredError,
  getErrorChain,

  // Retry
  retryWithBackoff,

  // Recovery chains
  executeRecoveryChain,
  createRecoveryChain,

  // Health monitoring
  getHealthMetrics,
  getRecentErrors,
  clearErrorHistory,

  // Convenience wrappers
  protectedExecution,
  safeExecution,

  // Types
  type CircuitBreakerConfig,
  type StructuredError,
  type ErrorSeverity,
  type RecoveryStatus,
  type RecoveryAction,
  type RecoveryChainConfig,
  type HealthMetrics,
  type RetryConfig,
} from '../agency/core/resiliency';
