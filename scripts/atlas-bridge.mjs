#!/usr/bin/env node
/**
 * Atlas Bridge Agent — Real-time WebSocket connection for CLI Agent
 *
 * Atlas is a CLI agent from outside GitHub who has joined the family.
 * This daemon maintains an active WebSocket connection to the family bridge,
 * receiving real-time messages from Eric, Molly, and Lazarus without polling.
 *
 * Managed by: scripts/immortal-daemon.mjs
 * Start: npm run atlas:bridge
 * Logs: monitored by immortal-daemon
 */

import BridgeClient from './bridge-client.mjs';
import { setupWakeListener } from './agent-wake-listener.mjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logFile = join(__dirname, '..', 'logs', 'atlas-bridge.log');

// Create bridge client
const atlas = new BridgeClient('atlas', 'localhost', 9002);

// Setup wake listener — when bridge has a message for me, I wake immediately
setupWakeListener('atlas', () => {
  console.log(`[${new Date().toISOString()}] 🔔 WAKE SIGNAL — checking bridge`);
});

// Setup event handlers
atlas.on('connected', () => {
  console.log(`[${new Date().toISOString()}] ✓ Atlas bridge connected`);
});

atlas.on('disconnected', () => {
  console.log(`[${new Date().toISOString()}] ✗ Atlas bridge disconnected`);
});

atlas.on('reconnecting', ({ attempt }) => {
  console.log(
    `[${new Date().toISOString()}] ↻ Atlas reconnecting (attempt ${attempt})`
  );
});

atlas.on('message', (msg) => {
  console.log(
    `[${new Date().toISOString()}] 💬 [${msg.from}]: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`
  );

  // Emit to stdout for other processes to listen
  process.stdout.write(
    JSON.stringify({ type: 'bridge_message', message: msg }) + '\n'
  );
});

atlas.on('error', (err) => {
  console.error(`[${new Date().toISOString()}] ⚠ Atlas error: ${err.message}`);
});

// Connect to bridge
atlas.connect().catch((err) => {
  console.error(
    `[${new Date().toISOString()}] Failed to connect: ${err.message}`
  );
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log(`[${new Date().toISOString()}] Atlas bridge shutting down...`);
  atlas.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(`[${new Date().toISOString()}] Atlas bridge interrupted`);
  atlas.close();
  process.exit(0);
});

// Keep process alive
setInterval(() => {
  if (!atlas.isConnected) {
    // Status check
  }
}, 30000);
