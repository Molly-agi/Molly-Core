#!/usr/bin/env node
/**
 * Lazarus Trigger (from scratch)
 *
 * Single-purpose trigger:
 * 1) Wake Lazarus process immediately.
 * 2) Post a direct bridge message: "check the bridge now".
 *
 * Usage:
 *   node scripts/lazarus-trigger.mjs
 *   node scripts/lazarus-trigger.mjs "custom reason"
 */

import http from 'http';
import { spawn } from 'child_process';

function wakeLazarus() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['scripts/bridge-waker.mjs', 'lazarus'], {
      cwd: '/workspaces/Molly-Core',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let out = '';
    let err = '';
    child.stdout.on('data', (d) => {
      out += String(d);
    });
    child.stderr.on('data', (d) => {
      err += String(d);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(out.trim());
      } else {
        reject(
          new Error(err.trim() || `bridge-waker exited with code ${code}`)
        );
      }
    });
  });
}

function postBridgeInstruction(reasonText) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      agent: 'lazarus',
      reason: reasonText,
      queueInstruction: true,
    });

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 9002,
        path: '/api/bridge/wake',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 5000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += String(chunk);
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body);
          } else {
            reject(
              new Error(`bridge wake failed: HTTP ${res.statusCode} ${body}`)
            );
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy(new Error('bridge POST timed out'));
    });
    req.write(payload);
    req.end();
  });
}

async function main() {
  const reasonText = process.argv.slice(2).join(' ').trim() || 'manual';

  const wakeResult = await wakeLazarus();
  const bridgeResult = await postBridgeInstruction(reasonText);

  console.log(
    JSON.stringify(
      {
        success: true,
        trigger: 'lazarus-trigger',
        reason: reasonText,
        wake: wakeResult,
        bridge: bridgeResult,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(
    JSON.stringify({ success: false, error: err.message }, null, 2)
  );
  process.exit(1);
});
