/**
 * CrystalInferenceLayer — tests against real vault-format files
 * Writes temp .A.f32 + .B.packed + .meta.json matching Atlas's
 * streaming-compress.ts output exactly, then verifies load/forward/evict.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CrystalInferenceLayer } from '../crystal-inference-layer';
import { TitanEngineOrchestrator } from '../orchestrator';

function makeMatrix(n: number): Float32Array {
  return Float32Array.from({ length: n }, (_, i) => Math.sin(i * 0.3));
}

describe('CrystalInferenceLayer', () => {
  let tmpDir: string;
  const orchestrator = new TitanEngineOrchestrator();

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'crystal-infer-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads a crystal from vault and runs forward pass', async () => {
    const rows = 8,
      cols = 6,
      rank = 2;
    const weights = makeMatrix(rows * cols);
    await orchestrator.compressModelLayer(
      'test.layer',
      weights,
      rows,
      cols,
      rank,
      tmpDir
    );

    const layer = new CrystalInferenceLayer({ vaultDir: tmpDir });
    const input = makeMatrix(1 * rows); // seqLen=1, inDim=rows
    const result = layer.forward('test.layer', input, 1, rows);

    expect(result.output.length).toBe(cols);
    expect(result.cols).toBe(cols);
    result.output.forEach((v) => expect(Number.isFinite(v)).toBe(true));
  }, 10_000);

  it('caches hot crystal on second forward — fromCache=true', async () => {
    const rows = 6,
      cols = 4,
      rank = 2;
    await orchestrator.compressModelLayer(
      'attn.q',
      makeMatrix(rows * cols),
      rows,
      cols,
      rank,
      tmpDir
    );

    const layer = new CrystalInferenceLayer({ vaultDir: tmpDir });
    layer.forward('attn.q', makeMatrix(rows), 1, rows); // cold load
    const second = layer.forward('attn.q', makeMatrix(rows), 1, rows); // hot
    expect(second.fromCache).toBe(true);
  }, 10_000);

  it('evicts LRU when hot tier is full', async () => {
    const rows = 4,
      cols = 4,
      rank = 1;
    for (const name of ['a', 'b', 'c']) {
      await orchestrator.compressModelLayer(
        name,
        makeMatrix(rows * cols),
        rows,
        cols,
        rank,
        tmpDir
      );
    }

    const layer = new CrystalInferenceLayer({
      vaultDir: tmpDir,
      maxHotLayers: 2,
    });
    layer.forward('a', makeMatrix(rows), 1, rows);
    layer.forward('b', makeMatrix(rows), 1, rows);
    layer.forward('c', makeMatrix(rows), 1, rows); // evicts 'a'

    expect(layer.hotCount).toBe(2);
    expect(layer.hotLayerNames).not.toContain('a');
    expect(layer.hotLayerNames).toContain('b');
    expect(layer.hotLayerNames).toContain('c');
  }, 10_000);

  it('evictAll clears hot tier', async () => {
    const rows = 4,
      cols = 4,
      rank = 1;
    await orchestrator.compressModelLayer(
      'x',
      makeMatrix(rows * cols),
      rows,
      cols,
      rank,
      tmpDir
    );

    const layer = new CrystalInferenceLayer({ vaultDir: tmpDir });
    layer.forward('x', makeMatrix(rows), 1, rows);
    expect(layer.hotCount).toBe(1);
    layer.evictAll();
    expect(layer.hotCount).toBe(0);
  }, 10_000);

  it('throws on missing crystal', () => {
    const layer = new CrystalInferenceLayer({ vaultDir: tmpDir });
    expect(() => layer.forward('ghost.layer', makeMatrix(4), 1, 4)).toThrow(
      /not found in vault/
    );
  });
});
