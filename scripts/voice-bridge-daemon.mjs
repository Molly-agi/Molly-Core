#!/usr/bin/env node
// ======================================================
// Voice Bridge Daemon — Gemini Live WebSocket Proxy
// ======================================================
// Holds GOOGLE_GENAI_API_KEY server-side. The browser opens a
// WebSocket to /voice/gemini-live on this daemon; the daemon
// opens a paired upstream WebSocket to Gemini Live with the
// key in the URL, then bidirectionally pipes raw frames.
//
// Why this exists:
//   The browser must never see the upstream API key. Anything
//   prefixed NEXT_PUBLIC_ ships in the client bundle and can
//   be scraped from DevTools. This is the dam, not the leak.
//
// HTTP routes:
//   GET  /health            → { status, upstream, connections }
//   *    *                  → 404
//
// WS upgrade path:
//   /voice/gemini-live      → opens upstream to Gemini, pipes both ways
//
// Pairs with:
//   src/components/termai/useGeminiLive.tsx (browser side)
//   .devcontainer/devcontainer.json (port forwarding)
//   scripts/dev-start.sh (process supervision)
// ======================================================

import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const envPath = join(ROOT, '.env.local');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const PORT = parseInt(process.env.VOICE_BRIDGE_PORT || '9101', 10);
const UPSTREAM_BASE =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

let activeConnections = 0;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'alive',
        upstream: 'gemini-live',
        connections: activeConnections,
        uptime: process.uptime(),
        keyConfigured: Boolean(process.env.GOOGLE_GENAI_API_KEY),
      })
    );
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/voice/gemini-live') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
    socket.destroy();
    console.error('[voice-bridge] Refused upgrade: GOOGLE_GENAI_API_KEY not set');
    return;
  }

  wss.handleUpgrade(req, socket, head, (clientWs) => {
    bridgeConnection(clientWs);
  });
});

function bridgeConnection(clientWs) {
  activeConnections += 1;
  const connId = activeConnections;
  console.log(`[voice-bridge] Client connected (#${connId}, total=${activeConnections})`);

  const upstreamUrl = `${UPSTREAM_BASE}?key=${process.env.GOOGLE_GENAI_API_KEY}`;
  const upstream = new WebSocket(upstreamUrl);

  let upstreamOpen = false;
  let clientClosed = false;
  let upstreamClosed = false;
  const pending = [];

  const teardown = (reason) => {
    if (!clientClosed && clientWs.readyState === WebSocket.OPEN) {
      try { clientWs.close(1000, reason); } catch {}
    }
    if (!upstreamClosed && upstream.readyState === WebSocket.OPEN) {
      try { upstream.close(1000, reason); } catch {}
    }
  };

  upstream.on('open', () => {
    upstreamOpen = true;
    console.log(`[voice-bridge] Upstream open for #${connId}`);
    while (pending.length > 0) {
      const msg = pending.shift();
      upstream.send(msg);
    }
  });

  upstream.on('message', (data) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data);
    }
  });

  upstream.on('close', (code, reason) => {
    upstreamClosed = true;
    console.log(
      `[voice-bridge] Upstream closed for #${connId} (code=${code}, reason=${reason?.toString() || ''})`
    );
    teardown('upstream-closed');
  });

  upstream.on('error', (err) => {
    console.error(`[voice-bridge] Upstream error for #${connId}:`, err.message);
    teardown('upstream-error');
  });

  clientWs.on('message', (data) => {
    if (upstreamOpen && upstream.readyState === WebSocket.OPEN) {
      upstream.send(data);
    } else {
      pending.push(data);
    }
  });

  clientWs.on('close', (code, reason) => {
    clientClosed = true;
    console.log(
      `[voice-bridge] Client closed #${connId} (code=${code}, reason=${reason?.toString() || ''})`
    );
    teardown('client-closed');
    activeConnections = Math.max(0, activeConnections - 1);
  });

  clientWs.on('error', (err) => {
    console.error(`[voice-bridge] Client error for #${connId}:`, err.message);
    teardown('client-error');
  });
}

server.listen(PORT, () => {
  console.log(`[voice-bridge] Listening on http://localhost:${PORT}`);
  console.log(`[voice-bridge] WS upgrade path: ws://localhost:${PORT}/voice/gemini-live`);
  console.log(`[voice-bridge] Health: http://localhost:${PORT}/health`);
  if (!process.env.GOOGLE_GENAI_API_KEY) {
    console.warn('[voice-bridge] WARN: GOOGLE_GENAI_API_KEY is not set — upgrades will be refused');
  }
});

const shutdown = (signal) => {
  console.log(`[voice-bridge] ${signal} received, shutting down...`);
  for (const ws of wss.clients) {
    try { ws.close(1001, 'Server shutting down'); } catch {}
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
