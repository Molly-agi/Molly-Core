/**
 * @fileOverview Device provisioning bootstrap gate (W0.2, F2.1).
 *
 * The original bridge daemon provisioned a new device secret for ANY
 * client that sent `op:'hello'` with an empty signature field. There was
 * no token check, no IP restriction, and no rate limiting. An attacker
 * could:
 *   • Enumerate device IDs and pre-register secrets.
 *   • Exhaust disk storage with fabricated device entries.
 *   • Race legitimate devices during first-boot provisioning.
 *
 * This module provides a two-tier bootstrap gate:
 *
 *   Tier 1 — Shared bootstrap token (`BRIDGE_BOOTSTRAP_TOKEN` env var).
 *     The client includes the token in the hello message. The daemon checks
 *     it before provisioning. Zero-knowledge from the daemon's side.
 *
 *   Tier 2 — Localhost bypass (`BRIDGE_BOOTSTRAP_LOCALHOST` env var, default
 *     `true`). Connections from 127.0.0.1 / ::1 are allowed to provision
 *     without a token. This covers the common codespace case where Eric's
 *     Android device tunnels through localhost.
 *
 * If NEITHER tier permits the request the daemon MUST send a
 * `bootstrap_denied` rejection and close the connection without provisioning.
 */

import type { BootstrapConfig, BootstrapRequest } from './types';

export type { BootstrapConfig, BootstrapRequest };

/** Result of a bootstrap gate check. */
export interface BootstrapResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Determine whether a device provisioning request is permitted.
 *
 * @param req    The incoming provisioning request.
 * @param config Gate configuration (parsed from env or supplied directly).
 */
export function canProvisionDevice(
  req: BootstrapRequest,
  config: BootstrapConfig
): BootstrapResult {
  // Tier 1: explicit bootstrap token.
  if (config.bootstrapToken) {
    if (req.token === config.bootstrapToken) {
      return { allowed: true };
    }
    // Wrong token — fall through to localhost check before denying.
  }

  // Tier 2: localhost bypass.
  if (config.allowLocalhost && isLocalhost(req.clientIp)) {
    return { allowed: true };
  }

  // No policy met — deny.
  if (!config.bootstrapToken && !config.allowLocalhost) {
    return { allowed: false, reason: 'no_bootstrap_policy' };
  }
  return { allowed: false, reason: 'bootstrap_denied' };
}

/** Returns `true` for IPv4 / IPv6 loopback addresses. */
function isLocalhost(ip?: string): boolean {
  if (!ip) return false;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

/**
 * Parse bootstrap configuration from `process.env` (or a compatible object).
 */
export function parseBootstrapConfig(env: NodeJS.ProcessEnv): BootstrapConfig {
  const bootstrapToken = env.BRIDGE_BOOTSTRAP_TOKEN || null;
  // Default: allow localhost bypass unless explicitly disabled.
  const allowLocalhost = env.BRIDGE_BOOTSTRAP_LOCALHOST !== 'false';
  return { bootstrapToken, allowLocalhost };
}
