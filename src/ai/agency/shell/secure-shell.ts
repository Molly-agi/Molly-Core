/**
 * Secure Shell (D.8)
 * ------------------------------------------------------------------
 * Agency-layer wrapper for shell execution. Security-first.
 *
 * This module does NOT implement shell parsing or command validation
 * from scratch — it delegates to the proven isCommandSafe() function
 * in tool-handlers/system-tools. D.8's job is to add the agency-layer
 * contract: tunability, rate limiting, provenance, secret scanning,
 * and a clear blocked-vs-allowed audit trail.
 *
 * Every execution — allowed or blocked — is recorded to provenance.
 *
 * Security invariants:
 *   - Blocked commands are logged but never executed
 *   - All output is scanned for secrets before returning
 *   - Rate limit prevents command flooding (registry-tunable)
 *   - Max output bytes prevents memory exhaustion (registry-tunable)
 *   - Workspace path is enforced — no escaping via '../'
 *   - Command timeout enforced (registry-tunable)
 *   - No root execution (checked at construction; warn if running as root)
 *
 * Path: src/ai/agency/shell/secure-shell.ts
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { ParameterRegistry } from '../registry/parameter-registry';
import { ProvenanceLog } from '../provenance/provenance-log';
import { MollyLogger, generateTraceId } from '@/ai/logger';
import { isCommandSafe } from '../tool-handlers/system-tools';
import { scanForSecrets } from '../safety/secret-scanner';

const execAsync = promisify(exec);

export const SECURE_SHELL_ID = 'secure-shell';

// ============================================================================
// TYPES & CONTRACTS
// ============================================================================

export type ShellOutcome =
  | 'allowed'
  | 'blocked-unsafe'
  | 'blocked-rate-limit'
  | 'blocked-path'
  | 'exec-error';

export interface ShellResult {
  /** Whether the command was executed */
  outcome: ShellOutcome;
  /** The command as submitted (before any mutation) */
  command: string;
  /** stdout output (may be truncated to maxOutputBytes) */
  stdout: string;
  /** stderr output (may be truncated) */
  stderr: string;
  /** Whether output was truncated */
  wasTruncated: boolean;
  /** Whether secrets were detected and redacted in output */
  hadSecretsRedacted: boolean;
  /** Execution duration in ms (0 if not executed) */
  durationMs: number;
  /** Reason for block (if blocked) */
  blockReason?: string;
  /** Trace ID for provenance */
  traceId: string;
}

// ============================================================================
// SECURE SHELL
// ============================================================================

export class SecureShell {
  private readonly registry: ParameterRegistry;
  private readonly provenance: ProvenanceLog;
  /** Rate limit tracking: timestamps of recent executions */
  private executionTimestamps: number[] = [];
  private readonly workspaceRoot: string;

  constructor(
    registry: ParameterRegistry,
    provenance: ProvenanceLog,
    workspaceRoot: string = process.cwd()
  ) {
    this.registry = registry;
    this.provenance = provenance;
    this.workspaceRoot = workspaceRoot;
    this.ensureTunables();
    this.warnIfRoot();
  }

  private ensureTunables(): void {
    const defs = [
      {
        key: 'shell.maxOutputBytes',
        default: 32 * 1024, // 32 KB
        min: 1024,
        max: 512 * 1024,
        description: 'Max stdout/stderr bytes returned from a shell command',
      },
      {
        key: 'shell.timeoutMs',
        default: 15_000, // 15 seconds
        min: 1_000,
        max: 120_000,
        description: 'Shell command execution timeout in milliseconds',
      },
      {
        key: 'shell.rateLimitPerMinute',
        default: 30,
        min: 1,
        max: 120,
        description: 'Maximum shell executions allowed per 60-second window',
      },
    ];

    for (const d of defs) {
      const { min, max } = d;
      try {
        this.registry.define<number>({
          key: d.key,
          owner: SECURE_SHELL_ID,
          default: d.default,
          validate: (v) =>
            v >= min && v <= max ? null : `must be ${min}–${max}`,
          description: d.description,
        });
      } catch {
        // already defined — fine
      }
    }
  }

  private warnIfRoot(): void {
    // process.getuid is not available on Windows — guard it
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      MollyLogger.warn(
        'SecureShell: running as root (uid=0). Shell access as root is strongly discouraged.',
        SECURE_SHELL_ID
      );
    }
  }

  /**
   * Execute a shell command with full security enforcement.
   * Always records to provenance — allowed OR blocked.
   */
  async execute(command: string): Promise<ShellResult> {
    const traceId = generateTraceId();
    const startMs = Date.now();

    // ── 1. Path traversal check ──────────────────────────────────────────
    if (command.includes('../') || command.includes('..\\')) {
      return this.blocked(
        command,
        'blocked-path',
        'Path traversal (../) detected — workspace boundary enforced',
        traceId,
        startMs
      );
    }

    // ── 2. Command safety validation (delegates to existing system-tools) ─
    if (!isCommandSafe(command)) {
      return this.blocked(
        command,
        'blocked-unsafe',
        'Command failed isCommandSafe() validation',
        traceId,
        startMs
      );
    }

    // ── 3. Rate limit check ──────────────────────────────────────────────
    const rateLimitResult = this.checkRateLimit();
    if (!rateLimitResult.ok) {
      return this.blocked(
        command,
        'blocked-rate-limit',
        rateLimitResult.reason,
        traceId,
        startMs
      );
    }

    // ── 4. Execute ───────────────────────────────────────────────────────
    const maxOutputBytes = this.registry.get<number>('shell.maxOutputBytes');
    const timeoutMs = this.registry.get<number>('shell.timeoutMs');

    let rawStdout = '';
    let rawStderr = '';
    let execError: string | undefined;

    try {
      this.executionTimestamps.push(Date.now());
      const result = await execAsync(command, {
        cwd: this.workspaceRoot,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024, // 1MB exec buffer — we do our own truncation below
        // Strip known credential keys from the child's environment
        env: Object.fromEntries(
          Object.entries(process.env).filter(
            ([k]) =>
              !/API_KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|SERVICE_ACCOUNT/i.test(k)
          )
        ),
      });
      rawStdout = result.stdout ?? '';
      rawStderr = result.stderr ?? '';
    } catch (err) {
      // exec rejects on non-zero exit; stdout/stderr may still have content
      if (err instanceof Error && 'stdout' in err) {
        const e = err as Error & { stdout?: string; stderr?: string };
        rawStdout = e.stdout ?? '';
        rawStderr = e.stderr ?? '';
        execError = err.message;
      } else {
        execError = err instanceof Error ? err.message : String(err);
      }
    }

    // ── 5. Truncate output ───────────────────────────────────────────────
    const wasTruncated =
      rawStdout.length > maxOutputBytes || rawStderr.length > maxOutputBytes;
    const truncStdout = rawStdout.slice(0, maxOutputBytes);
    const truncStderr = rawStderr.slice(0, maxOutputBytes);

    // ── 6. Secret scan output ────────────────────────────────────────────
    const stdoutScan = scanForSecrets(truncStdout);
    const stderrScan = scanForSecrets(truncStderr);
    const hadSecretsRedacted = stdoutScan.found || stderrScan.found;

    if (hadSecretsRedacted) {
      MollyLogger.warn(
        `SecureShell: secrets detected and redacted in output of: ${command.slice(0, 60)}`,
        SECURE_SHELL_ID,
        undefined,
        traceId
      );
    }

    const durationMs = Date.now() - startMs;
    const outcome: ShellOutcome =
      execError && !rawStdout && !rawStderr ? 'exec-error' : 'allowed';

    // ── 7. Record to provenance ──────────────────────────────────────────
    this.recordToProv(
      traceId,
      {
        command: command.slice(0, 120),
        outcome,
        durationMs,
        hadSecretsRedacted,
        wasTruncated,
        error: execError,
      },
      outcome === 'exec-error'
        ? `Shell exec error: ${execError?.slice(0, 100)}`
        : `Shell executed: ${command.slice(0, 60)}`
    );

    MollyLogger.info(
      'Shell execution',
      SECURE_SHELL_ID,
      { command: command.slice(0, 80), outcome, durationMs },
      traceId
    );

    return {
      outcome,
      command,
      stdout: stdoutScan.redacted,
      stderr: stderrScan.redacted,
      wasTruncated,
      hadSecretsRedacted,
      durationMs,
      blockReason: execError,
      traceId,
    };
  }

  /** Current number of executions in the rolling rate-limit window. */
  recentExecutionCount(): number {
    this.pruneExpiredTimestamps();
    return this.executionTimestamps.length;
  }

  private checkRateLimit(): { ok: boolean; reason: string } {
    this.pruneExpiredTimestamps();
    const limit = this.registry.get<number>('shell.rateLimitPerMinute');
    if (this.executionTimestamps.length >= limit) {
      return {
        ok: false,
        reason: `Rate limit exceeded: ${this.executionTimestamps.length}/${limit} executions in the last 60s`,
      };
    }
    return { ok: true, reason: '' };
  }

  private pruneExpiredTimestamps(): void {
    const cutoff = Date.now() - 60_000;
    this.executionTimestamps = this.executionTimestamps.filter((t) => t > cutoff);
  }

  private blocked(
    command: string,
    outcome: ShellOutcome,
    blockReason: string,
    traceId: string,
    startMs: number
  ): ShellResult {
    const durationMs = Date.now() - startMs;

    this.recordToProv(
      traceId,
      { command: command.slice(0, 120), outcome, blockReason, durationMs },
      `Shell blocked: ${blockReason}`
    );

    MollyLogger.warn(
      `Shell blocked (${outcome}): ${blockReason}`,
      SECURE_SHELL_ID,
      { command: command.slice(0, 80) },
      traceId
    );

    return {
      outcome,
      command,
      stdout: '',
      stderr: '',
      wasTruncated: false,
      hadSecretsRedacted: false,
      durationMs,
      blockReason,
      traceId,
    };
  }

  private recordToProv(
    traceId: string,
    data: Record<string, unknown>,
    reason: string
  ): void {
    try {
      const trace = this.provenance.startTrace(traceId);
      const actionSpanId = trace.action('secure-shell-exec', data);
      const gateDecision =
        data.outcome === 'allowed' || data.outcome === 'exec-error'
          ? ('allow' as const)
          : ('block' as const);
      trace.decision(actionSpanId, gateDecision, reason);
    } catch (error) {
      MollyLogger.warn(
        `Failed to record shell exec to provenance: ${error instanceof Error ? error.message : String(error)}`,
        SECURE_SHELL_ID
      );
    }
  }
}
