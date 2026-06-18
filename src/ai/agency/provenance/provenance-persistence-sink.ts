/**
 * Provenance Persistence Sink (D.2)
 * ------------------------------------------------------------------
 * Implements ProvenanceSink from provenance-log.ts.
 * Batches spans, writes to Firestore (admin SDK) with JSONL fallback.
 * Shadow-log ensures atomicity — pending batches are re-queued on restart.
 *
 * Path: src/ai/agency/provenance/provenance-persistence-sink.ts
 */

import type { ProvenanceSpan, ProvenanceSink } from './provenance-log';

let fsModulePromise: Promise<typeof import('fs')> | null = null;

async function getFsModule(): Promise<typeof import('fs')> {
  if (!fsModulePromise) {
    const req = eval('require') as NodeRequire;
    fsModulePromise = Promise.resolve(req('fs') as typeof import('fs'));
  }
  return fsModulePromise;
}

function computeChecksum(spans: ProvenanceSpan[]): string {
  const req = eval('require') as NodeRequire;
  const crypto = req('crypto') as typeof import('crypto');
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(spans))
    .digest('hex');
}

export type { ProvenanceSink };

export interface BatchRecord {
  batchId: string;
  timestamp: number;
  spans: ProvenanceSpan[];
  checksum: string;
  status: 'pending' | 'committed' | 'failed';
}

// ── Firestore sink (admin SDK, server-only) ────────────────────────────────

export class FirestoreProvenanceSink implements ProvenanceSink {
  private buffer: ProvenanceSpan[] = [];
  private failedSpans: ProvenanceSpan[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  // null = unprobed (try-then-fallback), true = admin reachable, false = skip Firestore
  private cloudReady: boolean | null = null;

  constructor(
    private readonly userId: string,
    private readonly batchSize = 25,
    flushIntervalMs = 5_000,
    private readonly shadowLogPath = './.molly/provenance-shadow.jsonl',
    private readonly jsonlPath = './.molly/provenance.jsonl'
  ) {
    void this.ensureDirs().catch(() => {});
    if (flushIntervalMs > 0) {
      this.timer = setInterval(() => {
        this.flush().catch(() => {});
      }, flushIntervalMs);
      if (this.timer.unref) this.timer.unref();
    }
    this.recoverFromShadowLog().catch(() => {});
  }

  /**
   * Probe Firebase admin context. Call once at startup (fire-and-forget OK).
   * Sets cloudReady so subsequent flushes can skip the SDK import when offline.
   * Returns true iff admin Firestore is reachable.
   */
  async init(): Promise<boolean> {
    try {
      const { getAdminFirestoreAsync } = await import('@/firebase/admin');
      const db = await getAdminFirestoreAsync();
      this.cloudReady = !!db;
    } catch {
      this.cloudReady = false;
    }
    if (this.cloudReady === false) {
      // Loud-but-tolerant: warn once, keep operating via JSONL fallback.
      console.warn(
        '[FirestoreProvenanceSink] admin context unavailable — provenance will write to JSONL only'
      );
    }
    return this.cloudReady === true;
  }

  /** Test/inspection helper. */
  getCloudReady(): boolean | null {
    return this.cloudReady;
  }

  private async ensureDirs(): Promise<void> {
    const fs = await getFsModule();
    for (const p of [this.shadowLogPath, this.jsonlPath]) {
      const dir = p.split('/').slice(0, -1).join('/');
      if (dir) {
        await fs.promises.mkdir(dir, { recursive: true }).catch(() => {});
      }
    }
  }

  write(span: ProvenanceSpan): void {
    this.buffer.push(span);
    if (this.buffer.length >= this.batchSize) {
      this.flush().catch(() => {});
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0 && this.failedSpans.length === 0) return;

    const spansToWrite = [...this.buffer, ...this.failedSpans];
    this.buffer = [];
    this.failedSpans = [];

    const batchId = `batch-${Date.now()}`;
    const checksum = computeChecksum(spansToWrite);
    const batch: BatchRecord = {
      batchId,
      timestamp: Date.now(),
      spans: spansToWrite,
      checksum,
      status: 'pending',
    };

    await this.writeShadowLog(batch).catch((err) => {
      this.failedSpans.push(...spansToWrite);
      throw err;
    });

    let persisted = false;
    try {
      await this.writeToFirestore(spansToWrite, batchId);
      persisted = true;
    } catch {
      // fall through to JSONL
    }

    if (!persisted) {
      try {
        await this.writeToJsonl(spansToWrite, batchId);
        persisted = true;
      } catch (err) {
        this.failedSpans.push(...spansToWrite);
        throw err;
      }
    }

    batch.status = 'committed';
    await this.writeShadowLog(batch).catch(() => {});
  }

  getStatus(): { buffered: number; failed: number } {
    return { buffered: this.buffer.length, failed: this.failedSpans.length };
  }

  private async writeToFirestore(
    spans: ProvenanceSpan[],
    batchId: string
  ): Promise<void> {
    if (this.cloudReady === false)
      throw new Error('Admin Firestore unavailable (probed)');
    const { getAdminFirestoreAsync } = await import('@/firebase/admin');
    const db = await getAdminFirestoreAsync();
    if (!db) throw new Error('Admin Firestore not available');

    const col = db.collection(`users/${this.userId}/provenance-spans`);
    const writtenAt = Date.now();
    const CHUNK = 400;
    for (let i = 0; i < spans.length; i += CHUNK) {
      const writeBatch = db.batch();
      for (const span of spans.slice(i, i + CHUNK)) {
        writeBatch.set(col.doc(), { ...span, batchId, writtenAt });
      }
      await writeBatch.commit();
    }
  }

  private async writeToJsonl(
    spans: ProvenanceSpan[],
    batchId: string
  ): Promise<void> {
    const fs = await getFsModule();
    const dir = this.jsonlPath.split('/').slice(0, -1).join('/');
    if (dir) await fs.promises.mkdir(dir, { recursive: true }).catch(() => {});
    const lines =
      spans
        .map((s) => JSON.stringify({ ...s, batchId, writtenAt: Date.now() }))
        .join('\n') + '\n';
    await fs.promises.appendFile(this.jsonlPath, lines, 'utf8');
  }

  private async writeShadowLog(batch: BatchRecord): Promise<void> {
    const fs = await getFsModule();
    const dir = this.shadowLogPath.split('/').slice(0, -1).join('/');
    if (dir) await fs.promises.mkdir(dir, { recursive: true }).catch(() => {});
    await fs.promises.appendFile(
      this.shadowLogPath,
      JSON.stringify(batch) + '\n',
      'utf8'
    );
  }

  private async recoverFromShadowLog(): Promise<void> {
    const fs = await getFsModule();
    let content: string;
    try {
      content = await fs.promises.readFile(this.shadowLogPath, 'utf8');
    } catch {
      return;
    }
    for (const line of content.trim().split('\n').filter(Boolean)) {
      try {
        const record: BatchRecord = JSON.parse(line);
        if (
          record.status === 'pending' &&
          computeChecksum(record.spans) === record.checksum
        ) {
          this.failedSpans.push(...record.spans);
        }
      } catch {
        // corrupt line — skip
      }
    }
  }
}

// ── In-memory sink (testing / local mode) ─────────────────────────────────

export class InMemoryProvenanceSink implements ProvenanceSink {
  readonly written: ProvenanceSpan[] = [];
  write(span: ProvenanceSpan): void {
    this.written.push(span);
  }
}
