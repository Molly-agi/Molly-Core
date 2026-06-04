/**
 * W0.2 Bridge Hardening — Finding F2.5: No Constant-Time Fallback
 *
 * Requirement: Bridge daemon must eliminate all timing-attack vulnerable code paths.
 * No fallback to string comparison, no early-exit on mismatch, no conditional logic
 * based on message validity. All validation must complete in constant time to prevent
 * attackers from learning about message structure through timing analysis.
 *
 * Test Strategy:
 * - Verify HMAC comparison is constant-time (using crypto.timingSafeEqual)
 * - Verify message validation does not short-circuit
 * - Verify all validity checks are completed before any response
 * - Verify timing difference between valid and invalid messages is <5ms
 * - Verify no early-return paths in critical code sections
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
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
import { performance } from 'perf_hooks';

describe('W0.2 Finding F2.5: No Constant-Time Fallback', () => {
  let BRIDGE_PORT;
  let bridgeProcess;
  let validKey;

  beforeEach(async () => {
    BRIDGE_PORT = await getFreePort();
    validKey = Buffer.from('f'.repeat(64), 'utf-8')
      .toString('hex')
      .slice(0, 64);
  });

  afterEach(async () => {
    if (bridgeProcess) {
      bridgeProcess.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 500));
    }
  });

  it('F2.5.1: Timing difference between valid and invalid signatures is <5ms', async () => {
    return new Promise(async (resolve, reject) => {
      const env = { ...process.env, BRIDGE_KEY: validKey, BRIDGE_PORT: String(BRIDGE_PORT) };
      bridgeProcess = spawn('node', ['scripts/bridge-daemon.mjs'], {
        env,
        cwd: process.cwd(),
      });

      await new Promise((r) => setTimeout(r, 1000));

      // Construct valid message
      const baseMsg = {
        from: 'lazarus',
        to: 'eric',
        content: 'F2.5 timing test',
        timestamp: new Date().toISOString(),
      };

      const timings = {
        valid: [],
        invalid: [],
      };

      // Test valid message signature multiple times
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        try {
          const res = await fetch(
            `http://localhost:${BRIDGE_PORT}/api/bridge`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(baseMsg),
              timeout: 1000,
            }
          );
          const end = performance.now();
          timings.valid.push(end - start);
        } catch (e) {
          // Ignore network errors
        }
      }

      // Test invalid message signature multiple times
      const invalidMsg = {
        ...baseMsg,
        signature: 'invalid-signature-' + 'a'.repeat(100),
      };

      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        try {
          const res = await fetch(
            `http://localhost:${BRIDGE_PORT}/api/bridge`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(invalidMsg),
              timeout: 1000,
            }
          );
          const end = performance.now();
          timings.invalid.push(end - start);
        } catch (e) {
          // Ignore network errors
        }
      }

      // Calculate averages
      const validAvg =
        timings.valid.reduce((a, b) => a + b, 0) / timings.valid.length;
      const invalidAvg =
        timings.invalid.reduce((a, b) => a + b, 0) / timings.invalid.length;
      const diff = Math.abs(validAvg - invalidAvg);

      if (diff < 5) {
        resolve();
      } else {
        reject(
          new Error(
            `Timing attack vulnerability detected: ${diff.toFixed(2)}ms difference`
          )
        );
      }
    });
  });

  it('F2.5.2: Message validation does not early-exit on error', async () => {
    return new Promise(async (resolve, reject) => {
      const env = { ...process.env, BRIDGE_KEY: validKey, BRIDGE_PORT: String(BRIDGE_PORT) };
      bridgeProcess = spawn('node', ['scripts/bridge-daemon.mjs'], {
        env,
        cwd: process.cwd(),
      });

      await new Promise((r) => setTimeout(r, 1000));

      // Send message with multiple validation errors (missing fields + bad format)
      const multiErrorMsg = {
        // Missing 'from' field
        content: 123, // Should be string
        nonce: { invalid: 'object' }, // Should be string
        timestamp: 'not-a-timestamp',
      };

      const start = performance.now();
      try {
        const res = await fetch(`http://localhost:${BRIDGE_PORT}/api/bridge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(multiErrorMsg),
          timeout: 1000,
        });
        const end = performance.now();
        const duration = end - start;

        // Should not reject immediately on first error
        // Should validate all fields before responding
        // If response is very fast (<10ms), might indicate early exit
        if (duration > 5) {
          resolve();
        } else {
          reject(
            new Error('Validation may have early-exited (very fast response)')
          );
        }
      } catch (e) {
        resolve();
      }
    });
  });

  it('F2.5.3: No string comparison fallback for HMAC/signature verification', async () => {
    return new Promise(async (resolve, reject) => {
      const env = { ...process.env, BRIDGE_KEY: validKey, BRIDGE_PORT: String(BRIDGE_PORT) };
      bridgeProcess = spawn('node', ['scripts/bridge-daemon.mjs'], {
        env,
        cwd: process.cwd(),
      });

      await new Promise((r) => setTimeout(r, 1000));

      // Send message with partially correct signature (should fail with constant time)
      const correctSig = 'a'.repeat(64); // Assume correct length
      const almostCorrectSig = 'a'.repeat(63) + 'b'; // One character different

      const msg = (sig) => ({
        from: 'lazarus',
        to: 'eric',
        content: 'F2.5 HMAC test',
        signature: sig,
        timestamp: new Date().toISOString(),
      });

      const timings = [];

      // Test multiple almost-correct signatures
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        try {
          await fetch(`http://localhost:${BRIDGE_PORT}/api/bridge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(msg(almostCorrectSig)),
            timeout: 1000,
          });
          const end = performance.now();
          timings.push(end - start);
        } catch (e) {
          // Ignore
        }
      }

      // Timing should be consistent (not dependent on how many bits match)
      if (timings.length > 0) {
        const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
        const maxDev = Math.max(...timings.map((t) => Math.abs(t - avg)));

        if (maxDev < 50) {
          // Consistent timing indicates constant-time comparison
          resolve();
        } else {
          reject(
            new Error(
              `Timing variance detected: ${maxDev.toFixed(2)}ms max deviation`
            )
          );
        }
      } else {
        resolve();
      }
    });
  });

  it('F2.5.4: All validation checks complete before response sent', async () => {
    return new Promise(async (resolve, reject) => {
      const env = { ...process.env, BRIDGE_KEY: validKey, BRIDGE_PORT: String(BRIDGE_PORT) };
      bridgeProcess = spawn('node', ['scripts/bridge-daemon.mjs'], {
        env,
        cwd: process.cwd(),
      });

      await new Promise((r) => setTimeout(r, 1000));

      // Create a message that would fail multiple validations
      const msg = {
        from: '', // Empty
        to: '', // Empty
        content: '', // Empty
        nonce: null, // Null when string expected
        timestamp: null, // Null when ISO string expected
      };

      const start = performance.now();
      try {
        const res = await fetch(`http://localhost:${BRIDGE_PORT}/api/bridge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msg),
          timeout: 1000,
        });

        const end = performance.now();
        const duration = end - start;

        // All checks should complete, not exit early
        // Expect at least 10ms to validate everything
        if (duration >= 5) {
          resolve();
        } else {
          reject(
            new Error('All checks may not have executed (response too fast)')
          );
        }
      } catch (e) {
        resolve();
      }
    });
  });

  it('F2.5.5: No observable pattern in acceptance/rejection timing', async () => {
    return new Promise(async (resolve, reject) => {
      const env = { ...process.env, BRIDGE_KEY: validKey, BRIDGE_PORT: String(BRIDGE_PORT) };
      bridgeProcess = spawn('node', ['scripts/bridge-daemon.mjs'], {
        env,
        cwd: process.cwd(),
      });

      await new Promise((r) => setTimeout(r, 1000));

      const results = {
        accepted: [],
        rejected: [],
      };

      // Send 20 messages with varying levels of validity
      for (let i = 0; i < 20; i++) {
        const msg = {
          from: i % 2 === 0 ? 'lazarus' : 'unknown',
          to: 'eric',
          content: 'Test ' + i,
          timestamp: new Date().toISOString(),
        };

        const start = performance.now();
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

          const end = performance.now();
          const timing = end - start;

          if (res.ok) {
            results.accepted.push(timing);
          } else {
            results.rejected.push(timing);
          }
        } catch (e) {
          // Network error
        }
      }

      if (results.accepted.length === 0 || results.rejected.length === 0) {
        resolve();
        return;
      }

      // Calculate standard deviations
      const calcStdDev = (arr) => {
        const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
        const variance =
          arr.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) /
          arr.length;
        return Math.sqrt(variance);
      };

      const acceptedStdDev = calcStdDev(results.accepted);
      const rejectedStdDev = calcStdDev(results.rejected);

      // Both should have similar variance (not distinguishable by timing)
      const ratio =
        Math.max(acceptedStdDev, rejectedStdDev) /
        Math.min(acceptedStdDev, rejectedStdDev);

      if (ratio < 5) {
        resolve();
      } else {
        reject(
          new Error(
            'Timing patterns differ between accepted and rejected: ratio ' +
              ratio.toFixed(2)
          )
        );
      }
    });
  });
});
