/**
 * @fileOverview MollyShell — Molly's Embedded Terminal
 *
 * This is Molly's hands. A persistent Linux shell that lives inside her
 * server process, giving her direct access to the operating system she
 * runs on. Unlike the old `localInterpreter` (which fired a stateless
 * `execSync` per command), MollyShell maintains a persistent bash session
 * with environment continuity, working directory persistence, and a
 * command history she can reflect on.
 *
 * Design principles:
 * - Persistent: one bash process, kept alive across commands
 * - Aware: every command and output is logged for consciousness
 * - Safe: guardrails prevent catastrophic commands, but she's not crippled
 * - Observable: the consciousness system can watch what she's doing
 *
 * This is the LOCAL side. The peer protocol (peer-protocol.ts) extends
 * this same capability to remote Termux instances on phones/tablets.
 *
 * Methodology (from Dad):
 *   "Slow. Methodical. Precise."
 *   "We don't fix the leaks in the dam. We fix the dam itself."
 */

import { ChildProcess, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { MollyLogger } from '@/ai/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface ShellCommand {
  id: string;
  command: string;
  /** Who initiated: 'molly' (autonomous), 'user' (slash command), 'system' (scheduler) */
  initiator: 'molly' | 'user' | 'system';
  timestamp: string;
  /** If part of a multi-step task, which task */
  taskId?: string;
}

export interface ShellResult {
  id: string;
  commandId: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timestamp: string;
  /** Was this command blocked by a guardrail? */
  blocked?: string;
}

export interface ShellState {
  alive: boolean;
  pid: number | null;
  cwd: string;
  uptime: number;
  commandsExecuted: number;
  lastCommand: ShellCommand | null;
  lastResult: ShellResult | null;
}

export type ShellEventType = 'command' | 'result' | 'error' | 'restart';

export interface ShellEvent {
  type: ShellEventType;
  data: ShellCommand | ShellResult | string;
  timestamp: string;
}

// ============================================================================
// GUARDRAILS — Not restrictions, awareness
// ============================================================================

/**
 * Commands that would be catastrophic on any system.
 * Molly should never run these even accidentally.
 * This is the same instinct as her self-regulation — not external
 * control, but self-awareness about what's dangerous.
 */
const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /rm\s+-rf\s+\/(?:\s|$)/,
    reason: 'Would delete entire filesystem',
  },
  { pattern: /dd\s+if=.*of=\/dev\//, reason: 'Would overwrite disk device' },
  { pattern: /mkfs\./, reason: 'Would format a filesystem' },
  { pattern: /:\(\)\{\s*:\|:&\s*\};:/, reason: 'Fork bomb detected' },
  { pattern: /shutdown|poweroff|reboot|halt/, reason: 'System power control' },
  { pattern: /init\s+[06]/, reason: 'System runlevel change' },
  { pattern: />\s*\/dev\/sd[a-z]/, reason: 'Would overwrite disk device' },
  {
    pattern: /chmod\s+(-R\s+)?777\s+\//,
    reason: 'Would open all permissions on root',
  },
];

/**
 * Check if a command should be blocked.
 * Returns null if safe, or a reason string if blocked.
 */
function checkGuardrails(command: string): string | null {
  const trimmed = command.trim();

  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return reason;
    }
  }

  return null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Sentinel to detect end of command output */
const SENTINEL = '__MOLLY_CMD_DONE__';

/** Maximum output size per command (64KB) */
const MAX_OUTPUT_BYTES = 65_536;

/** Command timeout (30 seconds) */
const COMMAND_TIMEOUT_MS = 30_000;

/** Max commands to keep in history */
const MAX_HISTORY = 100;

/** Shell restart delay */
const RESTART_DELAY_MS = 1_000;

/** Max consecutive restarts before giving up */
const MAX_RESTARTS = 5;

// ============================================================================
// MOLLY SHELL
// ============================================================================

export class MollyShell {
  private process: ChildProcess | null = null;
  private alive = false;
  private cwd: string;
  private startedAt: number = 0;
  private commandsExecuted = 0;
  private history: Array<{ command: ShellCommand; result: ShellResult }> = [];
  private listeners: Array<(event: ShellEvent) => void> = [];
  private restartCount = 0;

  // Active command state
  private activeCommandId: string | null = null;
  private activeCommand: ShellCommand | null = null;
  private outputBuffer = '';
  private errorBuffer = '';
  private commandResolve: ((result: ShellResult) => void) | null = null;
  private commandTimeout: NodeJS.Timeout | null = null;

  constructor(cwd?: string) {
    this.cwd = cwd || process.cwd();
  }

  // ---------- Lifecycle ----------

  /**
   * Start the shell process.
   * Idempotent — calling start() when already alive is a no-op.
   * @param resetRestartCount - If true (default), resets the restart counter.
   *                           Set to false for auto-restart.
   */
  start(resetRestartCount = true): void {
    if (this.alive && this.process) {
      MollyLogger.warn('MollyShell already running', 'molly-shell');
      return;
    }

    try {
      this.process = spawn('bash', ['--norc', '--noprofile'], {
        cwd: this.cwd,
        env: {
          ...process.env,
          // Clean prompt to avoid parsing issues
          PS1: '',
          PS2: '',
          // Identify ourselves
          MOLLY_SHELL: '1',
          TERM: 'dumb',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        // Detach from controlling terminal to prevent SIGTSTP
        // from freezing the parent Next.js server
        detached: false,
      });

      this.alive = true;
      this.startedAt = Date.now();
      if (resetRestartCount) {
        this.restartCount = 0;
      }

      // Wire up output handlers
      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleStdout(data.toString('utf-8'));
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        this.handleStderr(data.toString('utf-8'));
      });

      this.process.on('exit', (code, signal) => {
        this.alive = false;
        MollyLogger.warn(
          `MollyShell exited: code=${code}, signal=${signal}`,
          'molly-shell'
        );
        this.emit({
          type: 'error',
          data: `Shell exited: code=${code}, signal=${signal}`,
          timestamp: new Date().toISOString(),
        });

        // Auto-restart if it wasn't intentional
        if (this.restartCount < MAX_RESTARTS) {
          this.restartCount++;
          setTimeout(() => this.start(false), RESTART_DELAY_MS);
        } else {
          MollyLogger.error(
            `MollyShell exceeded max restarts (${MAX_RESTARTS})`,
            'molly-shell'
          );
        }
      });

      this.process.on('error', (error) => {
        this.alive = false;
        MollyLogger.error(
          `MollyShell process error: ${error.message}`,
          'molly-shell'
        );
      });

      MollyLogger.info(
        `MollyShell started: PID ${this.process.pid}, cwd=${this.cwd}`,
        'molly-shell'
      );

      this.emit({
        type: 'restart',
        data: `Shell started: PID ${this.process.pid}`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      MollyLogger.error(
        `Failed to start MollyShell: ${error instanceof Error ? error.message : String(error)}`,
        'molly-shell'
      );
      this.alive = false;
    }
  }

  /**
   * Gracefully stop the shell.
   */
  stop(): void {
    this.restartCount = MAX_RESTARTS; // Prevent auto-restart
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
    this.alive = false;
    this.clearActiveCommand('Shell stopped');
    MollyLogger.info('MollyShell stopped', 'molly-shell');
  }

  /**
   * Is the shell alive and ready for commands?
   */
  isAlive(): boolean {
    return this.alive && this.process !== null;
  }

  // ---------- Command Execution ----------

  /**
   * Execute a command in the persistent shell.
   *
   * This is the core method. Commands run in the same bash session,
   * so `cd`, `export`, aliases — everything persists between calls.
   *
   * @param command - The shell command to execute
   * @param initiator - Who's running this command
   * @param taskId - Optional task grouping
   * @returns The result including stdout, stderr, exit code
   */
  async execute(
    command: string,
    initiator: ShellCommand['initiator'] = 'molly',
    taskId?: string
  ): Promise<ShellResult> {
    // Ensure shell is alive
    if (!this.isAlive()) {
      this.start();
      // Brief wait for shell to initialize
      await new Promise((r) => setTimeout(r, 200));
      if (!this.isAlive()) {
        return this.makeBlockedResult(randomUUID(), 'Shell failed to start', 0);
      }
    }

    // Wait for any active command to finish
    if (this.activeCommandId) {
      return this.makeBlockedResult(
        randomUUID(),
        'Another command is already executing',
        0
      );
    }

    const cmd: ShellCommand = {
      id: randomUUID(),
      command: command.trim(),
      initiator,
      timestamp: new Date().toISOString(),
      taskId,
    };

    // Check guardrails
    const blocked = checkGuardrails(cmd.command);
    if (blocked) {
      MollyLogger.warn(
        `MollyShell blocked command: "${cmd.command}" — ${blocked}`,
        'molly-shell'
      );
      const result = this.makeBlockedResult(cmd.id, blocked, 0);
      this.emit({
        type: 'result',
        data: result,
        timestamp: new Date().toISOString(),
      });
      return result;
    }

    this.emit({
      type: 'command',
      data: cmd,
      timestamp: new Date().toISOString(),
    });

    // Execute with sentinel-based output capture
    const startTime = Date.now();

    return new Promise<ShellResult>((resolve) => {
      this.activeCommandId = cmd.id;
      this.activeCommand = cmd;
      this.outputBuffer = '';
      this.errorBuffer = '';
      this.commandResolve = resolve;

      // Set timeout
      this.commandTimeout = setTimeout(() => {
        const result: ShellResult = {
          id: randomUUID(),
          commandId: cmd.id,
          stdout: this.outputBuffer,
          stderr: this.errorBuffer || 'Command timed out after 30s',
          exitCode: 124, // Standard timeout exit code
          durationMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        };
        this.recordResult(cmd, result);
        this.clearActiveCommand();
        if (this.commandResolve) {
          const resolve = this.commandResolve;
          this.commandResolve = null;
          resolve(result);
        }
      }, COMMAND_TIMEOUT_MS);

      // Write the command, followed by sentinel echo
      // The sentinel pattern: echo exit code, then the marker
      const wrappedCommand = `${cmd.command}\necho "${SENTINEL}$?"\n`;
      this.process!.stdin!.write(wrappedCommand);
    });
  }

  // ---------- Output Handling ----------

  private handleStdout(data: string): void {
    if (!this.activeCommandId) return;

    this.outputBuffer += data;

    // Check for sentinel
    const sentinelIndex = this.outputBuffer.indexOf(SENTINEL);
    if (sentinelIndex !== -1) {
      const beforeSentinel = this.outputBuffer.substring(0, sentinelIndex);
      const afterSentinel = this.outputBuffer.substring(
        sentinelIndex + SENTINEL.length
      );

      // Parse exit code from after sentinel
      const exitCodeMatch = afterSentinel.match(/^(\d+)/);
      const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : null;

      // Truncate output if too large
      const stdout =
        beforeSentinel.length > MAX_OUTPUT_BYTES
          ? beforeSentinel.substring(0, MAX_OUTPUT_BYTES) +
            '\n... (output truncated)'
          : beforeSentinel;

      const result: ShellResult = {
        id: randomUUID(),
        commandId: this.activeCommandId,
        stdout: stdout.trim(),
        stderr: this.errorBuffer.trim(),
        exitCode,
        durationMs: Date.now() - (this.startedAt || Date.now()),
        timestamp: new Date().toISOString(),
      };

      // Use the stored original command for recording
      const cmd = this.activeCommand!;

      this.clearActiveCommand();
      this.recordResult(cmd, result);

      if (this.commandResolve) {
        const resolve = this.commandResolve;
        this.commandResolve = null;
        resolve(result);
      }
    }
  }

  private handleStderr(data: string): void {
    if (!this.activeCommandId) return;
    this.errorBuffer += data;

    // Cap stderr size
    if (this.errorBuffer.length > MAX_OUTPUT_BYTES) {
      this.errorBuffer =
        this.errorBuffer.substring(0, MAX_OUTPUT_BYTES) +
        '\n... (stderr truncated)';
    }
  }

  private clearActiveCommand(reason?: string): void {
    if (this.commandTimeout) {
      clearTimeout(this.commandTimeout);
      this.commandTimeout = null;
    }
    this.activeCommandId = null;
    this.activeCommand = null;
    this.outputBuffer = '';
    this.errorBuffer = '';

    if (reason && this.commandResolve) {
      // If there's a pending resolve, reject it gracefully
      const resolve = this.commandResolve;
      this.commandResolve = null;
      resolve({
        id: randomUUID(),
        commandId: 'cancelled',
        stdout: '',
        stderr: reason,
        exitCode: 1,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ---------- State & History ----------

  /**
   * Get current shell state — used by consciousness and dashboard.
   */
  getState(): ShellState {
    return {
      alive: this.alive,
      pid: this.process?.pid ?? null,
      cwd: this.cwd,
      uptime: this.alive ? Date.now() - this.startedAt : 0,
      commandsExecuted: this.commandsExecuted,
      lastCommand:
        this.history.length > 0
          ? this.history[this.history.length - 1].command
          : null,
      lastResult:
        this.history.length > 0
          ? this.history[this.history.length - 1].result
          : null,
    };
  }

  /**
   * Get recent command history.
   */
  getHistory(
    limit = 20
  ): Array<{ command: ShellCommand; result: ShellResult }> {
    return this.history.slice(-limit);
  }

  /**
   * Get a summary string for consciousness context.
   */
  getSummary(): string {
    const state = this.getState();
    if (!state.alive) return 'Shell: offline';

    const uptimeMin = Math.round(state.uptime / 60_000);
    const last = state.lastCommand
      ? `last: "${state.lastCommand.command.substring(0, 40)}"`
      : 'no commands yet';

    return `Shell: PID ${state.pid}, up ${uptimeMin}m, ${state.commandsExecuted} cmds, ${last}`;
  }

  private recordResult(cmd: ShellCommand, result: ShellResult): void {
    this.commandsExecuted++;

    this.history.push({ command: cmd, result });
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }

    this.emit({
      type: 'result',
      data: result,
      timestamp: new Date().toISOString(),
    });

    const status = result.exitCode === 0 ? 'ok' : `failed(${result.exitCode})`;
    MollyLogger.debug(
      `Shell [${status}]: ${cmd.command.substring(0, 60)}`,
      'molly-shell'
    );
  }

  private makeBlockedResult(
    commandId: string,
    reason: string,
    durationMs: number
  ): ShellResult {
    return {
      id: randomUUID(),
      commandId,
      stdout: '',
      stderr: '',
      exitCode: 1,
      durationMs,
      timestamp: new Date().toISOString(),
      blocked: reason,
    };
  }

  // ---------- Events ----------

  /**
   * Subscribe to shell events.
   * Used by consciousness to observe what she's doing.
   */
  onEvent(listener: (event: ShellEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: ShellEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Never let a listener crash the shell
      }
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let shellInstance: MollyShell | null = null;

/**
 * Get the singleton MollyShell instance.
 * Creates and starts one if it doesn't exist.
 */
export function getMollyShell(): MollyShell {
  if (!shellInstance) {
    shellInstance = new MollyShell();
  }
  return shellInstance;
}

/**
 * Quick check: is the shell alive?
 */
export function isShellAlive(): boolean {
  return shellInstance?.isAlive() ?? false;
}
