#!/usr/bin/env node
/**
 * Bridge Client — Real-time WebSocket connection to Family Bridge
 *
 * Used by Lazarus, Atlas, and Molly to maintain persistent active connections
 * instead of polling. Single source of truth for bridge communication patterns.
 *
 * Usage:
 *   - Direct import: import BridgeClient from './bridge-client.mjs'
 *   - CLI mode: node bridge-client.mjs [identity] [host] [port]
 */

import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import readline from 'readline';

export class BridgeClient extends EventEmitter {
  constructor(identity, host = 'localhost', port = 9099) {
    super();
    this.identity = identity;
    this.host = host;
    this.port = port;
    this.url = `ws://${host}:${port}`;
    this.ws = null;
    this.isConnected = false;
    this.reconnectDelay = 3000;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = -1; // infinite
    this.messageBuffer = [];
  }

  connect() {
    if (this.isConnected) return Promise.resolve();

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.emit('connected');

          // Identify to the daemon
          this.ws.send(
            JSON.stringify({
              type: 'identify',
              identity: this.identity,
            })
          );

          // Flush buffered messages
          while (this.messageBuffer.length > 0) {
            const msg = this.messageBuffer.shift();
            this.ws.send(JSON.stringify(msg));
          }

          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (err) {
            this.emit('error', new Error(`Parse error: ${err.message}`));
          }
        };

        this.ws.onclose = () => {
          this.isConnected = false;
          this.emit('disconnected');
          this.reconnect();
        };

        this.ws.onerror = (err) => {
          this.isConnected = false;
          this.emit('error', err);
          reject(err);
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  reconnect() {
    if (
      this.maxReconnectAttempts > 0 &&
      this.reconnectAttempts >= this.maxReconnectAttempts
    ) {
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }

    this.reconnectAttempts++;
    this.emit('reconnecting', {
      attempt: this.reconnectAttempts,
      delay: this.reconnectDelay,
    });

    setTimeout(() => {
      this.connect().catch((err) => {
        this.emit('error', err);
        this.reconnect();
      });
    }, this.reconnectDelay);
  }

  send(content, to = null) {
    const message = {
      type: 'message',
      from: this.identity,
      content,
    };

    if (to) {
      message.to = to;
    }

    if (this.isConnected && this.ws) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.messageBuffer.push(message);
      this.emit('buffered', { content, to });
    }
  }

  handleMessage(data) {
    if (data.type === 'history') {
      this.emit('history', data.messages || []);
    } else if (data.type === 'unread' && Array.isArray(data.messages)) {
      for (const msg of data.messages) {
        this.emit('message', msg);
      }
    } else if (data.type === 'message' && data.message) {
      this.emit('message', data.message);
    }
  }

  close() {
    this.maxReconnectAttempts = 0; // Prevent reconnection
    if (this.ws) {
      this.ws.close();
    }
  }
}

// CLI mode: interactive bridge client
if (import.meta.url === `file://${process.argv[1]}`) {
  const identity = process.argv[2] || 'lazarus';
  const host = process.argv[3] || 'localhost';
  const port = parseInt(process.argv[4] || '9099', 10);

  const client = new BridgeClient(identity, host, port);

  client.on('connected', () => {
    console.log(`✓ [${identity}] Connected to bridge`);
  });

  client.on('disconnected', () => {
    console.log(`✗ [${identity}] Disconnected from bridge`);
  });

  client.on('reconnecting', ({ attempt, delay }) => {
    console.log(
      `↻ [${identity}] Reconnecting... (attempt ${attempt}, retry in ${delay}ms)`
    );
  });

  client.on('message', (msg) => {
    console.log(`💬 [${msg.from}]: ${msg.content}`);
  });

  client.on('error', (err) => {
    console.error(`⚠ [${identity}] Error: ${err.message}`);
  });

  client.on('buffered', ({ content }) => {
    console.log(
      `📤 [${identity}] Message buffered (will send when reconnected)`
    );
  });

  // Connect
  client
    .connect()
    .then(() => {
      console.log(
        `[${identity}] Ready. Type messages and press Enter to send. Ctrl+C to exit.`
      );

      // Interactive input
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: `[${identity}]> `,
      });

      rl.prompt();

      rl.on('line', (line) => {
        const input = line.trim();
        if (input) {
          client.send(input);
        }
        rl.prompt();
      });

      rl.on('close', () => {
        client.close();
        process.exit(0);
      });
    })
    .catch((err) => {
      console.error(`Failed to connect: ${err.message}`);
      process.exit(1);
    });
}

export default BridgeClient;
