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
  context?: Record<string, unknown>;
  error?: {
    code: string;
    stack?: string;
    severity: string;
  };
}

type ErrorLike = {
  code?: string;
  stack?: string;
  severity?: string;
};

function normalizeErrorDetails(error: unknown): LogEntry['error'] | undefined {
  if (error instanceof Error) {
    const maybe = error as Error & ErrorLike;
    return {
      code: typeof maybe.code === 'string' ? maybe.code : 'UNKNOWN',
      stack: error.stack,
      severity: typeof maybe.severity === 'string' ? maybe.severity : 'high',
    };
  }

  if (typeof error === 'object' && error !== null) {
    const maybe = error as ErrorLike;
    return {
      code: typeof maybe.code === 'string' ? maybe.code : 'UNKNOWN',
      stack: typeof maybe.stack === 'string' ? maybe.stack : undefined,
      severity: typeof maybe.severity === 'string' ? maybe.severity : 'high',
    };
  }

  return undefined;
}

/**
 * Centralized logger that outputs structured JSON
 * Can be extended to send to Cloud Logging, Datadog, etc.
 */
export class MollyLogger {
  private static readonly isDevelopment = process.env.NODE_ENV !== 'production';
  private static readonly sessionEventName = 'heart-patch';

  /**
   * Log an error
   */
  static error(
    message: string,
    flowName?: string,
    context?: Record<string, unknown>,
    error?: unknown,
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

    const details = normalizeErrorDetails(error);
    if (details) {
      entry.error = details;
    }

    this.output(entry);
  }

  /**
   * Log a warning
   */
  static warn(
    message: string,
    flowName?: string,
    context?: Record<string, unknown>,
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
    context?: Record<string, unknown>,
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
    context?: Record<string, unknown>,
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
   * Output the log entry (to console in dev, Cloud Logging in prod).
   * MOLLY_DEBUG_LOG_DIR additionally appends every entry to molly.log
   * in the named directory (pattern from CLAUDE_CODE_DEBUG_LOGS_DIR).
   */
  private static output(entry: LogEntry) {
    if (entry.level === 'ERROR' || entry.level === 'WARN') {
      this.recordSessionEvent(entry);
    }

    if (this.isDevelopment) {
      console.log(JSON.stringify(entry, null, 2));
    } else {
      // In production, send to Cloud Logging or your observability platform
      console.log(JSON.stringify(entry));
    }

    this.writeToDebugDir(entry);
  }

  private static debugDirChecked = false;
  private static debugDirPath: string | null = null;

  private static writeToDebugDir(entry: LogEntry) {
    if (typeof window !== 'undefined') return;

    if (!this.debugDirChecked) {
      this.debugDirChecked = true;
      const dir = process.env.MOLLY_DEBUG_LOG_DIR?.trim();
      if (dir) {
        try {
          // Use eval'd require to keep fs out of client bundles.
          const fs = (Function('return require')() as NodeRequire)('node:fs');
          fs.mkdirSync(dir, { recursive: true });
          this.debugDirPath = dir;
        } catch {
          this.debugDirPath = null;
        }
      }
    }

    if (!this.debugDirPath) return;
    try {
      const fs = (Function('return require')() as NodeRequire)('node:fs');
      const path = (Function('return require')() as NodeRequire)('node:path');
      fs.appendFileSync(
        path.join(this.debugDirPath, 'molly.log'),
        JSON.stringify(entry) + '\n'
      );
    } catch {
      // Disk full / permission flip — drop silently.
    }
  }

  private static recordSessionEvent(entry: LogEntry) {
    try {
      if (typeof window !== 'undefined') {
        return;
      }

      const detailParts = [
        'tag=heart-patch',
        entry.message,
        entry.flowName ? `flow=${entry.flowName}` : null,
        entry.toolName ? `tool=${entry.toolName}` : null,
        entry.traceId ? `trace=${entry.traceId}` : null,
        entry.error?.code ? `code=${entry.error.code}` : null,
      ].filter(Boolean);

      const eventData = {
        event: this.sessionEventName,
        details: detailParts.join(' | '),
        timestamp: new Date(entry.timestamp).toISOString(),
      };

      // Dynamic import to keep this server-only and avoid bundling in clients.
      // webpackIgnore prevents webpack from analyzing/bundling this import.
      // Fire-and-forget pattern since session logging is non-critical.
      import(/* webpackIgnore: true */ '@/lib/session-manager')
        .then(({ appendSessionEvent }) => {
          appendSessionEvent(eventData);
        })
        .catch(() => {
          // Avoid cascading failures if session logging is unavailable.
        });
    } catch {
      // Avoid cascading failures if session logging is unavailable.
    }
  }

  /**
   * Log a tool invocation
   */
  static logToolCall(
    toolName: string,
    input: unknown,
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
    result: unknown,
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
  static logFlowStart(flowName: string, input: unknown, traceId?: string) {
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
    result: unknown,
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
    error: unknown,
    traceId?: string,
    context?: Record<string, unknown>
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
