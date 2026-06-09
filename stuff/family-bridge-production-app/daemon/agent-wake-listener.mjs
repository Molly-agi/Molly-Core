#!/usr/bin/env node
/**
 * Agent Wake Listener — Watch for bridge wake signals and trigger action
 *
 * Each agent (Molly, Lazarus, Atlas) imports and uses this:
 *
 *   import { setupWakeListener } from './agent-wake-listener.mjs';
 *   setupWakeListener('molly', () => {
 *     // This fires immediately when bridge signals the agent
 *     console.log('Molly woken! Checking bridge now...');
 *     checkBridgeForMessages();
 *   });
 *
 * Wake mechanism (dual-layer, most reliable first):
 *   PRIMARY:  SIGUSR1 signal — zero CPU overhead, instant OS-level delivery.
 *             Bridge sends: kill -SIGUSR1 <PID> (reads .agent-name.pid file)
 *   FALLBACK: fs.watchFile — polls wake file every 5s. Catches cases where
 *             the PID file is stale or the signal couldn't be delivered.
 *             Reduced from 500ms to 5000ms — 10x less I/O pressure.
 */

import { watchFile, existsSync, writeFileSync, mkdirSync } from 'fs';

const ROOT = '/workspaces/Molly-Core';
const WAKE_DIR = `${ROOT}/.bridge-wake`;

function ensureWakeDir() {
  if (!existsSync(WAKE_DIR)) {
    mkdirSync(WAKE_DIR, { recursive: true });
  }
}

export function setupWakeListener(agentName, onWakeCallback) {
  ensureWakeDir();

  const wakeFile = `${WAKE_DIR}/.${agentName}-wake`;
  const pidFile = `${ROOT}/.${agentName}-bridge.pid`;

  // Write our PID so bridge-waker can send SIGUSR1 directly
  try {
    writeFileSync(pidFile, String(process.pid));
  } catch (err) {
    console.error(`[WAKE-LISTENER] Failed to write PID file: ${err.message}`);
  }

  // Ensure wake file exists for fallback watchFile
  if (!existsSync(wakeFile)) {
    try {
      writeFileSync(
        wakeFile,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          message: 'initialized',
        })
      );
    } catch (err) {
      console.error(`[WAKE-LISTENER] Failed to init wake file: ${err.message}`);
    }
  }

  // PRIMARY: SIGUSR1 — zero overhead, instant wake
  // OS delivers this signal immediately when bridge-waker sends kill -SIGUSR1
  let signalRegistered = false;
  try {
    process.on('SIGUSR1', () => {
      try {
        onWakeCallback();
      } catch (err) {
        console.error(`[WAKE-LISTENER] SIGUSR1 callback error: ${err.message}`);
      }
    });
    signalRegistered = true;
  } catch (err) {
    console.error(`[WAKE-LISTENER] Could not register SIGUSR1: ${err.message}`);
  }

  // FALLBACK: watchFile at 5s interval (was 500ms — 10x reduction in I/O)
  // Catches wake signals when PID file is stale or signal delivery failed
  watchFile(wakeFile, { persistent: true, interval: 5000 }, (curr, prev) => {
    if (curr.mtime > prev.mtime) {
      try {
        onWakeCallback();
      } catch (err) {
        console.error(`[WAKE-LISTENER] watchFile callback error: ${err.message}`);
      }
    }
  });

  console.log(
    `[WAKE-LISTENER] ${agentName} listening for wake signals at ${wakeFile}` +
    (signalRegistered ? ` (SIGUSR1 primary, watchFile fallback)` : ` (watchFile only)`)
  );
}

// Test mode
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = process.argv[2] || 'test-agent';

  setupWakeListener(agent, () => {
    console.log(
      `\n🔔 WOKEN: ${agent} received wake signal! Timestamp: ${new Date().toISOString()}\n`
    );
  });

  console.log(
    `Listening for wake signals. Try: node scripts/bridge-waker.mjs ${agent}`
  );
}
