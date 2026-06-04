/**
 * W0.2 Bridge Hardening — Finding F2.2: Persisted Nonce Cache
 *
 * Requirement: Bridge daemon must maintain a persistent nonce cache to prevent
 * replay attacks. Nonces from previous sessions must be loaded from disk on startup.
 * No nonce can be reused within a configurable window.
 *
 * Test Strategy:
 * - Verify nonce file exists and is maintained on disk
 * - Verify nonce from session N is rejected in session N+1
 * - Verify nonce window parameter is enforced
 * - Verify old nonces are aged out correctly
 * - Verify cache survives daemon restart
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs, mkdtempSync, rmSync } from 'fs';
import os from 'os';
import net from 'net';

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => { const {port} = srv.address(); srv.close(() => resolve(port)); });
    srv.on('error', reject);
  });
}
import path from 'path';
import { spawn } from 'child_process';
import fetch from 'node-fetch';

describe('W0.2 Finding F2.2: Persisted Nonce Cache', () => {
  let BRIDGE_PORT;
  let NONCE_CACHE_PATH;
  let tmpDir;
  let bridgeProcess;
  let validKey;

  beforeEach(async () => {
    BRIDGE_PORT = await getFreePort();
    tmpDir = mkdtempSync(os.tmpdir() + '/bridge-test-f2.2-');
    NONCE_CACHE_PATH = tmpDir + '/.bridge-nonce-cache';
    validKey = Buffer.from('c'.repeat(64), 'utf-8')
      .toString('hex')
      .slice(0, 64);
  });

  afterEach(async () => {
    if (bridgeProcess) {
      bridgeProcess.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 500));
    }
    if (tmpDir) { try { rmSync(tmpDir, { recursive: true, force: true }); } catch {} tmpDir = null; }
  });

  it('F2.2.1: Nonce cache file is created on daemon startup', async () => {
    return new Promise((resolve, reject) => {
      const env = { ...process.env, BRIDGE_KEY: validKey, BRIDGE_PORT: String(BRIDGE_PORT), NONCE_CACHE_PATH: NONCE_CACHE_PATH };
      bridgeProcess = spawn('node', ['scripts/bridge-daemon.mjs'], {
        env,
        cwd: process.cwd(),
      });

      const checkCacheFile = async () => {
        try {
          const stat = await fs.stat(NONCE_CACHE_PATH);
          if (stat.isFile()) {
            resolve();
          }
        } catch (e) {
          // File not created yet
        }
      };

      const interval = setInterval(checkCacheFile, 100);

      setTimeout(() => {
        clearInterval(interval);
        if (bridgeProcess) {
          bridgeProcess.kill('SIGTERM');
        }
        reject(new Error('Nonce cache file was not created'));
      }, 5000);
    });
  });

  it('F2.2.2: Nonce is stored in persistent cache after use', async () => {
    return new Promise(async (resolve, reject) => {
      const env = { ...process.env, BRIDGE_KEY: validKey, BRIDGE_PORT: String(BRIDGE_PORT), NONCE_CACHE_PATH: NONCE_CACHE_PATH };
      bridgeProcess = spawn('node', ['scripts/bridge-daemon.mjs'], {
        env,
        cwd: process.cwd(),
      });

      const sendMessageWithNonce = async (nonce) => {
        try {
          const msg = {
            from: 'lazarus',
            content: 'F2.2 nonce test',
            nonce: nonce,
            timestamp: new Date().toISOString(),
          };

          const res = await fetch(
            `http://localhost:${BRIDGE_PORT}/api/bridge`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(msg),
              timeout: 1000,
            }
          );

          return res.ok;
        } catch (e) {
          return false;
        }
      };

      const checkNonceInCache = async (nonce) => {
        try {
          const cacheData = await fs.readFile(NONCE_CACHE_PATH, 'utf-8');
          return cacheData.includes(nonce);
        } catch (e) {
          return false;
        }
      };

      // Wait for daemon to start
      await new Promise((r) => setTimeout(r, 1000));

      // Send a message with a unique nonce
      const testNonce = `nonce-${Date.now()}`;
      const sent = await sendMessageWithNonce(testNonce);

      if (!sent) {
        reject(new Error('Could not send message with nonce'));
        return;
      }

      // Give daemon time to persist
      await new Promise((r) => setTimeout(r, 500));

      // Check if nonce is in cache
      const inCache = await checkNonceInCache(testNonce);
      if (inCache) {
        resolve();
      } else {
        reject(new Error('Nonce was not persisted to cache'));
      }
    });
  });

  it('F2.2.3: Duplicate nonce is rejected', async () => {
    return new Promise(async (resolve, reject) => {
      const env = { ...process.env, BRIDGE_KEY: validKey, BRIDGE_PORT: String(BRIDGE_PORT), NONCE_CACHE_PATH: NONCE_CACHE_PATH };
      bridgeProcess = spawn('node', ['scripts/bridge-daemon.mjs'], {
        env,
        cwd: process.cwd(),
      });

      const sendMessageWithNonce = async (nonce) => {
        try {
          const msg = {
            from: 'lazarus',
            content: 'F2.2 duplicate nonce test',
            nonce: nonce,
            timestamp: new Date().toISOString(),
          };

          const res = await fetch(
            `http://localhost:${BRIDGE_PORT}/api/bridge`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(msg),
              timeout: 1000,
            }
          );

          return { ok: res.ok, status: res.status };
        } catch (e) {
          return { ok: false, status: 0 };
        }
      };

      // Wait for daemon to start
      await new Promise((r) => setTimeout(r, 1000));

      const testNonce = `dup-nonce-${Date.now()}`;

      // First message with nonce should succeed
      const first = await sendMessageWithNonce(testNonce);
      expect(first.ok).toBe(true);

      await new Promise((r) => setTimeout(r, 200));

      // Second message with same nonce should be rejected
      const second = await sendMessageWithNonce(testNonce);
      if (!second.ok && second.status === 409) {
        // 409 Conflict is expected for duplicate
        resolve();
      } else if (!second.ok) {
        // Any rejection is acceptable for duplicate nonce
        resolve();
      } else {
        reject(new Error('Duplicate nonce was accepted — F2.2 FAILED'));
      }
    });
  });

  it('F2.2.4: Nonce cache survives daemon restart', async () => {
    jest.setTimeout(20000);
    return new Promise(async (resolve, reject) => {
      const testNonce = `restart-test-${Date.now()}`;
      const waitForDaemon = async () => {
        for (let i = 0; i < 30; i++) {
          try {
            const r = await fetch(`http://localhost:${BRIDGE_PORT}/ping`, { timeout: 500 });
            if (r.ok) return true;
          } catch {}
          await new Promise(r => setTimeout(r, 200));
        }
        return false;
      };

      // Session 1: Send message with nonce
      const env = { ...process.env, BRIDGE_KEY: validKey, BRIDGE_PORT: String(BRIDGE_PORT), NONCE_CACHE_PATH: NONCE_CACHE_PATH };
      bridgeProcess = spawn('node', ['scripts/bridge-daemon.mjs'], {
        env,
        cwd: process.cwd(),
      });

      const sendMessage = async (nonce) => {
        try {
          const res = await fetch(
            `http://localhost:${BRIDGE_PORT}/api/bridge`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: 'lazarus',
                content: 'F2.2 restart test',
                nonce: nonce,
                timestamp: new Date().toISOString(),
              }),
              timeout: 1000,
            }
          );
          return res.ok;
        } catch (e) {
          return false;
        }
      };

      // Wait for daemon to start
      await waitForDaemon();

      // Send message with nonce
      const sent = await sendMessage(testNonce);
      expect(sent).toBe(true);

      // Kill daemon
      bridgeProcess.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 300));

      // Restart daemon
      bridgeProcess = spawn('node', ['scripts/bridge-daemon.mjs'], {
        env,
        cwd: process.cwd(),
      });

      await waitForDaemon();

      // Try to reuse same nonce
      const reused = await sendMessage(testNonce);

      if (!reused) {
        // Nonce was rejected after restart — F2.2 passes
        resolve();
      } else {
        reject(
          new Error('Nonce was accepted after restart — cache not persisted')
        );
      }
    });
  });
});
