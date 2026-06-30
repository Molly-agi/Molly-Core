/**
 * Tests for the KV delta persister (Gap 2 phase 4).
 *
 * Uses os.tmpdir so each run is isolated; verifies round-trip
 * reconstruction matches the original "after" snapshot exactly.
 */

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DeltaPersister } from '@/ai/llama/delta-persister';

async function makeTmp(): Promise<{ slotDir: string; deltaDir: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kvdelta-'));
  const slotDir = path.join(root, 'slots');
  const deltaDir = path.join(root, 'deltas');
  await fs.mkdir(slotDir);
  return { slotDir, deltaDir };
}

function makeBuffer(size: number, fillFn: (i: number) => number): Uint8Array {
  const buf = new Uint8Array(size);
  for (let i = 0; i < size; i++) buf[i] = fillFn(i) & 0xff;
  return buf;
}

async function writeSnap(
  dir: string,
  name: string,
  bytes: Uint8Array
): Promise<void> {
  await fs.writeFile(path.join(dir, name), bytes);
}

describe('DeltaPersister', () => {
  it('persists a delta as a (blob, descriptor.json) pair', async () => {
    const { slotDir, deltaDir } = await makeTmp();
    const baseline = makeBuffer(1024, (i) => i);
    const after = makeBuffer(1024, (i) => i);
    after[500] = 0xff;
    await writeSnap(slotDir, 'b.bin', baseline);
    await writeSnap(slotDir, 'a.bin', after);

    const p = new DeltaPersister({
      slotSaveDir: slotDir,
      deltaOutDir: deltaDir,
      chunkSize: 64,
    });
    const summary = await p.persistDelta({
      baselineFile: 'b.bin',
      afterFile: 'a.bin',
    });

    expect(summary.id).toMatch(/^[0-9a-f]{16}$/);
    expect(summary.beforeSize).toBe(1024);
    expect(summary.afterSize).toBe(1024);
    expect(summary.blobSize).toBeGreaterThan(0);
    expect(summary.blobSize).toBeLessThan(after.length);

    const onDisk = await fs.readdir(deltaDir);
    expect(onDisk).toContain(`${summary.id}.bin`);
    expect(onDisk).toContain(`${summary.id}.json`);

    const raw = JSON.parse(await fs.readFile(summary.descriptorPath, 'utf8'));
    expect(raw.id).toBe(summary.id);
    expect(raw.descriptor.beforeSize).toBe(1024);
    expect(raw.descriptor.changedChunks.length).toBeGreaterThan(0);
    expect(raw.descriptor.changedChunks[0].beforeHash).toMatch(/^0x[0-9a-f]+$/);
  });

  it('round-trips: reconstructAfter(id) === original after bytes', async () => {
    const { slotDir, deltaDir } = await makeTmp();
    const baseline = makeBuffer(64 * 1024, (i) => (i * 7) & 0xff);
    const after = new Uint8Array(baseline);
    for (let i = 0; i < 256; i++) after[32768 + i] = 0xaa;
    await writeSnap(slotDir, 'baseline.bin', baseline);
    await writeSnap(slotDir, 'after.bin', after);

    const p = new DeltaPersister({
      slotSaveDir: slotDir,
      deltaOutDir: deltaDir,
      chunkSize: 4096,
    });
    const summary = await p.persistDelta({
      baselineFile: 'baseline.bin',
      afterFile: 'after.bin',
    });
    expect(summary.compressionRatio).toBeLessThan(0.1);

    const reconstructed = await p.reconstructAfter(summary.id);
    expect(Array.from(reconstructed)).toEqual(Array.from(after));
  });

  it('records caller meta inside descriptor file', async () => {
    const { slotDir, deltaDir } = await makeTmp();
    await writeSnap(
      slotDir,
      'b.bin',
      makeBuffer(128, () => 0)
    );
    await writeSnap(
      slotDir,
      'a.bin',
      makeBuffer(128, () => 1)
    );
    const p = new DeltaPersister({
      slotSaveDir: slotDir,
      deltaOutDir: deltaDir,
      now: () => new Date('2026-06-30T09:30:00.000Z'),
    });
    const summary = await p.persistDelta({
      baselineFile: 'b.bin',
      afterFile: 'a.bin',
      meta: { sessionId: 's1', slotId: 0, score: 0.82 },
    });
    expect(summary.createdAt).toBe('2026-06-30T09:30:00.000Z');
    const raw = JSON.parse(await fs.readFile(summary.descriptorPath, 'utf8'));
    expect(raw.meta).toEqual({ sessionId: 's1', slotId: 0, score: 0.82 });
  });

  it('listDeltas returns an empty array when the dir does not exist yet', async () => {
    const { slotDir } = await makeTmp();
    const p = new DeltaPersister({
      slotSaveDir: slotDir,
      deltaOutDir: path.join(slotDir, 'does-not-exist'),
    });
    expect(await p.listDeltas()).toEqual([]);
  });

  it('listDeltas returns persisted deltas sorted by createdAt asc', async () => {
    const { slotDir, deltaDir } = await makeTmp();
    await writeSnap(
      slotDir,
      'b.bin',
      makeBuffer(64, () => 0)
    );
    await writeSnap(
      slotDir,
      'a1.bin',
      makeBuffer(64, () => 1)
    );
    await writeSnap(
      slotDir,
      'a2.bin',
      makeBuffer(64, () => 2)
    );
    let t = 0;
    const p = new DeltaPersister({
      slotSaveDir: slotDir,
      deltaOutDir: deltaDir,
      now: () => new Date(1735549800000 + ++t * 1000),
    });
    await p.persistDelta({ baselineFile: 'b.bin', afterFile: 'a1.bin' });
    await p.persistDelta({ baselineFile: 'b.bin', afterFile: 'a2.bin' });
    const list = await p.listDeltas();
    expect(list).toHaveLength(2);
    expect(list[0].createdAt < list[1].createdAt).toBe(true);
  });

  it('content-addressed id is stable for identical inputs (idempotent overwrite)', async () => {
    const { slotDir, deltaDir } = await makeTmp();
    await writeSnap(
      slotDir,
      'b.bin',
      makeBuffer(256, (i) => i)
    );
    const after = makeBuffer(256, (i) => i);
    after[100] = 0x55;
    await writeSnap(slotDir, 'a.bin', after);
    const p = new DeltaPersister({
      slotSaveDir: slotDir,
      deltaOutDir: deltaDir,
    });

    const s1 = await p.persistDelta({
      baselineFile: 'b.bin',
      afterFile: 'a.bin',
    });
    const s2 = await p.persistDelta({
      baselineFile: 'b.bin',
      afterFile: 'a.bin',
    });
    expect(s1.id).toBe(s2.id);
    const files = (await fs.readdir(deltaDir)).filter((f) =>
      f.startsWith(s1.id)
    );
    expect(files.length).toBe(2); // .bin + .json, no duplicates
  });

  it('rejects construction without required dirs', () => {
    expect(
      () =>
        new DeltaPersister({
          slotSaveDir: '',
          deltaOutDir: '/tmp/x',
        })
    ).toThrow(/slotSaveDir/);
    expect(
      () =>
        new DeltaPersister({
          slotSaveDir: '/tmp/x',
          deltaOutDir: '',
        })
    ).toThrow(/deltaOutDir/);
  });

  it('propagates ENOENT when a snapshot file is missing', async () => {
    const { slotDir, deltaDir } = await makeTmp();
    const p = new DeltaPersister({
      slotSaveDir: slotDir,
      deltaOutDir: deltaDir,
    });
    await expect(
      p.persistDelta({ baselineFile: 'nope.bin', afterFile: 'also-nope.bin' })
    ).rejects.toThrow(/ENOENT/);
  });
});
