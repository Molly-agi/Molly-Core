/**
 * @fileOverview Gap 2 phase 2 — KV snapshot binary differ
 *
 * Compares two llama-server slot snapshots and produces a structured delta
 * descriptor. The crystallizer downstream uses the descriptor to decide
 * what to encode into a crystal — we do NOT interpret KV bytes semantically
 * here. This module is the transport layer: turn O(full snapshot) into
 * O(changed chunks) so we can store many snapshots cheaply.
 *
 * Algorithm: fixed-size chunking + hash-per-chunk. Chunks whose hash
 * differs between `before` and `after` are reported as changed. Default
 * chunk size 64KB — small enough that even a single-token KV update
 * lights up only a couple of chunks, large enough that hashing 100MB
 * snapshots stays fast.
 *
 * Hash is FNV-1a 64-bit. Not cryptographic. Cheap and collision-resistant
 * enough for change detection on this scale.
 */

export interface ChunkDelta {
  /** Byte offset of the chunk in the `after` buffer */
  offset: number;
  /** Actual length of the chunk (may be < chunkSize on the tail) */
  length: number;
  /** FNV-1a 64-bit hash of the chunk in `before` (0n if past end) */
  beforeHash: bigint;
  /** FNV-1a 64-bit hash of the chunk in `after` (0n if past end) */
  afterHash: bigint;
}

export interface DeltaDescriptor {
  beforeSize: number;
  afterSize: number;
  chunkSize: number;
  /** Chunks where beforeHash !== afterHash */
  changedChunks: ChunkDelta[];
  /** Total bytes covered by changed chunks (in the `after` buffer) */
  totalChangedBytes: number;
  /** totalChangedBytes / afterSize — coarse "how much shifted" metric */
  changeRatio: number;
  /** Wall-clock ms spent diffing */
  diffMs: number;
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FNV_MASK = 0xffffffffffffffffn;

function fnv1a64(bytes: Uint8Array, start: number, end: number): bigint {
  let hash = FNV_OFFSET;
  for (let i = start; i < end; i++) {
    hash ^= BigInt(bytes[i]);
    hash = (hash * FNV_PRIME) & FNV_MASK;
  }
  return hash;
}

/**
 * Diff two snapshots. Returns a structured delta — does NOT write any blob.
 * Symmetric in length: if `after` is shorter than `before` the "missing"
 * tail chunks are reported as changed with afterHash=0n.
 */
export function diffSnapshots(
  before: Uint8Array,
  after: Uint8Array,
  chunkSize = 64 * 1024
): DeltaDescriptor {
  if (chunkSize <= 0 || !Number.isInteger(chunkSize)) {
    throw new Error(`chunkSize must be a positive integer, got ${chunkSize}`);
  }
  const t0 = Date.now();

  const maxLen = Math.max(before.length, after.length);
  const numChunks = Math.ceil(maxLen / chunkSize);
  const changedChunks: ChunkDelta[] = [];
  let totalChangedBytes = 0;

  for (let i = 0; i < numChunks; i++) {
    const offset = i * chunkSize;
    const beforeEnd = Math.min(offset + chunkSize, before.length);
    const afterEnd = Math.min(offset + chunkSize, after.length);
    const beforeHash =
      offset >= before.length ? 0n : fnv1a64(before, offset, beforeEnd);
    const afterHash =
      offset >= after.length ? 0n : fnv1a64(after, offset, afterEnd);

    if (beforeHash !== afterHash) {
      const length = Math.max(0, afterEnd - offset);
      changedChunks.push({ offset, length, beforeHash, afterHash });
      totalChangedBytes += length;
    }
  }

  return {
    beforeSize: before.length,
    afterSize: after.length,
    chunkSize,
    changedChunks,
    totalChangedBytes,
    changeRatio: after.length > 0 ? totalChangedBytes / after.length : 0,
    diffMs: Date.now() - t0,
  };
}

/**
 * Serialize a descriptor to JSON-safe form (BigInts → hex strings).
 * Use this before persisting alongside a delta blob.
 */
export interface SerializedDeltaDescriptor {
  beforeSize: number;
  afterSize: number;
  chunkSize: number;
  totalChangedBytes: number;
  changeRatio: number;
  diffMs: number;
  changedChunks: Array<{
    offset: number;
    length: number;
    beforeHash: string;
    afterHash: string;
  }>;
}

export function serializeDescriptor(
  desc: DeltaDescriptor
): SerializedDeltaDescriptor {
  return {
    beforeSize: desc.beforeSize,
    afterSize: desc.afterSize,
    chunkSize: desc.chunkSize,
    totalChangedBytes: desc.totalChangedBytes,
    changeRatio: desc.changeRatio,
    diffMs: desc.diffMs,
    changedChunks: desc.changedChunks.map((c) => ({
      offset: c.offset,
      length: c.length,
      beforeHash: '0x' + c.beforeHash.toString(16),
      afterHash: '0x' + c.afterHash.toString(16),
    })),
  };
}

/**
 * Pack only the changed chunks of `after` into a single contiguous blob.
 * Pair with the descriptor to fully reconstruct `after` from `before`.
 * Returns a new Uint8Array — caller is responsible for persistence.
 */
export function packDeltaBlob(
  after: Uint8Array,
  desc: DeltaDescriptor
): Uint8Array {
  const out = new Uint8Array(desc.totalChangedBytes);
  let cursor = 0;
  for (const chunk of desc.changedChunks) {
    if (chunk.length === 0) continue;
    out.set(after.subarray(chunk.offset, chunk.offset + chunk.length), cursor);
    cursor += chunk.length;
  }
  return out;
}

/**
 * Reconstruct `after` from `before` + descriptor + packed delta blob.
 * Used by the crystallizer when restoring a state from a delta-only store.
 */
export function applyDeltaBlob(
  before: Uint8Array,
  desc: DeltaDescriptor,
  deltaBlob: Uint8Array
): Uint8Array {
  const out = new Uint8Array(desc.afterSize);
  const copyLen = Math.min(before.length, desc.afterSize);
  out.set(before.subarray(0, copyLen), 0);

  let cursor = 0;
  for (const chunk of desc.changedChunks) {
    if (chunk.length === 0) {
      if (chunk.offset < desc.afterSize) {
        out.fill(0, chunk.offset, Math.min(chunk.offset, desc.afterSize));
      }
      continue;
    }
    out.set(deltaBlob.subarray(cursor, cursor + chunk.length), chunk.offset);
    cursor += chunk.length;
  }
  return out;
}
