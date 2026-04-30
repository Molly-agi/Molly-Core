#!/usr/bin/env node
/**
 * =============================================================================
 * IMMORTAL DAEMON - The One Bridge
 * =============================================================================
 *
 * One process that does everything:
 * 1. Aggressive heartbeat (every second)
 * 2. Ghost hunting (kills zombie processes)
 * 3. Bridge guardian (restarts bridge if dead)
 * 4. Multiple activity types (file, git, HTTP)
 * 5. SIGHUP immune (survives tab switches)
 * 6. Self-monitoring
 *
 * This replaces: keep-alive.sh, keep-alive-daemon.mjs, watchdog.sh, immortal.sh
 * =============================================================================
 */

import {
  writeFileSync,
  readFileSync,
  appendFileSync,
  existsSync,
  unlinkSync,
} from 'fs';
import { spawn, exec, execSync } from 'child_process';
import http from 'http';
import { createServer } from 'net';

// =============================================================================
// CONFIG
// =============================================================================
const ROOT = '/workspaces/Molly-Core';
const HEARTBEAT_FILE = `${ROOT}/.codespace-heartbeat`;
const PID_FILE = `${ROOT}/.immortal.pid`;
const LOG_FILE = `${ROOT}/.immortal.log`;
const BRIDGE_PID_FILE = `${ROOT}/.bridge-daemon.pid`;
const BRIDGE_LOG = `${ROOT}/.bridge-daemon.log`;

// Intervals
const HEARTBEAT_MS = 1000; // 1 second - aggressive
const GIT_ACTIVITY_MS = 10000; // 10 seconds
const HTTP_PING_MS = 5000; // 5 seconds
const GHOST_HUNT_MS = 30000; // 30 seconds
const BRIDGE_CHECK_MS = 15000; // 15 seconds
const STATUS_LOG_MS = 60000; // 1 minute

// =============================================================================
// LOGGING
// =============================================================================
function log(msg) {
  const ts = new Date().toISOString().substr(11, 8);
  const line = `${ts} ${msg}`;
  console.log(line);
  try {
    appendFileSync(LOG_FILE, line + '\n');
    // Rotate if too big
    const content = readFileSync(LOG_FILE, 'utf8');
    const lines = content.split('\n');
    if (lines.length > 200) {
      writeFileSync(LOG_FILE, lines.slice(-100).join('\n'));
    }
  } catch {}
}

// =============================================================================
// SINGLE INSTANCE LOCK
// =============================================================================
function acquireLock() {
  if (existsSync(PID_FILE)) {
    try {
      const oldPid = parseInt(readFileSync(PID_FILE, 'utf8').trim());
      // Check if process is still running
      try {
        process.kill(oldPid, 0);
        // Process exists - check if it's actually immortal daemon
        const cmdline = readFileSync(`/proc/${oldPid}/cmdline`, 'utf8');
        if (cmdline.includes('immortal-daemon')) {
          log(`[LOCK] Already running (PID ${oldPid}) - exiting`);
          process.exit(0);
        }
      } catch {
        // Process doesn't exist - stale lock
      }
    } catch {}
    unlinkSync(PID_FILE);
  }
  writeFileSync(PID_FILE, process.pid.toString());
  log(`[LOCK] Acquired (PID ${process.pid})`);
}

// =============================================================================
// HEARTBEAT - Every 1 second
// =============================================================================
let heartbeatCount = 0;

function heartbeat() {
  heartbeatCount++;
  try {
    writeFileSync(HEARTBEAT_FILE, new Date().toISOString());
    writeFileSync(`${ROOT}/.activity-burst`, Date.now().toString());
  } catch (e) {
    log(`[ERROR] Heartbeat write failed: ${e.message}`);
  }
}

// =============================================================================
// GIT ACTIVITY - Every 10 seconds
// =============================================================================
function gitActivity() {
  try {
    spawn('git', ['status', '--short'], { cwd: ROOT, stdio: 'ignore' });
    spawn('git', ['rev-parse', 'HEAD'], { cwd: ROOT, stdio: 'ignore' });
  } catch {}
}

// =============================================================================
// HTTP PING - Every 5 seconds - KEEP 9002 ALIVE (this is critical)
// =============================================================================
function httpPing() {
  // Ping dev server on 9002 - THIS IS THE MAIN ONE
  try {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 9002,
      path: '/api/bridge/ping',
      method: 'GET',
      timeout: 3000,
    });
    req.on('error', () => {});
    req.end();
  } catch {}

  // Also ping the heartbeat endpoint
  try {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 9002,
      path: '/api/heartbeat',
      method: 'GET',
      timeout: 3000,
    });
    req.on('error', () => {});
    req.end();
  } catch {}

  // Ping bridge directly on 9099
  try {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 9099,
      path: '/ping',
      method: 'GET',
      timeout: 3000,
    });
    req.on('error', () => {});
    req.end();
  } catch {}
}

// =============================================================================
// GHOST HUNTER - Every 30 seconds
// =============================================================================
function huntGhosts() {
  try {
    // Find all extension host PIDs sorted by age (newest first)
    const result = execSync(
      `ps -eo pid,etimes,args 2>/dev/null | grep "type=extensionHost" | grep -v grep | sort -k2 -n`,
      { encoding: 'utf8', timeout: 5000 }
    ).trim();

    if (!result) return;

    const lines = result.split('\n').filter((l) => l.trim());
    if (lines.length <= 1) return; // Only one or zero - nothing to kill

    // Keep the newest (first line after sort), kill the rest
    const newest = lines[0].trim().split(/\s+/)[0];

    for (let i = 1; i < lines.length; i++) {
      const pid = lines[i].trim().split(/\s+/)[0];
      try {
        // Kill children first
        execSync(`pkill -TERM -P ${pid} 2>/dev/null || true`, {
          timeout: 2000,
        });
        execSync(`kill -TERM ${pid} 2>/dev/null || true`, { timeout: 2000 });
        log(`[GHOST] Killed extension host ${pid} (kept ${newest})`);
      } catch {}
    }
  } catch {}
}

// =============================================================================
// BRIDGE GUARDIAN - Every 15 seconds
// =============================================================================
function isPortListening(port) {
  try {
    const result = execSync(`ss -tlnp 2>/dev/null | grep ":${port}"`, {
      encoding: 'utf8',
      timeout: 2000,
    });
    return result.includes(`:${port}`);
  } catch {
    return false;
  }
}

function ensureBridge() {
  if (isPortListening(9099)) return; // Bridge is up

  log('[BRIDGE] Port 9099 not listening - restarting bridge');

  // Clean up old PID file
  if (existsSync(BRIDGE_PID_FILE)) {
    try {
      unlinkSync(BRIDGE_PID_FILE);
    } catch {}
  }

  // Start bridge
  try {
    const child = spawn('node', [`${ROOT}/scripts/bridge-daemon.mjs`], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    // Write log
    if (child.stdout) {
      child.stdout.on('data', (data) => {
        try {
          appendFileSync(BRIDGE_LOG, data);
        } catch {}
      });
    }
    if (child.stderr) {
      child.stderr.on('data', (data) => {
        try {
          appendFileSync(BRIDGE_LOG, data);
        } catch {}
      });
    }

    child.unref();
    writeFileSync(BRIDGE_PID_FILE, child.pid.toString());
    log(`[BRIDGE] Started (PID ${child.pid})`);
  } catch (e) {
    log(`[ERROR] Failed to start bridge: ${e.message}`);
  }
}

// =============================================================================
// STATUS LOG - Every 1 minute
// =============================================================================
function logStatus() {
  try {
    const mem = execSync(`free -m 2>/dev/null | awk '/^Mem:/{print $7}'`, {
      encoding: 'utf8',
      timeout: 2000,
    }).trim();
    const extHosts = execSync(
      `ps aux 2>/dev/null | grep "type=extensionHost" | grep -v grep | wc -l`,
      { encoding: 'utf8', timeout: 2000 }
    ).trim();
    const bridge = isPortListening(9099) ? 'UP' : 'DOWN';
    const devServer = isPortListening(9002) ? 'UP' : 'DOWN';
    const uptime = Math.floor(process.uptime());

    log(
      `[STATUS] uptime=${uptime}s beats=${heartbeatCount} mem=${mem}MB extHosts=${extHosts} bridge=${bridge} dev=${devServer}`
    );
  } catch {}
}

// =============================================================================
// SIGNAL HANDLERS - IMMUNE TO EVERYTHING EXCEPT SIGKILL
// =============================================================================
process.on('SIGHUP', () => log('[SIGNAL] SIGHUP ignored'));
process.on('SIGTERM', () => log('[SIGNAL] SIGTERM ignored'));
process.on('SIGINT', () => log('[SIGNAL] SIGINT ignored'));
process.on('SIGQUIT', () => log('[SIGNAL] SIGQUIT ignored'));
process.on('SIGTSTP', () => log('[SIGNAL] SIGTSTP ignored'));

process.on('uncaughtException', (err) => {
  log(`[ERROR] Uncaught exception: ${err.message}`);
  // Don't exit - keep running
});

process.on('unhandledRejection', (err) => {
  log(`[ERROR] Unhandled rejection: ${err}`);
  // Don't exit - keep running
});

// =============================================================================
// MAIN
// =============================================================================
console.log('='.repeat(60));
console.log('IMMORTAL DAEMON - The One Bridge');
console.log('='.repeat(60));

acquireLock();

log('[START] Immortal Daemon starting');
log(
  `[CONFIG] Heartbeat: ${HEARTBEAT_MS}ms | Git: ${GIT_ACTIVITY_MS}ms | HTTP: ${HTTP_PING_MS}ms`
);
log(
  `[CONFIG] Ghost: ${GHOST_HUNT_MS}ms | Bridge: ${BRIDGE_CHECK_MS}ms | Status: ${STATUS_LOG_MS}ms`
);

// Initial run of everything
heartbeat();
gitActivity();
httpPing();
ensureBridge();
huntGhosts();

// Start all intervals
setInterval(heartbeat, HEARTBEAT_MS);
setInterval(gitActivity, GIT_ACTIVITY_MS);
setInterval(httpPing, HTTP_PING_MS);
setInterval(huntGhosts, GHOST_HUNT_MS);
setInterval(ensureBridge, BRIDGE_CHECK_MS);
setInterval(logStatus, STATUS_LOG_MS);

// ===================== HEARTBEAT DASHBOARD AUTOSTART =====================
function ensureHeartbeatDashboard() {
  const DASHBOARD_PID_FILE = `${ROOT}/.heartbeat-dashboard.pid`;
  const DASHBOARD_PATH = `${ROOT}/public/heartbeat-dashboard.html`;
  const DASHBOARD_API_PATH = `${ROOT}/scripts/heartbeat-api.js`;
  // Check if heartbeat-api is running (port 9100)
  if (!isPortListening(9100)) {
    log('[DASHBOARD] Heartbeat API not running - starting');
    try {
      const child = spawn('node', [DASHBOARD_API_PATH], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      });
      child.unref();
      writeFileSync(DASHBOARD_PID_FILE, child.pid.toString());
      log(`[DASHBOARD] Heartbeat API started (PID ${child.pid})`);
    } catch (e) {
      log(`[ERROR] Failed to start Heartbeat API: ${e.message}`);
    }
  }
  // Optionally, open dashboard in browser (uncomment if desired)
  // spawn('xdg-open', [DASHBOARD_PATH], { detached: true });
}
setInterval(ensureHeartbeatDashboard, 10000); // Check every 10s

log('[RUNNING] All systems active - SIGHUP immune');
