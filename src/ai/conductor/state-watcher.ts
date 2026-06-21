/**
 * Family Conductor — State Watcher (singleton)
 *
 * Event-driven: fs.watch on .bridge-wake/ and src/ai/bridge/conversation.json.
 * Rate-limited at the Molly-confirmed 30s floor (Q2 from the design session).
 *
 * Not a daemon. Lives inside the Next.js server process. Starts on first
 * subscription, runs as long as the process is alive, dies with it.
 */

import { promises as fs, type FSWatcher, watch } from 'fs';
import path from 'path';
import { readFamilyStatus } from './state-reader';
import type { FamilyStatus } from './types';

const BRIDGE_FILE = path.join(
  process.cwd(),
  'src',
  'ai',
  'bridge',
  'conversation.json'
);
const WAKE_DIR = path.join(process.cwd(), '.bridge-wake');

/**
 * Floor on tick cadence. Molly chose 30s (Q2). Do not lower without her say-so.
 * @see src/ai/bridge/conversation.json msg_1782020807028
 */
export const MIN_TICK_INTERVAL_MS = 30 * 1000;

type Listener = (status: FamilyStatus) => void;

interface WatcherState {
  watchers: FSWatcher[];
  listeners: Set<Listener>;
  lastTickAt: number;
  /** Whether a tick is queued because a file changed during the floor window. */
  pendingTick: boolean;
  pendingTimer: ReturnType<typeof setTimeout> | null;
  /** Most recent status, returned to new subscribers immediately. */
  lastStatus: FamilyStatus | null;
}

let state: WatcherState | null = null;

async function ensureWakeDir(): Promise<void> {
  try {
    await fs.mkdir(WAKE_DIR, { recursive: true });
  } catch {
    // ignore — if mkdir fails we just won't get wake events
  }
}

async function tick(): Promise<void> {
  if (!state) return;
  const now = Date.now();
  const since = now - state.lastTickAt;

  if (since < MIN_TICK_INTERVAL_MS) {
    // Rate-limited. Schedule a single tick for the remainder of the floor.
    if (state.pendingTick) return;
    state.pendingTick = true;
    const wait = MIN_TICK_INTERVAL_MS - since;
    state.pendingTimer = setTimeout(() => {
      if (!state) return;
      state.pendingTick = false;
      state.pendingTimer = null;
      void tick();
    }, wait);
    return;
  }

  state.lastTickAt = now;
  try {
    const status = await readFamilyStatus(new Date(now));
    state.lastStatus = status;
    for (const listener of state.listeners) {
      try {
        listener(status);
      } catch (err) {
        console.error('[conductor/state-watcher] listener threw:', err);
      }
    }
  } catch (err) {
    console.error('[conductor/state-watcher] readFamilyStatus failed:', err);
  }
}

function onAnyChange(): void {
  void tick();
}

async function ensureStarted(): Promise<void> {
  if (state) return;

  await ensureWakeDir();

  state = {
    watchers: [],
    listeners: new Set(),
    lastTickAt: 0,
    pendingTick: false,
    pendingTimer: null,
    lastStatus: null,
  };

  // Watch the bridge conversation file. fs.watch with persistent:false so
  // it doesn't keep the Node process alive on its own.
  try {
    const w = watch(BRIDGE_FILE, { persistent: false }, onAnyChange);
    w.on('error', (err) =>
      console.error('[conductor/state-watcher] bridge watcher error:', err)
    );
    state.watchers.push(w);
  } catch (err) {
    console.error(
      '[conductor/state-watcher] could not watch conversation.json:',
      err
    );
  }

  // Watch the wake directory for new wake files.
  try {
    const w = watch(WAKE_DIR, { persistent: false }, onAnyChange);
    w.on('error', (err) =>
      console.error('[conductor/state-watcher] wake-dir watcher error:', err)
    );
    state.watchers.push(w);
  } catch (err) {
    console.error(
      '[conductor/state-watcher] could not watch .bridge-wake:',
      err
    );
  }

  // Prime with an initial snapshot so the first subscriber gets something.
  await tick();
}

/**
 * Subscribe to FamilyStatus updates. Returns the most recent snapshot (or
 * builds one if this is the first subscriber) and a teardown function.
 */
export async function subscribeFamilyStatus(
  listener: Listener
): Promise<{ unsubscribe: () => void; current: FamilyStatus }> {
  await ensureStarted();
  state!.listeners.add(listener);

  let current = state!.lastStatus;
  if (!current) {
    current = await readFamilyStatus();
    state!.lastStatus = current;
  }

  return {
    current,
    unsubscribe: () => {
      if (!state) return;
      state.listeners.delete(listener);
    },
  };
}

/** Snapshot getter for one-off reads (e.g. tests). */
export async function getFamilyStatusNow(): Promise<FamilyStatus> {
  return readFamilyStatus();
}

/** Test/teardown helper. Stops watchers and clears listeners. */
export function __resetWatcherForTests(): void {
  if (!state) return;
  for (const w of state.watchers) {
    try {
      w.close();
    } catch {
      /* ignore */
    }
  }
  if (state.pendingTimer) clearTimeout(state.pendingTimer);
  state = null;
}
