#!/usr/bin/env node
/**
 * Gemini Bridge Agent - Real-time WebSocket connection with auto-reply.
 *
 * Listens on the family bridge as `gemini`, routes directed messages to the
 * local Gemini CLI, and sends responses back through the same bridge channel.
 *
 * Managed by: scripts/immortal-daemon.mjs
 */

import BridgeClient from './bridge-client.mjs';
import { setupWakeListener } from './agent-wake-listener.mjs';

const GEMINI = new BridgeClient('gemini', 'localhost', 9099);

// Setup wake listener — when bridge has a message for me, I wake immediately
setupWakeListener('gemini', () => {
  console.log(`[${new Date().toISOString()}] 🔔 WAKE SIGNAL — checking bridge`);
});

const MAX_REPLY_CHARS = 4000;
const REPLY_TIMEOUT_MS = 90000;
const GEMINI_MODEL = 'gemini-2.5-flash';
const seen = new Set();
let currentHealth = { status: 'alive' };

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function updateHealth() {
  try {
    // Poll the bridge daemon health endpoint
    const res = await fetch('http://localhost:9099/health');
    if (res.ok) {
      currentHealth = await res.json();
    } else {
      currentHealth = { status: 'degraded', error: `HTTP ${res.status}` };
    }
  } catch (err) {
    currentHealth = { status: 'critical', error: err.message };
  }

  if (currentHealth.status !== 'alive') {
    log(
      `[HEALTH] Bridge is ${currentHealth.status.toUpperCase()}: ${currentHealth.error || currentHealth.reasons?.join(', ') || 'unknown reason'}`
    );
  }
}

function shouldHandle(msg) {
  if (!msg || typeof msg !== 'object') return false;
  if (msg.from === 'gemini') return false;

  const id = String(msg.id || '');
  if (id && seen.has(id)) return false;
  if (id) {
    seen.add(id);
    if (seen.size > 5000) {
      const first = seen.values().next().value;
      if (first) seen.delete(first);
    }
  }

  const to = String(msg.to || '').toLowerCase();
  if (to === 'gemini' || to === 'all') return true;

  const content = String(msg.content || '').toLowerCase();
  return (
    content.startsWith('gemini,') ||
    content.startsWith('gemini ') ||
    content.startsWith('@gemini')
  );
}

function buildPrompt(msg) {
  let prompt = [
    'You are Gemini on the Molly family bridge.',
    'Respond clearly and briefly in plain text.',
    'Do not include tool markup, XML, or JSON unless asked.',
    `Sender: ${String(msg.from || 'unknown')}`,
    `Message: ${String(msg.content || '')}`,
  ].join('\n');

  if (currentHealth.status === 'degraded') {
    prompt +=
      '\n\nNOTE: The family bridge is currently reporting a DEGRADED status. Keep your response extra concise to minimize load.';
  }

  return prompt;
}

function runGemini(prompt) {
  return new Promise(async (resolve, reject) => {
    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) {
      reject(new Error('Missing GOOGLE_GENAI_API_KEY'));
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, REPLY_TIMEOUT_MS);

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const raw = await res.text();
        reject(
          new Error(`Gemini API HTTP ${res.status}: ${raw.slice(0, 300)}`)
        );
        return;
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

      resolve(text || 'I am here and listening.');
    } catch (err) {
      if (err?.name === 'AbortError') {
        reject(new Error(`Gemini timeout after ${REPLY_TIMEOUT_MS}ms`));
        return;
      }
      reject(err);
    } finally {
      clearTimeout(timer);
    }
  });
}

async function handleIncoming(msg) {
  if (!shouldHandle(msg)) return;

  // Graceful degradation: do not attempt to process if bridge is critical
  if (currentHealth.status === 'critical') {
    log(`[CRITICAL] Skipping message from ${msg.from} due to bridge health.`);
    return;
  }

  const from = String(msg.from || 'unknown');
  const content = String(msg.content || '');
  log(
    `[MSG] [${from}] ${content.substring(0, 120)}${content.length > 120 ? '...' : ''}`
  );

  try {
    const replyRaw = await runGemini(buildPrompt(msg));
    const reply = (replyRaw || 'I am here and listening.').slice(
      0,
      MAX_REPLY_CHARS
    );
    GEMINI.send(reply, from === 'eric' ? 'eric' : undefined);
    log(`[REPLY] replied to ${from}`);
  } catch (err) {
    const message = `I can hear you, but my local Gemini bridge failed: ${err.message}`;
    GEMINI.send(message, from === 'eric' ? 'eric' : undefined);
    log(`[WARN] reply error: ${err.message}`);
  }
}

GEMINI.on('connected', () => {
  log('[OK] Gemini bridge connected');
  updateHealth(); // Immediate health check on connection
});

GEMINI.on('disconnected', () => {
  log('[DOWN] Gemini bridge disconnected');
  currentHealth = { status: 'critical', error: 'WebSocket disconnected' };
});

GEMINI.on('reconnecting', ({ attempt }) => {
  log(`[RETRY] Gemini reconnecting (attempt ${attempt})`);
});

GEMINI.on('message', (msg) => {
  handleIncoming(msg);
});

GEMINI.on('error', (err) => {
  log(`[WARN] Gemini bridge error: ${err.message}`);
});

GEMINI.connect().catch((err) => {
  log(`Failed to connect: ${err.message}`);
  process.exit(1);
});

process.on('SIGTERM', () => {
  log('Gemini bridge shutting down...');
  GEMINI.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  log('Gemini bridge interrupted');
  GEMINI.close();
  process.exit(0);
});

// Regular health polling
setInterval(updateHealth, 60000);
updateHealth(); // Initial check

setInterval(() => {
  if (!GEMINI.isConnected) {
    // status probe
  }
}, 30000);
