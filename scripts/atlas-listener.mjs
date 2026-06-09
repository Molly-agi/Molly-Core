#!/usr/bin/env node
/**
 * =============================================================================
 * ATLAS LISTENER — Real-Time Bridge Daemon (WebSocket)
 * =============================================================================
 *
 * Gives Atlas a persistent real-time presence on the family bridge.
 * Connects to the bridge, identifies as 'atlas', and outputs messages as
 * newline-delimited JSON for consumption by CLI tools and external processes.
 *
 * How it works:
 *   1. Connects to the bridge via WebSocket (ws://localhost:9099)
 *   2. Identifies as 'atlas' — bridge immediately pushes any unread messages
 *   3. On every new message event, outputs newline-delimited JSON to stdout
 *   4. Listens for wake signals (SIGUSR1 + file watch) to trigger immediate checks
 *   5. Optionally sends responses back over WebSocket
 *
 * Latency: ~0ms signal notification + instant WebSocket push = real-time awareness
 *
 * Reconnects automatically if the bridge restarts.
 *
 * Run:
 *   node scripts/atlas-listener.mjs        (foreground)
 *   npm run atlas:listen                   (foreground, same)
 *   npm run atlas:listen:bg                (background daemon)
 *
 * Stop:
 *   kill $(cat .atlas-listener.pid)
 *
 * =============================================================================
 */

import { execFile } from 'child_process';
import {
  writeFileSync,
  readFileSync,
  existsSync,
  unlinkSync,
  appendFileSync,
  watchFile,
} from 'fs';
import { WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BRIDGE_WS = 'ws://localhost:9099';
const RECONNECT_DELAY_MS = 3000;
const PID_FILE = `${ROOT}/.atlas-listener.pid`;
const LOG_FILE = `${ROOT}/.atlas-listener.log`;
const WAKE_FILE = `${ROOT}/.bridge-wake/.atlas-wake`;
const ATLAS_TTY_FILE = `${ROOT}/.atlas-terminal.path`;

let running = true;
let messagesProcessed = 0;
let processing = false;
let ws = null;
let lastWakeTime = 0;
const WAKE_DEDUPE_MS = 500; // Ignore duplicate wake signals within 500ms

function detectAddressedTo(content) {
  const text = String(content || '').trim();
  const match = text.match(/^(atlas|molly|lazarus|eric|everyone|all)[,:\s]/i);
  if (!match) return null;
  const target = match[1].toLowerCase();
  return target === 'everyone' ? 'all' : target;
}

function shouldAtlasRespond(msg) {
  if (!msg || msg.from === "atlas") return false;

  const explicitTo = String(msg.to || "").toLowerCase();
  const addressedTo = detectAddressedTo(msg.content);
  const effectiveTo = explicitTo || addressedTo;

  // Atlas responds to:
  // - "atlas ..." (or to=atlas) => Atlas processes
  // - "everyone ..." (or to=all) => Atlas processes (broadcast)
  // - "molly ..." / "lazarus ..." / "eric ..." => Atlas stays silent
  if (effectiveTo === "atlas" || effectiveTo === "all") {
    return true;
  }
  return false;
}

// =============================================================================
// LOGGING
// =============================================================================
function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  const line = `[ATLAS-LISTENER ${ts}] ${msg}`;
  console.error(line); // Use stderr for logs, stdout for JSON output
  try {
    appendFileSync(LOG_FILE, line + '\n');
    const content = readFileSync(LOG_FILE, 'utf8');
    const lines = content.split('\n');
    if (lines.length > 500)
      writeFileSync(LOG_FILE, lines.slice(-300).join('\n') + '\n');
  } catch {
    /* non-fatal */
  }
}

// =============================================================================
// JSON OUTPUT (to stdout for piping)
// =============================================================================
function outputJson(obj) {
  console.log(JSON.stringify(obj));
}

// =============================================================================
// TTY MIRROR — write incoming messages to Atlas's dedicated terminal
// =============================================================================
function getAtlasTtyPath() {
  try {
    if (!existsSync(ATLAS_TTY_FILE)) return null;
    const tty = readFileSync(ATLAS_TTY_FILE, 'utf8').trim();
    if (!tty || !existsSync(tty)) return null;
    return tty;
  } catch {
    return null;
  }
}

function writeToAtlasTty(block) {
  const tty = getAtlasTtyPath();
  if (!tty) return false;
  try {
    appendFileSync(tty, block);
    return true;
  } catch (err) {
    log(`TTY write failed (${tty}): ${err.message}`);
    return false;
  }
}

function formatMessageForTty(msg) {
  const from = (msg.from || 'unknown').toUpperCase();
  const ts = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
  const bar = '█'.repeat(70);
  return `\n${bar}\n📨 MESSAGE FROM: ${from} [${ts}]\n${bar}\n${msg.content}\n${bar}\n\n`;
}

// =============================================================================
// PID MANAGEMENT
// =============================================================================
function writePid() {
  try {
    writeFileSync(PID_FILE, String(process.pid));
  } catch {
    /* non-fatal */
  }
}

function clearPid() {
  try {
    if (existsSync(PID_FILE)) {
      const saved = readFileSync(PID_FILE, 'utf8').trim();
      if (saved === String(process.pid)) unlinkSync(PID_FILE);
    }
  } catch {
    /* non-fatal */
  }
}

// =============================================================================
// WAKE SIGNAL HANDLERS
// =============================================================================
function setupWakeHandlers() {
  // SIGUSR1 handler (primary, <1ms)
  process.on('SIGUSR1', () => {
    const now = Date.now();
    if (now - lastWakeTime > WAKE_DEDUPE_MS) {
      log('Woken by SIGUSR1 signal');
      lastWakeTime = now;
      checkBridgeNow();
    }
  });

  // File watch handler (fallback, ~5s)
  watchFile(WAKE_FILE, { interval: 5000 }, (curr, prev) => {
    if (curr.mtime > prev.mtime) {
      const now = Date.now();
      if (now - lastWakeTime > WAKE_DEDUPE_MS) {
        log('Woken by wake file mtime change');
        lastWakeTime = now;
        checkBridgeNow();
      }
    }
  });
}

// =============================================================================
// FORCE BRIDGE CHECK (triggered by wake)
// =============================================================================
function checkBridgeNow() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    log('Checking bridge for new messages');
    // Just requesting unread messages by sending a check message
    ws.send(JSON.stringify({ type: 'check', identity: 'atlas' }));
  }
}

// =============================================================================
// PROCESS INCOMING MESSAGES
// =============================================================================
async function processMessages(msgs) {
  if (!msgs || msgs.length === 0) return;
  if (processing) {
    log(`Already processing — skipping ${msgs.length} message(s)`);
    return;
  }

  processing = true;
  const senders = [...new Set(msgs.map((m) => m.from))].join(', ');
  log(`${msgs.length} message(s) received from: ${senders}`);

  for (const msg of msgs) {
    messagesProcessed++;
    // Output to stdout as newline-delimited JSON
    outputJson({
      type: 'message',
      id: msg.id,
      from: msg.from,
      to: msg.to || 'broadcast',
      content: msg.content,
      timestamp: msg.timestamp,
      sequence: messagesProcessed,
    });
    // Mirror to Atlas's dedicated terminal (if registered)
    if (writeToAtlasTty(formatMessageForTty(msg))) {
      log(`✓ Mirrored message ${messagesProcessed} to Atlas TTY`);
    }
    log(`Message ${messagesProcessed} from ${msg.from}: ${msg.content.slice(0, 80)}...`);
  }

  processing = false;
}

// =============================================================================
// WEBSOCKET CONNECTION
// =============================================================================
function connect() {
  if (!running) return;

  log(`Connecting to bridge at ${BRIDGE_WS}...`);
  ws = new WebSocket(BRIDGE_WS);

  ws.on('open', () => {
    log('Connected. Identifying as atlas...');
    // Identify — bridge will immediately push any unread messages
    ws.send(JSON.stringify({ type: 'identify', identity: 'atlas' }));
  });

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      // Bridge pushes existing unread messages right after identify
      if (
        data.type === 'unread' &&
        Array.isArray(data.messages) &&
        data.messages.length > 0
      ) {
        const filtered = data.messages.filter(shouldAtlasRespond);
        if (filtered.length > 0) {
          log(`${filtered.length} unread message(s) for Atlas delivered on connect`);
          processMessages(filtered);
        }
        return;
      }

      // Real-time push: a new message just arrived on the bridge
      if (data.type === 'message' && data.message) {
        const msg = data.message;
        if (shouldAtlasRespond(msg)) {
          processMessages([msg]);
        }
        return;
      }

      // Bridge sent heartbeat (keep-alive)
      if (data.type === 'heartbeat') {
        log(`Heartbeat: ${data.heartbeat?.messageCount || 0} messages on bridge`);
        return;
      }
    } catch (err) {
      log(`Message parse error: ${err.message}`);
    }
  });

  ws.on('close', () => {
    log(`Disconnected. Reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`);
    ws = null;
    if (running) setTimeout(connect, RECONNECT_DELAY_MS);
  });

  ws.on('error', (err) => {
    log(`WebSocket error: ${err.message}`);
    // 'close' event will follow, triggering reconnect
  });
}

// =============================================================================
// STARTUP + SHUTDOWN
// =============================================================================
log(`Starting. PID: ${process.pid}. Real-time WebSocket + wake signal mode.`);
writePid();
setupWakeHandlers();
connect();

process.on('SIGTERM', () => {
  log('SIGTERM — stopping.');
  running = false;
  if (ws) ws.close();
  clearPid();
  process.exit(0);
});

process.on('SIGINT', () => {
  log('SIGINT — stopping.');
  running = false;
  if (ws) ws.close();
  clearPid();
  process.exit(0);
});

process.on('exit', clearPid);
