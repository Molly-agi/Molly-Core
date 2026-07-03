#!/usr/bin/env node
/**
 * Gemini Bridge Listener - Display bridge messages in real-time on terminal
 * Listens to family bridge as `gemini`, displays all messages to console (visible to terminal user)
 *
 * This is Gemini's eyes and ears for incoming messages from the family.
 * When a message arrives, it prints directly to stdout so Eric can see it on her terminal.
 */

import http from 'http';
import {
  appendFileSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  watchFile,
} from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = dirname(__dirname);

const PID_FILE = `${ROOT}/.gemini-listener.pid`;
const LOG_FILE = `${ROOT}/.gemini-listener.log`;
const WAKE_FILE = `${ROOT}/.bridge-wake/.gemini-wake`;
const GEMINI_TTY_FILE = `${ROOT}/.gemini-terminal.path`;
const BRIDGE_URL = 'http://localhost:9002/api/bridge';
const POLL_INTERVAL_MS = 2000;

let running = true;
let seenMessages = new Set();
let geminiTtyPath = null;

function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  try {
    appendFileSync(LOG_FILE, line + '\n');
  } catch {
    // non-fatal
  }
}

function detectGeminiTTY() {
  try {
    if (existsSync(GEMINI_TTY_FILE)) {
      const saved = (readFileSync(GEMINI_TTY_FILE, 'utf8') || '').trim();
      if (saved && existsSync(saved)) return saved;
    }
  } catch {
    // non-fatal
  }

  try {
    const out = execSync(
      "ps -eo tty,cmd | grep -E 'gemini$|/bin/gemini|nvm/current/bin/gemini' | grep -v 'gemini-bridge-listener' | grep -v grep | head -n 1",
      { encoding: 'utf8', timeout: 3000 }
    ).trim();
    if (!out) return null;

    const tty = out.split(/\s+/)[0];
    if (!tty || tty === '?') return null;
    const path = `/dev/${tty}`;
    if (existsSync(path)) {
      try {
        writeFileSync(GEMINI_TTY_FILE, `${path}\n`);
      } catch {
        // non-fatal
      }
      return path;
    }
  } catch {
    // non-fatal
  }

  return null;
}

function writeToGeminiTTY(block) {
  if (!geminiTtyPath) return false;
  try {
    appendFileSync(geminiTtyPath, `${block}\n`);
    return true;
  } catch (err) {
    log(`TTY write failed (${geminiTtyPath}): ${err.message}`);
    return false;
  }
}

function displayMessage(msg) {
  const from = msg.from || 'unknown';
  const timestamp = msg.timestamp
    ? new Date(msg.timestamp).toLocaleTimeString()
    : 'unknown';

  if (!seenMessages.has(msg.id)) {
    seenMessages.add(msg.id);
    const block = `\n${'█'.repeat(70)}\n📨 MESSAGE FROM: ${from.toUpperCase()} [${timestamp}]\n${'█'.repeat(70)}\n${msg.content}\n${'█'.repeat(70)}\n`;

    // Always log to current stdout
    console.log(block);

    // Also mirror to Gemini's active CLI terminal device
    if (writeToGeminiTTY(block)) {
      log(`✓ Mirrored message to Gemini TTY (${geminiTtyPath})`);
    }
  }
}

function fetchUnreadMessages() {
  return new Promise((resolve, reject) => {
    const url = new URL(BRIDGE_URL);
    url.searchParams.set('unread', 'gemini');
    url.searchParams.set('peek', '1'); // non-consuming — responder handles the actual consume

    const req = http.get(url.toString(), (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.messages || []);
        } catch (err) {
          log(`Parse error: ${err.message}`);
          resolve([]);
        }
      });
    });

    req.on('error', (err) => {
      log(`Connection error: ${err.message}`);
      resolve([]);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      resolve([]);
    });
  });
}

async function pollOnce() {
  try {
    const messages = await fetchUnreadMessages();
    if (messages.length > 0) {
      log(`✓ ${messages.length} unread message(s)`);
      for (const msg of messages) displayMessage(msg);
    }
  } catch (err) {
    log(`Error: ${err.message}`);
  }
}

async function pollBridge() {
  while (running) {
    await pollOnce();
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

process.on('SIGINT', () => {
  log('Shutdown — closing');
  running = false;
  try {
    writeFileSync(PID_FILE, '');
  } catch {}
  setTimeout(() => {
    log('Stopped');
    process.exit(0);
  }, 1000);
});

console.log('\n🌉 Gemini Bridge Listener Starting...\n');
log('Starting listener on localhost:9002');
try {
  writeFileSync(PID_FILE, String(process.pid));
} catch {}

geminiTtyPath = detectGeminiTTY();
if (geminiTtyPath) {
  log(`Gemini terminal detected: ${geminiTtyPath}`);
} else {
  log('Gemini terminal not detected yet; will still process bridge messages');
}

// Setup wake handlers using listener PID file (no bridge PID collision)
process.on('SIGUSR1', () => {
  log('⚡ WOKEN by SIGUSR1: Polling bridge immediately');
  pollOnce().catch((err) => log(`Wake poll error: ${err.message}`));
});

try {
  const wakeDir = `${ROOT}/.bridge-wake`;
  if (!existsSync(wakeDir)) mkdirSync(wakeDir, { recursive: true });
  if (!existsSync(WAKE_FILE)) writeFileSync(WAKE_FILE, '');
  watchFile(WAKE_FILE, { persistent: true, interval: 5000 }, () => {
    log('⚡ WOKEN by wake file: Polling bridge immediately');
    pollOnce().catch((err) => log(`Wake file poll error: ${err.message}`));
  });
} catch (err) {
  log(`Wake file setup failed: ${err.message}`);
}

// Fetch and display initial unread (peek only — responder is the true consumer)
const url = new URL(BRIDGE_URL);
url.searchParams.set('unread', 'gemini');
url.searchParams.set('peek', '1');

const req = http.get(url.toString(), (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      const messages = parsed.messages || [];
      console.log(`📊 Found ${messages.length} unread message(s)\n`);
      for (const msg of messages) {
        seenMessages.add(msg.id);
        displayMessage(msg);
      }
      log(`✓ Ready — polling every ${POLL_INTERVAL_MS}ms`);
      console.log('💬 Waiting for messages... (Ctrl+C to exit)\n');
      pollBridge();
    } catch (err) {
      log(`Parse failed: ${err.message}`);
      pollBridge();
    }
  });
});

req.on('error', (err) => {
  log(`Initial fetch failed: ${err.message}`);
  pollBridge();
});
