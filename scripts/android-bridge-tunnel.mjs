#!/usr/bin/env node

import { WebSocketServer } from 'ws';
import http from 'http';
import { WebSocket } from 'ws';
import url from 'url';

const TUNNEL_PORT = process.env.TUNNEL_PORT || 9100;
const DAEMON_HOST = 'localhost';
const DAEMON_PORT = 9099;
const NEXTJS_HOST = 'localhost';
const NEXTJS_PORT = 9002;

const clients = new Map();
let clientCounter = 0;

console.log(`[tunnel] Starting Android Bridge Tunnel on port ${TUNNEL_PORT}`);
console.log(`[tunnel] Daemon: ${DAEMON_HOST}:${DAEMON_PORT}`);
console.log(`[tunnel] Next.js: ${NEXTJS_HOST}:${NEXTJS_PORT}`);

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'alive',
      tunnel: 'active',
      port: TUNNEL_PORT,
      clients: clients.size,
      timestamp: new Date().toISOString(),
    }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const clientId = ++clientCounter;
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  
  let targetHost = DAEMON_HOST;
  let targetPort = DAEMON_PORT;
  let route = 'daemon';

  if (pathname.includes('/ui') || pathname.includes('/next')) {
    targetHost = NEXTJS_HOST;
    targetPort = NEXTJS_PORT;
    route = 'nextjs';
  }

  console.log(`[tunnel] Client #${clientId} connected -> ${route}`);

  const upstreamUrl = `ws://${targetHost}:${targetPort}${pathname}`;
  const upstreamWs = new WebSocket(upstreamUrl);
  
  clients.set(clientId, { ws, route, upstreamWs });

  upstreamWs.on('open', () => {
    console.log(`[tunnel] Client #${clientId}: upstream open`);
  });

  upstreamWs.on('message', (data) => {
    if (ws.readyState === 1) ws.send(data);
  });

  upstreamWs.on('close', (code) => {
    console.log(`[tunnel] Client #${clientId}: upstream closed (${code})`);
    if (ws.readyState === 1) ws.close(code);
  });

  upstreamWs.on('error', (err) => {
    console.error(`[tunnel] Client #${clientId}: upstream error - ${err.message}`);
    if (ws.readyState === 1) ws.close(1011);
  });

  ws.on('message', (data) => {
    if (upstreamWs.readyState === 1) upstreamWs.send(data);
  });

  ws.on('close', (code) => {
    console.log(`[tunnel] Client #${clientId}: closed (${code})`);
    if (upstreamWs.readyState === 1) upstreamWs.close(code);
    clients.delete(clientId);
  });

  ws.on('error', (err) => {
    console.error(`[tunnel] Client #${clientId}: error - ${err.message}`);
    if (upstreamWs.readyState === 1) upstreamWs.close(1011);
  });
});

server.listen(TUNNEL_PORT, () => {
  console.log(`[tunnel] ✓ Listening on ${TUNNEL_PORT}`);
  console.log(`[tunnel] wss://codespace-url:${TUNNEL_PORT}`);
});

process.on('SIGTERM', () => {
  console.log('[tunnel] Shutting down...');
  server.close();
  process.exit(0);
});
