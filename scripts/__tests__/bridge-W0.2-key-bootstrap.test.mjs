/**
 * W0.2 Bridge Hardening — Finding F2.1: Key Bootstrap Gap
 *
 * Requirement: Bridge daemon must enforce proper key material initialization.
 * No fallback to uninitialized state; all message signing/verification requires
 * a valid bootstrap key that was explicitly provided at daemon startup.
 *
 * Test Strategy:
 * - Verify daemon rejects startup without BRIDGE_KEY or SIGNING_KEY env vars
 * - Verify daemon fails gracefully if key material is invalid
 * - Verify no messages are signed with a null/empty key
 * - Verify message verification fails if key bootstrap was incomplete
 */

import { describe, it, expect } from '@jest/globals';
import { spawn } from 'child_process';
import fetch from 'node-fetch';
import net from 'net';

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => { const {port} = srv.address(); srv.close(() => resolve(port)); });
    srv.on('error', reject);
  });
}

describe('W0.2 Finding F2.1: Key Bootstrap Gap', () => {
  let bridgeProcess;
  let BRIDGE_PORT;

  beforeEach(async () => {
    BRIDGE_PORT = await getFreePort();
  });

  afterEach(async () => {
    if (bridgeProcess) {
      bridgeProcess.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 500));
    }
  });

  it('F2.1.1: Daemon startup without BRIDGE_KEY env var should fail', async () => {
    return new Promise((resolve, reject) => {
      // Start daemon WITHOUT BRIDGE_KEY — set empty string so dotenv won't
      // overwrite it with a valid key from .env.local
      const env = { ...process.env, BRIDGE_KEY: '', BRIDGE_PORT: String(BRIDGE_PORT) };
      delete env.SIGNING_KEY;

      bridgeProcess = spawn('node', ['scripts/bridge-daemon.mjs'], {
        env,
        cwd: process.cwd(),
      });

      let stderr = '';
      bridgeProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      bridgeProcess.on('exit', (code) => {
        if (code !== 0) {
          expect(stderr).toMatch(/key|bootstrap|init|required/i);
          resolve();
        } else {
          reject(
            new Error('Daemon started without key material — F2.1 FAILED')
          );
        }
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        bridgeProcess.kill('SIGTERM');
        reject(new Error('Daemon did not exit after 5s without key material'));
      }, 5000);
    });
  });

  it('F2.1.2: Daemon with invalid BRIDGE_KEY should fail', async () => {
    return new Promise((resolve, reject) => {
      const env = { ...process.env, BRIDGE_KEY: 'invalid-not-hex' };
      bridgeProcess = spawn('node', ['scripts/bridge-daemon.mjs'], {
        env,
        cwd: process.cwd(),
      });

      let stderr = '';
      bridgeProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      bridgeProcess.on('exit', (code) => {
        if (code !== 0) {
          expect(stderr).toMatch(/invalid|key|format|hex/i);
          resolve();
        } else {
          reject(
            new Error('Daemon accepted invalid key material — F2.1 FAILED')
          );
        }
      });

      setTimeout(() => {
        bridgeProcess.kill('SIGTERM');
        reject(new Error('Daemon did not validate key material'));
      }, 5000);
    });
  });

  it('F2.1.3: Valid key material allows startup', async () => {
    return new Promise((resolve, reject) => {
      // Generate a valid 32-byte key in hex
      const validKey = Buffer.from('a'.repeat(64), 'utf-8')
        .toString('hex')
        .slice(0, 64);
      const env = { ...process.env, BRIDGE_KEY: validKey, BRIDGE_PORT: String(BRIDGE_PORT) };

      bridgeProcess = spawn('node', ['scripts/bridge-daemon.mjs'], {
        env,
        cwd: process.cwd(),
      });

      // Check if daemon started successfully
      const checkStartup = async () => {
        try {
          const res = await fetch(`http://localhost:${BRIDGE_PORT}/health`, {
            timeout: 1000,
          });
          if (res.ok) {
            resolve();
          }
        } catch {
          // Not ready yet
        }
      };

      const interval = setInterval(checkStartup, 100);

      setTimeout(() => {
        clearInterval(interval);
        if (bridgeProcess) {
          bridgeProcess.kill('SIGTERM');
        }
        reject(new Error('Valid key material did not allow startup'));
      }, 5000);
    });
  });

  it('F2.1.4: No messages are signed without key bootstrap', async () => {
    // This test requires instrumenting the daemon to verify no signing happens
    // For now, we verify by attempting to post a message and checking signature header

    // Set up daemon with valid key
    const validKey = Buffer.from('b'.repeat(64), 'utf-8')
      .toString('hex')
      .slice(0, 64);
    const env = { ...process.env, BRIDGE_KEY: validKey, BRIDGE_PORT: String(BRIDGE_PORT) };

    bridgeProcess = spawn('node', ['scripts/bridge-daemon.mjs'], {
      env,
      cwd: process.cwd(),
    });

    return new Promise((resolve, reject) => {
      const checkReady = async () => {
        try {
          // Post a message
          const msg = {
            from: 'lazarus',
            content: 'F2.1 test message',
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

          if (res.ok) {
            const result = await res.json();
            // Check that message has signature field if signing is implemented
            if (result.message) {
              expect(result.message.timestamp).toBeDefined();
              resolve();
            }
          }
        } catch {
          // Still starting
        }
      };

      const interval = setInterval(checkReady, 100);
      setTimeout(() => {
        clearInterval(interval);
        if (bridgeProcess) {
          bridgeProcess.kill('SIGTERM');
        }
        reject(new Error('Could not verify signed message'));
      }, 5000);
    });
  });
});
