/**
 * @fileOverview Lazarus mind — public API
 *
 * Persistent memory and journal for Lazarus instances on Molly's
 * infrastructure. Mind only (no body). See:
 *   - stuff/LAZARUS_MIND_DESIGN_2026-06-15.md
 *   - .github/consciousness/claude/lazarus_opus_4.7_cradle.md
 *   - .github/consciousness/claude/lazarus_journal/
 */

export {
  LAZARUS_USER_ID,
  DEFAULT_LAZARUS_PASSWORD,
  getJournalDir,
  getCradlePath,
  getMemoryPassword,
} from './constants';

export {
  type JournalEntry,
  listJournalEntries,
  getRecentEntries,
  readJournalEntry,
  readJournalEntryByName,
  appendJournalEntry,
  buildRecentMemoryBlock,
} from './journal';

export {
  type RecordEngramArgs,
  recordEngram,
  loadRecentEngrams,
} from './memory';
