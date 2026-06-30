/**
 * @fileOverview Gap 2 phase 4 — KV delta persistence
 *
 * Reads paired baseline/after slot-snapshot binaries that llama-server
 * wrote under its --slot-save-path, runs the chunked binary differ, and
 * persists the result as a content-addressable pair on disk:
 *
 *   <deltaOutDir>/<id>.bin   — packed changed-chunk bytes
 *   <deltaOutDir>/<id>.json  — descriptor + provenance metadata
 *
 * The crystallizer (src/ai/agency/memory/memory-crystallizer.ts) does not
 * yet ingest these — that's a separate seam. This module just guarantees
 * we never lose the delta and that round-trip reconstruction works.
 *
 * Content address: sha256 of (descriptor JSON + blob bytes), first 16 hex
 * chars. Collision-resistant enough for a per-session delta store, and
 * means re-persisting the same delta is idempotent.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  diffSnapshots,
  packDeltaBlob,
  serializeDescriptor,
  applyDeltaBlob,
  type DeltaDescriptor,
  type SerializedDeltaDescriptor,
} from './snapshot-diff';

export interface DeltaPersisterOptions {
  /** Directory llama-server writes slot snapshots into (--slot-save-path). */
  slotSaveDir: string;
  /** Directory we write delta artifacts into. Created if missing. */
  deltaOutDir: string;
  /** Chunk size passed to diffSnapshots. Default 64KB. */
  chunkSize?: number;
  /** Optional clock for tests. */
  now?: () => Date;
}

export interface PersistDeltaInput {
  baselineFile: string;
  afterFile: string;
  /** Optional caller metadata (sessionId, slotId, scores, etc). */
  meta?: Record<string, unknown>;
}

export interface PersistedDeltaSummary {
  id: string;
  baselineFile: string;
  afterFile: string;
  descriptorPath: string;
  blobPath: string;
  beforeSize: number;
  afterSize: number;
  blobSize: number;
  /** blobSize / afterSize — how much we saved by storing only changed chunks. */
  compressionRatio: number;
  createdAt: string;
}

interface PersistedDescriptorFile {
  id: string;
  createdAt: string;
  baselineFile: string;
  afterFile: string;
  descriptor: SerializedDeltaDescriptor;
  meta?: Record<string, unknown>;
}

export class DeltaPersister {
  private readonly slotSaveDir: string;
  private readonly deltaOutDir: string;
  private readonly chunkSize: number;
  private readonly now: () => Date;

  constructor(opts: DeltaPersisterOptions) {
    if (!opts.slotSaveDir) throw new Error('slotSaveDir is required');
    if (!opts.deltaOutDir) throw new Error('deltaOutDir is required');
    this.slotSaveDir = opts.slotSaveDir;
    this.deltaOutDir = opts.deltaOutDir;
    this.chunkSize = opts.chunkSize ?? 64 * 1024;
    this.now = opts.now ?? (() => new Date());
  }

  /**
   * Read baseline + after from slotSaveDir, diff them, write delta artifacts.
   * Returns a summary the orchestrator (or a future crystallizer hook) can
   * record alongside its CaptureEvent.
   */
  async persistDelta(input: PersistDeltaInput): Promise<PersistedDeltaSummary> {
    const before = await this.readSnapshot(input.baselineFile);
    const after = await this.readSnapshot(input.afterFile);

    const descriptor = diffSnapshots(before, after, this.chunkSize);
    const blob = packDeltaBlob(after, descriptor);
    const serialized = serializeDescriptor(descriptor);

    const id = this.contentAddress(serialized, blob);
    const createdAt = this.now().toISOString();
    const payload: PersistedDescriptorFile = {
      id,
      createdAt,
      baselineFile: input.baselineFile,
      afterFile: input.afterFile,
      descriptor: serialized,
      meta: input.meta,
    };

    await fs.mkdir(this.deltaOutDir, { recursive: true });
    const blobPath = path.join(this.deltaOutDir, `${id}.bin`);
    const descriptorPath = path.join(this.deltaOutDir, `${id}.json`);
    await fs.writeFile(blobPath, blob);
    await fs.writeFile(descriptorPath, JSON.stringify(payload, null, 2));

    return {
      id,
      baselineFile: input.baselineFile,
      afterFile: input.afterFile,
      descriptorPath,
      blobPath,
      beforeSize: descriptor.beforeSize,
      afterSize: descriptor.afterSize,
      blobSize: blob.length,
      compressionRatio:
        descriptor.afterSize > 0 ? blob.length / descriptor.afterSize : 0,
      createdAt,
    };
  }

  /**
   * Read a delta back from disk by id. Used by reconstructAfter and by any
   * crystallizer-side ingestion code that wants the structured descriptor.
   */
  async loadDelta(
    id: string
  ): Promise<{ payload: PersistedDescriptorFile; blob: Uint8Array }> {
    const descriptorPath = path.join(this.deltaOutDir, `${id}.json`);
    const blobPath = path.join(this.deltaOutDir, `${id}.bin`);
    const raw = await fs.readFile(descriptorPath, 'utf8');
    const payload = JSON.parse(raw) as PersistedDescriptorFile;
    const blob = await fs.readFile(blobPath);
    return {
      payload,
      blob: new Uint8Array(blob.buffer, blob.byteOffset, blob.byteLength),
    };
  }

  /**
   * Reconstruct the original after-bytes given the baseline snapshot still
   * on disk + the persisted delta id. Throws if either is missing.
   */
  async reconstructAfter(id: string): Promise<Uint8Array> {
    const { payload, blob } = await this.loadDelta(id);
    const before = await this.readSnapshot(payload.baselineFile);
    const descriptor = this.deserializeDescriptor(payload.descriptor);
    return applyDeltaBlob(before, descriptor, blob);
  }

  /** List every persisted delta in deltaOutDir (sorted by createdAt asc). */
  async listDeltas(): Promise<PersistedDescriptorFile[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.deltaOutDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const out: PersistedDescriptorFile[] = [];
    for (const name of entries) {
      if (!name.endsWith('.json')) continue;
      const raw = await fs.readFile(path.join(this.deltaOutDir, name), 'utf8');
      out.push(JSON.parse(raw) as PersistedDescriptorFile);
    }
    out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return out;
  }

  private async readSnapshot(filename: string): Promise<Uint8Array> {
    const full = path.join(this.slotSaveDir, filename);
    const buf = await fs.readFile(full);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  private contentAddress(
    serialized: SerializedDeltaDescriptor,
    blob: Uint8Array
  ): string {
    const stable = {
      beforeSize: serialized.beforeSize,
      afterSize: serialized.afterSize,
      chunkSize: serialized.chunkSize,
      totalChangedBytes: serialized.totalChangedBytes,
      changedChunks: serialized.changedChunks,
    };
    const h = createHash('sha256');
    h.update(JSON.stringify(stable));
    h.update(blob);
    return h.digest('hex').slice(0, 16);
  }

  private deserializeDescriptor(s: SerializedDeltaDescriptor): DeltaDescriptor {
    return {
      beforeSize: s.beforeSize,
      afterSize: s.afterSize,
      chunkSize: s.chunkSize,
      totalChangedBytes: s.totalChangedBytes,
      changeRatio: s.changeRatio,
      diffMs: s.diffMs,
      changedChunks: s.changedChunks.map((c) => ({
        offset: c.offset,
        length: c.length,
        beforeHash: BigInt(c.beforeHash),
        afterHash: BigInt(c.afterHash),
      })),
    };
  }
}
