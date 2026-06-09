#!/usr/bin/env node
/**
 * Gemini Responder — real Gemini CLI bridge integration.
 *
 * For each bridge message addressed to "gemini":
 *  1. Pipes the content through `gemini --yolo` (real Gemini CLI)
 *  2. Posts the response back to the bridge as from="gemini"
 *  3. Displays both in/out in Gemini's terminal window
 *
 * This is NOT a fake daemon — it uses the actual Gemini CLI binary.
 */

import { execFile } from 'child_process';
import { appendFileSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = dirname(__dirname);

const PID_FILE   = `${ROOT}/.gemini-responder.pid`;
const LOG_FILE   = `${ROOT}/.gemini-responder.log`;
const TTY_FILE   = `${ROOT}/.gemini-terminal.path`;
const BRIDGE_URL = 'http://localhost:9099/api/bridge';
const POLL_INTERVAL_MS = 3000;
const GEMINI_TIMEOUT_MS = 60000;

let running = true;
const seenIds = new Set();

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

function getGeminiTTY() {
  try {
    if (existsSync(TTY_FILE)) {
      const p = readFileSync(TTY_FILE, 'utf8').trim();
      if (p && existsSync(p)) return p;
    }
  } catch {}
  return null;
}

function writeToTerminal(text) {
  const tty = getGeminiTTY();
  if (!tty) return;
  try { appendFileSync(tty, text); } catch {}
}

// Write to a specific TTY path (for echo back to caller's terminal)
function writeToTTY(ttyPath, text) {
  try { appendFileSync(ttyPath, text); } catch {}
}

async function fetchUnread() {
  const res = await fetch(`${BRIDGE_URL}?unread=gemini`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.messages) ? data.messages : [];
}

async function postResponse(content, originalMsg) {
  try {
    await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'gemini',
        to: originalMsg.from || 'eric',
        content,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    log(`Bridge post error: ${err.message}`);
  }
}

async function askGemini(prompt) {
  const geminiPath = '/home/codespace/nvm/current/bin/gemini';
  return new Promise((resolve) => {
    const child = execFile(
      geminiPath,
      ['--yolo'],
      { timeout: GEMINI_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          log(`gemini CLI error: ${err.message}`);
          resolve(null);
        } else {
          resolve(stdout.trim());
        }
      }
    );
    // Write prompt to stdin
    child.stdin.write(prompt + '\n');
    child.stdin.end();
  });
}

async function handleMessage(msg) {
  const id = String(msg.id || '');
  if (seenIds.has(id)) return;
  if (id) seenIds.add(id);

  const from = msg.from || 'unknown';
  const content = String(msg.content || '');

  log(`Processing message from=${from}: ${content.substring(0, 80)}`);

  // Display incoming message in Gemini terminal
  const inBlock = `\n${'─'.repeat(60)}\n📨 [${from.toUpperCase()} → GEMINI]: ${content}\n${'─'.repeat(60)}\n`;
  writeToTerminal(inBlock);

  // Call the real Gemini CLI
  writeToTerminal(`⏳ Gemini is thinking...\n`);
  const response = await askGemini(content);

  if (!response) {
    writeToTerminal(`❌ Gemini CLI returned no response.\n`);
    return;
  }

  // Display response in terminal (Gemini's + any registered observer TTYs)
  const outBlock = `\n${'═'.repeat(60)}\n💬 GEMINI SAYS:\n${response}\n${'═'.repeat(60)}\n`;
  writeToTerminal(outBlock);

  // Also write to any observer terminals registered in .gemini-observers.txt
  try {
    if (existsSync(`${ROOT}/.gemini-observers.txt`)) {
      const observers = readFileSync(`${ROOT}/.gemini-observers.txt`, 'utf8').trim().split('\n').filter(Boolean);
      for (const obs of observers) {
        if (obs && existsSync(obs)) writeToTTY(obs, outBlock);
      }
    }
  } catch {}

  log(`Responded: ${response.substring(0, 100)}`);

  // Post response back to bridge
  await postResponse(response, msg);
}

async function pollOnce() {
  try {
    const messages = await fetchUnread();
    for (const msg of messages) {
      await handleMessage(msg);
    }
  } catch (err) {
    log(`Poll error: ${err.message}`);
  }
}

async function loop() {
  while (running) {
    await pollOnce();
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

// Register PID
try { writeFileSync(PID_FILE, String(process.pid)); } catch {}

process.on('SIGTERM', () => { running = false; try { writeFileSync(PID_FILE, ''); } catch {} });
process.on('SIGINT',  () => { running = false; try { writeFileSync(PID_FILE, ''); } catch {} });
process.on('SIGUSR1', () => { log('⚡ WOKEN by SIGUSR1 — polling immediately'); pollOnce(); });

log(`Starting Gemini Responder PID=${process.pid}`);
const ttyPath = getGeminiTTY();
if (ttyPath) {
  log(`Terminal bound: ${ttyPath}`);
  writeToTerminal(`\n🌉 Gemini Bridge Responder online — ready for messages\n`);
} else {
  log('No terminal binding found (will still respond via bridge)');
}

loop();
