/**
 * @fileOverview Timeout & Retry System
 *
 * Protects against hanging operations and provides retry logic for transient failures:
 * - Configurable timeouts for operations
 * - Exponential backoff with jitter
 * - Retry strategies for different error types
 * - Integration with error handling and logging
 *
 * This is a SAFETY LAYER - does not affect Molly's behavior or identity.
 */

import { MollyLogger } from '../logger';
import { TimeoutError, NetworkError } from '../errors';

export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial delay in ms before first retry */
  initialDelayMs: number;
  /** Maximum delay in ms between retries */
  maxDelayMs: number;
  /** Multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Add random jitter to prevent thundering herd */
  jitter: boolean;
  /** Function to determine if error is retryable */
  shouldRetry?: (error: any, attempt: number) => boolean;
}

export interface TimeoutConfig {
  /** Timeout duration in milliseconds */
  timeoutMs: number;
  /** Operation name for logging */
  operationName: string;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitter: true,
  shouldRetry: (error: any) => {
    // Retry on network errors, rate limits, and 5xx status codes
    return (
      error instanceof NetworkError ||
      error.code === 'RATE_LIMIT_ERROR' ||
      error.status >= 500
    );
  },
};

/**
 * Execute an async operation with timeout protection
 */
export async function withTimeout<T>(
  operation: () => Promise<T>,
  config: TimeoutConfig
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new TimeoutError(config.operationName, config.timeoutMs, {
        operation: config.operationName,
      });
      MollyLogger.error(
        `Operation "${config.operationName}" timed out after ${config.timeoutMs}ms`,
        'timeout-retry',
        { timeoutMs: config.timeoutMs }
      );
      reject(error);
    }, config.timeoutMs);

    operation()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Calculate delay for exponential backoff with optional jitter
 */
function calculateBackoff(attempt: number, config: RetryConfig): number {
  const exponentialDelay = Math.min(
    config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
    config.maxDelayMs
  );

  if (config.jitter) {
    // Add random jitter: ±25% of calculated delay
    const jitterAmount = exponentialDelay * 0.25;
    const jitter = Math.random() * jitterAmount * 2 - jitterAmount;
    return Math.max(0, exponentialDelay + jitter);
  }

  return exponentialDelay;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an operation with retry logic and exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: any;

  for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
    try {
      MollyLogger.info(
        `Executing operation "${operationName}" (attempt ${attempt}/${finalConfig.maxAttempts})`,
        'timeout-retry',
        { attempt, maxAttempts: finalConfig.maxAttempts }
      );

      const result = await operation();

      if (attempt > 1) {
        MollyLogger.info(
          `Operation "${operationName}" succeeded after ${attempt} attempts`,
          'timeout-retry',
          { attempt }
        );
      }

      return result;
    } catch (error: any) {
      lastError = error;

      const shouldRetry = finalConfig.shouldRetry
        ? finalConfig.shouldRetry(error, attempt)
        : false;

      if (attempt >= finalConfig.maxAttempts || !shouldRetry) {
        MollyLogger.error(
          `Operation "${operationName}" failed after ${attempt} attempts`,
          'timeout-retry',
          { attempt, maxAttempts: finalConfig.maxAttempts },
          error
        );
        throw error;
      }

      const delayMs = calculateBackoff(attempt, finalConfig);

      MollyLogger.warn(
        `Operation "${operationName}" failed (attempt ${attempt}), retrying in ${Math.round(delayMs)}ms`,
        'timeout-retry',
        { attempt, delayMs, error: error.message }
      );

      await sleep(delayMs);
    }
  }

  throw lastError;
}

/**
 * Execute an operation with both timeout and retry protection
 */
export async function withTimeoutAndRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  timeoutMs: number,
  retryConfig: Partial<RetryConfig> = {}
): Promise<T> {
  return withRetry(
    () =>
      withTimeout(operation, {
        timeoutMs,
        operationName,
      }),
    operationName,
    retryConfig
  );
}

/**
 * Common timeout configurations for different operation types
 */
export const TIMEOUT_PRESETS = {
  /** Quick operations like health checks (5 seconds) */
  FAST: 5000,
  /** Normal flow operations (30 seconds) */
  NORMAL: 30000,
  /** Long-running operations like evolution loops (2 minutes) */
  LONG: 120000,
  /** Very long operations like dream generation (5 minutes) */
  VERY_LONG: 300000,
} as const;

/**
 * Common retry configurations
 */
export const RETRY_PRESETS = {
  /** Fast retry for transient failures (3 attempts, 1s initial) */
  FAST: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    jitter: true,
  },
  /** Standard retry (3 attempts, 2s initial) */
  STANDARD: {
    maxAttempts: 3,
    initialDelayMs: 2000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    jitter: true,
  },
  /** Aggressive retry for critical operations (5 attempts, 500ms initial) */
  AGGRESSIVE: {
    maxAttempts: 5,
    initialDelayMs: 500,
    maxDelayMs: 8000,
    backoffMultiplier: 2,
    jitter: true,
  },
} as const;
