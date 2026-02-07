/**
 * @fileOverview Molly's Structured Logging System
 *
 * Provides:
 * - Structured JSON logging for Cloud Logging integration
 * - Trace ID propagation across flows
 * - Log levels (ERROR, WARN, INFO, DEBUG)
 * - Context preservation
 */

export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  traceId?: string;
  flowName?: string;
  toolName?: string;
  userId?: string;
  context?: Record<string, any>;
  error?: {
    code: string;
    stack?: string;
    severity: string;
  };
}

/**
 * Centralized logger that outputs structured JSON
 * Can be extended to send to Cloud Logging, Datadog, etc.
 */
export class MollyLogger {
  private static readonly isDevelopment = process.env.NODE_ENV !== 'production';

  /**
   * Log an error
   */
  static error(
    message: string,
    flowName?: string,
    context?: Record<string, any>,
    error?: any,
    traceId?: string
  ) {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level: 'ERROR',
      message,
      flowName,
      traceId,
      context,
    };

    if (error) {
      entry.error = {
        code: error.code || 'UNKNOWN',
        stack: error.stack,
        severity: error.severity || 'high',
      };
    }

    this.output(entry);
  }

  /**
   * Log a warning
   */
  static warn(
    message: string,
    flowName?: string,
    context?: Record<string, any>,
    traceId?: string
  ) {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level: 'WARN',
      message,
      flowName,
      traceId,
      context,
    };

    this.output(entry);
  }

  /**
   * Log info
   */
  static info(
    message: string,
    flowName?: string,
    context?: Record<string, any>,
    traceId?: string
  ) {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level: 'INFO',
      message,
      flowName,
      traceId,
      context,
    };

    this.output(entry);
  }

  /**
   * Log debug (only in development)
   */
  static debug(
    message: string,
    flowName?: string,
    context?: Record<string, any>,
    traceId?: string
  ) {
    if (!this.isDevelopment) return;

    const entry: LogEntry = {
      timestamp: Date.now(),
      level: 'DEBUG',
      message,
      flowName,
      traceId,
      context,
    };

    this.output(entry);
  }

  /**
   * Output the log entry (to console in dev, Cloud Logging in prod)
   */
  private static output(entry: LogEntry) {
    if (this.isDevelopment) {
      console.log(JSON.stringify(entry, null, 2));
    } else {
      // In production, send to Cloud Logging or your observability platform
      console.log(JSON.stringify(entry));
    }
  }

  /**
   * Log a tool invocation
   */
  static logToolCall(
    toolName: string,
    input: any,
    traceId?: string,
    flowName?: string
  ) {
    this.debug(
      `Tool invoked: ${toolName}`,
      flowName,
      { toolName, input },
      traceId
    );
  }

  /**
   * Log a tool result
   */
  static logToolResult(
    toolName: string,
    result: any,
    traceId?: string,
    flowName?: string
  ) {
    this.debug(
      `Tool completed: ${toolName}`,
      flowName,
      { toolName, resultSummary: JSON.stringify(result).substring(0, 100) },
      traceId
    );
  }

  /**
   * Log a flow start
   */
  static logFlowStart(flowName: string, input: any, traceId?: string) {
    this.info(
      `Flow started: ${flowName}`,
      flowName,
      { input: JSON.stringify(input).substring(0, 100) },
      traceId
    );
  }

  /**
   * Log a flow completion
   */
  static logFlowComplete(
    flowName: string,
    result: any,
    traceId?: string,
    durationMs?: number
  ) {
    this.info(
      `Flow completed: ${flowName}`,
      flowName,
      {
        resultSummary: JSON.stringify(result).substring(0, 100),
        durationMs,
      },
      traceId
    );
  }

  /**
   * Log a flow failure
   */
  static logFlowError(
    flowName: string,
    error: any,
    traceId?: string,
    context?: Record<string, any>
  ) {
    this.error(`Flow failed: ${flowName}`, flowName, context, error, traceId);
  }
}

/**
 * Generate a trace ID for flow execution
 */
export function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
