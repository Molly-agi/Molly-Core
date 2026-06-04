/**
 * @fileOverview Bridge security — shared types (W0.2)
 *
 * Types used by the five W0.2 security modules:
 *   F2.1 provision-rate-limit   — key bootstrap throttle
 *   F2.2 nonce-cache            — persisted replay defence
 *   F2.3 quarantine-ledger      — per-device failure tracking
 *   F2.4 bind-config            — explicit bind interface
 *   F2.5 constant-time-verify   — length-invariant signature check
 */

// ── F2.1 ──────────────────────────────────────────────────────────────────────

export interface ProvisionAttempt {
  /** Arbitrary key — typically IP address or deviceId bucket. */
  key: string;
  /** Unix timestamp of the attempt (ms). */
  ts: number;
}

export interface ProvisionRateLimitConfig {
  /** Maximum provisioning events allowed within windowMs. */
  maxAttempts: number;
  /** Rolling window in milliseconds. */
  windowMs: number;
}

// ── F2.2 ──────────────────────────────────────────────────────────────────────

export interface NonceRecord {
  /** `${deviceId}:${nonce}` composite key. */
  key: string;
  /** Unix timestamp when the nonce was consumed (ms). */
  consumedAt: number;
}

// ── F2.3 ──────────────────────────────────────────────────────────────────────

export interface QuarantineEntry {
  deviceId: string;
  reason: string;
  ts: number;
}

export interface FailureEntry {
  deviceId: string;
  reason: string;
  ts: number;
}

export interface QuarantineLedgerConfig {
  /** Failures within windowMs before quarantine fires. */
  failureThreshold: number;
  windowMs: number;
}

// ── F2.4 ──────────────────────────────────────────────────────────────────────

export interface BindConfig {
  host: string;
  port: number;
}
