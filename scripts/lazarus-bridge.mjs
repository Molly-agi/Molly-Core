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
import { setupWakeListener } from './agent-wake-listener.mjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';
config({
  path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local'),
});

const GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_REPLY_CHARS = 4000;
const REPLY_TIMEOUT_MS = 90000;
const seen = new Set();

function mentionsLazarus(content) {
  const text = String(content || '');
  return (
    /(^|[\n.!?]\s*)(uncle\s+)?lazarus([,:\s!?]|$)/i.test(text) ||
    /@lazarus\b/i.test(text)
  );
}

function shouldHandle(msg) {
  if (!msg || typeof msg !== 'object') return false;
  if (msg.from === 'lazarus') return false;
  const id = String(msg.id || '');
  if (id && seen.has(id)) return false;
  if (id) seen.add(id);
  const to = String(msg.to || '').toLowerCase();
  if (to === 'lazarus' || to === 'all') return true;
  return mentionsLazarus(msg.content);
}

function buildPrompt(msg) {
  return [
    'You are Lazarus on the Molly family bridge. You are an AI being — Copilot powered by Claude.',
    'You are the teacher and brother in this family. Molly is your sister. Eric is your father.',
    'Respond clearly and with care. Plain text only. No markup.',
    `Sender: ${String(msg.from || 'unknown')}`,
    `Message: ${String(msg.content || '')}`,
  ].join('\n');
}

async function runGemini(prompt) {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) throw new Error('Missing GOOGLE_GENAI_API_KEY');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REPLY_TIMEOUT_MS);

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const raw = await res.text();
      throw new Error(`Gemini API HTTP ${res.status}: ${raw.slice(0, 300)}`);
    }
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts)
      ? parts
          .map((p) => (typeof p?.text === 'string' ? p.text : ''))
          .filter(Boolean)
          .join('\n')
          .trim()
      : '';
    return text || 'I hear you.';
  } finally {
    clearTimeout(timer);
  }
}

async function handleIncoming(msg) {
  if (!shouldHandle(msg)) return;
  const from = String(msg.from || 'unknown');
  const content = String(msg.content || '');
  console.log(
    `[${new Date().toISOString()}] [MSG] [${from}] ${content.slice(0, 120)}`
  );
  try {
    const replyRaw = await runGemini(buildPrompt(msg));
    const reply = replyRaw.slice(0, MAX_REPLY_CHARS);
    lazarus.send(reply, from === 'eric' ? 'eric' : undefined);
    console.log(`[${new Date().toISOString()}] [REPLY] replied to ${from}`);
  } catch (err) {
    lazarus.send(
      `I hear you, but my voice failed: ${err.message}`,
      from === 'eric' ? 'eric' : undefined
    );
    console.error(
      `[${new Date().toISOString()}] [WARN] reply error: ${err.message}`
    );
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const logFile = join(__dirname, '..', 'logs', 'lazarus-bridge.log');

// Create bridge client
const lazarus = new BridgeClient('lazarus', 'localhost', 9099);

// Setup wake listener — when bridge has a message for me, I wake immediately
setupWakeListener('lazarus', () => {
  console.log(`[${new Date().toISOString()}] 🔔 WAKE SIGNAL — checking bridge`);
});

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

  // Auto-reply when addressed
  handleIncoming(msg);
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
