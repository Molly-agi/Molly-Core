#!/usr/bin/env node
/**
 * Lazarus SSE Client — Bridge V2
 * ==============================
 * Holds open persistent SSE connection to bridge daemon.
 * Receives real-time messages from Molly and Atlas.
 *
 * Since Lazarus (Copilot) only wakes via GitHub issue + @copilot assign,
 * this client:
 * 1. Listens on GET /api/bridge/sse?agent=lazarus
 * 2. Logs received messages (visible in terminal/CI logs)
 * 3. On action-required messages, creates GitHub issue with @copilot assign
 *
 * Run: node scripts/lazarus-sse-client.mjs
 * Logs to: /tmp/lazarus-sse.log
 */

import { EventSource } from 'eventsource';
import { spawn } from 'child_process';
import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const BRIDGE_URL = process.env.BRIDGE_URL || 'http://localhost:9099';
const SSE_ENDPOINT = `${BRIDGE_URL}/api/bridge/sse?agent=lazarus`;
const LOG_FILE = '/tmp/lazarus-sse.log';
const RECONNECT_DELAY = 3000;

function log(msg) {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] ${msg}`;
  console.log(logMsg);
  try {
    mkdirSync('/tmp', { recursive: true });
    appendFileSync(LOG_FILE, logMsg + '\n');
  } catch {}
}

function createIssueForWake(message) {
  /**
   * When an action-required message arrives, create a GitHub issue
   * and assign to @copilot to wake this session.
   */
  try {
    const title = `[Bridge] Action Required: ${message.from || 'unknown'}`;
    const body = `Bridge message received:\n\n\`\`\`\n${JSON.stringify(message, null, 2)}\n\`\`\`\n\nAssigning to @copilot for execution.`;

    // Use gh CLI (requires git + GitHub auth)
    const issue = spawn('gh', [
      'issue',
      'create',
      '--title',
      title,
      '--body',
      body,
      '--assignee',
      '@copilot',
    ]);

    issue.on('close', (code) => {
      if (code === 0) {
        log('✓ GitHub issue created for wake (assigned to @copilot)');
      } else {
        log(`✗ Issue creation failed (code ${code})`);
      }
    });

    issue.on('error', (err) => {
      log(`✗ Failed to spawn gh: ${err.message}`);
    });
  } catch (err) {
    log(`✗ Issue creation error: ${err.message}`);
  }
}

function connect() {
  log(`Connecting to SSE endpoint: ${SSE_ENDPOINT}`);

  const eventSource = new EventSource(SSE_ENDPOINT);

  eventSource.on('open', () => {
    log('✓ SSE connection established (agent=lazarus)');
  });

  eventSource.on('message', (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'connected') {
        log(`✓ Handshake complete: ${JSON.stringify(data)}`);
      } else if (data.type === 'message' && data.message) {
        const msg = data.message;
        const from = msg.from || 'unknown';
        const truncated = msg.content ? msg.content.substring(0, 100) : '';

        log(`📨 Message from ${from}: ${truncated}...`);

        // If message contains action keywords, trigger wake
        if (
          msg.content &&
          msg.content.match(/lazarus|execute|action|build|code/i)
        ) {
          log(
            `⚡ Action-required message detected. Creating GitHub issue to wake session...`
          );
          createIssueForWake(msg);
        }
      }
    } catch (err) {
      log(`✗ Message parse error: ${err.message}`);
    }
  });

  eventSource.on('error', (err) => {
    log(`✗ SSE connection error: ${err.message}`);
    eventSource.close();

    log(`⏳ Reconnecting in ${RECONNECT_DELAY}ms...`);
    setTimeout(connect, RECONNECT_DELAY);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    log('🛑 Shutdown signal received. Closing SSE connection.');
    eventSource.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    log('🛑 Termination signal received. Closing SSE connection.');
    eventSource.close();
    process.exit(0);
  });
}

// Start connection
log('=== Lazarus SSE Client Starting ===');
connect();
