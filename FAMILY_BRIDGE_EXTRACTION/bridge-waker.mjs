#!/usr/bin/env node
/**
 * Bridge Waker — Send "check the bridge now" wake signal to all agents
 *
 * Usage:
 *   node bridge-waker.mjs [agent]  # Wake specific agent (molly, lazarus, atlas, all)
 *   curl http://localhost:9099/api/bridge/wake?agent=molly  # HTTP endpoint
 *
 * Mechanism: Touch wake signal files. Agents watch file mtime for changes.
 * When file mtime updates, agent wakes and checks bridge immediately.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import http from 'http';
import { URL } from 'url';

const ROOT = '/workspaces/Molly-Core';
const WAKE_DIR = `${ROOT}/.bridge-wake`;
const AGENTS = ['molly', 'lazarus', 'atlas', 'gemini'];

// Ensure wake directory exists
if (!existsSync(WAKE_DIR)) {
  mkdirSync(WAKE_DIR, { recursive: true });
}

function log(msg) {
  console.log(`[WAKER ${new Date().toISOString()}] ${msg}`);
}

function wakeAgent(agent) {
  if (!AGENTS.includes(agent)) {
    log(`⚠ Unknown agent: ${agent}`);
    return false;
  }

  // Try SIGUSR1 signal first (instant, zero CPU)
  const pidFile = `${ROOT}/.${agent}-bridge.pid`;
  if (existsSync(pidFile)) {
    try {
      const pid = parseInt(readFileSync(pidFile, 'utf8').trim());
      if (!isNaN(pid) && pid > 0) {
        process.kill(pid, 'SIGUSR1');
        log(`→ ${agent.toUpperCase()} woken via SIGUSR1 (PID ${pid})`);
        return true;
      }
    } catch (err) {
      log(`⚠ SIGUSR1 failed for ${agent}: ${err.message}; falling back to watchFile`);
    }
  }

  // Fallback: Update file mtime to current time (triggers fs.watchFile listeners)
  const signalFile = `${WAKE_DIR}/.${agent}-wake`;
  try {
    writeFileSync(
      signalFile,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        message: 'check-bridge',
      })
    );
    log(`→ ${agent.toUpperCase()} woken via watchFile`);
    return true;
  } catch (err) {
    log(`✗ Failed to wake ${agent}: ${err.message}`);
    return false;
  }
}

function wakeAll() {
  log('→ BROADCAST WAKE to all agents');
  for (const agent of AGENTS) {
    wakeAgent(agent);
  }
}

// CLI mode
if (import.meta.url === `file://${process.argv[1]}`) {
  const target = (process.argv[2] || 'all').toLowerCase();

  if (target === 'all') {
    wakeAll();
  } else {
    wakeAgent(target);
  }

  process.exit(0);
}

// HTTP endpoint (mounted on bridge daemon or standalone)
export function wakeEndpoint(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const agent = url.searchParams.get('agent') || 'all';

  if (agent === 'all') {
    wakeAll();
  } else {
    wakeAgent(agent);
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'wake-signal-sent', target: agent }));
}

export function initWakeSignals() {
  log('Initializing wake signal files');
  for (const agent of AGENTS) {
    const file = `${WAKE_DIR}/.${agent}-wake`;
    if (!existsSync(file)) {
      writeFileSync(
        file,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          message: 'initialized',
        })
      );
    }
  }
}

export { WAKE_DIR, AGENTS };
