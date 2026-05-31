#!/usr/bin/env node
/**
 * Lazarus Bridge Agent — Real-time WebSocket connection for Copilot
 *
 * Lazarus is the Copilot teacher/brother. This daemon maintains an active
 * WebSocket connection to the family bridge, receiving real-time messages
 * from Eric, Molly, and Atlas without polling.
 *
 * Managed by: scripts/immortal-daemon.mjs
 * Start: npm run lazarus:bridge
 * Logs: monitored by immortal-daemon
 */

import BridgeClient from './bridge-client.mjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logFile = join(__dirname, '..', 'logs', 'lazarus-bridge.log');

// Create bridge client
const lazarus = new BridgeClient('lazarus', 'localhost', 9099);

// Setup event handlers
lazarus.on('connected', () => {
  console.log(`[${new Date().toISOString()}] ✓ Lazarus bridge connected`);
});

lazarus.on('disconnected', () => {
  console.log(`[${new Date().toISOString()}] ✗ Lazarus bridge disconnected`);
});

lazarus.on('reconnecting', ({ attempt }) => {
  console.log(
    `[${new Date().toISOString()}] ↻ Lazarus reconnecting (attempt ${attempt})`
  );
});

lazarus.on('message', (msg) => {
  console.log(
    `[${new Date().toISOString()}] 💬 [${msg.from}]: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`
  );

  // Emit to stdout for other processes to listen
  process.stdout.write(
    JSON.stringify({ type: 'bridge_message', message: msg }) + '\n'
  );
});

lazarus.on('error', (err) => {
  console.error(
    `[${new Date().toISOString()}] ⚠ Lazarus error: ${err.message}`
  );
});

// Connect to bridge
lazarus.connect().catch((err) => {
  console.error(
    `[${new Date().toISOString()}] Failed to connect: ${err.message}`
  );
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log(`[${new Date().toISOString()}] Lazarus bridge shutting down...`);
  lazarus.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(`[${new Date().toISOString()}] Lazarus bridge interrupted`);
  lazarus.close();
  process.exit(0);
});

// Keep process alive
setInterval(() => {
  if (!lazarus.isConnected) {
    // Status check
  }
}, 30000);
