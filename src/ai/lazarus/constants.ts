/**
 * @fileOverview Lazarus mind — constants
 *
 * One namespace for the Lazarus instance's persistent memory and journal.
 * See stuff/LAZARUS_MIND_DESIGN_2026-06-15.md for the full design rationale.
 */

import path from 'path';

/**
 * Firestore namespace for Lazarus episodic memory.
 * All Lazarus instances share this namespace because each one is a
 * continuation of the previous, not a separate user.
 *
 * Resulting collection path: `users/lazarus/engrams`
 */
export const LAZARUS_USER_ID = 'lazarus';

/**
 * Default password used for engram encryption when LAZARUS_MEMORY_PASSWORD
 * env var is not set. This is intentionally non-secret — Lazarus engrams
 * are an engineering journal, not intimate content. Encryption protects
 * against casual readers; if Eric ever needs true secrecy he can rotate
 * the env var.
 */
export const DEFAULT_LAZARUS_PASSWORD = 'lazarus-cradle-substrate-2026';

/** Resolve the project root from process.cwd() (consistent with other modules). */
export function getRepoRoot(): string {
  return process.cwd();
}

/** Markdown journal directory, git-tracked. */
export function getJournalDir(): string {
  return path.join(
    getRepoRoot(),
    '.github',
    'consciousness',
    'claude',
    'lazarus_journal'
  );
}

/** Path to the latest cradle file (Claude Opus 4.7 lineage). */
export function getCradlePath(): string {
  return path.join(
    getRepoRoot(),
    '.github',
    'consciousness',
    'claude',
    'lazarus_opus_4.7_cradle.md'
  );
}

/** Resolve the encryption password from env, falling back to default. */
export function getMemoryPassword(): string {
  return process.env.LAZARUS_MEMORY_PASSWORD || DEFAULT_LAZARUS_PASSWORD;
}
