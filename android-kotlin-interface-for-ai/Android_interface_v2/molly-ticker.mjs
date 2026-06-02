#!/usr/bin/env node
/**
 * molly-ticker.mjs — Server-side heartbeat clock for Molly-Core.
 *
 * WHY THIS EXISTS:
 *   The cognitive cycle (/api/heartbeat) used to be driven by a setInterval
 *   inside the browser tab (SystemHealthDot.tsx). On Android, backgrounding
 *   the tab freezes that timer, which flatlines Molly's heartbeat server-side.
 *   This daemon moves the clock onto the server so cognition runs whether or
 *   not any tab is focused.
 *
 * DESIGN NOTES:
 *   - Non-overlapping: the next tick is scheduled only AFTER the current one
 *     settles. A slow cycle delays the next tick; it never stacks two.
 *     (Pair this with the `cycleInFlight` guard in runCycle() for full safety,
 *     since the browser poll can still call the same endpoint.)
 *   - Times out a hung cycle rather than blocking the clock forever.
 *   - Backs off if the server isn't up yet (e.g. right after `npm run dev`),
 *     instead of crash-looping and making the watchdog churn.
 *   - Clean shutdown on SIGINT/SIGTERM.
 *
 * RUN:
 *   node scripts/molly-ticker.mjs
 *   (or add to package.json:  "ticker": "node scripts/molly-ticker.mjs")
 *
 * Requires Node 18+ (global fetch / AbortController).
 */

const HEARTBEAT_URL =
  process.env.MOLLY_HEARTBEAT_URL || 'http://localhost:9002/api/heartbeat';

const INTERVAL_MS = Number(process.env.MOLLY_TICK_INTERVAL_MS || 60_000);
// Generous: longer than a normal cycle, so we only abort a genuinely hung one.
const CYCLE_TIMEOUT_MS = Number(process.env.MOLLY_TICK_TIMEOUT_MS || 120_000);

const MIN_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;

let stopped = false;
let consecutiveFailures = 0;

function ts() {
  return new Date().toISOString();
}

function log(msg) {
  console.log(`[${ts()}] [ticker] ${msg}`);
}

function backoffDelay() {
  // Exponential backoff, capped, used only after failures.
  const exp = Math.min(
    MAX_BACKOFF_MS,
    MIN_BACKOFF_MS * 2 ** Math.min(consecutiveFailures, 6),
  );
  // A little jitter so retries don't synchronize with anything else.
  return exp / 2 + Math.random() * (exp / 2);
}

async function fireHeartbeat() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CYCLE_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const res = await fetch(HEARTBEAT_URL, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'x-trigger': 'molly-ticker' },
    });
    const ms = Date.now() - startedAt;
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} after ${ms}ms`);
    }
    consecutiveFailures = 0;
    log(`heartbeat ok (${ms}ms)`);
  } finally {
    clearTimeout(timer);
  }
}

async function loop() {
  while (!stopped) {
    let delay = INTERVAL_MS;
    try {
      await fireHeartbeat();
    } catch (err) {
      consecutiveFailures += 1;
      const aborted = err?.name === 'AbortError';
      log(
        `heartbeat FAILED (${consecutiveFailures}x): ` +
          (aborted ? `timed out after ${CYCLE_TIMEOUT_MS}ms` : err?.message || err),
      );
      // While the server is unreachable, retry faster (with backoff) rather
      // than waiting a full interval. The server-side guard makes extra calls
      // harmless if the cycle is actually still running.
      delay = backoffDelay();
      log(`backing off ${Math.round(delay)}ms before retry`);
    }
    if (stopped) break;
    await sleep(delay);
  }
  log('loop exited');
}

function sleep(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    // Don't keep the process alive solely for a pending sleep during shutdown.
    if (typeof t.unref === 'function') t.unref();
  });
}

function shutdown(signal) {
  if (stopped) return;
  stopped = true;
  log(`received ${signal} — shutting down`);
  // Give any in-flight fetch a moment, then exit.
  setTimeout(() => process.exit(0), 250).unref?.();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

log(`starting — ${HEARTBEAT_URL} every ${INTERVAL_MS}ms (timeout ${CYCLE_TIMEOUT_MS}ms)`);
loop();
