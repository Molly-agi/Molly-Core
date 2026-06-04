/**
 * @fileOverview F2.3 — Write-only quarantine ledger (W0.2)
 *
 * The original bridge only tracked a global authFailures counter.
 * Per-device failure tracking was absent, so a device could attempt
 * unlimited invalid signatures across connections with no consequence.
 *
 * This module provides:
 *   - An append-only failure log (write-only — never edits past entries)
 *   - Automatic quarantine when a device exceeds failureThreshold in windowMs
 *   - A quarantine registry (also append-only on disk)
 *
 * "Write-only" in F2.3 means the ledger never overwrites or deletes
 * past entries — new records are always appended. Reading is allowed
 * for quarantine evaluation, but mutations are insert-only.
 */

import { appendFileSync, existsSync, readFileSync } from 'fs';
import type {
  QuarantineEntry,
  FailureEntry,
  QuarantineLedgerConfig,
} from './schema';

export const DEFAULT_QUARANTINE_CONFIG: QuarantineLedgerConfig = {
  failureThreshold: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
};

export class QuarantineLedger {
  private readonly failurePath: string;
  private readonly quarantinePath: string;
  private readonly config: QuarantineLedgerConfig;

  // In-memory indices rebuilt from disk on construction.
  private failures: FailureEntry[] = [];
  private quarantined = new Set<string>();

  constructor(
    failurePath: string,
    quarantinePath: string,
    config: QuarantineLedgerConfig = DEFAULT_QUARANTINE_CONFIG
  ) {
    this.failurePath = failurePath;
    this.quarantinePath = quarantinePath;
    this.config = config;
    this.load();
  }

  /** Returns true if the device is currently quarantined. */
  isQuarantined(deviceId: string): boolean {
    return this.quarantined.has(deviceId);
  }

  /**
   * Record an auth failure for `deviceId`.
   * If the device now exceeds the threshold within the window, it is
   * immediately quarantined and the quarantine record is persisted.
   */
  recordFailure(
    deviceId: string,
    reason: string,
    now: number = Date.now()
  ): { quarantined: boolean } {
    const entry: FailureEntry = { deviceId, reason, ts: now };
    this.failures.push(entry);
    appendFileSync(this.failurePath, JSON.stringify(entry) + '\n', 'utf8');

    if (this.isQuarantined(deviceId)) {
      return { quarantined: true };
    }

    const recentCount = this.recentFailureCount(deviceId, now);
    if (recentCount >= this.config.failureThreshold) {
      this.addQuarantine(deviceId, `failure_threshold_exceeded`, now);
      return { quarantined: true };
    }

    return { quarantined: false };
  }

  /** Count failures for `deviceId` within the sliding window. */
  recentFailureCount(deviceId: string, now: number = Date.now()): number {
    const cutoff = now - this.config.windowMs;
    return this.failures.filter((e) => e.deviceId === deviceId && e.ts > cutoff)
      .length;
  }

  /** Return all quarantined device IDs. */
  quarantinedDevices(): string[] {
    return [...this.quarantined];
  }

  // ── private ────────────────────────────────────────────────────────────────

  private addQuarantine(deviceId: string, reason: string, ts: number): void {
    this.quarantined.add(deviceId);
    const entry: QuarantineEntry = { deviceId, reason, ts };
    appendFileSync(this.quarantinePath, JSON.stringify(entry) + '\n', 'utf8');
  }

  private load(): void {
    this.failures = this.readLines<FailureEntry>(this.failurePath);
    const quarantine = this.readLines<QuarantineEntry>(this.quarantinePath);
    for (const e of quarantine) {
      if (typeof e.deviceId === 'string') {
        this.quarantined.add(e.deviceId);
      }
    }
  }

  private readLines<T>(path: string): T[] {
    if (!existsSync(path)) return [];
    const lines = readFileSync(path, 'utf8').split('\n');
    const result: T[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        result.push(JSON.parse(trimmed) as T);
      } catch {
        // Malformed line — skip.
      }
    }
    return result;
  }
}
