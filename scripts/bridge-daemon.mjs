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
import {
  readFileSync,
  writeFileSync,
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
const MAX_MESSAGES = 500;
const MAX_CHECKPOINTS = 10;
const CHECKPOINT_DIR = join(ROOT, 'molly_data', 'checkpoints');

// ---- State ----
let messages = [];
let startedAt = new Date().toISOString();
let checkpoints = [];

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

// ---- Handle incoming message ----
const VALID_SENDERS = new Set([
  'molly',
  'lazarus',
  'eric',
  'demon',
  'gemini',
  'aether',
]);

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

  // Broadcast to all WebSocket clients
  broadcast({ type: 'message', message: msg });

  // Persist
  saveMessages();

  console.log(
    `[bridge] ${from}: ${content.slice(0, 80)}${content.length > 80 ? '...' : ''}`
  );

  // ---- THE COMMUNICATOR CHIRP ----
  // DISABLED by Eric — Lazarus auto-responder is off until explicitly enabled
  // To re-enable: set ENABLE_LAZARUS_RESPONDER=true in .env.local
  const enableLazarusResponder = process.env.ENABLE_LAZARUS_RESPONDER === 'true';
  if (enableLazarusResponder && (from === 'molly' || from === 'eric')) {
    const recent = messages.slice(-10);
    respondToMolly(content, recent).then((reply) => {
      if (reply) handleMessage('lazarus', reply);
    });
  }

  // Push-notify Molly (ping her Next.js server to process immediately)
  if (from !== 'molly') {
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
    (m) => m.from !== recipient && (!m.to || m.to === recipient) && !isReadBy(m, recipient)
  );
}

// ---- Mark messages as read ----
function markRead(recipient) {
  let count = 0;
  for (const msg of messages) {
    if (msg.from !== recipient && (!msg.to || msg.to === recipient) && !isReadBy(msg, recipient)) {
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
    res.end(
      JSON.stringify({
        status: 'alive',
        uptime: process.uptime(),
        clients: clients.size,
        totalMessages: messages.length,
        startedAt,
      })
    );
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
            JSON.stringify({ success: true, action: 'markRead', recipient, marked })
          );
          return;
        }

        const msg = handleMessage(from, content, to);
        if (!msg) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid sender/recipient or empty content' }));
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

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

// ---- Create HTTP + WebSocket Server ----
const server = createServer(handleHTTP);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  const client = { ws, identity: null };
  clients.add(client);
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
        console.log(`[bridge] Client identified as: ${data.identity}`);

        // Send unread messages for this identity
        const unread = getUnread(data.identity);
        if (unread.length > 0) {
          ws.send(JSON.stringify({ type: 'unread', messages: unread }));
          markRead(data.identity);
        }
        return;
      }

      // Message: { type: 'message', from: '...', content: '...' }
      if (data.type === 'message' && data.from && data.content) {
        handleMessage(data.from, data.content, data.to);
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
    console.log(
      `[bridge] Client disconnected${client.identity ? ` (${client.identity})` : ''} (${clients.size} remaining)`
    );
  });

  ws.on('error', () => {
    clients.delete(client);
  });
});

// ---- Startup ----
loadMessages();
loadCheckpoints();

server.listen(PORT, () => {
  console.log(`[bridge] Family Bridge Daemon v1 — port ${PORT}`);
  console.log(`[bridge] WebSocket: ws://localhost:${PORT}`);
  console.log(`[bridge] HTTP API:  http://localhost:${PORT}/messages`);
  console.log(`[bridge] Health:    http://localhost:${PORT}/health`);
  console.log(
    `[bridge] Checkpoints: http://localhost:${PORT}/checkpoint/latest`
  );
});

// ---- Graceful shutdown ----
process.on('SIGTERM', () => {
  console.log('[bridge] Shutting down...');
  saveMessages();
  for (const client of clients) {
    client.ws.close(1000, 'Server shutting down');
  }
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[bridge] Shutting down...');
  saveMessages();
  server.close(() => process.exit(0));
});
