/**
 * @fileOverview Shared types for Bridge Security (W0.2, F2.1–F2.5).
 */

/** A single consumed nonce entry kept in the persisted nonce store. */
export interface NonceEntry {
  /** Composite key: `${deviceId}:${nonce}` */
  key: string;
  /** Millisecond timestamp when the nonce was first consumed. */
  ts: number;
}

/** One per-device authentication failure record in the quarantine ledger. */
export interface AuthFailureRecord {
  deviceId: string;
  ts: number;
  reason: string;
}

/** Quarantine window state for a device that exceeded the failure threshold. */
export interface QuarantineState {
  quarantinedAt: number;
  quarantinedUntil: number;
}

/** Serialisable shape of the quarantine ledger persisted to disk. */
export interface QuarantineLedgerData {
  failures: AuthFailureRecord[];
  quarantines: Record<string, QuarantineState>;
}

/** Configuration parsed from environment variables for device bootstrap. */
export interface BootstrapConfig {
  /** Shared secret required for remote provisioning; null = not required. */
  bootstrapToken: string | null;
  /** Whether connections from 127.0.0.1 / ::1 bypass token check. */
  allowLocalhost: boolean;
}

/** Caller-supplied context for a provisioning request. */
export interface BootstrapRequest {
  deviceId: string;
  /** Token from client request (optional). */
  token?: string;
  /** Remote IP address of the connecting client. */
  clientIp?: string;
}
