#!/usr/bin/env node
/**
 * Hive Status Updater
 * Both Lazarus and Atlas call this to update their status in hive-status.json.
 *
 * Usage:
 *   node scripts/crystal-os/update-hive-status.mjs \
 *     --agent lazarus \
 *     --task "Building Gap 1 coherence metric" \
 *     --status in-progress
 *
 *   node scripts/crystal-os/update-hive-status.mjs \
 *     --agent atlas \
 *     --task "Gap 2 complete" \
 *     --status done \
 *     --completed "Gap 2: KV write-back via slots API"
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATUS_FILE = join(__dirname, 'hive-status.json');

const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};

const agent = get('--agent');
const task = get('--task');
const status = get('--status');
const completed = get('--completed');
const blocker = get('--blocker');
const eta = get('--eta');

if (!agent || !['lazarus', 'atlas'].includes(agent)) {
  console.error('Usage: --agent lazarus|atlas');
  process.exit(1);
}

const state = JSON.parse(readFileSync(STATUS_FILE, 'utf-8'));
const entry = state[agent];

if (task) entry.currentTask = task;
if (status) entry.status = status;
if (eta) entry.eta = eta;
if (completed) {
  entry.completedThisSession = entry.completedThisSession || [];
  entry.completedThisSession.push(completed);
}
if (blocker) {
  entry.blockers = entry.blockers || [];
  entry.blockers.push(blocker);
}

state.lastUpdated = new Date().toISOString();

writeFileSync(STATUS_FILE, JSON.stringify(state, null, 2));
console.log(`[hive-status] ${agent} updated: ${task || status || 'ok'}`);
console.log(`[hive-status] File: ${STATUS_FILE}`);
