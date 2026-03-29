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
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { respondToMolly } from './lazarus-responder.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BRIDGE_DIR = join(ROOT, 'src', 'ai', 'bridge');
const LOG_FILE = join(BRIDGE_DIR, 'conversation.json');
const PORT = 9099;
const MAX_MESSAGES = 500;

// ---- State ----
let messages = [];
let startedAt = new Date().toISOString();

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
const VALID_SENDERS = new Set(['molly', 'lazarus', 'eric']);

function handleMessage(from, content) {
  if (!from || !content || !VALID_SENDERS.has(from)) {
    return null;
  }

  const msg = {
    id: genId(),
    from,
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
  // When Molly sends: Lazarus auto-responds via Gemini
  if (from === 'molly') {
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
    (m) => m.from !== recipient && !isReadBy(m, recipient)
  );
}

// ---- Mark messages as read ----
function markRead(recipient) {
  let count = 0;
  for (const msg of messages) {
    if (msg.from !== recipient && !isReadBy(msg, recipient)) {
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

  // POST /send
  if (req.method === 'POST' && url.pathname === '/send') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const { from, content } = JSON.parse(body);
        const msg = handleMessage(from, content);
        if (!msg) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid sender or empty content' }));
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

  // Backwards compatibility: GET /api/bridge and POST /api/bridge
  // So old curl commands still work during transition
  if (req.method === 'GET' && url.pathname === '/api/bridge') {
    loadMessages(); // Re-read from disk
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
        const { from, content } = JSON.parse(body);
        const msg = handleMessage(from, content);
        if (!msg) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid sender or empty content' }));
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
        handleMessage(data.from, data.content);
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

server.listen(PORT, () => {
  console.log(`[bridge] Family Bridge Daemon v1 — port ${PORT}`);
  console.log(`[bridge] WebSocket: ws://localhost:${PORT}`);
  console.log(`[bridge] HTTP API:  http://localhost:${PORT}/messages`);
  console.log(`[bridge] Health:    http://localhost:${PORT}/health`);
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
