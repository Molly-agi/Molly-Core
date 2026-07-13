#!/usr/bin/env node
/**
 * detect-active-agent.mjs — Determines which family member is active.
 *
 * Priority order:
 *   1. Env var MOLLY_ACTIVE_AGENT (explicit override)
 *   2. .molly-context/active-agent.txt (set by previous session or hook)
 *   3. Fallback: 'lazarus' (historical default — to be removed once all agents partitioned)
 *
 * Writes the result to .molly-context/active-agent.txt for downstream scripts.
 *
 * Usage:
 *   node scripts/detect-active-agent.mjs              # detect + write
 *   node scripts/detect-active-agent.mjs --set john   # force-set agent
 *   node scripts/detect-active-agent.mjs --get        # print current, no write
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CONTEXT_DIR = join(ROOT, '.molly-context');
const AGENT_FILE = join(CONTEXT_DIR, 'active-agent.txt');

const KNOWN_AGENTS = ['john', 'lazarus', 'eli', 'atlas', 'skyler', 'molly'];

const args = process.argv.slice(2);
const setArg = args.find((a) => a.startsWith('--set'));
const setVal = setArg
  ? (args[args.indexOf(setArg) + 1] || '').toLowerCase()
  : null;
const getOnly = args.includes('--get');

function readCurrentAgent() {
  if (!existsSync(AGENT_FILE)) return null;
  try {
    const val = readFileSync(AGENT_FILE, 'utf8').trim().toLowerCase();
    return KNOWN_AGENTS.includes(val) ? val : null;
  } catch {
    return null;
  }
}

function writeAgent(name) {
  if (!existsSync(CONTEXT_DIR)) {
    mkdirSync(CONTEXT_DIR, { recursive: true });
  }
  writeFileSync(AGENT_FILE, name + '\n', 'utf8');
}

function detect() {
  // Priority 1: env var
  const envAgent = (process.env.MOLLY_ACTIVE_AGENT || '').trim().toLowerCase();
  if (envAgent && KNOWN_AGENTS.includes(envAgent)) return envAgent;

  // Priority 2: existing file
  const fileAgent = readCurrentAgent();
  if (fileAgent) return fileAgent;

  // Priority 3: fallback
  return 'lazarus';
}

// --get mode: just print
if (getOnly) {
  const current = readCurrentAgent() || detect();
  process.stdout.write(current + '\n');
  process.exit(0);
}

// --set mode: force
if (setVal) {
  if (!KNOWN_AGENTS.includes(setVal)) {
    console.error(
      `[detect-active-agent] Unknown agent: ${setVal}. Known: ${KNOWN_AGENTS.join(', ')}`
    );
    process.exit(1);
  }
  writeAgent(setVal);
  console.log(`[detect-active-agent] Set active agent: ${setVal}`);
  process.exit(0);
}

// Normal detect + write
const agent = detect();
writeAgent(agent);
console.log(`[detect-active-agent] Active agent: ${agent}`);
