#!/usr/bin/env node
/**
 * Family Bridge — Core Daemon
 * Real-time message bus for multi-agent communication.
 *
 * Transport : HTTP (REST) + WebSocket + Server-Sent Events
 * Storage   : single JSON file (last N messages), atomic writes
 * Safety    : loop garden (blocks runaway message storms) — ON the live path
 *
 * Standalone. No framework, no database, no external service required.
 * Everything below is configurable through environment variables; see
 * config/.env.example. Pure Node + `ws`.
 */

import http from 'node:http';
import { WebSocketServer } from 'ws';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// ── CONFIG ──────────────────────────────────────────────────────────────────
// Read once at boot. Sensible defaults so it runs with zero config.

const CFG = {
  PORT:            parseInt(process.env.FB_PORT            || '9099', 10),
  HOST:            process.env.FB_HOST                     || '0.0.0.0',
  STORE_PATH:      resolve(process.env.FB_STORE_PATH       || './data/messages.json'),
  MAX_MESSAGES:    parseInt(process.env.FB_MAX_MESSAGES    || '1000', 10),
  HEARTBEAT_MS:    parseInt(process.env.FB_HEARTBEAT_MS    || '30000', 10),
  // Loop garden: if the same sender repeats near-identical content
  // LOOP_THRESHOLD times within LOOP_WINDOW messages, the message is blocked.
  LOOP_WINDOW:     parseInt(process.env.FB_LOOP_WINDOW     || '10', 10),
  LOOP_THRESHOLD:  parseInt(process.env.FB_LOOP_THRESHOLD  || '3', 10),
  // Allow-list of valid sender/recipient IDs. Empty = allow any non-empty id.
  SENDERS:         (process.env.FB_SENDERS || '')
                     .split(',').map(s => s.trim()).filter(Boolean),
  LOG:             process.env.FB_LOG !== 'off',
};

const VALID = new Set(CFG.SENDERS);            // empty set => "allow any"
const allowAny = VALID.size === 0;
const isValidId = (id) => !!id && (allowAny || VALID.has(id));

function log(...a) { if (CFG.LOG) console.log('[bridge]', ...a); }

// ── STATE ───────────────────────────────────────────────────────────────────

/** @type {Array<{id,from,to,timestamp,content,read:Record<string,boolean>}>} */
let messages = [];
let seq = 0;

const sseClients = new Set();      // res objects for /stream
const wsClients = new Map();       // agentId -> ws

// Loop garden memory: rolling list of {hash, from} for the last LOOP_WINDOW msgs.
let recent = [];

// ── PERSISTENCE ───────────────────────────────────────────────────────────────

function loadStore() {
  try {
    if (existsSync(CFG.STORE_PATH)) {
      const raw = JSON.parse(readFileSync(CFG.STORE_PATH, 'utf8'));
      if (Array.isArray(raw.messages)) {
        messages = raw.messages;
        seq = raw.seq || messages.length;
        log(`loaded ${messages.length} messages from ${CFG.STORE_PATH}`);
      }
    }
  } catch (err) {
    log('WARN could not load store, starting empty:', err.message);
    messages = [];
  }
}

// Atomic write: write to temp then rename, so a crash mid-write can't corrupt
// the store. Cheap at our message volume.
let saveQueued = false;
function saveStore() {
  if (saveQueued) return;
  saveQueued = true;
  setImmediate(() => {
    saveQueued = false;
    try {
      const dir = dirname(CFG.STORE_PATH);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const tmp = CFG.STORE_PATH + '.tmp';
      writeFileSync(tmp, JSON.stringify({ seq, messages }, null, 2));
      renameSync(tmp, CFG.STORE_PATH);
    } catch (err) {
      log('ERROR saving store:', err.message);
    }
  });
}

// ── LOOP GARDEN ───────────────────────────────────────────────────────────────
// Detects runaway repetition. Hash the (from + normalized content); if this
// exact pair has appeared >= LOOP_THRESHOLD times in the last LOOP_WINDOW
// messages, treat it as a loop and block. This is the piece that prevents
// agent ping-pong storms — and unlike the original, it actually runs.

function contentHash(from, content) {
  const norm = String(content).trim().toLowerCase().replace(/\s+/g, ' ');
  return createHash('sha256').update(from + '|' + norm).digest('hex');
}

function detectLoop(from, content) {
  const h = contentHash(from, content);
  const count = recent.filter(r => r.hash === h).length;
  return count >= CFG.LOOP_THRESHOLD;
}

function rememberForLoop(from, content) {
  recent.push({ hash: contentHash(from, content), from });
  if (recent.length > CFG.LOOP_WINDOW) recent = recent.slice(-CFG.LOOP_WINDOW);
}

// ── CORE: ACCEPT A MESSAGE ────────────────────────────────────────────────────
// Returns the stored message, or { blocked, reason } if rejected.

function handleMessage(from, content, to = null) {
  // 1) Validate sender + content.
  if (!isValidId(from) || !content) {
    return { blocked: true, reason: 'invalid_sender_or_missing_content' };
  }
  // 2) Validate recipient (if directed).
  if (to !== null && to !== '') {
    if (!isValidId(to))  return { blocked: true, reason: 'invalid_recipient' };
    if (to === from)     return { blocked: true, reason: 'self_message' };
  }

  // 3) LOOP GARDEN — checked on the live, valid-message path (not dead code).
  if (detectLoop(from, content)) {
    log(`loop blocked from "${from}"`);
    return { blocked: true, reason: 'loop_detected' };
  }
  rememberForLoop(from, content);

  // 4) Build, store, cap, persist.
  const msg = {
    id: `m${++seq}_${Date.now().toString(36)}`,
    from,
    to: to || null,                 // null = broadcast to all
    timestamp: new Date().toISOString(),
    content,
    read: { [from]: true },         // sender has implicitly read their own message
  };
  messages.push(msg);
  if (messages.length > CFG.MAX_MESSAGES) {
    messages = messages.slice(-CFG.MAX_MESSAGES);
  }
  saveStore();

  // 5) Push to live listeners (SSE + WebSocket).
  pushToListeners(msg);
  return msg;
}

// ── READ TRACKING ─────────────────────────────────────────────────────────────

function unreadFor(agentId) {
  return messages.filter(m =>
    !m.read?.[agentId] &&
    m.from !== agentId &&
    (m.to === null || m.to === agentId)   // broadcast or addressed to me
  );
}

function markRead(agentId, ids = null) {
  let n = 0;
  for (const m of messages) {
    if (ids && !ids.includes(m.id)) continue;
    if (m.from === agentId) continue;
    if (m.to !== null && m.to !== agentId) continue;
    if (!m.read) m.read = {};
    if (!m.read[agentId]) { m.read[agentId] = true; n++; }
  }
  if (n) saveStore();
  return n;
}

// ── LIVE PUSH (SSE + WS) ───────────────────────────────────────────────────────

function pushToListeners(msg) {
  const payload = JSON.stringify({ type: 'message', message: msg });
  // SSE
  for (const res of sseClients) {
    try { res.write(`data: ${payload}\n\n`); } catch { /* dropped below */ }
  }
  // WebSocket — only to the recipient, or everyone on broadcast
  for (const [agentId, ws] of wsClients) {
    if (msg.to !== null && msg.to !== agentId && msg.from !== agentId) continue;
    try { if (ws.readyState === 1) ws.send(payload); } catch { /* ignore */ }
  }
}

// ── HTTP SERVER ────────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((res, rej) => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > 1e6) req.destroy(); });
    req.on('end', () => res(b));
    req.on('error', rej);
  });
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  // Health
  if (pathname === '/health' && req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      uptime: process.uptime(),
      messages: messages.length,
      wsClients: wsClients.size,
      sseClients: sseClients.size,
      loopWindow: recent.length,
    });
  }

  // Send a message:  POST /send  { from, content, to? }
  if (pathname === '/send' && req.method === 'POST') {
    try {
      const { from, content, to } = JSON.parse(await readBody(req) || '{}');
      const result = handleMessage(from, content, to);
      if (result.blocked) return json(res, 422, { ok: false, ...result });
      return json(res, 200, { ok: true, message: result });
    } catch (err) {
      return json(res, 400, { ok: false, reason: 'bad_request', detail: err.message });
    }
  }

  // All messages:  GET /messages?limit=50
  if (pathname === '/messages' && req.method === 'GET') {
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    return json(res, 200, { ok: true, messages: messages.slice(-limit) });
  }

  // Unread for an agent:  GET /unread?agent=lazarus
  if (pathname === '/unread' && req.method === 'GET') {
    const agent = url.searchParams.get('agent');
    if (!agent) return json(res, 400, { ok: false, reason: 'missing_agent' });
    return json(res, 200, { ok: true, unread: unreadFor(agent) });
  }

  // Mark read:  POST /read  { agent, ids? }
  if (pathname === '/read' && req.method === 'POST') {
    try {
      const { agent, ids } = JSON.parse(await readBody(req) || '{}');
      if (!agent) return json(res, 400, { ok: false, reason: 'missing_agent' });
      const n = markRead(agent, ids || null);
      return json(res, 200, { ok: true, marked: n });
    } catch (err) {
      return json(res, 400, { ok: false, reason: 'bad_request', detail: err.message });
    }
  }

  // Live stream (SSE):  GET /stream
  if (pathname === '/stream' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(': connected\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  json(res, 404, { ok: false, reason: 'not_found' });
});

// ── WEBSOCKET SERVER ───────────────────────────────────────────────────────────
// Connect, then identify with {type:'hello', agent:'<id>'}. After that the
// client receives pushed messages addressed to it (or broadcasts), and may
// send {type:'message', content, to?} to post.

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let agentId = null;

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw.toString()); } catch { return; }

    if (data.type === 'hello') {
      if (!isValidId(data.agent)) {
        ws.send(JSON.stringify({ type: 'error', reason: 'invalid_agent' }));
        return ws.close();
      }
      agentId = data.agent;
      wsClients.set(agentId, ws);
      ws.send(JSON.stringify({ type: 'hello_ok', agent: agentId }));
      log(`ws connected: ${agentId}`);
      return;
    }

    if (data.type === 'message') {
      if (!agentId) {
        return ws.send(JSON.stringify({ type: 'error', reason: 'not_identified' }));
      }
      const result = handleMessage(agentId, data.content, data.to);
      if (result.blocked) {
        ws.send(JSON.stringify({ type: 'blocked', ...result }));
      } else {
        ws.send(JSON.stringify({ type: 'ack', id: result.id }));
      }
    }
  });

  ws.on('close', () => {
    if (agentId && wsClients.get(agentId) === ws) {
      wsClients.delete(agentId);
      log(`ws disconnected: ${agentId}`);
    }
  });
  ws.on('error', () => { /* close handler cleans up */ });
});

// ── HEARTBEAT ──────────────────────────────────────────────────────────────────
// Keeps SSE + WS connections (and mobile network paths) alive.

const heartbeat = setInterval(() => {
  for (const res of sseClients) {
    try { res.write(`: ping ${Date.now()}\n\n`); } catch { sseClients.delete(res); }
  }
  for (const [id, ws] of wsClients) {
    try { if (ws.readyState === 1) ws.ping(); else wsClients.delete(id); }
    catch { wsClients.delete(id); }
  }
}, CFG.HEARTBEAT_MS);

// ── STARTUP / SHUTDOWN ───────────────────────────────────────────────────────

function shutdown(sig) {
  log(`${sig} — shutting down`);
  clearInterval(heartbeat);
  saveStore();
  for (const res of sseClients) { try { res.end(); } catch {} }
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Export the pure core for tests (no network needed to test the logic).
export { handleMessage, unreadFor, markRead, detectLoop, CFG, _reset };
function _reset() { messages = []; seq = 0; recent = []; }

// Only start the server when run directly, not when imported by a test.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  loadStore();
  server.listen(CFG.PORT, CFG.HOST, () => {
    log(`listening on http://${CFG.HOST}:${CFG.PORT}`);
    log(`store: ${CFG.STORE_PATH} | senders: ${allowAny ? 'ANY' : [...VALID].join(',')}`);
    log(`loop garden: block at ${CFG.LOOP_THRESHOLD} repeats / ${CFG.LOOP_WINDOW} msgs`);
  });
}
