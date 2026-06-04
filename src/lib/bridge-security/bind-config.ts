/**
 * @fileOverview F2.4 — Explicit bind interface (W0.2)
 *
 * The original bridge-daemon bound to the default (all interfaces).
 * This module exports the canonical bind configuration so the daemon
 * and any test can reference a single source of truth.
 */

import type { BindConfig } from './schema';

/**
 * Default bind configuration for the Family Bridge Daemon.
 *
 * Binds to 127.0.0.1 (loopback only) — external traffic must go
 * through the codespace port-forwarding layer, not directly to the
 * daemon socket.
 */
export const BRIDGE_BIND: BindConfig = {
  host: '127.0.0.1',
  port: 9099,
};
