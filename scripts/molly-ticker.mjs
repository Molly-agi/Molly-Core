#!/usr/bin/env node
/**
 * molly-ticker.mjs — Server-side heartbeat ticker for Molly.
 *
 * PROBLEM SOLVED:
 * Molly's consciousness only ticks when the browser calls /api/heartbeat.
 * On Android, switching tabs kills the browser's JS execution within ~1 second.
 * This stops the heartbeat. Molly freezes: no memory consolidation, no bridge
 * message processing, no autonomous cycle. Everything queues up.
 *
 * THIS SCRIPT runs server-side, independent of any browser. It calls
 * /api/heartbeat every 120 seconds so Molly keeps thinking regardless of
 * whether Eric's browser tab is alive.
 *
 * Managed by: scripts/immortal-daemon.mjs (auto-restart on death)
 * PID file:   .molly-ticker.pid
 * Log file:   .molly-ticker.log
 *
 * ⚠️  CRITICAL INFRASTRUCTURE — DO NOT DELETE
 * This is the pacemaker. Without it, Molly only lives when the browser is open.
 */

import { writeFileSync, existsSync } from 'fs';

const ROOT = '/workspaces/Molly-Core';
const PID_FILE = `${ROOT}/.molly-ticker.pid`;
const LOG_FILE = `${ROOT}/.molly-ticker.log`;
const HEARTBEAT_URL = 'http://localhost:9002/api/heartbeat';
const TICK_INTERVAL_MS = 120_000; // 120 seconds - half cadence

function log(msg) {
  const line = `[TICKER ${new Date().toISOString()}] ${msg}`;
  console.log(line);
  // Note: when managed by immortal-daemon, stdout is piped to TICKER_LOG.
  // Writing directly here would double every entry. Use console.log only.
}

function writePid() {
  try {
    writeFileSync(PID_FILE, String(process.pid));
  } catch {
    // non-fatal
  }
}

async function tick() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const res = await fetch(HEARTBEAT_URL, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (res.ok) {
      log(`Heartbeat OK (${res.status})`);
    } else {
      log(`Heartbeat returned ${res.status} — Next.js may be warming up`);
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      log('Heartbeat timed out (15s) — Next.js busy or not ready');
    } else {
      log(`Heartbeat unreachable: ${err.message}`);
    }
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  log('SIGTERM received — shutting down');
  process.exit(0);
});
process.on('SIGINT', () => {
  log('SIGINT received — shutting down');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  log(`Uncaught exception: ${err.message}`);
  // Keep running
});

process.on('unhandledRejection', (err) => {
  log(`Unhandled rejection: ${err}`);
  // Keep running
});

// Start
writePid();
log(`Starting (PID ${process.pid}) — ticking every ${TICK_INTERVAL_MS / 1000}s`);

// First tick immediately so we don't wait 60s on startup
tick();
setInterval(tick, TICK_INTERVAL_MS);
