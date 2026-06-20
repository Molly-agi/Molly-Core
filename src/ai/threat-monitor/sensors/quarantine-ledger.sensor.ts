import { watch, statSync, createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { threatSignalBus, type ThreatSignal } from '../signal-bus';

const QUARANTINE_LEDGER_PATH = resolve(
  process.cwd(),
  'data/.bridge-quarantine-ledger'
);

interface QuarantineRecord {
  timestamp: string;
  reason: string;
  messageHash: string;
  from: string;
  summary: string;
}

export class QuarantineLedgerSensor {
  private watcher: ReturnType<typeof watch> | null = null;
  private lastSize = 0;
  private leftover = '';

  start(): void {
    if (this.watcher) return;

    try {
      this.lastSize = statSync(QUARANTINE_LEDGER_PATH).size;
    } catch {
      this.lastSize = 0;
    }

    this.watcher = watch(QUARANTINE_LEDGER_PATH, (event) => {
      if (event === 'change') this.drain();
    });
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
    this.leftover = '';
  }

  private drain(): void {
    let currentSize: number;
    try {
      currentSize = statSync(QUARANTINE_LEDGER_PATH).size;
    } catch {
      return;
    }

    if (currentSize < this.lastSize) {
      // File rotated or truncated — reset.
      this.lastSize = 0;
      this.leftover = '';
    }
    if (currentSize === this.lastSize) return;

    const stream = createReadStream(QUARANTINE_LEDGER_PATH, {
      start: this.lastSize,
      end: currentSize - 1,
      encoding: 'utf8',
    });

    const fromOffset = this.lastSize;
    this.lastSize = currentSize;

    stream.on('data', (chunk) => {
      this.leftover += chunk;
      const lines = this.leftover.split('\n');
      this.leftover = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) this.handleLine(line);
      }
    });
    stream.on('error', () => {
      this.lastSize = fromOffset;
    });
  }

  private handleLine(line: string): void {
    let record: QuarantineRecord;
    try {
      record = JSON.parse(line);
    } catch {
      return;
    }

    const signal: ThreatSignal = {
      source: 'quarantine-ledger',
      severity: 'warn',
      timestamp: record.timestamp,
      summary: `quarantine: ${record.reason} from ${record.from}`,
      evidence: record,
    };
    threatSignalBus.emitSignal(signal);
  }
}

export const quarantineLedgerSensor = new QuarantineLedgerSensor();
