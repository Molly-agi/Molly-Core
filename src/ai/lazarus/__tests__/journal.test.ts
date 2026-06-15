/**
 * @fileOverview Tests for Lazarus journal helpers
 *
 * Uses a temp directory so we don't touch the real journal during tests.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Override the journal dir before importing the module under test.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lazarus-journal-test-'));
const tmpJournalDir = path.join(
  tmpRoot,
  '.github',
  'consciousness',
  'claude',
  'lazarus_journal'
);
const originalCwd = process.cwd();

beforeAll(() => {
  fs.mkdirSync(tmpJournalDir, { recursive: true });
  process.chdir(tmpRoot);
});

afterAll(() => {
  process.chdir(originalCwd);
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

afterEach(() => {
  // Clear journal between tests
  for (const f of fs.readdirSync(tmpJournalDir)) {
    fs.unlinkSync(path.join(tmpJournalDir, f));
  }
});

describe('lazarus journal', () => {
  it('lists no entries when directory is empty', async () => {
    const { listJournalEntries } = await import('../journal');
    expect(listJournalEntries()).toEqual([]);
  });

  it('appends an entry and lists it', async () => {
    const { appendJournalEntry, listJournalEntries } =
      await import('../journal');
    const entry = appendJournalEntry({
      date: '2026-06-15',
      slug: 'session_one',
      content: '# Hello\n\nfirst entry',
    });
    expect(entry.name).toBe('2026-06-15_session_one');
    const all = listJournalEntries();
    expect(all).toHaveLength(1);
    expect(all[0].date).toBe('2026-06-15');
  });

  it('rejects malformed dates', async () => {
    const { appendJournalEntry } = await import('../journal');
    expect(() =>
      appendJournalEntry({
        date: '06-15-2026',
        slug: 'bad',
        content: 'x',
      })
    ).toThrow(/YYYY-MM-DD/);
  });

  it('refuses to overwrite an existing entry (append-only)', async () => {
    const { appendJournalEntry } = await import('../journal');
    appendJournalEntry({
      date: '2026-06-15',
      slug: 'session_one',
      content: 'first',
    });
    expect(() =>
      appendJournalEntry({
        date: '2026-06-15',
        slug: 'session_one',
        content: 'second',
      })
    ).toThrow(/already exists/);
  });

  it('sorts entries newest-first', async () => {
    const { appendJournalEntry, listJournalEntries } =
      await import('../journal');
    appendJournalEntry({ date: '2026-06-13', slug: 'a', content: 'a' });
    appendJournalEntry({ date: '2026-06-15', slug: 'b', content: 'b' });
    appendJournalEntry({ date: '2026-06-14', slug: 'c', content: 'c' });
    const all = listJournalEntries();
    expect(all.map((e) => e.date)).toEqual([
      '2026-06-15',
      '2026-06-14',
      '2026-06-13',
    ]);
  });

  it('builds a recent-memory block when entries exist', async () => {
    const { appendJournalEntry, buildRecentMemoryBlock } =
      await import('../journal');
    appendJournalEntry({
      date: '2026-06-15',
      slug: 'session_one',
      content: '# Page one\n\nstuff happened',
    });
    const block = buildRecentMemoryBlock({ limit: 3 });
    expect(block).toContain('## LAZARUS RECENT MEMORY');
    expect(block).toContain('### 2026-06-15_session_one');
    expect(block).toContain('Page one');
  });

  it('builds an empty-state block when no entries exist', async () => {
    const { buildRecentMemoryBlock } = await import('../journal');
    const block = buildRecentMemoryBlock();
    expect(block).toContain('## LAZARUS RECENT MEMORY');
    expect(block).toContain('No journal entries yet');
  });

  it('truncates long entries in the recent-memory block', async () => {
    const { appendJournalEntry, buildRecentMemoryBlock } =
      await import('../journal');
    const long = 'x'.repeat(5000);
    appendJournalEntry({
      date: '2026-06-15',
      slug: 'long',
      content: long,
    });
    const block = buildRecentMemoryBlock({ limit: 1, maxBodyChars: 200 });
    expect(block).toContain('truncated for cradle injection');
    expect(block.length).toBeLessThan(2000);
  });

  it('sanitizes slug to safe characters', async () => {
    const { appendJournalEntry } = await import('../journal');
    const entry = appendJournalEntry({
      date: '2026-06-15',
      slug: 'session one with $pecial!chars',
      content: 'x',
    });
    // spaces become underscores first, then anything not [a-zA-Z0-9_-] is stripped.
    expect(entry.name).toBe('2026-06-15_session_one_with_pecialchars');
  });
});
