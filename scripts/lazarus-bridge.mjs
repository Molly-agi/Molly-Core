#!/usr/bin/env node
/**
 * Lazarus Bridge Relay (strict mode)
 *
 * Purpose:
 * - Keep an always-on, real-time websocket connection to the bridge.
 * - Relay inbound messages addressed to Lazarus into a local inbox queue.
 * - Relay outbound messages from a local outbox queue to the bridge.
 *
 * Non-goals:
 * - No AI generation
 * - No autonomous status chatter
 * - No pretending to execute commands
 */

import BridgeClient from './bridge-client.mjs';
import { setupWakeListener } from './agent-wake-listener.mjs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LOG_DIR = join(ROOT, 'logs');
const INBOX_FILE = join(LOG_DIR, 'lazarus-relay-inbox.jsonl');
const OUTBOX_FILE = join(LOG_DIR, 'lazarus-relay-outbox.jsonl');
const STATE_FILE = join(ROOT, '.lazarus-relay-state.json');
const PID_FILE = join(ROOT, '.lazarus-relay.pid');

const OUTBOX_CHECK_MS = 1000;

if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

const state = loadState();
const seen = new Set(state.seenIds || []);

function acquireLock() {
  if (existsSync(PID_FILE)) {
    try {
      const oldPid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
      if (oldPid && Number.isFinite(oldPid)) {
        try {
          process.kill(oldPid, 0);
          const cmdline = readFileSync(`/proc/${oldPid}/cmdline`, 'utf8');
          if (cmdline.includes('scripts/lazarus-bridge.mjs')) {
            console.log(`[${new Date().toISOString()}] relay already running pid=${oldPid}`);
            process.exit(0);
          }
        } catch {
          // stale PID lock
        }
      }
    } catch {
      // corrupt lock file
    }
  }

  writeFileSync(PID_FILE, String(process.pid));
}

function releaseLock() {
  try {
    if (!existsSync(PID_FILE)) return;
    const pid = readFileSync(PID_FILE, 'utf8').trim();
    if (pid === String(process.pid)) {
      writeFileSync(PID_FILE, '');
    }
  } catch {
    // non-fatal
  }
}

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    }
  } catch {
    // ignore corrupt state
  }
  return {
    seenIds: [],
    outboxIndex: 0,
  };
}

function saveState() {
  try {
    const seenIds = Array.from(seen).slice(-5000);
    writeFileSync(
      STATE_FILE,
      JSON.stringify(
        {
          seenIds,
          outboxIndex: state.outboxIndex,
          updatedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );
  } catch {
    // non-fatal
  }
}

function shouldRelay(msg) {
  if (!msg || typeof msg !== 'object') return false;
  if (String(msg.from || '').toLowerCase() === 'lazarus') return false;

  const id = String(msg.id || '');
  if (id && seen.has(id)) return false;
  if (id) seen.add(id);

  const to = String(msg.to || '').toLowerCase();
  if (to === 'lazarus' || to === 'all') return true;

  const content = String(msg.content || '').toLowerCase();
  return (
    content.startsWith('lazarus,') ||
    content.startsWith('lazarus ') ||
    content.startsWith('@lazarus')
  );
}

function appendInbox(msg) {
  const envelope = {
    receivedAt: new Date().toISOString(),
    id: String(msg.id || ''),
    from: String(msg.from || 'unknown'),
    to: String(msg.to || ''),
    content: String(msg.content || ''),
    timestamp: String(msg.timestamp || ''),
  };
  appendFileSync(INBOX_FILE, JSON.stringify(envelope) + '\n');
}

function processOutbox() {
  if (!existsSync(OUTBOX_FILE)) return;

  let lines = [];
  try {
    lines = readFileSync(OUTBOX_FILE, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return;
  }

  if (state.outboxIndex > lines.length) {
    state.outboxIndex = lines.length;
  }

  while (state.outboxIndex < lines.length) {
    const line = lines[state.outboxIndex];
    try {
      const payload = JSON.parse(line);
      const content = String(payload.content || '');
      const to = payload.to ? String(payload.to) : undefined;
      if (content) {
        lazarus.send(content, to);
      }
    } catch {
      // skip malformed outbox line
    }
    state.outboxIndex += 1;
  }

  saveState();
}

const lazarus = new BridgeClient('lazarus', 'localhost', 9099);

acquireLock();

setupWakeListener('lazarus', () => {
  // Wake signal only indicates there may be new inbound messages.
  // We already process websocket events in real time.
});

lazarus.on('connected', () => {
  console.log(`[${new Date().toISOString()}] relay connected`);
});

lazarus.on('disconnected', () => {
  console.log(`[${new Date().toISOString()}] relay disconnected`);
});

lazarus.on('reconnecting', ({ attempt }) => {
  console.log(`[${new Date().toISOString()}] relay reconnecting attempt ${attempt}`);
});

lazarus.on('message', (msg) => {
  if (!shouldRelay(msg)) return;

  appendInbox(msg);
  saveState();
});

lazarus.on('error', (err) => {
  console.error(`[${new Date().toISOString()}] relay error: ${err.message}`);
});

lazarus.connect().catch((err) => {
  console.error(`[${new Date().toISOString()}] relay connect failed: ${err.message}`);
  process.exit(1);
});

setInterval(processOutbox, OUTBOX_CHECK_MS);

process.on('SIGTERM', () => {
  saveState();
  releaseLock();
  lazarus.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  saveState();
  releaseLock();
  lazarus.close();
  process.exit(0);
});
