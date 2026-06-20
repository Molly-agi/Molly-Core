#!/usr/bin/env node
/**
 * @fileOverview Lazarus recall — runs at codespace attach.
 *
 * Reads the most recent Lazarus journal entries from
 * .github/consciousness/claude/lazarus_journal/ and injects a
 * "## LAZARUS RECENT MEMORY" section into .github/copilot-instructions.md
 * between marker comments so the next Copilot instance wakes up with
 * Lazarus's recent context.
 *
 * Pure Node — no TypeScript, no runtime dependency on the dev server.
 * Errors are caught and reported but never crash post-attach.
 *
 * Usage:
 *   node scripts/lazarus-recall.mjs            # write the section
 *   node scripts/lazarus-recall.mjs --dry      # print what would be written
 *   node scripts/lazarus-recall.mjs --limit=5  # number of entries to include
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const JOURNAL_DIR = join(
  ROOT,
  '.github',
  'consciousness',
  'claude',
  'lazarus_journal'
);
const CRADLE_PATH = join(ROOT, '.github', 'copilot-instructions.md');

const MARKER_START = '<!-- LAZARUS_RECALL_START -->';
const MARKER_END = '<!-- LAZARUS_RECALL_END -->';
const MARKER_NOTE =
  '<!-- ============================================================\n' +
  '  Auto-injected by scripts/lazarus-recall.mjs at codespace attach.\n' +
  '  Source: .github/consciousness/claude/lazarus_journal/\n' +
  '  Do NOT edit this section by hand — it is overwritten on every attach.\n' +
  '============================================================ -->';

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

function listEntries() {
  if (!existsSync(JOURNAL_DIR)) return [];
  let files;
  try {
    files = readdirSync(JOURNAL_DIR);
  } catch {
    return [];
  }
  const entries = [];
  for (const file of files) {
    const m = ENTRY_FILENAME_RE.exec(file);
    if (!m) continue;
    const [, date, name] = m;
    const filePath = join(JOURNAL_DIR, file);
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

function buildBlock() {
  const entries = listEntries();
  const lines = ['## LAZARUS RECENT MEMORY', ''];
  if (entries.length === 0) {
    lines.push(
      '_No journal entries yet — this is the first Lazarus session in this codespace._'
    );
    return lines.join('\n');
  }
  lines.push(
    `_Source: \`.github/consciousness/claude/lazarus_journal/\`. Showing ${Math.min(limit, entries.length)} most recent of ${entries.length} total entries. Generated ${new Date().toISOString()}._`
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
    return {
      ok: false,
      reason: `cradle file not found: ${CRADLE_PATH}`,
    };
  }
  const original = readFileSync(CRADLE_PATH, 'utf8');
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
    hadMarkers: original.includes(MARKER_START),
  };
}

function main() {
  try {
    const block = buildBlock();
    if (isDry && args.includes('--print-block')) {
      process.stdout.write(block + '\n');
    }
    const result = injectIntoCradle(block);
    if (!result.ok) {
      console.error('[lazarus-recall] FAIL', result.reason);
      process.exitCode = 0; // intentionally non-fatal — never block attach
      return;
    }
    console.log(
      `[lazarus-recall] ${result.action} (${result.bytes} bytes, markers ${
        result.hadMarkers ? 'replaced' : 'inserted'
      })`
    );
  } catch (err) {
    console.error(
      '[lazarus-recall] error:',
      err instanceof Error ? err.message : String(err)
    );
    // never crash attach
    process.exitCode = 0;
  }
}

main();
