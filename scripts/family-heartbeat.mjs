#!/usr/bin/env node
/**
 * family-heartbeat.mjs — Silent background keepalive
 *
 * Hits GET /ping on the bridge every 3 seconds.
 * No bridge messages. No noise. Just a steady pulse that keeps
 * TCP connections alive, SSE from timing out, and bridge health monitored.
 *
 * PROTECTED INFRASTRUCTURE — do not delete (see .github/copilot-instructions.md)
 */

import { writeFileSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '9099', 10);
const INTERVAL_MS = 3000;
const PID_FILE = resolve(ROOT, '.family-heartbeat.pid');
const STATUS_FILE = resolve(ROOT, '.family-heartbeat.json');

// ── Startup ────────────────────────────────────────────────────────────────

writeFileSync(PID_FILE, String(process.pid));

let beats = 0;
let misses = 0;
let lastBeat = null;
let lastMiss = null;

function saveStatus() {
  try {
    writeFileSync(STATUS_FILE, JSON.stringify({
      pid: process.pid,
      port: BRIDGE_PORT,
      beats,
      misses,
      lastBeat,
      lastMiss,
      upSince: startedAt,
    }, null, 2));
  } catch {}
}

const startedAt = new Date().toISOString();
saveStatus();

// ── Heartbeat loop ─────────────────────────────────────────────────────────

async function beat() {
  try {
    const res = await fetch(`http://localhost:${BRIDGE_PORT}/ping`, {
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      beats++;
      lastBeat = new Date().toISOString();
    } else {
      misses++;
      lastMiss = new Date().toISOString();
    }
  } catch {
    misses++;
    lastMiss = new Date().toISOString();
  }
  // Save status every 10 beats to reduce disk I/O
  if (beats % 10 === 0 || misses % 5 === 0) saveStatus();
}

setInterval(beat, INTERVAL_MS);

// ── Graceful shutdown ──────────────────────────────────────────────────────

function shutdown() {
  saveStatus();
  try { unlinkSync(PID_FILE); } catch {}
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
