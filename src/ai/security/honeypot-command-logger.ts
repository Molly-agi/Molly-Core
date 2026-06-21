/**
 * Honeypot Command Logger
 * ------------------------------------------------------------------
 * In-memory ring buffer of attacker commands observed against Molly's
 * honeypot surface. The threat-monitor honeypot-scan sensor reads from
 * this log to compute failure-rate and unique-type signals.
 *
 * No persistence — durable logging is a separate concern and out of
 * scope for this module. Consumers that need durability inject their
 * own source (the sensor already supports DI).
 */

export type HoneypotCommandType =
  | 'probe'
  | 'list'
  | 'retrieve'
  | 'analyze'
  | 'decrypt';

export interface AttackerCommand {
  id: string;
  /** ISO-8601 timestamp string. */
  timestamp: string;
  source_ip: string;
  command_type: HoneypotCommandType;
  parameters: Record<string, unknown>;
  response_time_ms: number;
  success: boolean;
  forensic_hash: string;
}

const DEFAULT_MAX_ENTRIES = 5_000;

export class HoneypotCommandLogger {
  private readonly buffer: AttackerCommand[] = [];

  constructor(private readonly maxEntries: number = DEFAULT_MAX_ENTRIES) {}

  record(command: AttackerCommand): void {
    this.buffer.push(command);
    if (this.buffer.length > this.maxEntries) {
      this.buffer.splice(0, this.buffer.length - this.maxEntries);
    }
  }

  getCommandLog(): AttackerCommand[] {
    return this.buffer.slice();
  }

  clear(): void {
    this.buffer.length = 0;
  }

  get size(): number {
    return this.buffer.length;
  }
}

export const honeypotLogger = new HoneypotCommandLogger();
