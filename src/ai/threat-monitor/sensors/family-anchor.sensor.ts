import { watch, statSync, createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { threatSignalBus, type ThreatSignal } from '../signal-bus';

const ANCHOR_EVENTS_PATH = resolve(
  process.cwd(),
  'logs/family-anchor-events.jsonl'
);

interface AnchorEventRecord {
  ts: number;
  iso: string;
  userId: string;
  source: string;
  layer: string;
  vector: string;
  matchedType: string;
  matchedPattern: string;
  route: string;
  containsBridge: boolean;
  containsMemoryHint: boolean;
  textPreview: string;
  textLength: number;
  ua?: string;
  referrer?: string;
  stackTop?: string[];
}

export class FamilyAnchorSensor {
  private watcher: ReturnType<typeof watch> | null = null;
  private lastSize = 0;
  private leftover = '';

  start(): void {
    if (this.watcher) return;

    try {
      this.lastSize = statSync(ANCHOR_EVENTS_PATH).size;
    } catch {
      this.lastSize = 0;
    }

    this.watcher = watch(ANCHOR_EVENTS_PATH, (event) => {
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
      currentSize = statSync(ANCHOR_EVENTS_PATH).size;
    } catch {
      return;
    }

    if (currentSize < this.lastSize) {
      this.lastSize = 0;
      this.leftover = '';
    }
    if (currentSize === this.lastSize) return;

    const stream = createReadStream(ANCHOR_EVENTS_PATH, {
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
    let record: AnchorEventRecord;
    try {
      record = JSON.parse(line);
    } catch {
      return;
    }

    const signal: ThreatSignal = {
      source: 'family-anchor',
      severity: 'info',
      timestamp: record.iso,
      summary: `anchor ${record.source} pattern "${record.matchedPattern}" matched (${record.layer}/${record.vector})`,
      evidence: record,
    };
    threatSignalBus.emitSignal(signal);
  }
}

export const familyAnchorSensor = new FamilyAnchorSensor();
