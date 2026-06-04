/**
 * W0.2 Bridge Hardening — Finding F2.3: Write-Only Quarantine Ledger
 *
 * Requirement: Bridge daemon must maintain an immutable append-only ledger
 * for all quarantined/suspicious messages. Ledger entries can only be appended,
 * never modified or deleted. This provides a complete audit trail.
 *
 * Test Strategy:
 * - Verify quarantine ledger file is write-only (no delete/truncate)
 * - Verify invalid messages are logged to ledger
 * - Verify ledger entries cannot be modified after write
 * - Verify ledger contains full message metadata (timestamp, hash, reason)
 * - Verify ledger survives daemon restart with all entries intact
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

describe('W0.2 Finding F2.3: Write-Only Quarantine Ledger', () => {
  let BRIDGE_PORT;
  let QUARANTINE_LEDGER_PATH;
  let tmpDir;
  let bridgeProcess;
  let validKey;

  beforeEach(async () => {
    BRIDGE_PORT = await getFreePort();
    tmpDir = mkdtempSync(os.tmpdir() + '/bridge-test-f2.3-');
    QUARANTINE_LEDGER_PATH = tmpDir + '/.bridge-quarantine-ledger';
    validKey = Buffer.from('d'.repeat(64), 'utf-8')
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

  it('F2.3.1: Quarantine ledger file is created on daemon startup', async () => {
    return new Promise((resolve, reject) => {
      const env = { ...process.env, BRIDGE_KEY: validKey, BRIDGE_PORT: String(BRIDGE_PORT), QUARANTINE_LEDGER_PATH: QUARANTINE_LEDGER_PATH };
      bridgeProcess = spawn('node', ['scripts/bridge-daemon.mjs'], {
        env,
        cwd: process.cwd(),
      });

      const checkLedgerFile = async () => {
        try {
          const stat = await fs.stat(QUARANTINE_LEDGER_PATH);
          if (stat.isFile()) {
            resolve();
          }
        } catch (e) {
          // File not created yet
        }
      };

      const interval = setInterval(checkLedgerFile, 100);

      setTimeout(() => {
        clearInterval(interval);
        if (bridgeProcess) {
          bridgeProcess.kill('SIGTERM');
        }
        reject(new Error('Quarantine ledger file was not created'));
      }, 5000);
    });
  });

  it('F2.3.2: Invalid message is logged to ledger', async () => {
    return new Promise(async (resolve, reject) => {
      const env = { ...process.env, BRIDGE_KEY: validKey, BRIDGE_PORT: String(BRIDGE_PORT), QUARANTINE_LEDGER_PATH: QUARANTINE_LEDGER_PATH };
      bridgeProcess = spawn('node', ['scripts/bridge-daemon.mjs'], {
        env,
        cwd: process.cwd(),
      });

      const sendInvalidMessage = async (msg) => {
        try {
          const res = await fetch(
            `http://localhost:${BRIDGE_PORT}/api/bridge`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(msg),
              timeout: 1000,
            }
          );
          return res.status;
        } catch (e) {
          return 0;
        }
      };

      // Wait for daemon to start
      await new Promise((r) => setTimeout(r, 1000));

      // Send an invalid message (missing required fields)
      const invalidMsg = { content: 'Missing from field' };
      const status = await sendInvalidMessage(invalidMsg);

      // Invalid messages should be rejected
      expect(status).not.toBe(200);

      // Give daemon time to persist to ledger
      await new Promise((r) => setTimeout(r, 500));

      // Check if ledger contains an entry
      try {
        const ledger = await fs.readFile(QUARANTINE_LEDGER_PATH, 'utf-8');
        if (ledger.length > 0) {
          // Verify it's valid JSON (one entry per line)
          const lines = ledger
            .trim()
            .split('\n')
            .filter((l) => l);
          if (lines.length > 0) {
            const parsed = JSON.parse(lines[0]);
            expect(parsed.reason).toBeDefined();
            resolve();
            return;
          }
        }
      } catch (e) {
        reject(
          new Error('Could not read or parse quarantine ledger: ' + e.message)
        );
      }
    });
  });

  it('F2.3.3: Ledger cannot be truncated or modified', async () => {
    return new Promise(async (resolve, reject) => {
      const env = { ...process.env, BRIDGE_KEY: validKey, BRIDGE_PORT: String(BRIDGE_PORT), QUARANTINE_LEDGER_PATH: QUARANTINE_LEDGER_PATH };
      bridgeProcess = spawn('node', ['scripts/bridge-daemon.mjs'], {
        env,
        cwd: process.cwd(),
      });

      // Wait for daemon to start and generate a quarantine entry
      await new Promise((r) => setTimeout(r, 1000));

      // Send invalid message to populate ledger
      try {
        await fetch(`http://localhost:${BRIDGE_PORT}/api/bridge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'invalid' }),
          timeout: 1000,
        });
      } catch (e) {
        // Expected to fail
      }

      await new Promise((r) => setTimeout(r, 500));

      // Read original ledger
      let originalLedger = '';
      try {
        originalLedger = await fs.readFile(QUARANTINE_LEDGER_PATH, 'utf-8');
      } catch (e) {
        reject(new Error('Ledger not created'));
        return;
      }

      // Attempt to modify ledger (this should fail or be detected)
      try {
        await fs.writeFile(QUARANTINE_LEDGER_PATH, 'TAMPERED', { flag: 'w' });

        // Read it back
        const modified = await fs.readFile(QUARANTINE_LEDGER_PATH, 'utf-8');

        // Ledger should detect tampering or refuse writes
        // Implementation should log this and potentially halt
        if (modified === 'TAMPERED') {
          // Ledger was writable (bad), but daemon might detect this on next write
          // Try to generate another quarantine entry
          try {
            await fetch(`http://localhost:${BRIDGE_PORT}/api/bridge`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: 'another invalid' }),
              timeout: 1000,
            });
          } catch (e) {
            // Expected
          }

          await new Promise((r) => setTimeout(r, 500));

          // Check if daemon detected tampering
          const final = await fs.readFile(QUARANTINE_LEDGER_PATH, 'utf-8');

          // If daemon is strict, it should have logged an integrity violation
          if (final.includes('integrity') || final.includes('tamper')) {
            resolve();
          } else {
            reject(new Error('Ledger tampering was not detected'));
          }
        }
      } catch (e) {
        // Good — file system prevented modification
        resolve();
      }
    });
  });

  it('F2.3.4: Ledger entries include required metadata', async () => {
    return new Promise(async (resolve, reject) => {
      const env = { ...process.env, BRIDGE_KEY: validKey, BRIDGE_PORT: String(BRIDGE_PORT), QUARANTINE_LEDGER_PATH: QUARANTINE_LEDGER_PATH };
      bridgeProcess = spawn('node', ['scripts/bridge-daemon.mjs'], {
        env,
        cwd: process.cwd(),
      });

      await new Promise((r) => setTimeout(r, 1000));

      // Send invalid message
      try {
        await fetch(`http://localhost:${BRIDGE_PORT}/api/bridge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'invalid message' }),
          timeout: 1000,
        });
      } catch (e) {
        // Expected
      }

      await new Promise((r) => setTimeout(r, 500));

      try {
        const ledger = await fs.readFile(QUARANTINE_LEDGER_PATH, 'utf-8');
        const lines = ledger
          .trim()
          .split('\n')
          .filter((l) => l);
        if (lines.length > 0) {
          const entry = JSON.parse(lines[0]);
          expect(entry.timestamp).toBeDefined();
          expect(entry.reason).toBeDefined();
          resolve();
        }
      } catch (e) {
        reject(
          new Error('Ledger entry missing required metadata: ' + e.message)
        );
      }
    });
  });

  it('F2.3.5: Quarantine ledger survives daemon restart', async () => {
    return new Promise(async (resolve, reject) => {
      const env = { ...process.env, BRIDGE_KEY: validKey, BRIDGE_PORT: String(BRIDGE_PORT), QUARANTINE_LEDGER_PATH: QUARANTINE_LEDGER_PATH };

      // Session 1: Generate quarantine entries
      bridgeProcess = spawn('node', ['scripts/bridge-daemon.mjs'], {
        env,
        cwd: process.cwd(),
      });

      await new Promise((r) => setTimeout(r, 1000));

      // Send invalid messages
      for (let i = 0; i < 3; i++) {
        try {
          await fetch(`http://localhost:${BRIDGE_PORT}/api/bridge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: `invalid-${i}` }),
            timeout: 1000,
          });
        } catch (e) {
          // Expected
        }
      }

      await new Promise((r) => setTimeout(r, 500));

      // Read ledger before restart
      let ledgerBefore = '';
      try {
        ledgerBefore = await fs.readFile(QUARANTINE_LEDGER_PATH, 'utf-8');
      } catch (e) {
        reject(new Error('Ledger not created in session 1'));
        return;
      }

      const lineCountBefore = ledgerBefore
        .trim()
        .split('\n')
        .filter((l) => l).length;

      // Kill daemon
      bridgeProcess.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 1000));

      // Session 2: Restart and check ledger persisted
      bridgeProcess = spawn('node', ['scripts/bridge-daemon.mjs'], {
        env,
        cwd: process.cwd(),
      });

      await new Promise((r) => setTimeout(r, 1000));

      try {
        const ledgerAfter = await fs.readFile(QUARANTINE_LEDGER_PATH, 'utf-8');
        const lineCountAfter = ledgerAfter
          .trim()
          .split('\n')
          .filter((l) => l).length;

        if (lineCountAfter >= lineCountBefore) {
          resolve();
        } else {
          reject(new Error('Quarantine ledger was truncated after restart'));
        }
      } catch (e) {
        reject(new Error('Ledger lost after restart: ' + e.message));
      }
    });
  });
});
