import { watch, statSync, createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { threatSignalBus, type ThreatSignal } from '../signal-bus';

interface MemoryAuditRecord {
  timestamp: string;
  userId: string;
  engramId: string;
  actionTaken: string;
  reasonCode: string;
  impactMetrics: Record<string, unknown>;
}

export type MemoryAuditStream = 'consol' | 'evict' | 'lifecycle';

const STREAM_PATHS: Record<MemoryAuditStream, string> = {
  consol: resolve(process.cwd(), 'logs/memory-audit-user-consol.jsonl'),
  evict: resolve(process.cwd(), 'logs/memory-audit-user-evict.jsonl'),
  lifecycle: resolve(process.cwd(), 'logs/memory-audit-user-lifecycle.jsonl'),
};

export class MemoryAuditSensor {
  private watcher: ReturnType<typeof watch> | null = null;
  private lastSize = 0;
  private leftover = '';
  private readonly path: string;

  constructor(private readonly stream: MemoryAuditStream) {
    this.path = STREAM_PATHS[stream];
  }

  start(): void {
    if (this.watcher) return;

    try {
      this.lastSize = statSync(this.path).size;
    } catch {
      this.lastSize = 0;
    }

    this.watcher = watch(this.path, (event) => {
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
      currentSize = statSync(this.path).size;
    } catch {
      return;
    }

    if (currentSize < this.lastSize) {
      this.lastSize = 0;
      this.leftover = '';
    }
    if (currentSize === this.lastSize) return;

    const stream = createReadStream(this.path, {
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
    let record: MemoryAuditRecord;
    try {
      record = JSON.parse(line);
    } catch {
      return;
    }

    const signal: ThreatSignal = {
      source: `memory-audit-${this.stream}`,
      severity: 'info',
      timestamp: record.timestamp,
      summary: `memory ${this.stream} ${record.actionTaken} (${record.reasonCode}) engram ${record.engramId}`,
      evidence: record,
    };
    threatSignalBus.emitSignal(signal);
  }
}

export const memoryAuditConsolSensor = new MemoryAuditSensor('consol');
export const memoryAuditEvictSensor = new MemoryAuditSensor('evict');
export const memoryAuditLifecycleSensor = new MemoryAuditSensor('lifecycle');
