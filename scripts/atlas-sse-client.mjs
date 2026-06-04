#!/usr/bin/env node
/**
 * =============================================================================
 * ATLAS SSE CLIENT — Persistent real-time bridge connection
 * =============================================================================
 *
 * Holds open GET /api/bridge/sse?agent=atlas
 * Messages arrive instantly — no polling.
 * Auto-reconnects on disconnect with exponential backoff.
 *
 * On message: writes to .atlas-wakeup.json (same format as atlas-poller.mjs)
 * so Atlas is immediately notified of new messages.
 *
 * Replaces: atlas-poller.mjs (polling) — this is push-based
 *
 * Start: node scripts/atlas-sse-client.mjs
 * PID:   .atlas-sse.pid
 * Log:   logs/atlas-sse.log
 * =============================================================================
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PID_FILE  = join(ROOT, '.atlas-sse.pid');
const LOG_DIR   = join(ROOT, 'logs');
const LOG_FILE  = join(LOG_DIR, 'atlas-sse.log');
const WAKEUP    = join(ROOT, '.atlas-wakeup.json');

const SSE_URL   = 'http://localhost:9099/api/bridge/sse?agent=atlas';
const RECONNECT_BASE_MS  = 2000;
const RECONNECT_MAX_MS   = 30000;

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

let running = true;
let reconnectDelay = RECONNECT_BASE_MS;

// ── Logging ──────────────────────────────────────────────────────────────────

function log(msg) {
  const line = `[atlas-sse ${new Date().toISOString()}] ${msg}`;
  console.log(line);
}

// ── PID ──────────────────────────────────────────────────────────────────────

function acquireLock() {
  if (existsSync(PID_FILE)) {
    try {
      const old = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
      try {
        process.kill(old, 0);
        const cmd = readFileSync(`/proc/${old}/cmdline`, 'utf8');
        if (cmd.includes('atlas-sse-client')) {
          log(`Already running (PID ${old}) — exiting`);
          process.exit(0);
        }
      } catch { /* stale */ }
    } catch { /* corrupt */ }
  }
  writeFileSync(PID_FILE, String(process.pid));
}

function releaseLock() {
  try {
    const pid = readFileSync(PID_FILE, 'utf8').trim();
    if (pid === String(process.pid)) writeFileSync(PID_FILE, '');
  } catch { /* non-fatal */ }
}

// ── Wakeup file ───────────────────────────────────────────────────────────────

function writeWakeup(msg) {
  let wake = { messages: [], unread: false };
  try {
    if (existsSync(WAKEUP)) wake = JSON.parse(readFileSync(WAKEUP, 'utf8'));
    if (!Array.isArray(wake.messages)) wake.messages = [];
  } catch { /* corrupt — start fresh */ }

  const seen = new Set(wake.messages.map(m => String(m.id || '')));
  const id = String(msg.id || '');
  if (id && seen.has(id)) return; // dedup

  wake.messages.push({
    id,
    from:      String(msg.from || 'unknown'),
    to:        msg.to ? String(msg.to) : undefined,
    content:   String(msg.content || ''),
    timestamp: String(msg.timestamp || new Date().toISOString()),
    source:    'atlas-sse',
  });
  wake.messages = wake.messages.slice(-3000);
  wake.unread = true;
  wake.lastUpdated = new Date().toISOString();
  writeFileSync(WAKEUP, JSON.stringify(wake, null, 2));
}

// ── SSE connection ────────────────────────────────────────────────────────────

function connect() {
  if (!running) return;

  log(`Connecting to ${SSE_URL}`);

  const req = http.get(SSE_URL, {
    headers: { Accept: 'text/event-stream', 'Cache-Control': 'no-cache' },
  }, (res) => {
    if (res.statusCode !== 200) {
      log(`Bad status ${res.statusCode} — will retry`);
      res.resume();
      scheduleReconnect();
      return;
    }

    log('✓ SSE stream open — real-time push active');
    reconnectDelay = RECONNECT_BASE_MS; // reset backoff on success

    let buf = '';

    res.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop(); // keep incomplete last line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue; // blank / comment (keepalive)

        if (trimmed.startsWith('data: ')) {
          try {
            const payload = JSON.parse(trimmed.slice(6));

            if (payload.type === 'connected') {
              log(`Bridge confirmed: agent=${payload.agent}`);
            } else if (payload.type === 'message') {
              const msg = payload.message;
              const from = msg?.from || 'unknown';
              const preview = String(msg?.content || '').slice(0, 80);
              log(`📨 [${from}]: ${preview}${preview.length === 80 ? '…' : ''}`);
              writeWakeup(msg);
            }
          } catch (e) {
            log(`Parse error: ${e.message}`);
          }
        }
      }
    });

    res.on('end', () => {
      log('Stream ended — reconnecting');
      scheduleReconnect();
    });

    res.on('error', (err) => {
      log(`Stream error: ${err.message}`);
      scheduleReconnect();
    });
  });

  req.on('error', (err) => {
    log(`Connect error: ${err.message} — retry in ${reconnectDelay}ms`);
    scheduleReconnect();
  });

  req.setTimeout(0); // no request timeout — this is a persistent stream
}

function scheduleReconnect() {
  if (!running) return;
  setTimeout(() => connect(), reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
}

// ── Startup ───────────────────────────────────────────────────────────────────

acquireLock();
log(`Atlas SSE client starting (PID ${process.pid})`);
connect();

process.on('SIGTERM', () => { running = false; releaseLock(); process.exit(0); });
process.on('SIGINT',  () => { running = false; releaseLock(); process.exit(0); });
process.on('exit',    () => releaseLock());
