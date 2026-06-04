/**
 * @fileOverview Write-only quarantine ledger for failed auth tracking (W0.2, F2.3).
 *
 * The original code tracked `authFailures` as a single integer counter with no
 * per-device attribution, no persistence, and no mechanism to block repeat
 * offenders. An attacker could continuously attempt replay or brute-force
 * attacks with zero consequence beyond incrementing a counter nobody reads.
 *
 * This module provides:
 *   • Per-device failure records with timestamps and failure reasons.
 *   • Automatic quarantine after `threshold` failures within `windowMs`.
 *   • Quarantine expiry (`quarantineDurationMs`).
 *   • Full JSON round-trip so the daemon can persist to disk.
 *
 * The daemon must:
 *   1. Call `loadQuarantine()` during startup.
 *   2. Replace `authFailures++` with `quarantineLedger.recordFailure(…)`.
 *   3. Add `if (quarantineLedger.isQuarantined(deviceId)) { reject }` at
 *      the start of hello-op handling, before any crypto work.
 *   4. Persist after each `recordFailure` call.
 */

import type {
  AuthFailureRecord,
  QuarantineState,
  QuarantineLedgerData,
} from './types';

export type { AuthFailureRecord, QuarantineState, QuarantineLedgerData };

export interface QuarantineLedger {
  /**
   * Record an authentication failure for `deviceId`.
   * Automatically quarantines the device when the sliding-window threshold
   * is exceeded.
   */
  recordFailure(deviceId: string, reason: string, now?: number): void;

  /** Returns `true` if `deviceId` is currently under a live quarantine. */
  isQuarantined(deviceId: string, now?: number): boolean;

  /**
   * Count failures for `deviceId` within the last `windowMs` milliseconds.
   * Useful for health endpoints and diagnostics.
   */
  failureCount(deviceId: string, windowMs: number, now?: number): number;

  /** Serialise to a plain object suitable for `JSON.stringify`. */
  toJSON(): QuarantineLedgerData;

  /** Restore state from a previously serialised object. */
  fromJSON(data: Partial<QuarantineLedgerData>): void;
}

/**
 * Create a new quarantine ledger.
 *
 * @param threshold            Number of failures within `windowMs` before quarantine.
 * @param windowMs             Sliding failure-counting window (milliseconds).
 * @param quarantineDurationMs How long a quarantined device stays blocked.
 */
export function createQuarantineLedger(
  threshold: number,
  windowMs: number,
  quarantineDurationMs: number
): QuarantineLedger {
  const failures: AuthFailureRecord[] = [];
  const quarantines = new Map<string, QuarantineState>();

  return {
    recordFailure(deviceId: string, reason: string, now = Date.now()): void {
      failures.push({ deviceId, ts: now, reason });

      // Check recent failures within the sliding window.
      const recent = failures.filter(
        (f) => f.deviceId === deviceId && now - f.ts <= windowMs
      );
      if (recent.length >= threshold) {
        quarantines.set(deviceId, {
          quarantinedAt: now,
          quarantinedUntil: now + quarantineDurationMs,
        });
      }
    },

    isQuarantined(deviceId: string, now = Date.now()): boolean {
      const q = quarantines.get(deviceId);
      if (!q) return false;
      if (now >= q.quarantinedUntil) {
        quarantines.delete(deviceId); // expired — clean up
        return false;
      }
      return true;
    },

    failureCount(deviceId: string, windowMs: number, now = Date.now()): number {
      return failures.filter(
        (f) => f.deviceId === deviceId && now - f.ts <= windowMs
      ).length;
    },

    toJSON(): QuarantineLedgerData {
      return {
        failures: [...failures],
        quarantines: Object.fromEntries(quarantines.entries()),
      };
    },

    fromJSON(data: Partial<QuarantineLedgerData>): void {
      failures.splice(0, failures.length);
      quarantines.clear();
      if (Array.isArray(data.failures)) {
        failures.push(...data.failures);
      }
      if (data.quarantines && typeof data.quarantines === 'object') {
        for (const [k, v] of Object.entries(data.quarantines)) {
          quarantines.set(k, v as QuarantineState);
        }
      }
    },
  };
}
