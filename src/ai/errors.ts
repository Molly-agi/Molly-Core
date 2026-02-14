/**
 * @fileOverview Molly's Error Hierarchy & Classification System
 *
 * All errors thrown by AI flows inherit from MollyError, enabling:
 * - Typed error handling across the system
 * - Structured logging and telemetry
 * - User-friendly error messages
 * - Automatic recovery strategies
 */

export class MollyError extends Error {
  public readonly code: string;
  public readonly severity: 'critical' | 'high' | 'medium' | 'low';
  public readonly context: Record<string, unknown>;
  public readonly timestamp: number;
  public readonly traceId?: string;

  constructor(
    code: string,
    message: string,
    severity: 'critical' | 'high' | 'medium' | 'low' = 'high',
    context: Record<string, unknown> = {},
    traceId?: string
  ) {
    super(message);
    this.code = code;
    this.severity = severity;
    this.context = context;
    this.timestamp = Date.now();
    this.traceId = traceId;
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, MollyError.prototype);
  }

  public toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      severity: this.severity,
      timestamp: this.timestamp,
      traceId: this.traceId,
      context: this.context,
    };
  }
}

/**
 * Thrown when a tool fails to execute (e.g., system call, API call)
 */
export class ToolError extends MollyError {
  constructor(
    toolName: string,
    message: string,
    context: Record<string, unknown> = {},
    traceId?: string
  ) {
    super(
      `TOOL_ERROR_${toolName.toUpperCase()}`,
      `Tool '${toolName}' failed: ${message}`,
      'high',
      { toolName, ...context },
      traceId
    );
    Object.setPrototypeOf(this, ToolError.prototype);
  }
}

/**
 * Thrown when a flow fails to complete or encounters a fatal error
 */
export class FlowError extends MollyError {
  constructor(
    flowName: string,
    message: string,
    context: Record<string, unknown> = {},
    traceId?: string
  ) {
    super(
      `FLOW_ERROR_${flowName.toUpperCase()}`,
      `Flow '${flowName}' failed: ${message}`,
      'high',
      { flowName, ...context },
      traceId
    );
    Object.setPrototypeOf(this, FlowError.prototype);
  }
}

/**
 * Thrown when authentication or authorization fails
 */
export class AuthenticationError extends MollyError {
  constructor(
    message: string,
    context: Record<string, unknown> = {},
    traceId?: string
  ) {
    super(
      'AUTH_ERROR',
      `Authentication failed: ${message}`,
      'critical',
      context,
      traceId
    );
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Thrown when API rate limit is exceeded
 */
export class RateLimitError extends MollyError {
  public readonly retryAfterMs: number;

  constructor(
    retryAfterMs: number = 60000,
    context: Record<string, unknown> = {},
    traceId?: string
  ) {
    super(
      'RATE_LIMIT_ERROR',
      `Rate limit exceeded. Retry after ${retryAfterMs}ms`,
      'high',
      { retryAfterMs, ...context },
      traceId
    );
    this.retryAfterMs = retryAfterMs;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Thrown when an operation times out
 */
export class TimeoutError extends MollyError {
  constructor(
    operation: string,
    timeoutMs: number,
    context: Record<string, unknown> = {},
    traceId?: string
  ) {
    super(
      'TIMEOUT_ERROR',
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      'high',
      { operation, timeoutMs, ...context },
      traceId
    );
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Thrown when network or API communication fails
 */
export class NetworkError extends MollyError {
  constructor(
    message: string,
    statusCode?: number,
    context: Record<string, unknown> = {},
    traceId?: string
  ) {
    super(
      'NETWORK_ERROR',
      `Network error: ${message}`,
      'high',
      { statusCode, ...context },
      traceId
    );
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Thrown when input validation fails
 */
export class ValidationError extends MollyError {
  constructor(
    fieldName: string,
    message: string,
    context: Record<string, unknown> = {},
    traceId?: string
  ) {
    super(
      'VALIDATION_ERROR',
      `Validation failed for '${fieldName}': ${message}`,
      'medium',
      { fieldName, ...context },
      traceId
    );
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Thrown when GenAI API returns an error
 */
export class GenerativeAIError extends MollyError {
  constructor(
    message: string,
    statusCode?: number,
    context: Record<string, unknown> = {},
    traceId?: string
  ) {
    super(
      'GENERATIVE_AI_ERROR',
      `GenAI API error: ${message}`,
      statusCode === 429 ? 'high' : 'high',
      { statusCode, ...context },
      traceId
    );
    Object.setPrototypeOf(this, GenerativeAIError.prototype);
  }
}

/**
 * Thrown when Firebase/Firestore operation fails
 */
export class FirebaseError extends MollyError {
  constructor(
    operation: string,
    message: string,
    context: Record<string, unknown> = {},
    traceId?: string
  ) {
    super(
      `FIREBASE_ERROR_${operation.toUpperCase()}`,
      `Firebase operation '${operation}' failed: ${message}`,
      'high',
      { operation, ...context },
      traceId
    );
    Object.setPrototypeOf(this, FirebaseError.prototype);
  }
}

/**
 * Type guard to check if error is a MollyError
 */
export function isMollyError(error: unknown): error is MollyError {
  return error instanceof MollyError;
}

/**
 * Extract a user-friendly error message from any error
 */
export function getUserFriendlyMessage(error: unknown): string {
  if (isMollyError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred. Please try again.';
}
