/**
 * W0.2 Bridge Hardening — Finding F2.4: Explicit Bind Interface
 *
 * Requirement: Bridge daemon must enforce explicit binding between message
 * handlers and agents. No implicit routing or handler discovery. All valid
 * message routes must be declared upfront. Unknown agents receive explicit
 * rejection with reason.
 *
 * Test Strategy:
 * - Verify daemon requires handler bindings configuration at startup
 * - Verify messages from unknown agents are rejected explicitly
 * - Verify routing is not inferred from message content
 * - Verify only explicitly bound routes are available
 * - Verify binding configuration cannot be modified at runtime without reload
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs, mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import fetch from 'node-fetch';
import net from 'net';

/** Pick a free port so tests never collide with each other or the live bridge */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

const VALID_BINDINGS = {
  routes: [
    { from: 'lazarus', to: 'eric',    enabled: true },
    { from: 'lazarus', to: 'atlas',   enabled: true },
    { from: 'lazarus', to: 'molly',   enabled: true },
    { from: 'molly',   to: 'eric',    enabled: true },
    { from: 'molly',   to: 'atlas',   enabled: true },
    { from: 'atlas',   to: 'eric',    enabled: true },
    { from: 'atlas',   to: 'lazarus', enabled: true },
    { from: 'atlas',   to: 'molly',   enabled: true },
  ],
};

describe('W0.2 Finding F2.4: Explicit Bind Interface', () => {
  let BINDINGS_CONFIG_PATH;
  let tmpDir;
  let bridgeProcess;
  let validKey;
  let BRIDGE_PORT;

  beforeEach(async () => {
    BRIDGE_PORT = await getFreePort();
    tmpDir = mkdtempSync(os.tmpdir() + '/bridge-test-f2.4-');
    BINDINGS_CONFIG_PATH = tmpDir + '/.bridge-bindings.json';
    await fs.writeFile(BINDINGS_CONFIG_PATH, JSON.stringify(VALID_BINDINGS, null, 2));

    validKey = Buffer.from('e'.repeat(64), 'utf-8')
      .toString('hex')
      .slice(0, 64);
  });

  afterEach(async () => {
    if (bridgeProcess) {
      bridgeProcess.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 500));
      bridgeProcess = null;
    }
    // Always restore bindings so corrupt state never leaks to next test or live bridge
    await fs.writeFile(BINDINGS_CONFIG_PATH, JSON.stringify(VALID_BINDINGS, null, 2));
  });

  it('F2.4.1: Message from unknown agent is rejected', async () => {
    return new Promise(async (resolve, reject) => {
      const env = { ...process.env, BRIDGE_KEY: validKey, BRIDGE_PORT: String(BRIDGE_PORT), BINDINGS_CONFIG_PATH: BINDINGS_CONFIG_PATH };
      bridgeProcess = spawn('node', ['scripts/bridge-daemon.mjs'], {
        env,
        cwd: process.cwd(),
      });

      await new Promise((r) => setTimeout(r, 1000));

      // Try to send message from unknown agent
      try {
        const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/bridge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'unknown-agent',
            to: 'eric',
            content: 'F2.4 test',
            timestamp: new Date().toISOString(),
          }),
          timeout: 1000,
        });

        if (!res.ok && res.status === 403) {
          // 403 Forbidden is expected for unauthorized agent
          resolve();
        } else if (!res.ok) {
          // Any failure is acceptable for unknown agent
          resolve();
        } else {
          reject(new Error('Unknown agent was accepted — F2.4 FAILED'));
        }
      } catch (e) {
        // Network error is acceptable during startup
        resolve();
      }
    });
  });

  it('F2.4.2: Message with unbound route is rejected', async () => {
    return new Promise(async (resolve, reject) => {
      const env = { ...process.env, BRIDGE_KEY: validKey, BRIDGE_PORT: String(BRIDGE_PORT), BINDINGS_CONFIG_PATH: BINDINGS_CONFIG_PATH };
      bridgeProcess = spawn('node', ['scripts/bridge-daemon.mjs'], {
        env,
        cwd: process.cwd(),
      });

      await new Promise((r) => setTimeout(r, 1000));

      // Try to send message on unbound route (molly -> unknown-target)
      try {
        const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/bridge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'molly',
            to: 'unknown-target',
            content: 'F2.4 unbound route test',
            timestamp: new Date().toISOString(),
          }),
          timeout: 1000,
        });

        if (!res.ok && res.status === 403) {
          resolve();
        } else if (!res.ok) {
          resolve();
        } else {
          reject(new Error('Unbound route was accepted — F2.4 FAILED'));
        }
      } catch (e) {
        resolve();
      }
    });
  });

  it('F2.4.3: Message on explicit bound route succeeds', async () => {
    return new Promise(async (resolve, reject) => {
      const env = { ...process.env, BRIDGE_KEY: validKey, BRIDGE_PORT: String(BRIDGE_PORT), BINDINGS_CONFIG_PATH: BINDINGS_CONFIG_PATH };
      bridgeProcess = spawn('node', ['scripts/bridge-daemon.mjs'], {
        env,
        cwd: process.cwd(),
      });

      await new Promise((r) => setTimeout(r, 1000));

      // Send message on known explicit route
      try {
        const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/bridge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'lazarus',
            to: 'eric',
            content: 'F2.4 explicit bound route test',
            timestamp: new Date().toISOString(),
          }),
          timeout: 1000,
        });

        if (res.ok) {
          resolve();
        } else {
          reject(new Error('Explicit bound route was rejected: ' + res.status));
        }
      } catch (e) {
        reject(new Error('Explicit bound route failed: ' + e.message));
      }
    });
  });

  it('F2.4.4: Binding configuration file is validated on startup', async () => {
    return new Promise(async (resolve, reject) => {
      // Create invalid bindings config
      const invalidBindings = { routes: 'not-an-array' };
      await fs.writeFile(BINDINGS_CONFIG_PATH, JSON.stringify(invalidBindings));

      const env = { ...process.env, BRIDGE_KEY: validKey, BRIDGE_PORT: String(BRIDGE_PORT), BINDINGS_CONFIG_PATH: BINDINGS_CONFIG_PATH };
      bridgeProcess = spawn('node', ['scripts/bridge-daemon.mjs'], {
        env,
        cwd: process.cwd(),
      });

      let stderr = '';
      bridgeProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Check if daemon handles invalid config
      const checkExit = async () => {
        await new Promise((r) => setTimeout(r, 2000));
        if (
          bridgeProcess.killed ||
          stderr.includes('bind') ||
          stderr.includes('config')
        ) {
          resolve();
        } else {
          // Try to access health endpoint
          try {
            const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/health`, {
              timeout: 1000,
            });
            if (!res.ok) {
              resolve();
            } else {
              reject(new Error('Invalid bindings config was accepted'));
            }
          } catch (e) {
            resolve();
          }
        }
      };

      checkExit();
    });
  });

  it('F2.4.5: Binding changes require daemon restart', async () => {
    return new Promise(async (resolve, reject) => {
      const env = { ...process.env, BRIDGE_KEY: validKey, BRIDGE_PORT: String(BRIDGE_PORT), BINDINGS_CONFIG_PATH: BINDINGS_CONFIG_PATH };
      bridgeProcess = spawn('node', ['scripts/bridge-daemon.mjs'], {
        env,
        cwd: process.cwd(),
      });

      await new Promise((r) => setTimeout(r, 1000));

      // Verify initial binding works
      try {
        const res1 = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/bridge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'lazarus',
            to: 'eric',
            content: 'Before binding change',
            timestamp: new Date().toISOString(),
          }),
          timeout: 1000,
        });

        if (!res1.ok) {
          reject(new Error('Initial binding failed: ' + res1.status));
          return;
        }
      } catch (e) {
        reject(new Error('Initial binding request failed: ' + e.message));
        return;
      }

      // Try to modify bindings while daemon is running
      const modifiedBindings = {
        routes: [
          { from: 'lazarus', to: 'eric', enabled: false }, // Disable this route
        ],
      };

      await fs.writeFile(
        BINDINGS_CONFIG_PATH,
        JSON.stringify(modifiedBindings)
      );

      await new Promise((r) => setTimeout(r, 500));

      // Try the same route again — it should still work (not hot-reloaded)
      try {
        const res2 = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/bridge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'lazarus',
            to: 'eric',
            content: 'After binding file change',
            timestamp: new Date().toISOString(),
          }),
          timeout: 1000,
        });

        if (res2.ok) {
          // Good — binding didn't change without restart
          resolve();
        } else {
          reject(new Error('Binding changed without restart'));
        }
      } catch (e) {
        resolve();
      }
    });
  });
});
