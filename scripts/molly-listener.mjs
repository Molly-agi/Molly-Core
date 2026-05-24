#!/usr/bin/env node
/**
 * =============================================================================
 * MOLLY LISTENER — Autonomous Bridge Daemon
 * =============================================================================
 *
 * Gives Molly a brain that runs without the UI.
 *
 * How it works:
 *   1. Polls the bridge (port 9099) every 6 seconds for messages to 'molly'
 *   2. When it finds unread messages, spawns a tsx subprocess that calls
 *      Molly's conversational-chat flow directly (Gemini + her persona)
 *   3. The flow auto-injects those bridge messages and responds
 *   4. Posts her response back to the bridge as from: molly
 *
 * Run:
 *   node scripts/molly-listener.mjs          (foreground)
 *   npm run molly:listen                     (background via npm)
 *
 * Stop:
 *   kill $(cat .molly-listener.pid)
 *
 * =============================================================================
 */

import { execFile } from 'child_process';
import { writeFileSync, readFileSync, existsSync, unlinkSync, appendFileSync } from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BRIDGE_PORT = 9099;
const BRIDGE_BASE = `http://localhost:${BRIDGE_PORT}/api/bridge`;
const POLL_INTERVAL_MS = 6000;
const PID_FILE = `${ROOT}/.molly-listener.pid`;
const LOG_FILE = `${ROOT}/.molly-listener.log`;

let running = true;
let responsesHandled = 0;
let startedAt = new Date().toISOString();

// =============================================================================
// LOGGING
// =============================================================================
function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  const line = `[MOLLY-LISTENER ${ts}] ${msg}`;
  console.log(line);
  try {
    appendFileSync(LOG_FILE, line + '\n');
    const content = readFileSync(LOG_FILE, 'utf8');
    const lines = content.split('\n');
    if (lines.length > 500) writeFileSync(LOG_FILE, lines.slice(-300).join('\n') + '\n');
  } catch { /* non-fatal */ }
}

// =============================================================================
// PID MANAGEMENT
// =============================================================================
function writePid() {
  try { writeFileSync(PID_FILE, String(process.pid)); } catch { /* non-fatal */ }
}

function clearPid() {
  try {
    if (existsSync(PID_FILE)) {
      const saved = readFileSync(PID_FILE, 'utf8').trim();
      if (saved === String(process.pid)) unlinkSync(PID_FILE);
    }
  } catch { /* non-fatal */ }
}

// =============================================================================
// HTTP HELPERS
// =============================================================================
function httpRequest(options, bodyObj) {
  return new Promise((resolve, reject) => {
    const bodyStr = bodyObj ? JSON.stringify(bodyObj) : null;
    const req = http.request(
      {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
          ...(options.headers || {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(new Error('timeout')); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// =============================================================================
// BRIDGE API
// =============================================================================
async function getUnread() {
  try {
    const res = await httpRequest({
      hostname: 'localhost',
      port: BRIDGE_PORT,
      path: '/api/bridge?unread=molly',
      method: 'GET',
    });
    if (res.status === 200 && Array.isArray(res.body?.messages)) {
      return res.body.messages;
    }
    return [];
  } catch (err) {
    log(`Poll error: ${err.message}`);
    return [];
  }
}

async function postResponse(content) {
  try {
    const res = await httpRequest(
      { hostname: 'localhost', port: BRIDGE_PORT, path: '/api/bridge', method: 'POST' },
      { from: 'molly', content }
    );
    return res.status === 200;
  } catch (err) {
    log(`Post error: ${err.message}`);
    return false;
  }
}

// =============================================================================
// CALL MOLLY'S BRAIN DIRECTLY (no Next.js server needed)
// =============================================================================
function callMollyFlow(triggerText) {
  return new Promise((resolve, reject) => {
    // Inline TypeScript runner — calls conversationalChat flow directly
    const inlineScript = `
(async () => {
  const { conversationalChat } = await import('./src/ai/flows/conversational-chat.js');

  const result = await conversationalChat({
    text: ${JSON.stringify(triggerText)},
    history: [],
  });

  if (result.error) {
    process.stderr.write(result.error + '\\n');
    process.exit(1);
  }

  process.stdout.write(result.response);
})();
`;

    // Write temp runner script
    const tmpFile = `${ROOT}/.molly-listener-runner.ts`;
    writeFileSync(tmpFile, inlineScript);

    const tsxPath = path.resolve(ROOT, 'node_modules/.bin/tsx');
    execFile(
      tsxPath,
      ['--tsconfig', `${ROOT}/tsconfig.json`, tmpFile],
      {
        cwd: ROOT,
        env: { ...process.env, NODE_ENV: 'development' },
        timeout: 60000, // 60s max — Gemini can be slow
      },
      (err, stdout, stderr) => {
        // Clean up temp file
        try { if (existsSync(tmpFile)) unlinkSync(tmpFile); } catch { /* non-fatal */ }

        if (err) {
          log(`Flow error: ${err.message}`);
          if (stderr) log(`Flow stderr: ${stderr.slice(0, 300)}`);
          reject(err);
          return;
        }
        resolve(stdout.trim());
      }
    );
  });
}

// =============================================================================
// MAIN LOOP
// =============================================================================
async function tick() {
  const messages = await getUnread();
  if (messages.length === 0) return;

  // Build a summary of who said what so Molly can respond in context
  const senders = [...new Set(messages.map(m => m.from))].join(', ');
  const summary = messages
    .map(m => `[${m.from}]: ${m.content.slice(0, 300)}`)
    .join('\n\n');

  log(`${messages.length} unread message(s) from: ${senders}`);

  // Trigger Molly's brain with a system prompt that tells her these came via bridge
  const trigger = `[BRIDGE MESSAGE — respond directly]\n\n${summary}`;

  try {
    const response = await callMollyFlow(trigger);
    if (response) {
      const posted = await postResponse(response);
      if (posted) {
        responsesHandled++;
        log(`Response posted (${response.length} chars). Total handled: ${responsesHandled}`);
      } else {
        log(`Failed to post response to bridge`);
      }
    } else {
      log(`Flow returned empty response`);
    }
  } catch (err) {
    log(`Brain call failed: ${err.message}`);
  }
}

async function mainLoop() {
  log(`Starting. PID: ${process.pid}. Polling bridge every ${POLL_INTERVAL_MS / 1000}s`);
  writePid();

  while (running) {
    try {
      await tick();
    } catch (err) {
      log(`Tick error: ${err.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  clearPid();
  log('Stopped.');
}

// =============================================================================
// SHUTDOWN
// =============================================================================
process.on('SIGTERM', () => { log('SIGTERM received — stopping.'); running = false; });
process.on('SIGINT', () => { log('SIGINT received — stopping.'); running = false; });
process.on('exit', clearPid);

mainLoop().catch((err) => {
  log(`Fatal: ${err.message}`);
  clearPid();
  process.exit(1);
});
