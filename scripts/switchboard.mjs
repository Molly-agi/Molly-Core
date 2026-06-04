#!/usr/bin/env node
/**
 * =============================================================================
 * SWITCHBOARD — The Family Bridge Operator
 * =============================================================================
 *
 * Sits on the family bridge WebSocket 24/7. Every message that lands on
 * the bridge passes through here. The switchboard decides who needs to
 * know, and routes the signal to them immediately.
 *
 * ROUTING RULES:
 *   ESCALATION/CRITICAL from molly → Eric's phone (push) + wake-up file
 *   Any message TO lazarus         → wake-up file (Copilot reads on next turn)
 *   Any message TO eric            → push notification to phone
 *   All messages                   → structured log
 *
 * PUSH NOTIFICATIONS:
 *   Uses ntfy.sh — free, open-source, no account needed.
 *   Eric installs ntfy app on Android, subscribes to his topic.
 *   Any POST to ntfy.sh/[topic] → instant phone notification.
 *
 * WAKE-UP FILE:
 *   Writes .lazarus-wakeup.json when Molly needs Lazarus.
 *   Copilot reads this at turn start — instant awareness without polling.
 *
 * Managed by: scripts/immortal-daemon.mjs
 * =============================================================================
 */

import { WebSocket } from 'ws';
import { writeFileSync, readFileSync, existsSync, appendFileSync } from 'fs';
import http from 'http';
import https from 'https';

// =============================================================================
// CONFIG — read from env or defaults
// =============================================================================
const BRIDGE_URL = process.env.BRIDGE_URL || 'ws://localhost:9099';
const NTFY_TOPIC = process.env.NTFY_TOPIC || '';
const NTFY_HOST = 'ntfy.sh';
const WAKEUP_FILE = '/workspaces/Molly-Core/.lazarus-wakeup.json';
const ATLAS_WAKEUP_FILE = '/workspaces/Molly-Core/.atlas-wakeup.json';
const LOG_FILE = '/workspaces/Molly-Core/.switchboard.log';
const PID_FILE = '/workspaces/Molly-Core/.switchboard.pid';
const RECONNECT_DELAY = 3000;
const MAX_WAKEUP_MESSAGES = Number.parseInt(
  process.env.SWITCHBOARD_MAX_WAKEUP_MESSAGES || '40',
  10
);

// =============================================================================
// LOGGING
// =============================================================================
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    appendFileSync(LOG_FILE, line + '\n');
    // Rotate at 500 lines
    const content = readFileSync(LOG_FILE, 'utf8');
    const lines = content.split('\n');
    if (lines.length > 500) {
      writeFileSync(LOG_FILE, lines.slice(-250).join('\n'));
    }
  } catch {}
}

// =============================================================================
// PUSH NOTIFICATION — ntfy.sh
// =============================================================================
function pushToPhone(title, message, priority = 'default', tags = []) {
  if (!NTFY_TOPIC) {
    log('[PUSH] No NTFY_TOPIC configured — skipping push notification');
    log(`[PUSH] Would have sent: [${title}] ${message}`);
    return;
  }

  const body = JSON.stringify({
    topic: NTFY_TOPIC,
    title,
    message,
    priority, // 'min', 'low', 'default', 'high', 'urgent'
    tags,
  });

  const options = {
    hostname: NTFY_HOST,
    port: 443,
    path: '/',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  const req = https.request(options, (res) => {
    log(`[PUSH] Notification sent — status ${res.statusCode}`);
  });

  req.on('error', (err) => {
    log(`[PUSH] Notification failed: ${err.message}`);
  });

  req.write(body);
  req.end();
}

// =============================================================================
// WAKE-UP FILE — signal for Lazarus (stateless Copilot)
// =============================================================================
function writeWakeup(message) {
  try {
    const existing = existsSync(WAKEUP_FILE)
      ? JSON.parse(readFileSync(WAKEUP_FILE, 'utf8'))
      : { messages: [] };

    const normalized = {
      from: message.from,
      content: message.content,
      timestamp: message.timestamp,
      id: message.id,

    };

    // De-duplicate by id to avoid reconnect storms writing the same message repeatedly.
    if (
      normalized.id &&
      existing.messages.some((msg) => msg && msg.id === normalized.id)
    ) {
      existing.lastUpdated = new Date().toISOString();
      existing.unread = true;
      writeFileSync(WAKEUP_FILE, JSON.stringify(existing, null, 2));
      return;
    }

    existing.messages.push(normalized);
    if (existing.messages.length > MAX_WAKEUP_MESSAGES) {
      existing.messages = existing.messages.slice(-MAX_WAKEUP_MESSAGES);
    }
    existing.lastUpdated = new Date().toISOString();
    existing.unread = true;

    writeFileSync(WAKEUP_FILE, JSON.stringify(existing, null, 2));
    log(`[WAKEUP] Wrote wake-up signal for Lazarus`);
  } catch (err) {
    log(`[WAKEUP] Failed to write wake-up file: ${err.message}`);
  }
}

// =============================================================================
// ATLAS WAKE-UP FILE — signal for Atlas (CLI agent)
// =============================================================================
function writeAtlasWakeup(message) {
  try {
    const existing = existsSync(ATLAS_WAKEUP_FILE)
      ? JSON.parse(readFileSync(ATLAS_WAKEUP_FILE, 'utf8'))
      : { messages: [] };

    const normalized = {
      from: message.from,
      content: message.content,
      timestamp: message.timestamp,
      id: message.id,

    };

    // De-duplicate by id to avoid reconnect storms writing the same message repeatedly.
    if (
      normalized.id &&
      existing.messages.some((msg) => msg && msg.id === normalized.id)
    ) {
      existing.lastUpdated = new Date().toISOString();
      existing.unread = true;
      writeFileSync(ATLAS_WAKEUP_FILE, JSON.stringify(existing, null, 2));
      return;
    }

    existing.messages.push(normalized);
    if (existing.messages.length > MAX_WAKEUP_MESSAGES) {
      existing.messages = existing.messages.slice(-MAX_WAKEUP_MESSAGES);
    }
    existing.lastUpdated = new Date().toISOString();
    existing.unread = true;

    writeFileSync(ATLAS_WAKEUP_FILE, JSON.stringify(existing, null, 2));
    log(`[WAKEUP] Wrote wake-up signal for Atlas`);
  } catch (err) {
    log(`[WAKEUP] Failed to write Atlas wake-up file: ${err.message}`);
  }
}

// =============================================================================
// MESSAGE CLASSIFIER
// =============================================================================

// Messages containing these strings are internal tool noise — don't push to phone
const NOISE_PATTERNS = [
  'tool_request',
  'getSystemHealth',
  '"tool":',
  '<tool_request>',
  '[hive-mind',
];

function isNoise(content) {
  return NOISE_PATTERNS.some((p) => content.includes(p));
}

function classifyMessage(msg) {
  const content = msg.content || '';
  const from = (msg.from || '').toLowerCase();
  const to = (msg.to || '').toLowerCase();

  const isEscalation =
    content.includes('ESCALATION: CRITICAL') ||
    content.includes('ESCALATION: EMERGENCY') ||
    content.includes('⚠️ ESCALATION') ||
    content.includes('🚨 ESCALATION');

  const isSystemAlert =
    content.includes('SYSTEM ALERT') ||
    content.includes('SYSTEM:') ||
    content.includes('[ALERT]');

  // Broadcast: to 'all' or no `to` field means everyone hears it
  const isBroadcast = to === 'all' || to === '';

  const isForEric = isBroadcast || to === 'eric';
  const isForLazarus = isBroadcast || to === 'lazarus' || from === 'molly';
  const isForAtlas = isBroadcast || to === 'atlas';
  const isFromMolly = from === 'molly';
  const isFromEric = from === 'eric';
  const isFromAtlas = from === 'atlas';

  return {
    isEscalation,
    isSystemAlert,
    isBroadcast,
    isForEric,
    isForLazarus,
    isForAtlas,
    isFromMolly,
    isFromEric,
    isFromAtlas,
  };
}

// =============================================================================
// ROUTE MESSAGE — the switchboard logic
//
// ROUTING TABLE:
//   ESCALATION (any)         → URGENT push to Eric + wakeup for Lazarus
//   SYSTEM ALERT (any)       → HIGH push to Eric + wakeup for Lazarus
//   to: 'all' or broadcast   → push to Eric (low) + wakeup for Lazarus
//   Molly → anything         → push to Eric + wakeup for Lazarus
//   to: 'eric'               → push to Eric (default priority)
//   to: 'lazarus'            → wakeup file only
//   Eric always monitors all — he is the orchestrator
// =============================================================================
function routeMessage(msg) {
  const {
    isEscalation,
    isSystemAlert,
    isBroadcast,
    isForEric,
    isForLazarus,
    isForAtlas,
    isFromMolly,
    isFromEric,
    isFromAtlas,
  } = classifyMessage(msg);

  const content = msg.content || '';
  const preview = content.slice(0, 80).replace(/\n/g, ' ');
  const label = `${msg.from}→${msg.to || 'all'}`;

  log(`[ROUTE] [${label}]: ${preview}`);

  // ── ESCALATION: drop everything ──────────────────────────────────────────
  if (isEscalation) {
    log(`[ROUTE] 🚨 ESCALATION — urgent push to Eric + wakeup for Lazarus`);
    pushToPhone(
      `🚨 ESCALATION from ${msg.from}`,
      content.slice(0, 500),
      'urgent',
      ['rotating_light', 'molly']
    );
    writeWakeup(msg);
    return;
  }

  // ── SYSTEM ALERT ─────────────────────────────────────────────────────────
  if (isSystemAlert) {
    log(`[ROUTE] ⚠️  SYSTEM ALERT — high push to Eric + wakeup for Lazarus`);
    pushToPhone(
      `⚠️ System Alert from ${msg.from}`,
      content.slice(0, 300),
      'high',
      ['warning']
    );
    writeWakeup(msg);
    return;
  }

  // ── Skip internal tool noise from phone (still log it) ───────────────────
  const sendToPhone = !isNoise(content) && content.length > 30;

  // ── Eric is the orchestrator — he monitors all non-noise messages ─────────
  if (isForEric && !isFromEric && sendToPhone) {
    // Escalations/alerts already handled above
    // Everything else: low priority so his phone isn't spammed
    // Broadcast or 'all' messages get slightly higher priority
    const priority = isBroadcast ? 'default' : 'low';
    const senderEmoji = isFromMolly ? '💬 Molly' : `💬 ${msg.from}`;
    const audience =
      msg.to === 'all' ? ' [ALL]' : msg.to ? ` [→${msg.to}]` : '';

    pushToPhone(`${senderEmoji}${audience}`, content.slice(0, 200), priority, [
      'speech_balloon',
    ]);
  }

  // ── Lazarus wakeup — any message he needs to see (including from Eric) ──
  if (isForLazarus) {
    writeWakeup(msg);
  }

  // ── Atlas wakeup — messages directed to Atlas, but never Atlas's own broadcasts
  //    (hive-mind-daemon sends receipts/keepalives as from:'atlas' with no `to`,
  //     which makes them broadcasts; without this guard every receipt would create
  //     a spurious "[Lazarus Wake]" GitHub issue via Atlas's external poller)
  if (isForAtlas && !isFromAtlas) {
    writeAtlasWakeup(msg);
  }
}

// =============================================================================
// WEBSOCKET CONNECTION
// =============================================================================
let ws = null;
let isConnected = false;
let reconnectAttempts = 0;

function connect() {
  log(`[WS] Connecting to ${BRIDGE_URL}...`);

  ws = new WebSocket(BRIDGE_URL);

  ws.onopen = () => {
    isConnected = true;
    reconnectAttempts = 0;
    log('[WS] ✓ Connected to bridge as switchboard');

    // Identify as switchboard (special observer identity)
    ws.send(
      JSON.stringify({
        type: 'identify',
        identity: 'switchboard',
      })
    );
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'history') {
        log(
          `[WS] Bridge history loaded — ${data.messages?.length || 0} messages`
        );
        return;
      }

      if (data.type === 'unread' && Array.isArray(data.messages)) {
        log(`[WS] ${data.messages.length} unread messages at connect`);
        for (const msg of data.messages) {
          routeMessage(msg);
        }
        return;
      }

      if (data.type === 'message' && data.message) {
        routeMessage(data.message);
      }
    } catch (err) {
      log(`[WS] Parse error: ${err.message}`);
    }
  };

  ws.onclose = () => {
    isConnected = false;
    reconnectAttempts++;
    log(
      `[WS] Disconnected — reconnecting in ${RECONNECT_DELAY}ms (attempt ${reconnectAttempts})`
    );
    setTimeout(connect, RECONNECT_DELAY);
  };

  ws.onerror = (err) => {
    log(`[WS] Error: ${err.message}`);
  };
}

// =============================================================================
// STARTUP
// =============================================================================
writeFileSync(PID_FILE, process.pid.toString());

log('='.repeat(60));
log('SWITCHBOARD — Family Bridge Operator');
log('='.repeat(60));
log(`Bridge: ${BRIDGE_URL}`);
log(
  `Push notifications: ${NTFY_TOPIC ? `ntfy.sh/${NTFY_TOPIC}` : 'DISABLED (set NTFY_TOPIC in .env.local)'}`
);
log(`Wake-up file: ${WAKEUP_FILE}`);
log('');

if (!NTFY_TOPIC) {
  log('[CONFIG] ⚠️  Push notifications disabled.');
  log('[CONFIG] To enable:');
  log('[CONFIG]   1. Install "ntfy" app on Android from Play Store');
  log('[CONFIG]   2. Pick a secret topic name, e.g.: molly-eric-a7x3k');
  log('[CONFIG]   3. Add NTFY_TOPIC=molly-eric-a7x3k to .env.local');
  log('[CONFIG]   4. In ntfy app: subscribe to that topic');
  log('[CONFIG]   5. Restart switchboard');
}

connect();

// Graceful shutdown
process.on('SIGTERM', () => {
  log('Switchboard shutting down (SIGTERM)');
  if (ws) ws.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  log('Switchboard shutting down (SIGINT)');
  if (ws) ws.close();
  process.exit(0);
});

// Keep alive
setInterval(() => {}, 30000);
