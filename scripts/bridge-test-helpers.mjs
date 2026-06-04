/**
 * Shared test helpers for W0.2 bridge hardening tests.
 *
 * Key problem solved: all tests previously hardcoded BRIDGE_PORT=9099 and
 * wrote to production data/ paths, causing state bleed between tests.
 *
 * This module provides:
 *   - getFreePort()        — allocates a random available TCP port
 *   - makeTempPaths(dir)   — returns isolated temp file paths for a test run
 *   - spawnBridge(opts)    — spawns an isolated daemon and waits until ready
 *   - killBridge(proc)     — graceful SIGTERM + 500ms drain
 */

import net from 'net';
import os from 'os';
import path from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { spawn } from 'child_process';
import fetch from 'node-fetch';

export function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

export function makeTempDir() {
  return mkdtempSync(path.join(os.tmpdir(), 'bridge-test-'));
}

export function makeTempPaths(tmpDir) {
  return {
    bindings: path.join(tmpDir, '.bridge-bindings.json'),
    nonceCache: path.join(tmpDir, '.bridge-nonce-cache'),
    quarantine: path.join(tmpDir, '.bridge-quarantine-ledger'),
    secrets: path.join(tmpDir, 'bridge-secrets.json'),
  };
}

export function cleanTempDir(tmpDir) {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ok */
  }
}

/**
 * Spawn an isolated bridge daemon.
 * @param {object} opts
 * @param {number}  opts.port        - TCP port (from getFreePort())
 * @param {string}  opts.bridgeKey   - BRIDGE_KEY value (min 32 chars hex)
 * @param {object}  opts.paths       - from makeTempPaths()
 * @param {number}  [opts.timeout]   - ms to wait for ready (default 4000)
 * @returns {Promise<{process, port}>}
 */
export async function spawnBridge({ port, bridgeKey, paths, timeout = 4000 }) {
  const env = {
    ...process.env,
    BRIDGE_KEY: bridgeKey,
    BRIDGE_PORT: String(port),
    NONCE_CACHE_PATH: paths.nonceCache,
    QUARANTINE_LEDGER_PATH: paths.quarantine,
    BINDINGS_CONFIG_PATH: paths.bindings,
    BRIDGE_SECRETS_FILE: paths.secrets,
  };

  const proc = spawn('node', ['scripts/bridge-daemon.mjs'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Wait until ping responds
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/ping`, {
        timeout: 300,
      });
      if (res.ok) return { process: proc, port };
    } catch {
      /* not ready yet */
    }
  }

  proc.kill('SIGTERM');
  throw new Error(
    `Bridge daemon did not become ready on port ${port} within ${timeout}ms`
  );
}

export async function killBridge(proc) {
  if (!proc) return;
  proc.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 500));
}
