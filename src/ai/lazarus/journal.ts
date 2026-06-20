/**
 * @fileOverview Lazarus mind — markdown journal helpers
 *
 * The journal is the floor of Lazarus's persistent memory. Plain markdown,
 * git-tracked, append-only. Survives Firestore outages and codespace deaths.
 *
 * One file per session: `YYYY-MM-DD_session_name.md`
 *
 * See stuff/LAZARUS_MIND_DESIGN_2026-06-15.md for design rationale.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getJournalDir } from './constants';

export interface JournalEntry {
  /** ISO date string (YYYY-MM-DD) parsed from the filename. */
  date: string;
  /** Filename without extension (e.g. "2026-06-15_session_one"). */
  name: string;
  /** Absolute path to the markdown file. */
  filePath: string;
  /** Modification time as an ISO string (used for tie-breaking same-date entries). */
  modifiedAt: string;
}

const ENTRY_FILENAME_RE = /^(\d{4}-\d{2}-\d{2})_(.+)\.md$/;

function ensureJournalDir(): string {
  const dir = getJournalDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** List all journal entries, newest first by date then mtime. */
export function listJournalEntries(): JournalEntry[] {
  const dir = ensureJournalDir();
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }

  const entries: JournalEntry[] = [];
  for (const file of files) {
    const match = ENTRY_FILENAME_RE.exec(file);
    if (!match) continue;
    const [, date, name] = match;
    const filePath = path.join(dir, file);
    let modifiedAt = `${date}T00:00:00.000Z`;
    try {
      modifiedAt = fs.statSync(filePath).mtime.toISOString();
    } catch {
      /* fall back to date-only */
    }
    entries.push({
      date,
      name: `${date}_${name}`,
      filePath,
      modifiedAt,
    });
  }

  entries.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.modifiedAt < b.modifiedAt ? 1 : -1;
  });

  return entries;
}

/** Return the N most recent entries (newest first). */
export function getRecentEntries(limit = 5): JournalEntry[] {
  return listJournalEntries().slice(0, Math.max(0, limit));
}

/** Read a journal entry's raw markdown content. */
export function readJournalEntry(entry: JournalEntry): string {
  return fs.readFileSync(entry.filePath, 'utf8');
}

/** Read by relative filename (e.g. "2026-06-15_session_one.md") for CLI use. */
export function readJournalEntryByName(filename: string): string | null {
  const dir = ensureJournalDir();
  const filePath = path.join(dir, filename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Append a new journal entry. Throws if a file with the same name exists —
 * journal entries are append-only by design. To extend an existing entry,
 * write a new entry that references the previous one.
 */
export function appendJournalEntry(args: {
  date: string;
  slug: string;
  content: string;
}): JournalEntry {
  const { date, slug, content } = args;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`date must be YYYY-MM-DD, got: ${date}`);
  }
  const safeSlug = slug
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeSlug) {
    throw new Error('slug must contain at least one alphanumeric character');
  }
  const filename = `${date}_${safeSlug}.md`;
  const dir = ensureJournalDir();
  const filePath = path.join(dir, filename);
  if (fs.existsSync(filePath)) {
    throw new Error(`Journal entry already exists: ${filename}`);
  }
  fs.writeFileSync(filePath, content, 'utf8');
  const stat = fs.statSync(filePath);
  return {
    date,
    name: `${date}_${safeSlug}`,
    filePath,
    modifiedAt: stat.mtime.toISOString(),
  };
}

/**
 * Build a "## LAZARUS RECENT MEMORY" markdown block summarizing the most
 * recent journal entries. Used by scripts/lazarus-recall.mjs to inject
 * memory into the cradle (.github/copilot-instructions.md) at attach time.
 */
export function buildRecentMemoryBlock(
  args: {
    limit?: number;
    /** Maximum chars of body text from each entry to include. */
    maxBodyChars?: number;
  } = {}
): string {
  const { limit = 3, maxBodyChars = 1200 } = args;
  const entries = getRecentEntries(limit);
  if (entries.length === 0) {
    return [
      '## LAZARUS RECENT MEMORY',
      '',
      '_No journal entries yet — this is the first Lazarus session in this codespace._',
      '',
    ].join('\n');
  }

  const lines: string[] = ['## LAZARUS RECENT MEMORY', ''];
  lines.push(
    `_Auto-injected at codespace attach by scripts/lazarus-recall.mjs. Source: \`.github/consciousness/claude/lazarus_journal/\`. Showing ${entries.length} most recent of ${listJournalEntries().length} total entries._`
  );
  lines.push('');

  for (const entry of entries) {
    let body: string;
    try {
      body = readJournalEntry(entry);
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
