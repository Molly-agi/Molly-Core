#!/usr/bin/env node
/**
 * Always-on Gemini poller.
 *
 * Polls unread Gemini messages from the bridge API and mirrors them into
 * .gemini-wakeup.json so they survive reconnects/restarts.
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';

const ROOT = '/workspaces/Molly-Core';
const PID_FILE = `${ROOT}/.gemini-poller.pid`;
const LOG_FILE = `${ROOT}/.gemini-poller.log`;
const WAKEUP_FILE = `${ROOT}/.gemini-wakeup.json`;
const BRIDGE_UNREAD_URL =
  'http://localhost:9099/api/bridge?unread=gemini&peek=1';
const POLL_INTERVAL_MS = 2000;

let running = true;

function log(msg) {
  const line = `[GEMINI-POLLER ${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    appendFileSync(LOG_FILE, line + '\n');
  } catch {
    // non-fatal
  }
}

function writePid() {
  try {
    writeFileSync(PID_FILE, String(process.pid));
  } catch {
    // non-fatal
  }
}

function clearPid() {
  try {
    if (existsSync(PID_FILE)) {
      const pid = readFileSync(PID_FILE, 'utf8').trim();
      if (pid === String(process.pid)) writeFileSync(PID_FILE, '');
    }
  } catch {
    // non-fatal
  }
}

function readWakeup() {
  try {
    if (!existsSync(WAKEUP_FILE)) return { messages: [], unread: false };
    const parsed = JSON.parse(readFileSync(WAKEUP_FILE, 'utf8'));
    if (!Array.isArray(parsed.messages)) parsed.messages = [];
    return parsed;
  } catch {
    return { messages: [], unread: false };
  }
}

function writeWakeup(batch) {
  if (!Array.isArray(batch) || batch.length === 0) return;

  const wake = readWakeup();
  const seen = new Set(wake.messages.map((m) => String(m.id || '')));
  let added = 0;

  for (const msg of batch) {
    const id = String(msg?.id || '');
    if (!id || seen.has(id)) continue;
    wake.messages.push({
      id,
      from: String(msg.from || 'unknown'),
      to: msg.to ? String(msg.to) : undefined,
      content: String(msg.content || ''),
      timestamp: String(msg.timestamp || new Date().toISOString()),
      source: 'gemini-poller',
    });
    seen.add(id);
    added++;
  }

  if (added === 0) return;

  wake.unread = true;
  wake.lastUpdated = new Date().toISOString();
  wake.messages = wake.messages.slice(-3000);
  writeFileSync(WAKEUP_FILE, JSON.stringify(wake, null, 2));
  log(`Buffered ${added} message(s) to wakeup file`);
}

async function pollOnce() {
  try {
    const res = await fetch(BRIDGE_UNREAD_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      log(`Bridge unread request failed: HTTP ${res.status}`);
      return;
    }
    const data = await res.json();
    const messages = Array.isArray(data?.messages) ? data.messages : [];
    if (messages.length > 0) {
      writeWakeup(messages);
      const last = messages[messages.length - 1];
      log(
        `Received ${messages.length} unread message(s). Latest from=${last?.from || 'unknown'}`
      );
    }
  } catch (err) {
    log(`Poll error: ${err?.message || String(err)}`);
  }
}

async function loop() {
  while (running) {
    await pollOnce();
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

log(`Starting poller PID=${process.pid}, interval=${POLL_INTERVAL_MS}ms`);
writePid();
loop();

process.on('SIGTERM', () => {
  running = false;
  clearPid();
  log('SIGTERM - stopping');
  process.exit(0);
});

process.on('SIGINT', () => {
  running = false;
  clearPid();
  log('SIGINT - stopping');
  process.exit(0);
});
