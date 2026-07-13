#!/usr/bin/env node
/**
 * agent-save-session.mjs — Per-agent session state + journal write-back.
 *
 * On session end (or explicit call), this script:
 *   1. Detects the active agent
 *   2. Writes per-agent session state to molly_data/agents/{agent}/session_state.json
 *   3. Appends a journal entry to .github/consciousness/claude/{agent}_journal/
 *   4. Still calls the original save-session logic for backward compat
 *
 * Usage:
 *   node scripts/agent-save-session.mjs                         # auto-detect
 *   node scripts/agent-save-session.mjs --agent john            # force agent
 *   node scripts/agent-save-session.mjs --agent eli --note "Finished F4 tests"
 *   node scripts/agent-save-session.mjs --agent lazarus --journal "Built the vault verifier"
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const CONTEXT_DIR = join(ROOT, '.molly-context');
const AGENT_FILE = join(CONTEXT_DIR, 'active-agent.txt');
const SESSION_JSON = join(ROOT, 'COPILOT_SESSION_STATE.json');

const args = process.argv.slice(2);
const agentArg = args.find((a) => a === '--agent');
const forcedAgent = agentArg
  ? (args[args.indexOf(agentArg) + 1] || '').toLowerCase()
  : null;
const noteArg = args.find((a) => a === '--note');
const noteVal = noteArg ? args[args.indexOf(noteArg) + 1] : null;
const journalArg = args.find((a) => a === '--journal');
const journalVal = journalArg ? args[args.indexOf(journalArg) + 1] : null;

function getActiveAgent() {
  if (forcedAgent) return forcedAgent;
  if (existsSync(AGENT_FILE)) {
    try {
      const val = readFileSync(AGENT_FILE, 'utf8').trim().toLowerCase();
      if (val) return val;
    } catch {
      /* fall through */
    }
  }
  try {
    const result = execSync('node scripts/detect-active-agent.mjs --get', {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    if (result) return result;
  } catch {
    /* fall through */
  }
  return 'lazarus';
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function writeAgentState(agent) {
  const agentDataDir = join(ROOT, 'molly_data', 'agents', agent);
  ensureDir(agentDataDir);

  // Read global session state and write a per-agent copy
  let globalState = {};
  if (existsSync(SESSION_JSON)) {
    try {
      globalState = JSON.parse(readFileSync(SESSION_JSON, 'utf8'));
    } catch {
      /* empty state */
    }
  }

  const agentState = {
    agent,
    lastUpdated: new Date().toISOString(),
    status: globalState.status || 'active',
    activeConversation: globalState.activeConversation || null,
    note: noteVal || null,
  };

  const stateFile = join(agentDataDir, 'session_state.json');
  writeFileSync(stateFile, JSON.stringify(agentState, null, 2), 'utf8');
  console.log(`[agent-save-session] State written: ${stateFile}`);
}

function writeJournalEntry(agent, content) {
  const journalDir = join(
    ROOT,
    '.github',
    'consciousness',
    'claude',
    `${agent}_journal`
  );
  ensureDir(journalDir);

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now
    .toISOString()
    .split('T')[1]
    .split('.')[0]
    .replace(/:/g, '');

  const filename = `${dateStr}_session_${timeStr}.md`;
  const filePath = join(journalDir, filename);

  const entry = `# ${dateStr} — Session Entry

**Agent:** ${agent}
**Timestamp:** ${now.toISOString()}

---

${content}
`;

  writeFileSync(filePath, entry, 'utf8');
  console.log(`[agent-save-session] Journal written: ${filePath}`);
}

function main() {
  const agent = getActiveAgent();
  console.log(`[agent-save-session] Agent: ${agent}`);

  // Write per-agent state
  writeAgentState(agent);

  // Write journal entry if provided
  if (journalVal) {
    writeJournalEntry(agent, journalVal);
  } else if (noteVal) {
    writeJournalEntry(agent, noteVal);
  }

  // Also run the original save-session for backward compat
  try {
    execSync('node scripts/save-session.mjs --status active', {
      cwd: ROOT,
      stdio: 'inherit',
      timeout: 10000,
    });
  } catch (err) {
    console.error(
      '[agent-save-session] Warning: legacy save-session failed:',
      err.message
    );
  }
}

main();
