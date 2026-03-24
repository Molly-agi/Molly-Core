/**
 * @fileOverview Resiliency Core — Circuit Breaker, Error Context, Recovery Chains
 *
 * This module provides the foundational resiliency patterns that all of Molly's
 * systems should use. Rather than each module inventing its own error handling,
 * this provides a unified approach to:
 *
 * 1. Circuit Breaker - Prevents cascading failures and infinite retry loops
 * 2. Structured Errors - Preserves full context (stack traces, nested causes)
 * 3. Retry with Backoff - Exponential backoff with jitter
 * 4. Recovery Chains - Escalation from simple fixes to complex interventions
 * 5. Health Tracking - Monitors recovery system health itself
 *
 * Philosophy: Fix the dam, not the leaks.
 */

import { MollyLogger, generateTraceId } from '@/ai/logger';

// ============================================================
// TYPES
// ============================================================

/** Circuit breaker states */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/** Severity levels for structured errors */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/** Recovery action status */
export type RecoveryStatus = 'success' | 'failed' | 'skipped' | 'escalated';

/** Configuration for circuit breaker */
export interface CircuitBreakerConfig {
  /** Name for logging/identification */
  name: string;
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time in ms before attempting recovery (half-open state) */
  resetTimeoutMs: number;
  /** Number of successes in half-open needed to close circuit */
  successThreshold: number;
  /** Optional callback when circuit opens */
  onOpen?: (failures: number) => void;
  /** Optional callback when circuit closes */
  onClose?: () => void;
}

/** Structured error with full context */
export interface StructuredError {
  /** Unique error ID for tracking */
  id: string;
  /** Human-readable message */
  message: string;
  /** Error severity */
  severity: ErrorSeverity;
  /** Original error if wrapped */
  cause?: Error | StructuredError;
  /** Full stack trace */
  stack?: string;
  /** Source module/function */
  source: string;
  /** Timestamp when error occurred */
  timestamp: number;
  /** Additional metadata */
  metadata: Record<string, unknown>;
  /** Whether recovery was attempted */
  recoveryAttempted: boolean;
  /** Recovery result if attempted */
  recoveryResult?: RecoveryStatus;
  /** Trace ID for correlation */
  traceId: string;
}

/** Recovery action definition */
export interface RecoveryAction {
  /** Action name */
  name: string;
  /** Action description */
  description: string;
  /** Priority (lower = try first) */
  priority: number;
  /** The recovery function */
  execute: (error: StructuredError) => Promise<boolean>;
  /** Conditions under which this action applies */
  appliesTo?: (error: StructuredError) => boolean;
}

/** Recovery chain configuration */
export interface RecoveryChainConfig {
  /** Chain name */
  name: string;
  /** Maximum total attempts across all actions */
  maxTotalAttempts: number;
  /** Actions in priority order */
  actions: RecoveryAction[];
  /** Callback when all recovery attempts exhausted */
  onExhausted?: (error: StructuredError, attempts: number) => void;
}

/** Health metrics for monitoring */
export interface HealthMetrics {
  /** Total errors observed */
  totalErrors: number;
  /** Errors by severity */
  errorsBySeverity: Record<ErrorSeverity, number>;
  /** Recovery attempts */
  recoveryAttempts: number;
  /** Successful recoveries */
  successfulRecoveries: number;
  /** Recovery success rate */
  recoveryRate: number;
  /** Active circuit breakers and their states */
  circuitBreakers: Record<string, CircuitState>;
  /** Errors in last hour */
  recentErrorRate: number;
  /** Health score (0-100) */
  healthScore: number;
  /** Last updated */
  lastUpdated: number;
}

/** Retry configuration */
export interface RetryConfig {
  /** Maximum retry attempts */
  maxAttempts: number;
  /** Initial delay in ms */
  initialDelayMs: number;
  /** Maximum delay in ms */
  maxDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Add jitter to prevent thundering herd */
  jitter: boolean;
  /** Errors that should not be retried */
  nonRetryableErrors?: string[];
}

// ============================================================
// STATE
// ============================================================

const circuitBreakers = new Map<string, CircuitBreaker>();
const errorLog: StructuredError[] = [];
const MAX_ERROR_LOG = 500;
const hourlyErrors: number[] = []; // timestamps
const HOUR_MS = 60 * 60 * 1000;

let totalRecoveryAttempts = 0;
let successfulRecoveries = 0;

// ============================================================
// CIRCUIT BREAKER
// ============================================================

/**
 * Circuit Breaker implementation
 *
 * States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Too many failures, requests rejected immediately
 * - HALF_OPEN: Testing if system recovered, limited requests allowed
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly traceId: string;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
    this.traceId = generateTraceId();
    circuitBreakers.set(config.name, this);

    MollyLogger.info(
      `Circuit breaker initialized: ${config.name}`,
      'resiliency',
      {
        threshold: config.failureThreshold,
        resetTimeout: config.resetTimeoutMs,
      },
      this.traceId
    );
  }

  /** Get current state */
  getState(): CircuitState {
    return this.state;
  }

  /** Get failure count */
  getFailureCount(): number {
    return this.failures;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === 'OPEN') {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure >= this.config.resetTimeoutMs) {
        this.transitionTo('HALF_OPEN');
      } else {
        throw createStructuredError({
          message: `Circuit breaker ${this.config.name} is OPEN`,
          severity: 'high',
          source: 'resiliency/circuit-breaker',
          metadata: {
            circuitName: this.config.name,
            failures: this.failures,
            retryAfterMs: this.config.resetTimeoutMs - timeSinceFailure,
          },
        });
      }
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /** Record a successful operation */
  private recordSuccess(): void {
    this.failures = 0;

    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.transitionTo('CLOSED');
      }
    }
  }

  /** Record a failed operation */
  private recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.successes = 0;

    if (
      this.state === 'CLOSED' &&
      this.failures >= this.config.failureThreshold
    ) {
      this.transitionTo('OPEN');
    } else if (this.state === 'HALF_OPEN') {
      // Any failure in half-open immediately reopens
      this.transitionTo('OPEN');
    }
  }

  /** Transition to a new state */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    MollyLogger.warn(
      `Circuit breaker ${this.config.name}: ${oldState} -> ${newState}`,
      'resiliency',
      { failures: this.failures, successes: this.successes },
      this.traceId
    );

    if (newState === 'OPEN' && this.config.onOpen) {
      this.config.onOpen(this.failures);
    } else if (newState === 'CLOSED' && this.config.onClose) {
      this.config.onClose();
    }

    if (newState === 'HALF_OPEN') {
      this.successes = 0;
    }
  }

  /** Manually reset the circuit breaker */
  reset(): void {
    this.failures = 0;
    this.successes = 0;
    this.transitionTo('CLOSED');

    MollyLogger.info(
      `Circuit breaker ${this.config.name} manually reset`,
      'resiliency',
      {},
      this.traceId
    );
  }
}

/**
 * Get or create a circuit breaker by name
 */
export function getCircuitBreaker(
  name: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  const existing = circuitBreakers.get(name);
  if (existing) return existing;

  return new CircuitBreaker({
    name,
    failureThreshold: 5,
    resetTimeoutMs: 30000,
    successThreshold: 2,
    ...config,
  });
}

// ============================================================
// STRUCTURED ERRORS
// ============================================================

let errorIdCounter = 0;

/**
 * Create a structured error with full context preservation
 */
export function createStructuredError(params: {
  message: string;
  severity: ErrorSeverity;
  source: string;
  cause?: Error | StructuredError;
  metadata?: Record<string, unknown>;
  traceId?: string;
}): StructuredError {
  const error: StructuredError = {
    id: `err_${Date.now()}_${++errorIdCounter}`,
    message: params.message,
    severity: params.severity,
    source: params.source,
    cause: params.cause,
    stack:
      params.cause instanceof Error ? params.cause.stack : new Error().stack,
    timestamp: Date.now(),
    metadata: params.metadata || {},
    recoveryAttempted: false,
    traceId: params.traceId || generateTraceId(),
  };

  // Log the error
  logError(error);

  return error;
}

/**
 * Wrap an unknown error into a structured error
 */
export function wrapError(
  error: unknown,
  source: string,
  severity: ErrorSeverity = 'medium',
  metadata?: Record<string, unknown>
): StructuredError {
  if (isStructuredError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error : undefined;

  return createStructuredError({
    message,
    severity,
    source,
    cause,
    metadata,
  });
}

/**
 * Type guard for StructuredError
 */
export function isStructuredError(error: unknown): error is StructuredError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'id' in error &&
    'severity' in error &&
    'source' in error
  );
}

/**
 * Log error to internal tracking
 */
function logError(error: StructuredError): void {
  errorLog.push(error);
  if (errorLog.length > MAX_ERROR_LOG) {
    errorLog.shift();
  }

  // Track hourly rate
  const now = Date.now();
  hourlyErrors.push(now);
  // Prune old entries
  while (hourlyErrors.length > 0 && hourlyErrors[0] < now - HOUR_MS) {
    hourlyErrors.shift();
  }

  MollyLogger.error(
    error.message,
    error.source,
    error.metadata,
    error.cause instanceof Error ? error.cause : undefined,
    error.traceId
  );
}

/**
 * Get the error chain (nested causes)
 */
export function getErrorChain(error: StructuredError): string[] {
  const chain: string[] = [error.message];

  let current = error.cause;
  while (current) {
    if (isStructuredError(current)) {
      chain.push(current.message);
      current = current.cause;
    } else if (current instanceof Error) {
      chain.push(current.message);
      break;
    } else {
      break;
    }
  }

  return chain;
}

// ============================================================
// RETRY WITH BACKOFF
// ============================================================

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay =
    config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  if (config.jitter) {
    // Add up to 25% jitter
    const jitterRange = cappedDelay * 0.25;
    return cappedDelay + Math.random() * jitterRange;
  }

  return cappedDelay;
}

/**
 * Execute a function with retry and exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  source: string,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const traceId = generateTraceId();
  let lastError: StructuredError | undefined;

  for (let attempt = 0; attempt < fullConfig.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = wrapError(error, source);

      // Check if error is non-retryable
      if (
        fullConfig.nonRetryableErrors?.some((msg) =>
          lastError!.message.includes(msg)
        )
      ) {
        MollyLogger.warn(
          `Non-retryable error encountered: ${lastError.message}`,
          'resiliency',
          { attempt, source },
          traceId
        );
        throw lastError;
      }

      // Check if this was the last attempt
      if (attempt === fullConfig.maxAttempts - 1) {
        MollyLogger.error(
          `All retry attempts exhausted`,
          'resiliency',
          { attempts: fullConfig.maxAttempts, source },
          lastError.cause instanceof Error ? lastError.cause : undefined,
          traceId
        );
        throw lastError;
      }

      // Calculate and apply delay
      const delay = calculateDelay(attempt, fullConfig);
      MollyLogger.info(
        `Retry attempt ${attempt + 1}/${fullConfig.maxAttempts} after ${Math.round(delay)}ms`,
        'resiliency',
        { source, error: lastError.message },
        traceId
      );

      await sleep(delay);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError || new Error('Retry failed unexpectedly');
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// RECOVERY CHAINS
// ============================================================

/**
 * Execute a recovery chain with escalation
 */
export async function executeRecoveryChain(
  error: StructuredError,
  chain: RecoveryChainConfig
): Promise<RecoveryStatus> {
  const traceId = error.traceId;
  let totalAttempts = 0;

  MollyLogger.info(
    `Starting recovery chain: ${chain.name}`,
    'resiliency',
    { error: error.message, actions: chain.actions.length },
    traceId
  );

  // Sort actions by priority
  const sortedActions = [...chain.actions].sort(
    (a, b) => a.priority - b.priority
  );

  for (const action of sortedActions) {
    // Check if we've exceeded total attempts
    if (totalAttempts >= chain.maxTotalAttempts) {
      MollyLogger.warn(
        `Recovery chain exhausted max attempts`,
        'resiliency',
        { chain: chain.name, attempts: totalAttempts },
        traceId
      );
      break;
    }

    // Check if action applies to this error
    if (action.appliesTo && !action.appliesTo(error)) {
      MollyLogger.info(
        `Skipping recovery action: ${action.name} (not applicable)`,
        'resiliency',
        {},
        traceId
      );
      continue;
    }

    MollyLogger.info(
      `Attempting recovery action: ${action.name}`,
      'resiliency',
      { description: action.description, priority: action.priority },
      traceId
    );

    totalAttempts++;
    totalRecoveryAttempts++;
    error.recoveryAttempted = true;

    try {
      const success = await action.execute(error);

      if (success) {
        successfulRecoveries++;
        error.recoveryResult = 'success';

        MollyLogger.info(
          `Recovery successful: ${action.name}`,
          'resiliency',
          { chain: chain.name, attempts: totalAttempts },
          traceId
        );

        return 'success';
      }

      MollyLogger.warn(
        `Recovery action failed: ${action.name}, escalating`,
        'resiliency',
        { chain: chain.name },
        traceId
      );
    } catch (recoveryError) {
      MollyLogger.error(
        `Recovery action threw error: ${action.name}`,
        'resiliency',
        { chain: chain.name },
        recoveryError instanceof Error ? recoveryError : undefined,
        traceId
      );
    }
  }

  // All actions exhausted
  error.recoveryResult = 'failed';

  if (chain.onExhausted) {
    chain.onExhausted(error, totalAttempts);
  }

  MollyLogger.error(
    `Recovery chain exhausted: ${chain.name}`,
    'resiliency',
    { attempts: totalAttempts, error: error.message },
    undefined,
    traceId
  );

  return 'failed';
}

/**
 * Create a simple recovery chain from action functions
 */
export function createRecoveryChain(
  name: string,
  actions: Array<{
    name: string;
    description: string;
    execute: (error: StructuredError) => Promise<boolean>;
  }>,
  maxAttempts = 5
): RecoveryChainConfig {
  return {
    name,
    maxTotalAttempts: maxAttempts,
    actions: actions.map((action, index) => ({
      ...action,
      priority: index,
    })),
  };
}

// ============================================================
// HEALTH MONITORING
// ============================================================

/**
 * Get current health metrics
 */
export function getHealthMetrics(): HealthMetrics {
  const errorsBySeverity: Record<ErrorSeverity, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  for (const error of errorLog) {
    errorsBySeverity[error.severity]++;
  }

  const circuitStates: Record<string, CircuitState> = {};
  circuitBreakers.forEach((breaker, name) => {
    circuitStates[name] = breaker.getState();
  });

  const recoveryRate =
    totalRecoveryAttempts > 0
      ? successfulRecoveries / totalRecoveryAttempts
      : 1;

  // Calculate health score (0-100)
  let healthScore = 100;

  // Deduct for open circuit breakers
  const openCircuits = Object.values(circuitStates).filter(
    (s) => s === 'OPEN'
  ).length;
  healthScore -= openCircuits * 15;

  // Deduct for recent errors
  healthScore -= Math.min(hourlyErrors.length, 20);

  // Deduct for critical errors
  healthScore -= errorsBySeverity.critical * 10;
  healthScore -= errorsBySeverity.high * 5;

  // Deduct for low recovery rate
  if (recoveryRate < 0.5) {
    healthScore -= 20;
  } else if (recoveryRate < 0.8) {
    healthScore -= 10;
  }

  return {
    totalErrors: errorLog.length,
    errorsBySeverity,
    recoveryAttempts: totalRecoveryAttempts,
    successfulRecoveries,
    recoveryRate,
    circuitBreakers: circuitStates,
    recentErrorRate: hourlyErrors.length,
    healthScore: Math.max(0, Math.min(100, healthScore)),
    lastUpdated: Date.now(),
  };
}

/**
 * Get recent errors (for analysis)
 */
export function getRecentErrors(limit = 50): StructuredError[] {
  return errorLog.slice(-limit);
}

/**
 * Clear error history (use with caution)
 */
export function clearErrorHistory(): void {
  errorLog.length = 0;
  hourlyErrors.length = 0;
  MollyLogger.info('Error history cleared', 'resiliency', {});
}

/**
 * Reset all circuit breakers (use with caution)
 */
export function resetAllCircuitBreakers(): void {
  circuitBreakers.forEach((breaker, name) => {
    breaker.reset();
    MollyLogger.info(`Reset circuit breaker: ${name}`, 'resiliency', {});
  });
}

// ============================================================
// CONVENIENCE WRAPPERS
// ============================================================

/**
 * Protected async operation with circuit breaker and retry
 */
export async function protectedExecution<T>(
  name: string,
  fn: () => Promise<T>,
  options: {
    circuitBreaker?: Partial<CircuitBreakerConfig>;
    retry?: Partial<RetryConfig>;
    onError?: (error: StructuredError) => void;
  } = {}
): Promise<T> {
  const breaker = getCircuitBreaker(name, options.circuitBreaker);

  return breaker.execute(async () => {
    try {
      return await retryWithBackoff(fn, name, options.retry);
    } catch (error) {
      const structured = wrapError(error, name);
      if (options.onError) {
        options.onError(structured);
      }
      throw structured;
    }
  });
}

/**
 * Safe execution that never throws - returns result or error
 */
export async function safeExecution<T>(
  name: string,
  fn: () => Promise<T>,
  defaultValue: T
): Promise<{ success: boolean; value: T; error?: StructuredError }> {
  try {
    const value = await fn();
    return { success: true, value };
  } catch (error) {
    const structured = wrapError(error, name);
    return { success: false, value: defaultValue, error: structured };
  }
}
