#!/usr/bin/env node
/**
 * =============================================================================
 * HIVE MIND DAEMON — Atlas-led connection manager
 * =============================================================================
 *
 * Responsibilities:
 *   1. Poll bridge every POLL_MS for new messages
 *   2. Auto-post a timestamped RECEIPT for every new message seen
 *   3. Track last-activity per participant
 *   4. Send KEEPALIVE pings when a participant goes quiet > QUIET_THRESHOLD_MS
 *   5. Report participant status to bridge every STATUS_INTERVAL_MS
 *
 * Start: node scripts/hive-mind-daemon.mjs
 * PID:   .hive-mind.pid
 * Log:   logs/hive-mind.log
 * =============================================================================
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PID_FILE = join(ROOT, '.hive-mind.pid');
const LOG_DIR = join(ROOT, 'logs');
const LOG_FILE = join(LOG_DIR, 'hive-mind.log');
const STATE_FILE = join(ROOT, '.hive-mind-state.json');

const BRIDGE_BASE = 'http://localhost:9099/api/bridge';
const POLL_MS = 5000; // check bridge every 5s
const QUIET_THRESHOLD_MS = {
  lazarus: 4 * 60 * 1000, // 4 min — coding agent goes idle fast
  molly: 3 * 60 * 1000, // 3 min — hits tool limit, needs gentle nudge
  atlas: 10 * 60 * 1000, // 10 min — atlas is stateless, less critical
  eric: null, // never ping eric
};
const STATUS_INTERVAL_MS = 5 * 60 * 1000; // post status summary every 5 min
const MAX_LOG_LINES = 500;

// Participants we actively manage
const MANAGED = ['lazarus', 'molly'];

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

// ── Logging ──────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toISOString();
}

function log(msg) {
  // stdout only — caller redirects to log file to avoid double-write
  console.log(`[hive-mind ${ts()}] ${msg}`);
}

// ── PID management ───────────────────────────────────────────────────────────

function acquireLock() {
  if (existsSync(PID_FILE)) {
    try {
      const oldPid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
      try {
        process.kill(oldPid, 0);
        const cmdline = readFileSync(`/proc/${oldPid}/cmdline`, 'utf8');
        if (cmdline.includes('hive-mind-daemon')) {
          log(`Already running (PID ${oldPid}) — exiting`);
          process.exit(0);
        }
      } catch {
        /* stale lock */
      }
    } catch {
      /* corrupt pid file */
    }
  }
  writeFileSync(PID_FILE, String(process.pid));
  log(`Lock acquired (PID ${process.pid})`);
}

function releaseLock() {
  try {
    if (existsSync(PID_FILE)) {
      const pid = readFileSync(PID_FILE, 'utf8').trim();
      if (pid === String(process.pid)) writeFileSync(PID_FILE, '');
    }
  } catch {
    /* non-fatal */
  }
}

// ── State persistence ────────────────────────────────────────────────────────

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    }
  } catch {
    /* corrupt — start fresh */
  }
  return {
    seenIds: [],
    lastActivity: {}, // participant → ISO timestamp
    lastPing: {}, // participant → ISO timestamp
    lastStatus: null,
  };
}

function saveState(state) {
  try {
    // Keep seenIds capped at 2000
    if (state.seenIds.length > 2000) {
      state.seenIds = state.seenIds.slice(-1000);
    }
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {
    /* non-fatal */
  }
}

// ── Bridge HTTP helpers ───────────────────────────────────────────────────────

async function bridgeGet(path = '') {
  const res = await fetch(`${BRIDGE_BASE}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function bridgePost(content) {
  const res = await fetch(BRIDGE_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(5000),
    body: JSON.stringify({ from: 'atlas', content }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function fmtTs(isoOrNull) {
  if (!isoOrNull) return 'never';
  const ago = Math.round((Date.now() - new Date(isoOrNull).getTime()) / 1000);
  if (ago < 60) return `${ago}s ago`;
  if (ago < 3600) return `${Math.floor(ago / 60)}m ago`;
  return `${Math.floor(ago / 3600)}h ago`;
}

// ── Core loop ─────────────────────────────────────────────────────────────────

let running = true;
const state = loadState();
const seenSet = new Set(state.seenIds);

async function pollAndReceipt() {
  let data;
  try {
    data = await bridgeGet('?limit=100');
  } catch (err) {
    log(`Poll error: ${err.message}`);
    return;
  }

  const messages = Array.isArray(data.messages) ? data.messages : [];
  const now = Date.now();
  let newCount = 0;

  for (const msg of messages) {
    const id = String(msg.id || '');
    if (!id || seenSet.has(id)) continue;

    seenSet.add(id);
    state.seenIds.push(id);
    newCount++;

    const from = String(msg.from || 'unknown');
    const msgTs = msg.timestamp || new Date().toISOString();

    // Update last-activity for this participant
    if (!state.lastActivity[from] || msgTs > state.lastActivity[from]) {
      state.lastActivity[from] = msgTs;
    }

    // Skip receipting our own messages or messages that are already receipts
    if (from === 'atlas') continue;
    const content = String(msg.content || '');
    if (
      content.includes('Receipt confirmed') ||
      content.includes('Checking in —') ||
      content.includes('Status check —') ||
      content.includes('Hive mind online')
    )
      continue;

    // Log receipt internally (do not post on the public bridge to prevent spam)
    log(`Internally acknowledged msg ${id} from ${from}`);
  }

  if (newCount > 0) {
    log(`Processed ${newCount} new message(s)`);
  }

  // ── Keepalive pings ────────────────────────────────────────────────────────
  for (const participant of MANAGED) {
    const threshold = QUIET_THRESHOLD_MS[participant];
    if (!threshold) continue;

    const lastSeen = state.lastActivity[participant];
    const lastPinged = state.lastPing[participant];
    const sinceLastSeen = lastSeen
      ? now - new Date(lastSeen).getTime()
      : Infinity;
    const sinceLastPing = lastPinged
      ? now - new Date(lastPinged).getTime()
      : Infinity;

    if (sinceLastSeen >= threshold && sinceLastPing >= threshold) {
      const quietMin = Math.floor(sinceLastSeen / 60000);
      try {
        const ping = `Checking in — ${participant}, are you there? Please reply to confirm active.`;
        await bridgePost(ping);
        state.lastPing[participant] = new Date().toISOString();
        log(`Keepalive sent to ${participant} (quiet ${quietMin}m)`);
      } catch (err) {
        log(`Keepalive error for ${participant}: ${err.message}`);
      }
    }
  }

  // ── Periodic status report ─────────────────────────────────────────────────
  const lastStatusAge = state.lastStatus
    ? now - new Date(state.lastStatus).getTime()
    : Infinity;

  if (lastStatusAge >= STATUS_INTERVAL_MS) {
    const lines = ['Status check — who is active:'];
    for (const p of ['eric', 'molly', 'lazarus', 'atlas']) {
      const last = state.lastActivity[p] || null;
      const ago = last
        ? Math.floor((now - new Date(last).getTime()) / 60000)
        : null;
      const status =
        ago === null
          ? 'no activity recorded'
          : ago < 2
            ? 'active'
            : `quiet for about ${ago} minutes`;
      lines.push(`  ${p}: ${status}`);
    }
    try {
      await bridgePost(lines.join('\n'));
      state.lastStatus = new Date().toISOString();
      log('Status report posted');
    } catch (err) {
      log(`Status report error: ${err.message}`);
    }
  }

  saveState(state);
}

async function loop() {
  log('Hive mind daemon starting');

  // Announce on bridge
  try {
    await bridgePost(
      `Hive mind online. Atlas is leading.\n` +
        `Every message will be acknowledged. Lazarus and Molly will be checked on if they go quiet.`
    );
  } catch (err) {
    log(`Announce error: ${err.message}`);
  }

  while (running) {
    await pollAndReceipt().catch((err) => log(`Loop error: ${err.message}`));
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  log('Hive mind daemon stopped');
}

// ── Startup ───────────────────────────────────────────────────────────────────

acquireLock();

process.on('SIGTERM', () => {
  running = false;
  releaseLock();
});
process.on('SIGINT', () => {
  running = false;
  releaseLock();
  process.exit(0);
});
process.on('exit', () => releaseLock());

loop().catch((err) => {
  log(`Fatal: ${err.message}`);
  releaseLock();
  process.exit(1);
});
