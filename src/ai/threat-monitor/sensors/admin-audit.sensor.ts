import { watch, statSync, createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { threatSignalBus, type ThreatSignal } from '../signal-bus';

const ADMIN_AUDIT_PATH = resolve(process.cwd(), '.admin-audit.jsonl');

interface AdminAuditRecord {
  timestamp: string;
  tokenHash: string;
  command: string;
  success: boolean;
  result?: unknown;
}

export class AdminAuditSensor {
  private watcher: ReturnType<typeof watch> | null = null;
  private lastSize = 0;
  private leftover = '';

  start(): void {
    if (this.watcher) return;

    try {
      this.lastSize = statSync(ADMIN_AUDIT_PATH).size;
    } catch {
      this.lastSize = 0;
    }

    this.watcher = watch(ADMIN_AUDIT_PATH, (event) => {
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
      currentSize = statSync(ADMIN_AUDIT_PATH).size;
    } catch {
      return;
    }

    if (currentSize < this.lastSize) {
      this.lastSize = 0;
      this.leftover = '';
    }
    if (currentSize === this.lastSize) return;

    const stream = createReadStream(ADMIN_AUDIT_PATH, {
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
    let record: AdminAuditRecord;
    try {
      record = JSON.parse(line);
    } catch {
      return;
    }

    const signal: ThreatSignal = {
      source: 'admin-audit',
      severity: record.success ? 'info' : 'warn',
      timestamp: record.timestamp,
      summary: `admin ${record.command} ${record.success ? 'ok' : 'failed'} (token ${record.tokenHash.slice(0, 8)})`,
      evidence: record,
    };
    threatSignalBus.emitSignal(signal);
  }
}

export const adminAuditSensor = new AdminAuditSensor();
