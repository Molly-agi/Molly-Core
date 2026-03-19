/**
 * @fileOverview Error Handling Utilities & Flow Wrappers
 *
 * Provides higher-order functions to wrap flows and tools with
 * error handling, logging, and recovery strategies.
 */

import { MollyError, GenerativeAIError, TimeoutError } from './errors';
import { MollyLogger, generateTraceId } from './logger';
import { handleUnknownFailure } from './resilience-core';

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

    // Route through resilience core for diagnosis and learning
    handleUnknownFailure(error, `tool:${toolName}`, {
      flowName,
      traceId: actualTraceId,
    }).catch((resilErr) => {
      console.error(
        '[error-handler] Resilience core failed:',
        resilErr instanceof Error ? resilErr.message : String(resilErr)
      );
    });

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

    // Route through resilience core for diagnosis and learning
    handleUnknownFailure(error, `generate:${flowName}`, {
      statusCode,
      traceId,
    }).catch((resilErr) => {
      console.error(
        '[error-handler] Resilience core failed:',
        resilErr instanceof Error ? resilErr.message : String(resilErr)
      );
    });

    throw new GenerativeAIError(message, statusCode, { flowName }, traceId);
  }
}

/**
 * Wrapper to add timeout to async operations.
 * Properly clears the timer when the promise resolves.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
  traceId: string
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(operation, timeoutMs, {}, traceId));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}
