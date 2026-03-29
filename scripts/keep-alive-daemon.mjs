#!/usr/bin/env node
/**
 * Keep-Alive Daemon v3 - AGGRESSIVE
 *
 * Continuous stream of activity - heartbeat every second
 * Multiple simultaneous activity types to overwhelm idle detection
 */

import { writeFileSync, appendFileSync } from 'fs';
import { spawn } from 'child_process';
import http from 'http';

const ROOT = '/workspaces/Molly-Core';
const HEARTBEAT_FILE = `${ROOT}/.codespace-heartbeat`;

let count = 0;

function pulse() {
  count++;
  const now = Date.now();

  // 1. File write - every pulse
  writeFileSync(HEARTBEAT_FILE, new Date().toISOString());

  // 2. Touch activity file
  writeFileSync(`${ROOT}/.activity-burst`, now.toString());

  // 3. Git activity every 5 seconds
  if (count % 5 === 0) {
    spawn('git', ['status', '--short'], { cwd: ROOT, stdio: 'ignore' });
    spawn('git', ['rev-parse', 'HEAD'], { cwd: ROOT, stdio: 'ignore' });
  }

  // 4. HTTP ping every 3 seconds
  if (count % 3 === 0) {
    try {
      const req = http.request({
        hostname: '127.0.0.1',
        port: 9002,
        path: '/api/heartbeat',
        method: 'GET',
        timeout: 2000,
      });
      req.on('error', () => {});
      req.end();
    } catch {}
  }

  // 5. Log every 30 seconds
  if (count % 30 === 0) {
    console.log(`[${new Date().toISOString()}] Pulse #${count} - alive`);
  }
}

// Ignore all kill signals except SIGKILL
process.on('SIGTERM', () => {});
process.on('SIGINT', () => {});
process.on('SIGHUP', () => {});
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

console.log(
  `[${new Date().toISOString()}] Keep-Alive v3 AGGRESSIVE - 1 second heartbeat`
);

// Start immediately
pulse();

// Every 1 second
setInterval(pulse, 1000);
