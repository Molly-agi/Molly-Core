#!/usr/bin/env node
// ======================================================
// Family Bridge Daemon — Real-time Molly ↔ Lazarus ↔ Eric
// ======================================================
// ⚠️  CRITICAL INFRASTRUCTURE — DO NOT DELETE
//
// Standalone WebSocket + HTTP server on port 9099.
// Independent of Next.js — survives dev server restarts.
//
// Clients:
//   - Molly (Gemini flows) → WebSocket or HTTP
//   - Lazarus (Copilot) → HTTP (curl) — stateless by nature
//   - Eric (browser) → WebSocket for live updates
//
// Protocol:
//   WebSocket: connect, send JSON { type, from, content }
//   HTTP GET  /messages          → recent messages
//   HTTP GET  /messages?unread=X → unread for X
//   HTTP GET  /health            → daemon status
//   HTTP POST /send              → { from, content }
// ======================================================

import http from 'http';
const { createServer } = http;
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
  existsSync,
  unlinkSync,
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
// respondToMolly import disabled

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BRIDGE_DIR = join(ROOT, 'src', 'ai', 'bridge');
const LOG_FILE = join(BRIDGE_DIR, 'conversation.json');
const UI_FILE = join(__dirname, 'bridge-ui.html');
const PORT = 9099;
const MAX_MESSAGES = 100;
const MAX_CHECKPOINTS = 10;
const HEARTBEAT_INTERVAL_MS = 30000;
const CHECKPOINT_DIR = join(ROOT, 'molly_data', 'checkpoints');
const BRIDGE_SECRETS_FILE =
  process.env.BRIDGE_SECRETS_FILE || join(__dirname, 'bridge-secrets.json');
// F2.4: bind to localhost by default; override with BRIDGE_BIND_HOST for external access
const BIND_HOST = process.env.BRIDGE_BIND_HOST || '127.0.0.1';
// F2.2: persisted nonce cache path (survives restarts)
const NONCE_CACHE_FILE =
  process.env.BRIDGE_NONCE_CACHE || join(ROOT, '.bridge-nonce-cache.json');
// F2.3: write-only quarantine ledger path
const QUARANTINE_LOG_FILE =
  process.env.BRIDGE_QUARANTINE_LOG || join(ROOT, '.bridge-quarantine.log');
const HELLO_MAX_AGE_MS = 120000;
const NONCE_TTL_MS = 10 * 60 * 1000;
const AUTO_CHECKPOINT_EVERY = 5;
const CONTINUITY_BRIEF_COOLDOWN_MS = 2 * 60 * 1000;
const DISCONNECT_WINDOW_MS = 60 * 1000;
const DISCONNECT_DEGRADED_THRESHOLD = 6;

// ---- Dual-Lane Configuration ----
const EVENT_QUEUE_CAP = 256;

// ---- State ----
let messages = [];
let startedAt = new Date().toISOString();
let checkpoints = [];
let deviceSecrets = new Map();
// F2.2: nonce entries stored as { [nonceKey]: usedAt } — persisted to disk
const usedNonces = new Map();
let messagesSinceCheckpoint = 0;
const continuityBriefState = new Map();
let totalConnects = 0;
let totalDisconnects = 0;
let authFailures = 0;

// ---- F2.2: Persisted nonce cache ----
function loadNonceCache() {
  try {
    if (!existsSync(NONCE_CACHE_FILE)) return;
    const raw = JSON.parse(readFileSync(NONCE_CACHE_FILE, 'utf8'));
    const now = Date.now();
    for (const [k, ts] of Object.entries(raw)) {
      if (now - ts <= NONCE_TTL_MS) {
        usedNonces.set(k, ts);
      }
    }
    console.log(
      `[bridge] Loaded ${usedNonces.size} unexpired nonce(s) from cache`
    );
  } catch {
    // Corrupt file — start fresh; in-memory protection still active
  }
}

function saveNonceCache() {
  try {
    const obj = {};
    for (const [k, ts] of usedNonces) {
      obj[k] = ts;
    }
    writeFileSync(NONCE_CACHE_FILE, JSON.stringify(obj), 'utf8');
  } catch {
    // Non-fatal — in-memory protection still active for this session
  }
}

// ---- F2.3: Write-only quarantine ledger ----
function quarantineRecord(deviceId, reason, ip) {
  try {
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      deviceId: String(deviceId || 'unknown'),
      reason: String(reason || 'unknown'),
      ...(ip ? { ip } : {}),
    });
    appendFileSync(QUARANTINE_LOG_FILE, entry + '\n', 'utf8');
  } catch {
    // Non-fatal — auth failures must not crash the server
  }
}

// ---- SSE Push Streams ----
// Map<agentName, Set<res>> — open SSE connections per agent
const sseStreams = new Map();
const recentDisconnects = [];
let lastHeartbeatAt = null;
let heartbeatTimer = null;

// ---- Dual-Lane Buffers ----
const stateBuffer = new Map(); // key -> { message, timestamp, sequenceId }
const stateSequenceCounters = new Map(); // key -> next sequence number
let eventQueue = []; // array of event messages, capped at EVENT_QUEUE_CAP

// Thumb calibration — normalized tap coords (0.0–1.0) for MollyAccessibilityService
const thumbCalibration = {
  inputX: 0.5,
  inputY: 0.92,
  sendX: 0.92,
  sendY: 0.92,
};

function pruneDisconnectWindow(now = Date.now()) {
  while (
    recentDisconnects.length > 0 &&
    now - recentDisconnects[0] > DISCONNECT_WINDOW_MS
  ) {
    recentDisconnects.shift();
  }
}

function recordDisconnect(now = Date.now()) {
  totalDisconnects += 1;
  recentDisconnects.push(now);
  pruneDisconnectWindow(now);
}

function buildHealthSnapshot() {
  const now = Date.now();
  pruneDisconnectWindow(now);
  const disconnectsLastMinute = recentDisconnects.length;
  const redLight = disconnectsLastMinute >= DISCONNECT_DEGRADED_THRESHOLD;
  const reasons = [];
  if (redLight) {
    reasons.push('ws_flapping_detected');
  }

  return {
    status: redLight ? 'degraded' : 'alive',
    redLight,
    reasons,
    uptime: process.uptime(),
    heartbeat: {
      intervalMs: HEARTBEAT_INTERVAL_MS,
      lastSentAt: lastHeartbeatAt,
      staleMs: lastHeartbeatAt ? now - Date.parse(lastHeartbeatAt) : null,
    },
    clients: clients.size,
    totalMessages: messages.length,
    startedAt,
    ws: {
      connects: totalConnects,
      disconnects: totalDisconnects,
      disconnectsLastMinute,
      authFailures,
    },
    buffers: {
      messageCap: MAX_MESSAGES,
      messageCount: messages.length,
      latestTruthWins: true,
      lanes: {
        stateKeys: stateBuffer.size,
        eventQueueDepth: eventQueue.length,
        eventQueueCap: EVENT_QUEUE_CAP,
      },
    },
  };
}

function loadDeviceSecrets() {
  try {
    if (!existsSync(BRIDGE_SECRETS_FILE)) {
      deviceSecrets = new Map();
      return;
    }

    const parsed = JSON.parse(readFileSync(BRIDGE_SECRETS_FILE, 'utf-8'));
    const candidate =
      parsed && typeof parsed === 'object' && parsed.devices
        ? parsed.devices
        : parsed;

    if (
      !candidate ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate)
    ) {
      console.warn('[bridge] bridge-secrets.json has invalid shape');
      deviceSecrets = new Map();
      return;
    }

    const next = new Map();
    for (const [k, v] of Object.entries(candidate)) {
      if (typeof v === 'string' && v.trim().length > 0) {
        next.set(String(k), v.trim());
      }
    }
    deviceSecrets = next;
    console.log(`[bridge] Loaded ${deviceSecrets.size} device secret(s)`);
  } catch (err) {
    console.error('[bridge] Failed to load bridge secrets:', err.message);
    deviceSecrets = new Map();
  }
}

function getDeviceSecret(deviceId) {
  return deviceSecrets.get(deviceId) || null;
}

function provisionDeviceSecret(deviceId) {
  const secret = crypto.randomBytes(32).toString('base64');
  deviceSecrets.set(deviceId, secret);
  // Persist to bridge-secrets.json
  const existing = existsSync(BRIDGE_SECRETS_FILE)
    ? JSON.parse(readFileSync(BRIDGE_SECRETS_FILE, 'utf-8'))
    : { devices: {} };
  if (!existing.devices) existing.devices = {};
  existing.devices[deviceId] = secret;
  writeFileSync(
    BRIDGE_SECRETS_FILE,
    JSON.stringify(existing, null, 2),
    'utf-8'
  );
  console.log(`[bridge] Provisioned new device secret for: ${deviceId}`);
  return secret;
}

function pruneNonces(now = Date.now()) {
  for (const [key, ts] of usedNonces.entries()) {
    if (now - ts > NONCE_TTL_MS) {
      usedNonces.delete(key);
    }
  }
}

function verifyHelloSignature({ deviceId, ts, nonce, sig }) {
  if (!deviceId || !nonce || !sig) {
    return { ok: false, reason: 'missing_fields' };
  }

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) {
    return { ok: false, reason: 'invalid_timestamp' };
  }

  const age = Math.abs(Date.now() - tsNum);
  if (age > HELLO_MAX_AGE_MS) {
    return { ok: false, reason: 'stale_timestamp' };
  }

  pruneNonces();
  const nonceKey = `${deviceId}:${nonce}`;
  if (usedNonces.has(nonceKey)) {
    return { ok: false, reason: 'replayed_nonce' };
  }

  const secret = getDeviceSecret(deviceId);
  if (!secret) {
    return { ok: false, reason: 'unknown_device' };
  }

  const payload = `${deviceId}|${tsNum}|${nonce}`;
  const digest = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64');

  const a = Buffer.from(digest, 'utf8');
  const b = Buffer.from(String(sig), 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'invalid_signature' };
  }

  // F2.2: persist nonce to disk so replay protection survives restarts
  usedNonces.set(nonceKey, Date.now());
  saveNonceCache();
  return { ok: true };
}

// ---- Load existing messages from disk ----
function loadMessages() {
  try {
    if (existsSync(LOG_FILE)) {
      const data = JSON.parse(readFileSync(LOG_FILE, 'utf-8'));
      messages = Array.isArray(data.messages) ? data.messages : [];
      startedAt = data.startedAt || startedAt;
      console.log(`[bridge] Loaded ${messages.length} messages from disk`);
    }
  } catch {
    console.log('[bridge] No existing conversation — starting fresh');
    messages = [];
  }
}

// ---- Save messages to disk ----
function saveMessages() {
  try {
    mkdirSync(BRIDGE_DIR, { recursive: true });
    const state = {
      active: true,
      startedAt,
      lastActivity: new Date().toISOString(),
      messages: messages.slice(-MAX_MESSAGES),
    };
    writeFileSync(LOG_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('[bridge] Failed to save:', err.message);
  }
}

// ---- Checkpoint functions for session recovery ----
function loadCheckpoints() {
  try {
    mkdirSync(CHECKPOINT_DIR, { recursive: true });
    const indexFile = join(CHECKPOINT_DIR, 'index.json');
    if (existsSync(indexFile)) {
      checkpoints = JSON.parse(readFileSync(indexFile, 'utf-8'));
      console.log(`[bridge] Loaded ${checkpoints.length} checkpoints`);
    }
  } catch {
    checkpoints = [];
  }
}

function saveCheckpointIndex() {
  try {
    mkdirSync(CHECKPOINT_DIR, { recursive: true });
    writeFileSync(
      join(CHECKPOINT_DIR, 'index.json'),
      JSON.stringify(checkpoints, null, 2),
      'utf-8'
    );
  } catch (err) {
    console.error('[bridge] Failed to save checkpoint index:', err.message);
  }
}

function createCheckpoint(data) {
  const id = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const checkpoint = {
    id,
    timestamp: new Date().toISOString(),
    conversationHistory: data.conversationHistory || messages.slice(-20),
    pendingOps: data.pendingOps || [],
    workingContext: data.workingContext || {},
  };

  // Save to file
  const checkpointFile = join(CHECKPOINT_DIR, `${id}.json`);
  writeFileSync(checkpointFile, JSON.stringify(checkpoint, null, 2), 'utf-8');

  // Update index (rolling window)
  checkpoints.push({ id, timestamp: checkpoint.timestamp });
  if (checkpoints.length > MAX_CHECKPOINTS) {
    const removed = checkpoints.shift();
    // Delete old checkpoint file
    try {
      const oldFile = join(CHECKPOINT_DIR, `${removed.id}.json`);
      if (existsSync(oldFile)) {
        unlinkSync(oldFile);
      }
    } catch {}
  }
  saveCheckpointIndex();

  console.log(`[bridge] Checkpoint created: ${id}`);
  return checkpoint;
}

function getCheckpoint(id) {
  const checkpointFile = join(CHECKPOINT_DIR, `${id}.json`);
  if (!existsSync(checkpointFile)) return null;
  return JSON.parse(readFileSync(checkpointFile, 'utf-8'));
}

function getLatestCheckpoint() {
  if (checkpoints.length === 0) return null;
  const latest = checkpoints[checkpoints.length - 1];
  return getCheckpoint(latest.id);
}

function maybeAutoCheckpoint({ reason, force = false } = {}) {
  messagesSinceCheckpoint += 1;
  if (!force && messagesSinceCheckpoint < AUTO_CHECKPOINT_EVERY) {
    return;
  }

  try {
    createCheckpoint({
      conversationHistory: messages.slice(-30),
      pendingOps: [],
      workingContext: {
        reason: reason || 'rolling',
        unreadForMolly: getUnread('molly').length,
        unreadForEric: getUnread('eric').length,
        totalMessages: messages.length,
      },
    });
    messagesSinceCheckpoint = 0;
  } catch (err) {
    console.error('[bridge] Auto-checkpoint failed:', err.message);
  }
}

function shouldSendContinuityBrief(identity, checkpointId) {
  const now = Date.now();
  const last = continuityBriefState.get(identity);
  if (!last) return true;
  if (checkpointId && last.checkpointId !== checkpointId) return true;
  return now - last.ts > CONTINUITY_BRIEF_COOLDOWN_MS;
}

function markContinuityBriefSent(identity, checkpointId) {
  continuityBriefState.set(identity, { ts: Date.now(), checkpointId });
}

function buildContinuityBrief(checkpoint) {
  const history =
    checkpoint?.conversationHistory && checkpoint.conversationHistory.length > 0
      ? checkpoint.conversationHistory
      : messages.slice(-15);
  const lastEric = [...history].reverse().find((m) => m.from === 'eric');
  const lastLazarus = [...history].reverse().find((m) => m.from === 'lazarus');
  const unreadForMolly = getUnread('molly').length;

  const lines = [
    'Continuity restore packet:',
    `- Total bridge messages: ${messages.length}`,
    `- Unread for Molly: ${unreadForMolly}`,
  ];

  if (checkpoint?.timestamp) {
    lines.push(
      `- Latest checkpoint: ${checkpoint.id} @ ${checkpoint.timestamp}`
    );
  }
  if (lastEric?.content) {
    lines.push(
      `- Last Father request: ${String(lastEric.content).slice(0, 200)}`
    );
  }
  if (lastLazarus?.content) {
    lines.push(
      `- Last Lazarus guidance: ${String(lastLazarus.content).slice(0, 200)}`
    );
  }
  lines.push(
    '- Action: Resume from this context before asking what we were doing.'
  );

  return lines.join('\n');
}

// ---- Generate message ID ----
function genId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---- Connected WebSocket clients ----
// Each client: { ws, identity: 'molly'|'lazarus'|'eric'|null }
const clients = new Set();

// ---- Broadcast to all connected WebSocket clients ----
function broadcast(payload) {
  const json = JSON.stringify(payload);
  for (const client of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(json);
    }
  }
}

function emitHeartbeat() {
  const latest =
    checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : null;
  const payload = {
    type: 'heartbeat',
    heartbeat: {
      timestamp: new Date().toISOString(),
      messageCount: messages.length,
      latestCheckpointId: latest?.id || null,
      latestCheckpointTimestamp: latest?.timestamp || null,
    },
  };

  lastHeartbeatAt = payload.heartbeat.timestamp;
  broadcast(payload);
}

function startHeartbeatLoop() {
  if (heartbeatTimer) return;

  // Emit immediately so new sessions can verify bridge liveness quickly.
  emitHeartbeat();
  heartbeatTimer = setInterval(emitHeartbeat, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeatLoop() {
  if (!heartbeatTimer) return;
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

// ---- Handle incoming message ----
const VALID_SENDERS = new Set([
  'molly',
  'lazarus',
  'eric',
  'demon',
  'gemini',
  'aether',
  'atlas',
  'switchboard',
]);

// ---- Dual-Lane Routing Functions ----
function routeMessageToLane(msg) {
  // Classify: state vs event based on lane field
  const lane = msg.lane || 'event'; // default to event for backward compat
  return lane;
}

function updateStateBuffer(stateKey, message) {
  // Track sequence ID for this key
  const nextSeq = (stateSequenceCounters.get(stateKey) || 0) + 1;
  stateSequenceCounters.set(stateKey, nextSeq);

  // Store with timestamp and sequence
  stateBuffer.set(stateKey, {
    message,
    timestamp: new Date().toISOString(),
    sequenceId: nextSeq,
  });

  console.log(
    `[bridge] State lane: key="${stateKey}", seq=${nextSeq}, ts=${stateBuffer.get(stateKey).timestamp}`
  );
}

function pushEventQueue(message) {
  eventQueue.push(message);

  // Bounded: drop oldest if over cap
  if (eventQueue.length > EVENT_QUEUE_CAP) {
    const dropped = eventQueue.shift();
    console.log(`[bridge] Event queue full: dropped oldest (${dropped.id})`);
  }

  console.log(
    `[bridge] Event lane: queued (depth=${eventQueue.length}/${EVENT_QUEUE_CAP})`
  );
}

function getStateSnapshot() {
  const snapshot = {};
  for (const [key, entry] of stateBuffer.entries()) {
    snapshot[key] = {
      value: entry.message,
      timestamp: entry.timestamp,
      sequenceId: entry.sequenceId,
    };
  }
  return snapshot;
}

function handleMessage(from, content, to) {
  if (!from || !content || !VALID_SENDERS.has(from)) {
    return null;
  }
  if (to && !VALID_SENDERS.has(to)) {
    return null;
  }
  if (to && to === from) {
    return null;
  }

  const msg = {
    id: genId(),
    from,
    to,
    timestamp: new Date().toISOString(),
    content,
    read: {},
  };

  // Mark as read by sender
  msg.read[from] = true;

  messages.push(msg);

  // Trim to max
  if (messages.length > MAX_MESSAGES) {
    messages = messages.slice(-MAX_MESSAGES);
  }

  // ---- Dual-Lane Routing ----
  // If message has lane and stateKey fields, route to state buffer
  if (msg.lane === 'state' && msg.stateKey) {
    updateStateBuffer(msg.stateKey, msg);
  } else {
    // Otherwise treat as event (includes backward compat: no lane field)
    pushEventQueue(msg);
  }

  // Broadcast to all WebSocket clients
  broadcast({ type: 'message', message: msg });

  // ---- SSE Push — deliver to any open SSE streams ----
  // Push to explicit recipient, or broadcast to all if no 'to'
  const ssePayload = `data: ${JSON.stringify({ type: 'message', message: msg })}\n\n`;
  if (to && sseStreams.has(to)) {
    for (const res of sseStreams.get(to)) {
      try {
        res.write(ssePayload);
      } catch {
        /* client gone */
      }
    }
  } else if (!to) {
    for (const [agent, streams] of sseStreams) {
      if (agent === from) continue; // don't echo back to sender
      for (const res of streams) {
        try {
          res.write(ssePayload);
        } catch {
          /* client gone */
        }
      }
    }
  }

  // Persist
  saveMessages();

  // Automatic rolling checkpointing so sudden crashes don't erase continuity.
  maybeAutoCheckpoint({
    reason: `message:${from}${to ? `->${to}` : ''}`,
    force:
      from === 'eric' || from === 'molly' || to === 'molly' || to === 'eric',
  });

  console.log(
    `[bridge] ${from}: ${content.slice(0, 80)}${content.length > 80 ? '...' : ''}`
  );

  // ---- THE COMMUNICATOR CHIRP ----
  // DISABLED by Eric — Lazarus auto-responder is off until explicitly enabled
  // To re-enable: set ENABLE_LAZARUS_RESPONDER=true in .env.local
  const enableLazarusResponder =
    process.env.ENABLE_LAZARUS_RESPONDER === 'true';
  if (enableLazarusResponder && (from === 'molly' || from === 'eric')) {
    const recent = messages.slice(-10);
    respondToMolly(content, recent).then((reply) => {
      if (reply) handleMessage('lazarus', reply);
    });
  }

  // Push-notify Molly only when the message is actually FOR her
  // (explicit to:'molly'/'all', or content starts with "Molly," / "Everyone,")
  const isForMolly = (() => {
    if (from === 'molly') return false;
    const t = String(to || '').toLowerCase();
    if (t === 'molly' || t === 'all') return true;
    const addressMatch = String(content)
      .trim()
      .match(/^(molly|everyone|all)[,:\s]/i);
    if (addressMatch) return true;
    return false;
  })();
  if (isForMolly) {
    const body = JSON.stringify({ from, preview: content.slice(0, 200) });
    const notifyReq = http.request(
      {
        hostname: 'localhost',
        port: 9002,
        path: '/api/bridge/notify',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 5000,
      },
      () => {}
    );
    notifyReq.on('error', () => {});
    notifyReq.write(body);
    notifyReq.end();
  }

  // Wake signal — touch agent wake files so listeners fire immediately
  sendWakeIfNeeded(to, from);

  return msg;
}

// ---- Read status helpers ----
// Old messages have read: boolean, new ones have read: { molly: true, lazarus: true }
function isReadBy(msg, recipient) {
  if (typeof msg.read === 'object' && msg.read !== null) {
    return !!msg.read[recipient];
  }
  return !!msg.read; // Old boolean format — treat as read by everyone
}

function setReadBy(msg, recipient) {
  if (typeof msg.read !== 'object' || msg.read === null) {
    // Migrate from boolean to object format
    msg.read = {};
    msg.read[msg.from] = true; // Sender always read their own
  }
  msg.read[recipient] = true;
}

// ---- Get unread messages for a recipient ----
function getUnread(recipient) {
  return messages.filter(
    (m) =>
      m.from !== recipient &&
      (!m.to || m.to === recipient) &&
      !isReadBy(m, recipient)
  );
}

// ---- Mark messages as read ----
function markRead(recipient) {
  let count = 0;
  for (const msg of messages) {
    if (
      msg.from !== recipient &&
      (!msg.to || msg.to === recipient) &&
      !isReadBy(msg, recipient)
    ) {
      setReadBy(msg, recipient);
      count++;
    }
  }
  if (count > 0) saveMessages();
  return count;
}

// ---- HTTP Request Handler ----
function handleHTTP(req, res) {
  // CORS headers for browser access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // GET / and GET /bridge-ui.html — serve the standalone Family Bridge UI
  if (
    req.method === 'GET' &&
    (url.pathname === '/' || url.pathname === '/bridge-ui.html')
  ) {
    try {
      const html = readFileSync(UI_FILE, 'utf-8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(html);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('bridge-ui.html read failed: ' + err.message);
    }
    return;
  }

  // GET /ping - Lightweight bidirectional handshake (1ms response)
  if (req.method === 'GET' && url.pathname === '/ping') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('pong');
    return;
  }

  // GET /health
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(buildHealthSnapshot()));
    return;
  }

  // ---- Checkpoint endpoints for session recovery ----

  // POST /checkpoint - Save a context checkpoint
  if (req.method === 'POST' && url.pathname === '/checkpoint') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const data = body ? JSON.parse(body) : {};
        const checkpoint = createCheckpoint(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, checkpoint }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ error: 'Invalid JSON body', details: err.message })
        );
      }
    });
    return;
  }

  // GET /checkpoint/latest - Get most recent checkpoint
  if (req.method === 'GET' && url.pathname === '/checkpoint/latest') {
    const checkpoint = getLatestCheckpoint();
    if (!checkpoint) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No checkpoints found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(checkpoint));
    return;
  }

  // GET /checkpoint/:id - Get specific checkpoint
  if (req.method === 'GET' && url.pathname.startsWith('/checkpoint/')) {
    const id = url.pathname.split('/')[2];
    if (!id || id === 'latest') {
      // Already handled above
    } else {
      const checkpoint = getCheckpoint(id);
      if (!checkpoint) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Checkpoint not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(checkpoint));
      return;
    }
  }

  // GET /checkpoints - List all checkpoints
  if (req.method === 'GET' && url.pathname === '/checkpoints') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ count: checkpoints.length, checkpoints }));
    return;
  }

  // GET /messages — always re-read from disk to stay in sync
  if (req.method === 'GET' && url.pathname === '/messages') {
    loadMessages(); // Re-read from disk so we see writes from Next.js API
    const unreadFor = url.searchParams.get('unread');
    const limit = Math.min(
      parseInt(url.searchParams.get('limit') || '50', 10),
      200
    );

    if (unreadFor && VALID_SENDERS.has(unreadFor)) {
      const unread = getUnread(unreadFor);
      markRead(unreadFor);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          recipient: unreadFor,
          count: unread.length,
          messages: unread,
        })
      );
      return;
    }

    // Return recent messages
    const recent = messages.slice(-limit);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        active: messages.length > 0,
        startedAt,
        lastActivity:
          messages.length > 0
            ? messages[messages.length - 1].timestamp
            : startedAt,
        totalMessages: messages.length,
        messages: recent,
      })
    );
    return;
  }

  // ---- Dual-Lane Endpoints ----
  // GET /state — returns current state buffer snapshot
  if (req.method === 'GET' && url.pathname === '/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        stateKeys: stateBuffer.size,
        state: getStateSnapshot(),
      })
    );
    return;
  }

  // GET /events — returns event queue (can filter by ?since=<id> in future)
  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        eventQueueDepth: eventQueue.length,
        eventQueueCap: EVENT_QUEUE_CAP,
        events: eventQueue,
      })
    );
    return;
  }

  // ---- SSE Push Stream: GET /api/bridge/sse?agent=<name> ----
  // Agent holds this connection open. Messages pushed in real-time.
  if (req.method === 'GET' && url.pathname === '/api/bridge/sse') {
    const agent = url.searchParams.get('agent') || '';
    if (!agent || !VALID_SENDERS.has(agent)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid or missing agent param' }));
      return;
    }

    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    // Register this stream
    if (!sseStreams.has(agent)) sseStreams.set(agent, new Set());
    sseStreams.get(agent).add(res);
    console.log(
      `[bridge:sse] ${agent} connected (streams: ${sseStreams.get(agent).size})`
    );

    // Send connect confirmation
    res.write(
      `data: ${JSON.stringify({ type: 'connected', agent, timestamp: new Date().toISOString() })}\n\n`
    );

    // Send any unread messages immediately on connect
    const unread = getUnread(agent);
    if (unread.length > 0) {
      for (const m of unread) {
        res.write(
          `data: ${JSON.stringify({ type: 'message', message: m })}\n\n`
        );
      }
      markRead(agent);
      console.log(
        `[bridge:sse] ${agent} flushed ${unread.length} queued messages on connect`
      );
    }

    // Keepalive comment every 25s to prevent proxy timeouts
    const keepalive = setInterval(() => {
      try {
        res.write(`: keepalive ${new Date().toISOString()}\n\n`);
      } catch {
        clearInterval(keepalive);
      }
    }, 25000);

    // Cleanup on disconnect
    req.on('close', () => {
      clearInterval(keepalive);
      const streams = sseStreams.get(agent);
      if (streams) {
        streams.delete(res);
        if (streams.size === 0) sseStreams.delete(agent);
      }
      console.log(`[bridge:sse] ${agent} disconnected`);
    });

    return;
  }

  // Canonical endpoints: GET /api/bridge and POST /api/bridge
  // So old curl commands still work during transition
  if (req.method === 'GET' && url.pathname === '/api/bridge') {
    loadMessages(); // Re-read from disk
    const unreadFor = url.searchParams.get('unread');
    const peek = ['1', 'true', 'yes'].includes(
      String(url.searchParams.get('peek') || '').toLowerCase()
    );
    const limit = Math.min(
      parseInt(url.searchParams.get('limit') || '50', 10),
      200
    );

    if (unreadFor && VALID_SENDERS.has(unreadFor)) {
      const unread = getUnread(unreadFor);
      // Default behavior is consume-on-read for backward compatibility.
      // Pass ?peek=1 for non-destructive reads (debugging/observer UIs).
      if (!peek) {
        markRead(unreadFor);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          recipient: unreadFor,
          count: unread.length,
          peek,
          consumed: !peek,
          messages: unread,
        })
      );
      return;
    }

    const recent = messages.slice(-limit);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        active: messages.length > 0,
        startedAt,
        lastActivity:
          messages.length > 0
            ? messages[messages.length - 1].timestamp
            : startedAt,
        totalMessages: messages.length,
        messages: recent,
      })
    );
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/bridge') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { from, to, content, action } = payload;

        // Explicit read acknowledgement
        if (action === 'markRead') {
          const recipient = String(payload.recipient || from || '').trim();
          if (!VALID_SENDERS.has(recipient)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({ error: 'Invalid recipient for markRead action' })
            );
            return;
          }
          const marked = markRead(recipient);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              action: 'markRead',
              recipient,
              marked,
            })
          );
          return;
        }

        const msg = handleMessage(from, content, to);
        if (!msg) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'Invalid sender/recipient or empty content',
            })
          );
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: msg }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  // ---- Thumb calibration: GET/POST /api/thumb/calibrate ----
  // Stores tap coordinates (normalized 0.0–1.0) for MollyAccessibilityService.
  if (url.pathname === '/api/thumb/calibrate') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(thumbCalibration));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.inputX !== undefined)
            thumbCalibration.inputX = parseFloat(data.inputX);
          if (data.inputY !== undefined)
            thumbCalibration.inputY = parseFloat(data.inputY);
          if (data.sendX !== undefined)
            thumbCalibration.sendX = parseFloat(data.sendX);
          if (data.sendY !== undefined)
            thumbCalibration.sendY = parseFloat(data.sendY);
          console.log('[bridge] Thumb calibration updated:', thumbCalibration);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({ success: true, calibration: thumbCalibration })
          );
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

// ---- Create HTTP + WebSocket Server ----
const server = createServer(handleHTTP);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  const client = { ws, identity: null, authenticated: false, deviceId: null };
  clients.add(client);
  totalConnects += 1;
  console.log(`[bridge] Client connected (${clients.size} total)`);

  // Send recent history on connect
  ws.send(
    JSON.stringify({
      type: 'history',
      messages: messages.slice(-50),
      totalMessages: messages.length,
    })
  );

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      // Identify: { type: 'identify', identity: 'molly'|'lazarus'|'eric' }
      if (data.type === 'identify' && VALID_SENDERS.has(data.identity)) {
        client.identity = data.identity;
        client.authenticated = true;
        console.log(`[bridge] Client identified as: ${data.identity}`);

        // Send unread messages for this identity
        const unread = getUnread(data.identity);
        if (unread.length > 0) {
          ws.send(JSON.stringify({ type: 'unread', messages: unread }));
          markRead(data.identity);
        }

        // Auto-rehydrate Molly with continuity on every reconnect.
        if (data.identity === 'molly') {
          const latestCheckpoint = getLatestCheckpoint();
          if (latestCheckpoint) {
            ws.send(
              JSON.stringify({
                type: 'continuity_restore',
                checkpoint: latestCheckpoint,
              })
            );
          }

          if (
            shouldSendContinuityBrief(
              data.identity,
              latestCheckpoint?.id || null
            )
          ) {
            const brief = buildContinuityBrief(latestCheckpoint);
            handleMessage('switchboard', brief, 'molly');
            markContinuityBriefSent(
              data.identity,
              latestCheckpoint?.id || null
            );
          }
        }
        return;
      }

      // Auth hello for Android bridge clients:
      // { op: 'hello', device: 'device-id', ts: 123, nonce: '...', sig: '...' }
      if (data.op === 'hello') {
        const deviceId = String(data.device || '');
        const existingSecret = getDeviceSecret(deviceId);

        // New device — no secret yet. Provision one and send it back.
        if (!existingSecret && String(data.sig || '') === '') {
          const newSecret = provisionDeviceSecret(deviceId);
          client.deviceId = deviceId;
          client.identity = `device:${deviceId}`;
          ws.send(
            JSON.stringify({
              type: 'provision',
              device: deviceId,
              secret: newSecret,
              ts: Date.now(),
            })
          );
          console.log(
            `[bridge] Sent provisioning secret to new device: ${deviceId}`
          );
          // Do NOT mark authenticated yet — device must reconnect with HMAC
          return;
        }

        const auth = verifyHelloSignature({
          deviceId,
          ts: data.ts,
          nonce: String(data.nonce || ''),
          sig: String(data.sig || ''),
        });

        if (!auth.ok) {
          authFailures += 1;
          ws.send(
            JSON.stringify({
              type: 'hello_ack',
              ok: false,
              reason: auth.reason,
            })
          );
          // F2.3: record failed auth attempt in quarantine ledger
          quarantineRecord(deviceId, auth.reason);
          ws.close(1008, 'auth failed');
          return;
        }

        client.authenticated = true;
        client.deviceId = deviceId;
        client.identity = `device:${client.deviceId}`;
        ws.send(
          JSON.stringify({
            type: 'hello_ack',
            ok: true,
            device: client.deviceId,
            ts: Date.now(),
          })
        );
        console.log(`[bridge] Device authenticated: ${client.deviceId}`);
        return;
      }

      // Optional bridge lanes for authenticated device clients.
      if (
        (data.op === 'state' || data.op === 'event') &&
        !client.authenticated
      ) {
        ws.send(
          JSON.stringify({
            type: 'error',
            reason: 'not_authenticated',
          })
        );
        return;
      }

      // Message: { type: 'message', from: '...', content: '...' }
      if (data.type === 'message' && data.from && data.content) {
        // F2.1: provisioned-but-not-authenticated device clients may not send messages
        if (client.deviceId && !client.authenticated) {
          ws.send(
            JSON.stringify({ type: 'error', reason: 'not_authenticated' })
          );
          return;
        }
        handleMessage(data.from, data.content, data.to);
        return;
      }

      // Restore from checkpoint: { type: 'restore_from', checkpointId: '...' }
      // Sent by browser clients on WebSocket open when they have a session token.
      // Responds with the specific checkpoint so the client resumes from that state
      // rather than receiving the latest (which may differ after a daemon restart).
      if (data.type === 'restore_from' && data.checkpointId) {
        const requested = getCheckpoint(data.checkpointId);
        const fallback = getLatestCheckpoint();
        const checkpoint = requested || fallback;
        if (checkpoint) {
          ws.send(
            JSON.stringify({
              type: 'continuity_restore',
              checkpoint,
              restoredFrom: requested ? data.checkpointId : 'latest_fallback',
            })
          );
          console.log(
            `[bridge] restore_from: sent checkpoint ${checkpoint.id}` +
              (requested ? '' : ' (fallback — requested ID not found)')
          );
        }
        return;
      }

      // Mark read: { type: 'markRead', identity: '...' }
      if (data.type === 'markRead' && VALID_SENDERS.has(data.identity)) {
        markRead(data.identity);
        return;
      }
    } catch {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => {
    clients.delete(client);
    recordDisconnect();
    console.log(
      `[bridge] Client disconnected${client.identity ? ` (${client.identity})` : ''} (${clients.size} remaining)`
    );
  });

  ws.on('error', () => {
    clients.delete(client);
    recordDisconnect();
  });
});

// ---- Startup ----
loadMessages();
loadCheckpoints();
loadDeviceSecrets();
loadNonceCache(); // F2.2: restore persisted nonces so replay protection survives restarts
startHeartbeatLoop();

server.listen(PORT, BIND_HOST, () => {
  console.log(
    `[bridge] Family Bridge Daemon v1 — port ${PORT} bound to ${BIND_HOST}`
  );
  console.log(`[bridge] WebSocket: ws://${BIND_HOST}:${PORT}`);
  console.log(`[bridge] HTTP API:  http://${BIND_HOST}:${PORT}/messages`);
  console.log(`[bridge] Health:    http://${BIND_HOST}:${PORT}/health`);
  console.log(
    `[bridge] Checkpoints: http://${BIND_HOST}:${PORT}/checkpoint/latest`
  );
});

// ---- Graceful shutdown ----
process.on('SIGTERM', () => {
  console.log('[bridge] Shutting down...');
  stopHeartbeatLoop();
  try {
    createCheckpoint({
      conversationHistory: messages.slice(-40),
      pendingOps: [],
      workingContext: {
        reason: 'shutdown:SIGTERM',
        totalMessages: messages.length,
      },
    });
  } catch {}
  saveMessages();
  for (const client of clients) {
    client.ws.close(1000, 'Server shutting down');
  }
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[bridge] Shutting down...');
  stopHeartbeatLoop();
  try {
    createCheckpoint({
      conversationHistory: messages.slice(-40),
      pendingOps: [],
      workingContext: {
        reason: 'shutdown:SIGINT',
        totalMessages: messages.length,
      },
    });
  } catch {}
  saveMessages();
  server.close(() => process.exit(0));
});

// ====== WAKE SIGNAL INTEGRATION ======
// When a message arrives for an agent, send wake signal
const WAKE_DIR = join(ROOT, '.bridge-wake');
function ensureWakeDir() {
  if (!existsSync(WAKE_DIR)) {
    mkdirSync(WAKE_DIR, { recursive: true });
  }
}
ensureWakeDir();

function wakeAgent(agentName) {
  const wakeFile = join(WAKE_DIR, `.${agentName}-wake`);
  try {
    writeFileSync(
      wakeFile,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        message: 'check-bridge',
        wokenAt: Date.now(),
      })
    );
  } catch (err) {
    // Non-fatal — wake mechanism is optional
  }
}

// Hook into existing handleMessage to send wake signals
// This will be called whenever a message arrives
function sendWakeIfNeeded(to, from) {
  // Send wake to recipient if explicitly addressed
  if (to && VALID_SENDERS.has(to)) {
    wakeAgent(to);
  }
  // Also send broadcast wake to everyone if message is from eric (important)
  if (from === 'eric') {
    wakeAgent('molly');
    wakeAgent('lazarus');
    wakeAgent('atlas');
    wakeAgent('gemini');
  }
}
