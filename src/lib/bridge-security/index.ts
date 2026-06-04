/**
 * @fileOverview Bridge Security module — W0.2 hardening (F2.1–F2.5).
 *
 * Re-exports all public surface area so callers can import from a single
 * path: `@/lib/bridge-security`.
 */

export { verifyHmacSha256 } from './verify';

export {
  createNonceStore,
  serializeNonces,
  deserializeNonces,
} from './nonce-store';
export type { NonceStore, NonceEntry } from './nonce-store';

export { createQuarantineLedger } from './quarantine';
export type {
  QuarantineLedger,
  AuthFailureRecord,
  QuarantineState,
  QuarantineLedgerData,
} from './quarantine';

export { canProvisionDevice, parseBootstrapConfig } from './bootstrap';
export type {
  BootstrapConfig,
  BootstrapRequest,
  BootstrapResult,
} from './bootstrap';
