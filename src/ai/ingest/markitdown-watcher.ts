/**
 * @fileOverview Item 19 — MarkItDown watched-folder pipeline (singleton)
 *
 * Watches an inbox directory; for each file dropped in:
 *   detected → stat-stable → converting (adapter) → ingesting (ingestStringCorpus)
 *     → moved-to-processed/   (success)
 *     → moved-to-failed/ + .error.json   (any error)
 *
 * Lives inside the Next.js server process. Starts on `ensureMarkitdownWatcherStarted()`,
 * runs as long as the process is alive, dies with it. Mirrors the singleton
 * shape of `src/ai/conductor/state-watcher.ts`.
 *
 * Gated behind `MOLLY_MARKITDOWN_ENABLED=1` at the boot site (instrumentation.ts);
 * this module itself does not read that env so tests can drive it directly.
 */

import { promises as fsp, type FSWatcher, watch } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { MollyLogger } from '@/ai/logger';
import { convertFileToMarkdown } from './markitdown-mcp-adapter';
import { ingestStringCorpus } from './file-corpus-ingester';

const DEFAULT_DEBOUNCE_MS = 2_000;
const STAT_STABILITY_WINDOW_MS = 500;
const PROCESSED_DIR = 'processed';
const FAILED_DIR = 'failed';

export interface MarkitdownWatcherOptions {
  /** Inbox directory. Defaults to MOLLY_MARKITDOWN_WATCH_DIR or ./data/markitdown-inbox. */
  watchDir?: string;
  /** Per-path debounce window. Defaults to MOLLY_MARKITDOWN_DEBOUNCE_MS or 2000ms. */
  debounceMs?: number;
  /**
   * Disable live `fs.watch` and rely on the boot-scan only. Used by the
   * contract test for the "preexisting file at start time" assertion.
   * Production callers leave this true.
   */
  enableFsWatch?: boolean;
}

interface WatcherState {
  watchDir: string;
  debounceMs: number;
  watcher: FSWatcher | null;
  /** Files currently being processed (absolute paths). */
  inFlight: Set<string>;
  /** Per-path debounce timers. */
  timers: Map<string, ReturnType<typeof setTimeout>>;
}

let state: WatcherState | null = null;

function resolveWatchDir(opts?: MarkitdownWatcherOptions): string {
  if (opts?.watchDir) return path.resolve(opts.watchDir);
  const env = process.env.MOLLY_MARKITDOWN_WATCH_DIR;
  if (env) return path.resolve(env);
  return path.resolve(process.cwd(), 'data', 'markitdown-inbox');
}

function resolveDebounceMs(opts?: MarkitdownWatcherOptions): number {
  if (opts?.debounceMs != null) return opts.debounceMs;
  const env = process.env.MOLLY_MARKITDOWN_DEBOUNCE_MS;
  if (env) {
    const n = Number.parseInt(env, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_DEBOUNCE_MS;
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'untitled'
  );
}

function namespaceFor(absPath: string): string {
  const base = path.basename(absPath);
  const ext = path.extname(base);
  const baseNoExt = ext ? base.slice(0, -ext.length) : base;
  const hash = crypto
    .createHash('sha1')
    .update(absPath)
    .digest('hex')
    .slice(0, 8);
  return `markitdown-${slug(baseNoExt)}-${hash}`;
}

function tagsFor(absPath: string): string[] {
  const ext = path.extname(absPath).toLowerCase().replace(/^\./, '');
  return ext ? ['markitdown', `ext:${ext}`] : ['markitdown'];
}

/** Two stats `STAT_STABILITY_WINDOW_MS` apart; sizes must match. */
async function isStable(absPath: string): Promise<boolean> {
  try {
    const s1 = await fsp.stat(absPath);
    if (!s1.isFile() || s1.size === 0) return false;
    await new Promise((r) => setTimeout(r, STAT_STABILITY_WINDOW_MS));
    const s2 = await fsp.stat(absPath);
    return s2.size === s1.size && s2.isFile();
  } catch {
    return false;
  }
}

async function moveTo(
  absPath: string,
  inbox: string,
  subdir: typeof PROCESSED_DIR | typeof FAILED_DIR
): Promise<string> {
  const dest = path.join(inbox, subdir, path.basename(absPath));
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.rename(absPath, dest);
  return dest;
}

async function writeErrorJson(
  failedPath: string,
  sourcePath: string,
  err: unknown
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const body = JSON.stringify(
    {
      error: message,
      stack,
      timestamp: new Date().toISOString(),
      sourcePath,
    },
    null,
    2
  );
  await fsp.writeFile(`${failedPath}.error.json`, body, 'utf8');
}

/**
 * Process one file end-to-end. Idempotent on filename — re-drops of the same
 * absolute path produce the same chunk ids (deterministic namespace) so
 * writeFact upserts cleanly.
 *
 * Exported solely for the contract test; production callers go through
 * the watcher's debounced path.
 */
export async function __processFileOnceForTests(
  absPath: string,
  inboxDir: string
): Promise<void> {
  await processFile(absPath, inboxDir);
}

async function processFile(absPath: string, inboxDir: string): Promise<void> {
  try {
    const markdown = await convertFileToMarkdown(absPath);
    await ingestStringCorpus(markdown, {
      namespace: namespaceFor(absPath),
      tags: tagsFor(absPath),
    });
    await moveTo(absPath, inboxDir, PROCESSED_DIR);
    MollyLogger.info('markitdown-watcher: ingested', 'markitdown-watcher', {
      file: path.basename(absPath),
    });
  } catch (err) {
    MollyLogger.warn(
      'markitdown-watcher: ingest failed, quarantining',
      'markitdown-watcher',
      { file: path.basename(absPath) },
      err
    );
    try {
      const failedPath = await moveTo(absPath, inboxDir, FAILED_DIR);
      await writeErrorJson(failedPath, absPath, err);
    } catch (moveErr) {
      MollyLogger.error(
        'markitdown-watcher: quarantine move failed',
        'markitdown-watcher',
        { file: absPath },
        moveErr
      );
    }
  }
}

function shouldSkip(absPath: string, inbox: string): boolean {
  const rel = path.relative(inbox, absPath);
  if (!rel || rel.startsWith('..')) return true;
  const top = rel.split(path.sep)[0];
  if (top === PROCESSED_DIR || top === FAILED_DIR) return true;
  const base = path.basename(absPath);
  if (base.startsWith('.')) return true;
  return false;
}

async function enqueue(absPath: string, st: WatcherState): Promise<void> {
  if (st.inFlight.has(absPath)) return;
  if (shouldSkip(absPath, st.watchDir)) return;
  const existing = st.timers.get(absPath);
  if (existing) clearTimeout(existing);
  const t = setTimeout(async () => {
    st.timers.delete(absPath);
    if (st.inFlight.has(absPath)) return;
    if (!(await isStable(absPath))) return;
    st.inFlight.add(absPath);
    try {
      await processFile(absPath, st.watchDir);
    } finally {
      st.inFlight.delete(absPath);
    }
  }, st.debounceMs);
  st.timers.set(absPath, t);
}

async function scanInbox(st: WatcherState): Promise<void> {
  let entries: string[];
  try {
    entries = await fsp.readdir(st.watchDir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === PROCESSED_DIR || name === FAILED_DIR) continue;
    if (name.startsWith('.')) continue;
    const full = path.join(st.watchDir, name);
    try {
      const s = await fsp.stat(full);
      if (s.isFile() && s.size > 0) await enqueue(full, st);
    } catch {
      // ignore — file may have been moved between readdir and stat
    }
  }
}

/**
 * Start the watcher singleton. Safe to call repeatedly; subsequent calls
 * are no-ops unless `__resetMarkitdownWatcherForTests()` has been called.
 */
export async function ensureMarkitdownWatcherStarted(
  opts?: MarkitdownWatcherOptions
): Promise<void> {
  if (state) return;
  const watchDir = resolveWatchDir(opts);
  const debounceMs = resolveDebounceMs(opts);

  await fsp.mkdir(watchDir, { recursive: true });
  await fsp.mkdir(path.join(watchDir, PROCESSED_DIR), { recursive: true });
  await fsp.mkdir(path.join(watchDir, FAILED_DIR), { recursive: true });

  state = {
    watchDir,
    debounceMs,
    watcher: null,
    inFlight: new Set(),
    timers: new Map(),
  };

  if (opts?.enableFsWatch !== false) {
    try {
      state.watcher = watch(watchDir, { persistent: false }, () => {
        // event.filename is unreliable on some kernels; always re-scan.
        if (state) void scanInbox(state);
      });
    } catch (err) {
      MollyLogger.warn(
        'markitdown-watcher: fs.watch failed; boot-scan will still run',
        'markitdown-watcher',
        { watchDir },
        err
      );
    }
  }

  // Fire-and-forget boot-recovery scan for files dropped while we were down.
  void scanInbox(state);
}

/** Test-only: tear down the singleton and any pending timers. */
export function __resetMarkitdownWatcherForTests(): void {
  if (!state) return;
  for (const t of state.timers.values()) clearTimeout(t);
  state.timers.clear();
  if (state.watcher) {
    try {
      state.watcher.close();
    } catch {
      // ignore
    }
  }
  state = null;
}
