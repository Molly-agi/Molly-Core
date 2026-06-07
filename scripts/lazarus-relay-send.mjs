#!/usr/bin/env node
/**
 * Append outbound relay messages for lazarus-bridge.mjs to deliver.
 *
 * Usage:
 *   node scripts/lazarus-relay-send.mjs "message content"
 *   node scripts/lazarus-relay-send.mjs --to eric "message content"
 */

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LOG_DIR = join(ROOT, 'logs');
const OUTBOX_FILE = join(LOG_DIR, 'lazarus-relay-outbox.jsonl');

if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

const args = process.argv.slice(2);
let to;

if (args[0] === '--to' && args[1]) {
  to = args[1];
  args.splice(0, 2);
}

const content = args.join(' ').trim();
if (!content) {
  console.error('Usage: node scripts/lazarus-relay-send.mjs [--to recipient] "message"');
  process.exit(1);
}

const payload = {
  at: new Date().toISOString(),
  to,
  content,
};

appendFileSync(OUTBOX_FILE, JSON.stringify(payload) + '\n');
console.log('queued for relay');
