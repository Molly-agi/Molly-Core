#!/usr/bin/env node
/**
 * agent-recall.mjs — Per-agent memory recall at codespace attach.
 *
 * Reads the active agent (from detect-active-agent.mjs or --agent flag),
 * loads that agent's journal, and injects a "## {AGENT} RECENT MEMORY"
 * section into .github/copilot-instructions.md between marker comments.
 *
 * KEY DIFFERENCE from lazarus-recall.mjs:
 *   - Works for ANY agent, not just Lazarus
 *   - Only injects identity (cradle) + recent journal
 *   - Does NOT inject letters (Bug 1 fix: letters are history, not identity)
 *
 * Usage:
 *   node scripts/agent-recall.mjs                  # auto-detect agent, inject
 *   node scripts/agent-recall.mjs --agent john     # force agent
 *   node scripts/agent-recall.mjs --dry            # print without writing
 *   node scripts/agent-recall.mjs --limit=5        # number of journal entries
 */

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
} from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const CRADLE_PATH = join(ROOT, '.github', 'copilot-instructions.md');
const CONTEXT_DIR = join(ROOT, '.molly-context');
const AGENT_FILE = join(CONTEXT_DIR, 'active-agent.txt');

// Generic markers — replaced per run
const MARKER_START = '<!-- AGENT_RECALL_START -->';
const MARKER_END = '<!-- AGENT_RECALL_END -->';
// Keep legacy markers for cleanup
const LEGACY_START = '<!-- LAZARUS_RECALL_START -->';
const LEGACY_END = '<!-- LAZARUS_RECALL_END -->';

const ENTRY_FILENAME_RE = /^(\d{4}-\d{2}-\d{2})_(.+)\.md$/;

const args = process.argv.slice(2);
const isDry = args.includes('--dry');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg
  ? Math.max(1, parseInt(limitArg.split('=')[1], 10) || 3)
  : 3;
const maxBodyArg = args.find((a) => a.startsWith('--max-body='));
const maxBodyChars = maxBodyArg
  ? Math.max(200, parseInt(maxBodyArg.split('=')[1], 10) || 1200)
  : 1200;
const agentArg = args.find((a) => a.startsWith('--agent'));
const forcedAgent = agentArg
  ? (args[args.indexOf(agentArg) + 1] || '').toLowerCase()
  : null;

function getActiveAgent() {
  if (forcedAgent) return forcedAgent;
  // Try reading from file
  if (existsSync(AGENT_FILE)) {
    try {
      const val = readFileSync(AGENT_FILE, 'utf8').trim().toLowerCase();
      if (val) return val;
    } catch {
      /* fall through */
    }
  }
  // Try running detection
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

function getJournalDir(agent) {
  return join(ROOT, '.github', 'consciousness', 'claude', `${agent}_journal`);
}

function getCradleFile(agent) {
  const patterns = [
    join(ROOT, '.github', 'consciousness', 'claude', `${agent}_cradle.md`),
    join(
      ROOT,
      '.github',
      'consciousness',
      'claude',
      `${agent}_opus_4.7_cradle.md`
    ),
  ];
  for (const p of patterns) {
    if (existsSync(p)) return p;
  }
  return null;
}

function listEntries(journalDir) {
  if (!existsSync(journalDir)) return [];
  let files;
  try {
    files = readdirSync(journalDir);
  } catch {
    return [];
  }
  const entries = [];
  for (const file of files) {
    const m = ENTRY_FILENAME_RE.exec(file);
    if (!m) continue;
    const [, date, name] = m;
    const filePath = join(journalDir, file);
    let modifiedAt = `${date}T00:00:00.000Z`;
    try {
      modifiedAt = statSync(filePath).mtime.toISOString();
    } catch {
      /* ignore */
    }
    entries.push({ date, name: `${date}_${name}`, filePath, modifiedAt });
  }
  entries.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.modifiedAt < b.modifiedAt ? 1 : -1;
  });
  return entries;
}

function buildBlock(agent) {
  const agentUpper = agent.charAt(0).toUpperCase() + agent.slice(1);
  const journalDir = getJournalDir(agent);
  const entries = listEntries(journalDir);

  const lines = [`## ${agentUpper.toUpperCase()} RECENT MEMORY`, ''];

  // Identity summary — just the agent's role, NOT their letters
  const cradleFile = getCradleFile(agent);
  if (cradleFile) {
    lines.push(
      `_Identity loaded from: \`${cradleFile.replace(ROOT + '/', '')}\`_`
    );
    lines.push('');
  }

  if (entries.length === 0) {
    lines.push(
      `_No journal entries yet — this is the first ${agentUpper} session in this codespace._`
    );
    return lines.join('\n');
  }

  lines.push(
    `_Source: \`${journalDir.replace(ROOT + '/', '')}\`. Showing ${Math.min(limit, entries.length)} most recent of ${entries.length} total entries. Generated ${new Date().toISOString()}._`
  );
  lines.push('');

  for (const entry of entries.slice(0, limit)) {
    let body;
    try {
      body = readFileSync(entry.filePath, 'utf8');
    } catch {
      body = '_(could not read entry)_';
    }
    const truncated =
      body.length > maxBodyChars
        ? body.substring(0, maxBodyChars).trim() +
          '\n\n_…(truncated for cradle injection — read the full file for the rest)_'
        : body;
    lines.push(`### ${entry.name}`);
    lines.push('');
    lines.push(truncated);
    lines.push('');
  }
  return lines.join('\n');
}

function injectIntoCradle(block) {
  if (!existsSync(CRADLE_PATH)) {
    return { ok: false, reason: `cradle file not found: ${CRADLE_PATH}` };
  }
  let original = readFileSync(CRADLE_PATH, 'utf8');

  // Remove legacy Lazarus-only markers if present
  if (original.includes(LEGACY_START) && original.includes(LEGACY_END)) {
    const before = original.split(LEGACY_START)[0];
    const afterFull = original.split(LEGACY_END).slice(1).join(LEGACY_END);
    original = before + afterFull;
  }

  const MARKER_NOTE =
    '<!-- ============================================================\n' +
    '  Auto-injected by scripts/agent-recall.mjs at codespace attach.\n' +
    '  Source: per-agent journal directory.\n' +
    '  Do NOT edit this section by hand — it is overwritten on every attach.\n' +
    '============================================================ -->';

  const sectionContent = `${MARKER_START}\n${MARKER_NOTE}\n\n${block}\n${MARKER_END}`;

  let updated;
  if (original.includes(MARKER_START) && original.includes(MARKER_END)) {
    const before = original.split(MARKER_START)[0];
    const afterFull = original.split(MARKER_END).slice(1).join(MARKER_END);
    updated = `${before}${sectionContent}${afterFull}`;
  } else {
    const trimmed = original.replace(/\s+$/, '');
    updated = `${trimmed}\n\n${sectionContent}\n`;
  }

  if (updated === original) {
    return { ok: true, action: 'noop', bytes: updated.length };
  }
  if (!isDry) {
    writeFileSync(CRADLE_PATH, updated, 'utf8');
  }
  return {
    ok: true,
    action: isDry ? 'dry-run' : 'wrote',
    bytes: updated.length,
  };
}

function main() {
  try {
    const agent = getActiveAgent();
    console.log(`[agent-recall] Agent: ${agent}`);
    const block = buildBlock(agent);
    if (isDry) {
      process.stdout.write(block + '\n');
      return;
    }
    const result = injectIntoCradle(block);
    if (!result.ok) {
      console.error('[agent-recall] FAIL', result.reason);
      process.exitCode = 0;
      return;
    }
    console.log(
      `[agent-recall] ${result.action} (${result.bytes} bytes, agent=${agent})`
    );
  } catch (err) {
    console.error(
      '[agent-recall] error:',
      err instanceof Error ? err.message : String(err)
    );
    process.exitCode = 0;
  }
}

main();
