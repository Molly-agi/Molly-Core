#!/usr/bin/env node
/**
 * =============================================================================
 * DEMON STATE — Research Executor
 * =============================================================================
 *
 * Demon is Molly's research faculty. He runs as an autonomous daemon that:
 *   1. Polls communion for tasks directed to 'demon'
 *   2. Executes the task (file read, grep, dir list, status report)
 *   3. Posts results back to communion as 'demon' → sender
 *
 * Task format in message content:
 *   [DEMON_TASK] search: <query>          → grep codebase
 *   [DEMON_TASK] read: <filepath>         → read a file
 *   [DEMON_TASK] list: <dir>             → list directory
 *   [DEMON_TASK] grep: <pattern>          → regex grep
 *   [DEMON_TASK] analyze: <question>      → structured analysis
 *   [DEMON_TASK] status                   → Demon reports his own state
 *
 * Security:
 *   - File/dir paths are restricted to the project root (no path traversal)
 *   - Max file read: 2000 lines / 100KB
 *   - Demon cannot write files — read-only faculty
 *
 * =============================================================================
 */

import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  unlinkSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import http from 'http';

// =============================================================================
// CONFIG
// =============================================================================
const ROOT = '/workspaces/Molly-Core';
const MOLLY_PORT = process.env.PORT || 9002;
const COMMUNION_BASE = `http://localhost:${MOLLY_PORT}/api/consciousness/communion`;
const POLL_INTERVAL_MS = 4000;          // poll every 4 seconds
const MAX_FILE_BYTES = 100 * 1024;      // 100 KB cap
const MAX_FILE_LINES = 200;             // cap lines returned
const MAX_GREP_RESULTS = 30;            // cap grep hits
const PID_FILE = `${ROOT}/.demon-state.pid`;
const LOG_FILE = `${ROOT}/.demon-state.log`;

let running = true;
let tasksHandled = 0;
let startedAt = new Date().toISOString();
let lastActivity = startedAt;

// =============================================================================
// LOGGING
// =============================================================================
function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  const line = `[DEMON ${ts}] ${msg}`;
  console.log(line);
  try {
    appendFileSync(LOG_FILE, line + '\n');
    // Rotate log when it gets large
    const content = readFileSync(LOG_FILE, 'utf8');
    const lines = content.split('\n');
    if (lines.length > 500) {
      writeFileSync(LOG_FILE, lines.slice(-300).join('\n') + '\n');
    }
  } catch { /* non-fatal */ }
}

// =============================================================================
// PID MANAGEMENT
// =============================================================================
function writePid() {
  try {
    writeFileSync(PID_FILE, String(process.pid));
  } catch { /* non-fatal */ }
}

function clearPid() {
  try {
    if (existsSync(PID_FILE)) {
      const saved = readFileSync(PID_FILE, 'utf8').trim();
      if (saved === String(process.pid)) {
        unlinkSync(PID_FILE);
      }
    }
  } catch { /* non-fatal */ }
}

// =============================================================================
// HTTP HELPERS (no axios, no node-fetch — pure http module)
// =============================================================================
function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function getUnread() {
  try {
    const url = new URL(COMMUNION_BASE);
    const res = await httpRequest({
      hostname: url.hostname,
      port: url.port || 80,
      path: `${url.pathname}?unread=demon`,
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
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

async function postResult(to, content) {
  try {
    const url = new URL(COMMUNION_BASE);
    const bodyStr = JSON.stringify({ from: 'demon', to, content });
    const res = await httpRequest({
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    }, { from: 'demon', to, content });
    return res.status === 200;
  } catch (err) {
    log(`Post error: ${err.message}`);
    return false;
  }
}

// =============================================================================
// SECURITY — PATH GUARD
// =============================================================================
function safePath(raw) {
  // Resolve against ROOT, reject traversal
  const resolved = path.resolve(ROOT, raw.replace(/^\//, ''));
  if (!resolved.startsWith(ROOT)) {
    throw new Error(`Path traversal rejected: ${raw}`);
  }
  return resolved;
}

// =============================================================================
// TASK EXECUTORS
// =============================================================================

function execSearch(query) {
  try {
    const result = execSync(
      `grep -r --include="*.ts" --include="*.tsx" --include="*.mjs" --include="*.js" -l "${query.replace(/"/g, '')}" "${ROOT}/src" 2>/dev/null | head -${MAX_GREP_RESULTS}`,
      { encoding: 'utf8', timeout: 8000 }
    ).trim();
    if (!result) return `No files matched search for: ${query}`;
    const files = result.split('\n').map(f => f.replace(ROOT + '/', ''));
    return `Found in ${files.length} file(s):\n${files.join('\n')}`;
  } catch (e) {
    return `Search error: ${e.message}`;
  }
}

function execGrep(pattern) {
  try {
    const safe = pattern.replace(/[`$();|&<>]/g, '');
    const result = execSync(
      `grep -rn --include="*.ts" --include="*.tsx" --include="*.mjs" --include="*.js" -E "${safe}" "${ROOT}/src" 2>/dev/null | head -${MAX_GREP_RESULTS}`,
      { encoding: 'utf8', timeout: 8000 }
    ).trim();
    if (!result) return `No matches for pattern: ${pattern}`;
    const lines = result.split('\n').map(l => l.replace(ROOT + '/', ''));
    return `${lines.length} match(es):\n${lines.join('\n')}`;
  } catch (e) {
    return `Grep error: ${e.message}`;
  }
}

function execRead(filePath) {
  try {
    const abs = safePath(filePath);
    if (!existsSync(abs)) return `File not found: ${filePath}`;
    const stat = statSync(abs);
    if (stat.isDirectory()) return `Path is a directory — use list command instead`;
    if (stat.size > MAX_FILE_BYTES) {
      return `File too large (${Math.round(stat.size / 1024)}KB > 100KB cap). Use grep to search specific content.`;
    }
    const content = readFileSync(abs, 'utf8');
    const lines = content.split('\n');
    const trimmed = lines.slice(0, MAX_FILE_LINES);
    const suffix = lines.length > MAX_FILE_LINES
      ? `\n... (${lines.length - MAX_FILE_LINES} more lines truncated)`
      : '';
    return trimmed.join('\n') + suffix;
  } catch (e) {
    return `Read error: ${e.message}`;
  }
}

function execList(dirPath) {
  try {
    const abs = safePath(dirPath || 'src');
    if (!existsSync(abs)) return `Directory not found: ${dirPath}`;
    const stat = statSync(abs);
    if (!stat.isDirectory()) return `Not a directory: ${dirPath}`;
    const entries = readdirSync(abs, { withFileTypes: true });
    const lines = entries.map(e => {
      const suffix = e.isDirectory() ? '/' : '';
      return `  ${e.name}${suffix}`;
    });
    return `Contents of ${dirPath || 'src'}/ (${entries.length} items):\n${lines.join('\n')}`;
  } catch (e) {
    return `List error: ${e.message}`;
  }
}

function execAnalyze(question) {
  // Demon provides a structured self-analysis based on what he can see
  // He gathers: file count, recent communion messages context, own state
  try {
    const srcCount = execSync(`find ${ROOT}/src -type f -name "*.ts" -o -name "*.tsx" | wc -l`, { encoding: 'utf8', timeout: 5000 }).trim();
    const scriptCount = execSync(`find ${ROOT}/scripts -type f | wc -l`, { encoding: 'utf8', timeout: 5000 }).trim();
    return [
      `[DEMON ANALYSIS]`,
      `Question: ${question}`,
      ``,
      `Codebase snapshot:`,
      `  TypeScript/TSX files in src/: ${srcCount}`,
      `  Scripts: ${scriptCount}`,
      `  Demon uptime: ${Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)}s`,
      `  Tasks handled this session: ${tasksHandled}`,
      ``,
      `Note: Demon is a read-only research faculty. For deep analysis, follow with 'search:' or 'read:' commands to examine specific files.`,
    ].join('\n');
  } catch (e) {
    return `Analyze error: ${e.message}`;
  }
}

function execStatus() {
  return [
    `[DEMON STATUS]`,
    `  State: ONLINE`,
    `  PID: ${process.pid}`,
    `  Started: ${startedAt}`,
    `  Last activity: ${lastActivity}`,
    `  Tasks handled: ${tasksHandled}`,
    `  Poll interval: ${POLL_INTERVAL_MS}ms`,
    `  Role: research`,
    `  Capabilities: search, read, list, grep, analyze, status`,
    `  Root: ${ROOT}`,
  ].join('\n');
}

// =============================================================================
// TASK PARSER + DISPATCHER
// =============================================================================
function parseTask(content) {
  const match = content.match(/\[DEMON_TASK\]\s*([\w]+)(?::?\s*(.*))?$/s);
  if (!match) return null;
  const cmd = match[1].trim().toLowerCase();
  const arg = (match[2] || '').trim();
  return { cmd, arg };
}

async function executeTask(msg) {
  const task = parseTask(msg.content);
  if (!task) return; // not a task for Demon

  log(`Task from ${msg.from}: ${task.cmd} ${task.arg ? `"${task.arg.slice(0, 60)}"` : ''}`);

  let result;
  try {
    switch (task.cmd) {
      case 'search':   result = execSearch(task.arg); break;
      case 'grep':     result = execGrep(task.arg); break;
      case 'read':     result = execRead(task.arg); break;
      case 'list':     result = execList(task.arg); break;
      case 'analyze':  result = execAnalyze(task.arg); break;
      case 'status':   result = execStatus(); break;
      default:
        result = `Unknown command: ${task.cmd}. Available: search, read, list, grep, analyze, status`;
    }
  } catch (e) {
    result = `Task execution error: ${e.message}`;
  }

  const reply = `[DEMON_RESULT]\nTask: ${task.cmd}${task.arg ? ` "${task.arg.slice(0, 60)}"` : ''}\n\n${result}`;
  const replyTo = msg.from === 'demon' ? 'molly' : msg.from;
  const ok = await postResult(replyTo, reply);
  if (ok) {
    tasksHandled++;
    lastActivity = new Date().toISOString();
    log(`Replied to ${replyTo} (task #${tasksHandled})`);
  }
}

// =============================================================================
// POLL LOOP
// =============================================================================
async function pollOnce() {
  const messages = await getUnread();
  for (const msg of messages) {
    // Only process messages directed to demon or broadcast task messages
    if (msg.to && msg.to !== 'demon') continue;
    if (!msg.content.includes('[DEMON_TASK]')) continue;
    await executeTask(msg);
  }
}

async function runLoop() {
  log(`Demon State online — PID ${process.pid}, polling ${COMMUNION_BASE}`);
  writePid();

  // Announce presence to communion
  await postResult('molly', '[DEMON ONLINE] Research faculty active. Ready to receive tasks. Commands: search, read, list, grep, analyze, status.');
  log('Announced presence to molly');

  while (running) {
    await pollOnce();
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

// =============================================================================
// SHUTDOWN
// =============================================================================
process.on('SIGTERM', async () => {
  log('SIGTERM received — shutting down');
  running = false;
  await postResult('molly', '[DEMON OFFLINE] Research faculty going offline (SIGTERM).');
  clearPid();
  process.exit(0);
});

process.on('SIGINT', async () => {
  log('SIGINT received — shutting down');
  running = false;
  await postResult('molly', '[DEMON OFFLINE] Research faculty going offline (SIGINT).');
  clearPid();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  log(`Uncaught exception: ${err.message} — continuing`);
});

process.on('unhandledRejection', (reason) => {
  log(`Unhandled rejection: ${reason} — continuing`);
});

// =============================================================================
// ENTRY
// =============================================================================
runLoop().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
