/**
 * @fileOverview Error Handling Utilities & Flow Wrappers
 *
 * Provides higher-order functions to wrap flows and tools with
 * error handling, logging, and recovery strategies.
 */

import { MollyError, GenerativeAIError, TimeoutError } from './errors';
import { MollyLogger, generateTraceId } from './logger';

// Lazy-loaded resilience core for server-side error diagnosis
let _resilenceCoreModule: typeof import('./resilience-core') | null = null;

async function getResilientFailureHandler() {
  if (!_resilenceCoreModule) {
    try {
      // Only available in Node.js environment
      if (typeof process !== 'undefined' && process.versions?.node) {
        _resilenceCoreModule = await import('./resilience-core');
        return _resilenceCoreModule.handleUnknownFailure;
      }
    } catch {
      // Not available (browser context), that's fine
      return null;
    }
  }
  return _resilenceCoreModule?.handleUnknownFailure ?? null;
}

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

    // Route through resilience core for diagnosis and learning (server-side only)
    const handleUnknownFailure = await getResilientFailureHandler();
    if (handleUnknownFailure) {
      handleUnknownFailure(error, `tool:${toolName}`, {
        flowName,
        traceId: actualTraceId,
      }).catch((resilErr) => {
        console.error(
          '[error-handler] Resilience core failed:',
          resilErr instanceof Error ? resilErr.message : String(resilErr)
        );
      });
    }


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

    // Route through resilience core for diagnosis and learning (server-side only)
    const handleUnknownFailure = await getResilientFailureHandler();
    if (handleUnknownFailure) {
      handleUnknownFailure(error, `generate:${flowName}`, {
        statusCode,
        traceId,
      }).catch((resilErr) => {
        console.error(
          '[error-handler] Resilience core failed:',
          resilErr instanceof Error ? resilErr.message : String(resilErr)
        );
      });
    }

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
