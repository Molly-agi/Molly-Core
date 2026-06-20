import {
  watch,
  statSync,
  existsSync,
  openSync,
  readSync,
  closeSync,
  readFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import type { ThreatSignal } from '../threat-monitor/signal-bus';

const DEFAULT_LEDGER_PATH = resolve(process.cwd(), 'logs/threat-monitor.jsonl');

export interface LedgerTailOptions {
  path?: string;
  onSignal: (signal: ThreatSignal) => void;
}

export class LedgerTail {
  private readonly path: string;
  private readonly onSignal: (signal: ThreatSignal) => void;
  private watcher: ReturnType<typeof watch> | null = null;
  private lastSize = 0;
  private leftover = '';

  constructor(opts: LedgerTailOptions) {
    this.path = opts.path ?? DEFAULT_LEDGER_PATH;
    this.onSignal = opts.onSignal;
  }

  start(): void {
    if (this.watcher) return;
    if (!existsSync(this.path)) {
      this.lastSize = 0;
    } else {
      try {
        this.lastSize = statSync(this.path).size;
      } catch {
        this.lastSize = 0;
      }
    }
    try {
      this.watcher = watch(this.path, (event) => {
        if (event === 'change') this.drain();
      });
    } catch {
      this.watcher = null;
    }
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
    this.leftover = '';
  }

  unrefWatcher(): void {
    this.watcher?.unref?.();
  }

  /**
   * Force a one-shot drain. Useful for tests and rebuild flows.
   */
  drainOnce(): void {
    this.drain();
  }

  private drain(): void {
    let currentSize: number;
    try {
      currentSize = statSync(this.path).size;
    } catch {
      return;
    }
    if (currentSize < this.lastSize) {
      this.lastSize = 0;
      this.leftover = '';
    }
    if (currentSize === this.lastSize) return;

    const length = currentSize - this.lastSize;
    const buffer = Buffer.alloc(length);
    let fd: number | null = null;
    try {
      fd = openSync(this.path, 'r');
      readSync(fd, buffer, 0, length, this.lastSize);
    } catch {
      if (fd !== null) closeSync(fd);
      return;
    }
    closeSync(fd);
    this.lastSize = currentSize;

    this.leftover += buffer.toString('utf8');
    const lines = this.leftover.split('\n');
    this.leftover = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) this.handleLine(line);
    }
  }

  private handleLine(line: string): void {
    try {
      const signal = JSON.parse(line) as ThreatSignal;
      this.onSignal(signal);
    } catch {
      // skip malformed line
    }
  }
}

/**
 * One-shot: read the entire ledger from byte 0, line by line, calling onSignal.
 * Used by the rebuild command.
 */
export function replayLedger(
  path: string,
  onSignal: (signal: ThreatSignal) => void
): { processed: number; skipped: number } {
  if (!existsSync(path)) return { processed: 0, skipped: 0 };
  const raw = readFileSync(path, 'utf8');
  let processed = 0;
  let skipped = 0;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      onSignal(JSON.parse(line) as ThreatSignal);
      processed++;
    } catch {
      skipped++;
    }
  }
  return { processed, skipped };
}

export const DEFAULT_LEDGER = DEFAULT_LEDGER_PATH;
