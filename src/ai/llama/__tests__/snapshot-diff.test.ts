/**
 * Tests for the KV snapshot binary differ (Gap 2 phase 2).
 */

import {
  diffSnapshots,
  serializeDescriptor,
  packDeltaBlob,
  applyDeltaBlob,
} from '@/ai/llama/snapshot-diff';

function makeBuffer(size: number, fillFn: (i: number) => number): Uint8Array {
  const buf = new Uint8Array(size);
  for (let i = 0; i < size; i++) buf[i] = fillFn(i) & 0xff;
  return buf;
}

describe('diffSnapshots', () => {
  it('reports zero changed chunks for identical buffers', () => {
    const a = makeBuffer(1024, (i) => i);
    const b = makeBuffer(1024, (i) => i);
    const desc = diffSnapshots(a, b, 64);
    expect(desc.changedChunks).toHaveLength(0);
    expect(desc.totalChangedBytes).toBe(0);
    expect(desc.changeRatio).toBe(0);
    expect(desc.beforeSize).toBe(1024);
    expect(desc.afterSize).toBe(1024);
  });

  it('detects a single byte change in the chunk that contains it', () => {
    const a = makeBuffer(512, (i) => i);
    const b = makeBuffer(512, (i) => i);
    b[200] = 0xff;
    const desc = diffSnapshots(a, b, 64);
    expect(desc.changedChunks).toHaveLength(1);
    expect(desc.changedChunks[0].offset).toBe(192);
    expect(desc.changedChunks[0].length).toBe(64);
    expect(desc.changedChunks[0].beforeHash).not.toBe(
      desc.changedChunks[0].afterHash
    );
  });

  it('handles a shorter "after" buffer by reporting the missing tail as changed', () => {
    const a = makeBuffer(256, (i) => i);
    const b = makeBuffer(128, (i) => i);
    const desc = diffSnapshots(a, b, 64);
    expect(desc.beforeSize).toBe(256);
    expect(desc.afterSize).toBe(128);
    expect(desc.changedChunks.length).toBeGreaterThanOrEqual(2);
    const lastChunk = desc.changedChunks[desc.changedChunks.length - 1];
    expect(lastChunk.afterHash).toBe(0n);
  });

  it('handles a longer "after" buffer by reporting the new tail as changed', () => {
    const a = makeBuffer(128, (i) => i);
    const b = makeBuffer(256, (i) => i);
    const desc = diffSnapshots(a, b, 64);
    expect(desc.changedChunks.length).toBeGreaterThanOrEqual(2);
    expect(desc.totalChangedBytes).toBeGreaterThan(0);
  });

  it('changeRatio reflects fraction of after that changed', () => {
    const a = makeBuffer(1024, () => 0);
    const b = makeBuffer(1024, (i) => (i < 256 ? 0xff : 0));
    const desc = diffSnapshots(a, b, 64);
    expect(desc.totalChangedBytes).toBe(256);
    expect(desc.changeRatio).toBeCloseTo(0.25, 5);
  });

  it('rejects invalid chunkSize', () => {
    const a = makeBuffer(64, () => 0);
    expect(() => diffSnapshots(a, a, 0)).toThrow();
    expect(() => diffSnapshots(a, a, -1)).toThrow();
    expect(() => diffSnapshots(a, a, 1.5)).toThrow();
  });
});

describe('serializeDescriptor', () => {
  it('renders bigint hashes as hex strings', () => {
    const a = makeBuffer(64, () => 0);
    const b = makeBuffer(64, () => 1);
    const desc = diffSnapshots(a, b, 64);
    const ser = serializeDescriptor(desc);
    expect(ser.changedChunks[0].beforeHash).toMatch(/^0x[0-9a-f]+$/);
    expect(ser.changedChunks[0].afterHash).toMatch(/^0x[0-9a-f]+$/);
    expect(ser.beforeSize).toBe(64);
    expect(JSON.stringify(ser)).toBeTruthy();
  });
});

describe('packDeltaBlob + applyDeltaBlob round-trip', () => {
  it('reconstructs after from before + descriptor + blob (small change)', () => {
    const a = makeBuffer(1024, (i) => i);
    const b = makeBuffer(1024, (i) => i);
    b[10] = 0x77;
    b[500] = 0x77;
    const desc = diffSnapshots(a, b, 64);
    const blob = packDeltaBlob(b, desc);
    const reconstructed = applyDeltaBlob(a, desc, blob);
    expect(Array.from(reconstructed)).toEqual(Array.from(b));
  });

  it('round-trips when after is longer than before', () => {
    const a = makeBuffer(128, (i) => i);
    const b = makeBuffer(256, (i) => (i * 3) & 0xff);
    const desc = diffSnapshots(a, b, 64);
    const blob = packDeltaBlob(b, desc);
    const reconstructed = applyDeltaBlob(a, desc, blob);
    expect(Array.from(reconstructed)).toEqual(Array.from(b));
  });

  it('round-trips for the storage-saving case (95% identical buffers)', () => {
    const a = makeBuffer(64 * 1024, (i) => (i * 7) & 0xff);
    const b = new Uint8Array(a);
    for (let i = 0; i < 128; i++) b[i + 32768] = 0xaa;
    const desc = diffSnapshots(a, b, 64);
    const blob = packDeltaBlob(b, desc);
    expect(blob.length).toBeLessThan(a.length / 10);
    const reconstructed = applyDeltaBlob(a, desc, blob);
    expect(Array.from(reconstructed)).toEqual(Array.from(b));
  });
});
