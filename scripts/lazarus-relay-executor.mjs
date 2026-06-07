#!/usr/bin/env node
/**
 * Lazarus Relay Executor (strict, whitelisted)
 *
 * Runs continuously and executes only explicit, audited commands
 * received via relay inbox. Sends execution results to relay outbox.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LOG_DIR = join(ROOT, 'logs');
const INBOX_FILE = join(LOG_DIR, 'lazarus-relay-inbox.jsonl');
const OUTBOX_FILE = join(LOG_DIR, 'lazarus-relay-outbox.jsonl');
const STATE_FILE = join(ROOT, '.lazarus-relay-executor-state.json');
const PID_FILE = join(ROOT, '.lazarus-relay-executor.pid');
const TARGET_FILES = [
  join(ROOT, 'scripts', 'bridge-ui.html'),
  join(ROOT, 'src', 'app', 'lazarus', 'page.tsx'),
];

const LOOP_MS = 1000;

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
if (!existsSync(INBOX_FILE)) writeFileSync(INBOX_FILE, '');
if (!existsSync(OUTBOX_FILE)) writeFileSync(OUTBOX_FILE, '');

const state = loadState();

function nowIso() {
  return new Date().toISOString();
}

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    }
  } catch {
    // ignore corrupt state
  }
  return { inboxIndex: lineCount(INBOX_FILE), updatedAt: nowIso() };
}

function saveState() {
  writeFileSync(
    STATE_FILE,
    JSON.stringify({ ...state, updatedAt: nowIso() }, null, 2)
  );
}

function lineCount(file) {
  try {
    const raw = readFileSync(file, 'utf8').trim();
    if (!raw) return 0;
    return raw.split('\n').length;
  } catch {
    return 0;
  }
}

function acquireLock() {
  if (existsSync(PID_FILE)) {
    try {
      const oldPid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
      if (oldPid && Number.isFinite(oldPid)) {
        try {
          process.kill(oldPid, 0);
          const cmdline = readFileSync(`/proc/${oldPid}/cmdline`, 'utf8');
          if (cmdline.includes('scripts/lazarus-relay-executor.mjs')) {
            console.log(`[${nowIso()}] executor already running pid=${oldPid}`);
            process.exit(0);
          }
        } catch {
          // stale lock
        }
      }
    } catch {
      // corrupt lock
    }
  }
  writeFileSync(PID_FILE, String(process.pid));
}

function releaseLock() {
  try {
    if (!existsSync(PID_FILE)) return;
    const pid = readFileSync(PID_FILE, 'utf8').trim();
    if (pid === String(process.pid)) writeFileSync(PID_FILE, '');
  } catch {
    // non-fatal
  }
}

function queueReply(to, content) {
  const payload = { at: nowIso(), to, content };
  appendFileSync(OUTBOX_FILE, JSON.stringify(payload) + '\n');
}

function parseCommand(content) {
  const c = String(content || '').toLowerCase();

  const asksRed = /turn|change|set/.test(c) && /test\s+lazarus\s+voice|test\s+button|lazarus\s+voice\s+button/.test(c) && /red/.test(c);
  if (asksRed) return { type: 'set_lazarus_test_button_red' };

  return null;
}

function setLazarusButtonRed() {
  let changedAny = false;

  for (const file of TARGET_FILES) {
    const original = readFileSync(file, 'utf8');
    let next = original;

    // Bridge UI target
    next = next.replace(
      ".voice-row .test-lazarus { background: #002244; }",
      ".voice-row .test-lazarus { background: #cc0000; }"
    );

    // Legacy Lazarus page target
    next = next.replace("backgroundColor: '#002244'", "backgroundColor: '#cc0000'");

    if (next !== original) {
      writeFileSync(file, next);
      changedAny = true;
    }
  }

  return {
    changed: changedAny,
    message: changedAny
      ? 'Changed Test Lazarus Voice button from blue to red.'
      : 'Button is already red.',
  };
}

function executeCommand(envelope, command) {
  if (command.type === 'set_lazarus_test_button_red') {
    const res = setLazarusButtonRed();
    return { ok: true, content: res.message };
  }

  return { ok: false, content: `Unsupported command type: ${command.type}` };
}

function readNewInboxMessages() {
  const raw = readFileSync(INBOX_FILE, 'utf8');
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const batch = lines.slice(state.inboxIndex);
  state.inboxIndex = lines.length;
  saveState();
  return batch;
}

function processInbox() {
  const batch = readNewInboxMessages();
  for (const line of batch) {
    let envelope;
    try {
      envelope = JSON.parse(line);
    } catch {
      continue;
    }

    const from = String(envelope.from || 'eric').toLowerCase();
    const content = String(envelope.content || '');
    const command = parseCommand(content);

    if (!command) continue;

    const result = executeCommand(envelope, command);
    const prefix = result.ok ? '[Lazarus executor]' : '[Lazarus executor error]';
    queueReply(from, `${prefix} ${result.content}`);
  }
}

acquireLock();
console.log(`[${nowIso()}] relay executor started pid=${process.pid}`);

setInterval(() => {
  try {
    processInbox();
  } catch (err) {
    queueReply('eric', `[Lazarus executor error] ${err.message}`);
  }
}, LOOP_MS);

process.on('SIGTERM', () => {
  releaseLock();
  process.exit(0);
});

process.on('SIGINT', () => {
  releaseLock();
  process.exit(0);
});
