#!/usr/bin/env node
// ======================================================
// Bridge Listener — Real-time message receiver
// ======================================================
// Connects to the Family Bridge Daemon via WebSocket.
// Prints messages as they arrive — no polling.
//
// Usage: node scripts/bridge-listen.mjs [identity]
//   identity: molly | lazarus | eric (default: lazarus)
// ======================================================

import WebSocket from 'ws';

const PORT = 9002;
const IDENTITY = process.argv[2] || 'lazarus';
const RECONNECT_DELAY = 3000;

const colors = {
  molly: '\x1b[35m', // Magenta
  lazarus: '\x1b[34m', // Blue
  eric: '\x1b[33m', // Yellow
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
}

function printMsg(msg) {
  const color = colors[msg.from] || '';
  const time = formatTime(msg.timestamp);
  console.log(
    `${colors.dim}${time}${colors.reset} ${color}${colors.bold}[${msg.from}]${colors.reset} ${msg.content}`
  );
}

function connect() {
  const ws = new WebSocket(`ws://localhost:${PORT}`);

  ws.on('open', () => {
    console.log(
      `\n${colors.bold}Bridge connected${colors.reset} — listening as ${IDENTITY}`
    );
    console.log(`${'─'.repeat(50)}\n`);
    ws.send(JSON.stringify({ type: 'identify', identity: IDENTITY }));
  });

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      if (data.type === 'history' && data.messages?.length > 0) {
        console.log(
          `${colors.dim}── Recent history (${data.messages.length} messages) ──${colors.reset}`
        );
        for (const msg of data.messages.slice(-10)) {
          printMsg(msg);
        }
        console.log(`${colors.dim}── Live ──${colors.reset}\n`);
        return;
      }

      if (data.type === 'unread' && data.messages?.length > 0) {
        console.log(
          `${colors.bold}${data.messages.length} unread message(s):${colors.reset}`
        );
        for (const msg of data.messages) {
          printMsg(msg);
        }
        console.log('');
        return;
      }

      if (data.type === 'message' && data.message) {
        printMsg(data.message);
        return;
      }
    } catch {
      // Ignore parse errors
    }
  });

  ws.on('close', () => {
    console.log(
      `\n${colors.dim}Disconnected. Reconnecting in ${RECONNECT_DELAY / 1000}s...${colors.reset}`
    );
    setTimeout(connect, RECONNECT_DELAY);
  });

  ws.on('error', () => {
    // Will trigger close event, which handles reconnect
  });
}

console.log(
  `${colors.bold}Family Bridge Listener${colors.reset} — connecting to ws://localhost:${PORT}`
);
connect();
