#!/usr/bin/env node
/**
 * Agent Wake Listener — Watch for bridge wake signals and trigger action
 *
 * Each agent (Molly, Lazarus, Atlas) imports and uses this:
 *
 *   import { setupWakeListener } from './agent-wake-listener.mjs';
 *   setupWakeListener('molly', () => {
 *     // This fires immediately when .molly-wake file is touched
 *     console.log('Molly woken! Checking bridge now...');
 *     checkBridgeForMessages();
 *   });
 */

import { watchFile, existsSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const ROOT = '/workspaces/Molly-Core';
const WAKE_DIR = `${ROOT}/.bridge-wake`;

function ensureWakeDir() {
  if (!existsSync(WAKE_DIR)) {
    mkdirSync(WAKE_DIR, { recursive: true });
  }
}

export function setupWakeListener(agentName, onWakeCallback) {
  const wakeFile = `${WAKE_DIR}/.${agentName}-wake`;

  // Ensure file exists
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
      return;
    }
  }

  // Watch file for ANY change (mtime update = wake signal)
  watchFile(wakeFile, { persistent: true, interval: 500 }, (curr, prev) => {
    // Only trigger if mtime actually changed (not initial watch)
    if (curr.mtime > prev.mtime) {
      try {
        onWakeCallback();
      } catch (err) {
        console.error(`[WAKE-LISTENER] Callback error: ${err.message}`);
      }
    }
  });

  console.log(
    `[WAKE-LISTENER] ${agentName} listening for wake signals at ${wakeFile}`
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
