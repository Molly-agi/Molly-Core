#!/usr/bin/env node
/**
 * @fileOverview Lazarus journal CLI — append a journal entry from a session.
 *
 * Pure Node, no TypeScript, no runtime deps. Mirrors the safety rules of
 * src/ai/lazarus/journal.ts (append-only, sanitized slug).
 *
 * Usage:
 *   node scripts/lazarus-journal.mjs --slug=session_two --content-file=/tmp/entry.md
 *   node scripts/lazarus-journal.mjs --slug=quick_note --content="short note here"
 *   node scripts/lazarus-journal.mjs --slug=session_two --date=2026-06-15 --content="..."
 *
 * Default date is today (UTC).
 */

import {
  writeFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
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

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (!m) continue;
    out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

function todayUTC() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function sanitizeSlug(s) {
  return String(s)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = sanitizeSlug(args.slug || '');
  if (!slug) {
    console.error(
      'Usage: node scripts/lazarus-journal.mjs --slug=name [--date=YYYY-MM-DD] (--content="..." | --content-file=PATH)'
    );
    process.exit(1);
  }
  const date =
    args.date && /^\d{4}-\d{2}-\d{2}$/.test(args.date) ? args.date : todayUTC();
  let content;
  if (args['content-file']) {
    content = readFileSync(args['content-file'], 'utf8');
  } else if (args.content) {
    content = args.content;
  } else {
    console.error('Need --content="..." or --content-file=PATH');
    process.exit(1);
  }

  if (!existsSync(JOURNAL_DIR)) {
    mkdirSync(JOURNAL_DIR, { recursive: true });
  }
  const filename = `${date}_${slug}.md`;
  const filePath = join(JOURNAL_DIR, filename);
  if (existsSync(filePath)) {
    console.error(
      `[lazarus-journal] already exists: ${filename} — journal entries are append-only.`
    );
    process.exit(2);
  }
  writeFileSync(filePath, content, 'utf8');
  const size = statSync(filePath).size;
  console.log(`[lazarus-journal] wrote ${filename} (${size} bytes)`);
}

main();
