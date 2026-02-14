/**
 * @fileOverview Error Handling Utilities & Flow Wrappers
 *
 * Provides higher-order functions to wrap flows and tools with
 * error handling, logging, and recovery strategies.
 */

import { MollyError, GenerativeAIError, TimeoutError } from './errors';
import { MollyLogger, generateTraceId } from './logger';

type ErrorWithStatus = {
  statusCode?: number | string;
  code?: number | string;
};

function getStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const maybe = error as ErrorWithStatus;
  const raw = maybe.statusCode ?? maybe.code;
  if (typeof raw === 'number') {
    return raw;
  }

  if (typeof raw === 'string') {
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}

/**
 * Wraps a flow to catch and log errors, with optional recovery
 */
export async function withErrorHandling<T>(
  flowName: string,
  fn: (traceId: string) => Promise<T>,
  userId?: string,
  fallback?: T
): Promise<T> {
  const traceId = generateTraceId();

  try {
    MollyLogger.logFlowStart(flowName, { userId }, traceId);
    const startTime = Date.now();

    const result = await fn(traceId);

    const durationMs = Date.now() - startTime;
    MollyLogger.logFlowComplete(flowName, result, traceId, durationMs);

    return result;
  } catch (error) {
    MollyLogger.logFlowError(flowName, error, traceId, { userId });

    if (fallback !== undefined) {
      MollyLogger.warn(
        `Flow '${flowName}' failed but fallback provided`,
        flowName,
        { userId },
        traceId
      );
      return fallback;
    }

    if (error instanceof MollyError) {
      throw error;
    }

    // Convert generic Error to MollyError
    if (error instanceof Error) {
      throw new MollyError(
        'UNKNOWN_ERROR',
        error.message,
        'high',
        { originalError: error.toString() },
        traceId
      );
    }

    throw new MollyError(
      'UNKNOWN_ERROR',
      'An unknown error occurred',
      'high',
      { error: String(error) },
      traceId
    );
  }
}

/**
 * Wraps a tool to catch and log errors
 */
export async function withToolErrorHandling<T>(
  toolName: string,
  fn: (traceId: string) => Promise<T>,
  flowName?: string,
  traceId?: string
): Promise<{ output: T }> {
  const actualTraceId = traceId || generateTraceId();

  try {
    MollyLogger.logToolCall(toolName, {}, actualTraceId, flowName);
    const result = await fn(actualTraceId);
    MollyLogger.logToolResult(toolName, result, actualTraceId, flowName);
    // Many tools when defined via genkit expose their payload under an `output` key.
    // Preserve that shape for backwards compatibility with existing flows that
    // destructure `{ output } = await tool()`.
    return { output: result };
  } catch (error) {
    MollyLogger.error(
      `Tool '${toolName}' failed`,
      flowName,
      { toolName },
      error,
      actualTraceId
    );

    if (error instanceof MollyError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new MollyError(
        `TOOL_ERROR_${toolName.toUpperCase()}`,
        error.message,
        'high',
        { toolName },
        actualTraceId
      );
    }

    throw new MollyError(
      `TOOL_ERROR_${toolName.toUpperCase()}`,
      'Tool execution failed',
      'high',
      { toolName },
      actualTraceId
    );
  }
}

/**
 * Wraps ai.generate() calls to catch GenAI errors
 */
export async function withGenerateErrorHandling<T>(
  fn: () => Promise<T>,
  flowName: string,
  traceId: string
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode = getStatusCode(error);

    MollyLogger.error(
      `GenAI API call failed in '${flowName}'`,
      flowName,
      { statusCode },
      error,
      traceId
    );

    throw new GenerativeAIError(message, statusCode, { flowName }, traceId);
  }
}

/**
 * Wrapper to add timeout to async operations
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
  traceId: string
): Promise<T> {
  const timeoutPromise = new Promise<T>((_, reject) => {
    setTimeout(() => {
      reject(new TimeoutError(operation, timeoutMs, {}, traceId));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

/**
 * Retry logic with exponential backoff
 */
export async function withRetry<T>(
  fn: (attempt: number, traceId: string) => Promise<T>,
  maxRetries: number = 3,
  initialBackoffMs: number = 1000,
  flowName?: string,
  traceId?: string
): Promise<T> {
  const actualTraceId = traceId || generateTraceId();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        MollyLogger.debug(
          `Retrying ${flowName || 'operation'} (attempt ${attempt}/${maxRetries})`,
          flowName,
          {},
          actualTraceId
        );
      }

      return await fn(attempt, actualTraceId);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on validation or auth errors
      if (
        lastError.message.includes('Validation') ||
        lastError.message.includes('Auth')
      ) {
        throw error;
      }

      if (attempt < maxRetries) {
        const backoffMs = initialBackoffMs * Math.pow(2, attempt - 1);
        const jitterMs = Math.random() * backoffMs * 0.1;
        const totalBackoff = backoffMs + jitterMs;

        MollyLogger.warn(
          `${flowName || 'Operation'} failed (attempt ${attempt}), retrying in ${totalBackoff}ms`,
          flowName,
          { attempt, backoffMs: Math.round(totalBackoff) },
          actualTraceId
        );

        await new Promise((resolve) => setTimeout(resolve, totalBackoff));
      }
    }
  }

  MollyLogger.error(
    `${flowName || 'Operation'} failed after ${maxRetries} attempts`,
    flowName,
    { maxRetries },
    lastError,
    actualTraceId
  );

  throw lastError;
}

/**
 * Safely convert unknown error to user-friendly message
 */
export function toUserMessage(error: unknown): string {
  if (error instanceof MollyError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred. Please try again.';
}
