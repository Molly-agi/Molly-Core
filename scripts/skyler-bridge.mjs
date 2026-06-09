#!/usr/bin/env node
/**
 * Skyler Bridge — One-shot send/receive for the pushback agent.
 *
 * Unlike molly-listener (persistent WS daemon), Skyler is invoked on-demand
 * by Atlas or Eric. This script handles a single round-trip:
 *   send:    node scripts/skyler-bridge.mjs send <to> "<message>"
 *   receive: node scripts/skyler-bridge.mjs receive
 *   status:  node scripts/skyler-bridge.mjs status
 *
 * The bridge assigns a numeric clientId on first connect (stored locally
 * in .skyler-bridge-id.json for reference, but not required for auth).
 */

import { WebSocket } from 'ws';

const BRIDGE_WS = 'ws://localhost:9099';
const BRIDGE_HTTP = 'http://localhost:9099';
const IDENTITY = 'skyler';

const [, , command, ...args] = process.argv;

async function send(to, content) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BRIDGE_WS);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'identify', identity: IDENTITY }));
    });
    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === 'unread' || data.type === 'continuity_restore')
          return;
        // After identify ack (no explicit ack — just send)
        ws.send(
          JSON.stringify({ type: 'message', from: IDENTITY, to, content })
        );
        setTimeout(() => {
          ws.close();
          resolve();
        }, 300);
      } catch {
        /* ignore */
      }
    });
    // Send after brief delay to ensure identify was processed
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({ type: 'message', from: IDENTITY, to, content })
        );
        setTimeout(() => {
          ws.close();
          resolve();
        }, 300);
      }
    }, 500);
    ws.on('error', reject);
  });
}

async function receive() {
  const url = `${BRIDGE_HTTP}/messages?unread=${IDENTITY}`;
  const resp = await fetch(url);
  const data = await resp.json();
  return data;
}

async function status() {
  const resp = await fetch(`${BRIDGE_HTTP}/health`);
  return resp.json();
}

(async () => {
  try {
    switch (command) {
      case 'send': {
        const [to, ...msgParts] = args;
        const content = msgParts.join(' ');
        if (!to || !content) {
          console.error('Usage: skyler-bridge.mjs send <to> <message>');
          process.exit(1);
        }
        await send(to, content);
        console.log(`[skyler-bridge] Sent to ${to}: ${content.slice(0, 80)}`);
        break;
      }
      case 'receive': {
        const data = await receive();
        if (data.count === 0) {
          console.log('[skyler-bridge] No unread messages');
        } else {
          console.log(`[skyler-bridge] ${data.count} unread message(s):`);
          for (const msg of data.messages) {
            console.log(`  [${msg.from}] ${msg.content}`);
          }
        }
        break;
      }
      case 'status': {
        const data = await status();
        console.log(
          '[skyler-bridge] Bridge status:',
          JSON.stringify(data, null, 2)
        );
        break;
      }
      default:
        console.log('Usage: skyler-bridge.mjs <send|receive|status> [args]');
        process.exit(1);
    }
  } catch (err) {
    console.error('[skyler-bridge] Error:', err.message);
    process.exit(1);
  }
})();
