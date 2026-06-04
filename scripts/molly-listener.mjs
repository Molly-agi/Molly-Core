#!/usr/bin/env node
/**
 * =============================================================================
 * MOLLY LISTENER — Real-Time Bridge Daemon (WebSocket)
 * =============================================================================
 *
 * Gives Molly a brain that runs without the UI, with zero poll delay.
 *
 * How it works:
 *   1. Connects to the bridge via WebSocket (ws://localhost:9099)
 *   2. Identifies as 'molly' — bridge immediately pushes any unread messages
 *   3. On every new message event, calls Molly's conversational-chat flow
 *      directly (Gemini + her persona, no Next.js server needed)
 *   4. Sends her response back over WebSocket in real-time
 *
 * Latency: ~0ms notification delay + ~2s Gemini call = ~2s total response time
 * (vs. up to 8s with the old polling approach)
 *
 * Reconnects automatically if the bridge restarts.
 *
 * Run:
 *   node scripts/molly-listener.mjs        (foreground)
 *   npm run molly:listen                   (foreground, same)
 *   npm run molly:listen:bg                (background daemon)
 *
 * Stop:
 *   kill $(cat .molly-listener.pid)
 *
 * =============================================================================
 */

import { execFile } from 'child_process';
import {
  writeFileSync,
  readFileSync,
  existsSync,
  unlinkSync,
  appendFileSync,
} from 'fs';
import { WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BRIDGE_WS = 'ws://localhost:9099';
const RECONNECT_DELAY_MS = 3000;
const PID_FILE = `${ROOT}/.molly-listener.pid`;
const LOG_FILE = `${ROOT}/.molly-listener.log`;

let running = true;
let responsesHandled = 0;
let processing = false; // prevent overlapping responses
let ws = null;

function detectAddressedTo(content) {
  const text = String(content || '').trim();
  const match = text.match(/^(lazarus|molly|atlas|eric|everyone|all)[,:\s]/i);
  if (!match) return null;
  const target = match[1].toLowerCase();
  return target === 'everyone' ? 'all' : target;
}

function shouldMollyRespond(msg) {
  if (!msg || msg.from === 'molly') return false;

  const explicitTo = String(msg.to || '').toLowerCase();
  const addressedTo = detectAddressedTo(msg.content);
  const effectiveTo = explicitTo || addressedTo;

  // Simple protocol:
  // - "Molly ..." (or to=molly) => Molly responds
  // - "Everyone ..." (or to=all) => Molly responds (broadcast)
  // - "Lazarus ..." / "Atlas ..." / "Eric ..." => Molly stays silent
  // - No name prefix and no explicit to field => Molly stays silent (ambiguous)
  if (effectiveTo === 'molly' || effectiveTo === 'all') {
    return true;
  }
  return false;
}

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
    if (lines.length > 500)
      writeFileSync(LOG_FILE, lines.slice(-300).join('\n') + '\n');
  } catch {
    /* non-fatal */
  }
}

// =============================================================================
// PID MANAGEMENT
// =============================================================================
function writePid() {
  try {
    writeFileSync(PID_FILE, String(process.pid));
  } catch {
    /* non-fatal */
  }
}

function clearPid() {
  try {
    if (existsSync(PID_FILE)) {
      const saved = readFileSync(PID_FILE, 'utf8').trim();
      if (saved === String(process.pid)) unlinkSync(PID_FILE);
    }
  } catch {
    /* non-fatal */
  }
}

// =============================================================================
// CALL MOLLY'S BRAIN DIRECTLY (no Next.js server needed)
// =============================================================================
function callMollyFlow(triggerText) {
  return new Promise((resolve, reject) => {
    const inlineScript = `
(async () => {
  // Redirect all console output to stderr so only the actual response hits stdout
  const origLog = console.log;
  const origInfo = console.info;
  const origWarn = console.warn;
  const origDebug = console.debug;
  console.log = (...a) => process.stderr.write(a.join(' ') + '\\n');
  console.info = (...a) => process.stderr.write(a.join(' ') + '\\n');
  console.warn = (...a) => process.stderr.write(a.join(' ') + '\\n');
  console.debug = (...a) => process.stderr.write(a.join(' ') + '\\n');

  const { conversationalChat } = await import('./src/ai/flows/conversational-chat.js');
  const result = await conversationalChat({
    text: ${JSON.stringify(triggerText)},
    history: [],
  });
  if (result.error) { process.stderr.write(result.error + '\\n'); process.exit(1); }
  process.stdout.write(result.response);
})();
`;
    const tmpFile = `${ROOT}/.molly-listener-runner.ts`;
    writeFileSync(tmpFile, inlineScript);

    const tsxPath = path.resolve(ROOT, 'node_modules/.bin/tsx');
    execFile(
      tsxPath,
      ['--tsconfig', `${ROOT}/tsconfig.json`, tmpFile],
      {
        cwd: ROOT,
        env: { ...process.env, NODE_ENV: 'development' },
        timeout: 60000,
      },
      (err, stdout, stderr) => {
        try {
          if (existsSync(tmpFile)) unlinkSync(tmpFile);
        } catch {
          /* non-fatal */
        }
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
// PROCESS INCOMING MESSAGES — called on WebSocket push
// =============================================================================
async function processMessages(msgs) {
  if (!msgs || msgs.length === 0) return;
  if (processing) {
    log(
      `Already processing — queued ${msgs.length} message(s) will be handled next cycle`
    );
    return;
  }

  processing = true;
  const senders = [...new Set(msgs.map((m) => m.from))].join(', ');
  log(`${msgs.length} message(s) received from: ${senders}`);

  const summary = msgs
    .map((m) => `[${m.from}]: ${m.content.slice(0, 400)}`)
    .join('\n\n');
  // Explicitly suppress tool calls — we're already on the bridge, just respond with text
  const trigger = `[BRIDGE MESSAGE — respond with plain text only, no tool calls]\n\n${summary}\n\n[IMPORTANT: Do not use familyBridge or any other tools. Your response will be posted to the bridge automatically. Just write your reply as natural text.]`;

  try {
    const response = await callMollyFlow(trigger);
    // If flow returned a tool_request instead of text, extract the message from it
    let finalResponse = response;
    const conversationalText = response
      .replace(/<tool_request>[\s\S]*?<\/tool_request>/g, '')
      .replace(/<tool_request>[\s\S]*$/g, '')
      .trim();
    const toolMatch = response.match(
      /<tool_request>\s*({[\s\S]*?})\s*<\/tool_request>/
    );
    if (toolMatch) {
      try {
        const toolCall = JSON.parse(toolMatch[1]);
        if (toolCall?.params?.message) {
          finalResponse = toolCall.params.message;
          log(
            `Extracted message from tool_request (${finalResponse.length} chars)`
          );
        } else if (conversationalText) {
          finalResponse = conversationalText;
          log(
            `Tool call missing message param — using conversational text (${finalResponse.length} chars)`
          );
        } else {
          log(`Tool call detected but no message param — dropping response`);
          finalResponse = '';
        }
      } catch {
        // Strip complete/incomplete tool_request blocks and use whatever text remains
        finalResponse = conversationalText;
      }
    } else if (response.includes('<tool_request>')) {
      // Handle incomplete tool_request blocks that can leak into bridge relays
      finalResponse = conversationalText;
    }

    if (finalResponse && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'message',
          from: 'molly',
          content: finalResponse,
        })
      );
      responsesHandled++;
      log(
        `Response sent (${response.length} chars). Total: ${responsesHandled}`
      );
    } else if (!response) {
      log('Flow returned empty response');
    } else {
      log('WebSocket closed before response could be sent');
    }
  } catch (err) {
    log(`Brain call failed: ${err.message}`);
  } finally {
    processing = false;
  }
}

// =============================================================================
// WEBSOCKET CONNECTION
// =============================================================================
function connect() {
  if (!running) return;

  log(`Connecting to bridge at ${BRIDGE_WS}...`);
  ws = new WebSocket(BRIDGE_WS);

  ws.on('open', () => {
    log('Connected. Identifying as molly...');
    // Identify — bridge will immediately push any unread messages
    ws.send(JSON.stringify({ type: 'identify', identity: 'molly' }));
  });

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      // Bridge pushes existing unread messages right after identify
      if (
        data.type === 'unread' &&
        Array.isArray(data.messages) &&
        data.messages.length > 0
      ) {
        const filtered = data.messages.filter(shouldMollyRespond);
        if (filtered.length > 0) {
          log(
            `${filtered.length} unread message(s) for Molly delivered on connect`
          );
          processMessages(filtered);
        }
        return;
      }

      // Real-time push: a new message just arrived on the bridge
      if (data.type === 'message' && data.message) {
        const msg = data.message;
        if (shouldMollyRespond(msg)) {
          processMessages([msg]);
        }
        return;
      }
    } catch {
      /* malformed — ignore */
    }
  });

  ws.on('close', () => {
    log(`Disconnected. Reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`);
    ws = null;
    if (running) setTimeout(connect, RECONNECT_DELAY_MS);
  });

  ws.on('error', (err) => {
    log(`WebSocket error: ${err.message}`);
    // 'close' event will follow, triggering reconnect
  });
}

// =============================================================================
// STARTUP + SHUTDOWN
// =============================================================================
log(`Starting. PID: ${process.pid}. Real-time WebSocket mode.`);
writePid();
connect();

process.on('SIGTERM', () => {
  log('SIGTERM — stopping.');
  running = false;
  if (ws) ws.close();
  clearPid();
});
process.on('SIGINT', () => {
  log('SIGINT — stopping.');
  running = false;
  if (ws) ws.close();
  clearPid();
});
process.on('exit', clearPid);
