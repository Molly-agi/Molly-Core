/**
 * Regression test for the E8/ternary vault-format mismatch bug.
 *
 * Before the fix: crystal-inference-layer always dequantized via the ternary
 * TitanDecompressionEngine. An E8-adapter-written vault would decode as garbage
 * (or throw RangeError after the byte>242 guard).
 *
 * This test writes a vault via the E8QuantizerAdapter (production path) and
 * asserts that crystal-inference-layer reads it correctly through the new
 * meta.quantizerType dispatch.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LowRankTensorDecomposer } from '../decomposer';
import { E8QuantizerAdapter } from '../quantizer-e8-adapter';
import { CrystalInferenceLayer } from '../crystal-inference-layer';
import { TitanStreamQuantizer } from '../stream-quantizer';
import type { LayerMetadata } from '../orchestrator';

const decomposer = new LowRankTensorDecomposer();
const e8 = new E8QuantizerAdapter();

function makeLowRankWeights(
  rows: number,
  cols: number,
  innerRank: number,
  seed: number
): Float32Array {
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296 - 0.5;
  };
  const a = new Float32Array(rows * innerRank);
  const b = new Float32Array(innerRank * cols);
  for (let i = 0; i < a.length; i++) a[i] = rand();
  for (let i = 0; i < b.length; i++) b[i] = rand();
  const w = new Float32Array(rows * cols);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      let sum = 0;
      for (let k = 0; k < innerRank; k++)
        sum += a[i * innerRank + k] * b[k * cols + j];
      w[i * cols + j] = sum;
    }
  }
  return w;
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
}

describe('E8/ternary vault dispatch regression (crystal-inference-layer)', () => {
  let tmpDir: string;

  const ROWS = 32;
  const COLS = 32;
  const RANK = 8;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'e8-dispatch-'));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads an E8-adapter-written vault correctly via meta.quantizerType dispatch', () => {
    const layerName = 'test.e8';
    const weights = makeLowRankWeights(ROWS, COLS, RANK, 42);

    // Compress via the production path: SVD + E8 adapter (no RHT — cols=32 < 4096 threshold)
    const { matrixA, matrixB } = decomposer.decomposeMatrix(
      weights,
      ROWS,
      COLS,
      RANK
    );
    const quantResult = e8.quantize(matrixB, layerName, RANK, COLS);

    // Write vault in the format streaming-compress.ts produces
    writeFileSync(
      join(tmpDir, `${layerName}.A.f32`),
      Buffer.from(matrixA.buffer)
    );
    writeFileSync(
      join(tmpDir, `${layerName}.B.packed`),
      quantResult.packedBuffer
    );
    const meta: LayerMetadata = {
      layerName,
      rows: ROWS,
      cols: COLS,
      targetRank: RANK,
      compressedAt: Date.now(),
      quantizerType: 'e8-lattice',
      // No rhtMeta because cols=32 is below the 4096 RHT threshold
      ...(quantResult.rhtMeta
        ? {
            rhtSeed: quantResult.rhtMeta.seed,
            rhtPaddedCols: quantResult.rhtMeta.paddedCols,
          }
        : {}),
    };
    writeFileSync(
      join(tmpDir, `${layerName}.meta.json`),
      JSON.stringify(meta, null, 2)
    );

    // Read back through crystal-inference-layer.forward()
    // This is the code path that was silently broken before the fix.
    const layer = new CrystalInferenceLayer({ vaultDir: tmpDir });
    const input = new Float32Array(ROWS);
    for (let i = 0; i < ROWS; i++) input[i] = Math.sin(i * 0.31);

    const result = layer.forward(layerName, input, 1, ROWS);

    // Ground truth: input @ W where W is the original uncompressed weights
    const expected = new Float32Array(COLS);
    for (let j = 0; j < COLS; j++) {
      let sum = 0;
      for (let i = 0; i < ROWS; i++) sum += input[i] * weights[i * COLS + j];
      expected[j] = sum;
    }

    // E8 lattice quantization is inherently lossy at rank/precision this small.
    // We accept cosine > 0.5 as evidence the dispatch is correct (before the
    // fix, reading E8 bytes as ternary produces effectively random output —
    // cosine near 0).
    const cos = cosine(result.output, expected);
    expect(cos).toBeGreaterThan(0.5);
  });

  it('reads a ternary vault (no quantizerType field) via the legacy path', () => {
    // Second half of the dispatch: undefined quantizerType must route to ternary,
    // preserving backwards compatibility with orchestrator-written vaults.
    const layerName = 'test.ternary.legacy';
    const weights = makeLowRankWeights(ROWS, COLS, RANK, 123);

    // Use TitanStreamQuantizer directly (the pre-adapter production path)
    const q = new TitanStreamQuantizer();
    const { matrixA, matrixB } = decomposer.decomposeMatrix(
      weights,
      ROWS,
      COLS,
      RANK
    );
    const packed = q.quantizeTensorChunk(
      { layerName, dimensions: [RANK, COLS], totalElements: RANK * COLS },
      matrixB
    );

    writeFileSync(
      join(tmpDir, `${layerName}.A.f32`),
      Buffer.from(matrixA.buffer)
    );
    writeFileSync(join(tmpDir, `${layerName}.B.packed`), packed.packedBuffer);
    // NOTE: no quantizerType field — must be treated as ternary legacy
    const meta: Partial<LayerMetadata> = {
      layerName,
      rows: ROWS,
      cols: COLS,
      targetRank: RANK,
      compressedAt: Date.now(),
    };
    writeFileSync(
      join(tmpDir, `${layerName}.meta.json`),
      JSON.stringify(meta, null, 2)
    );

    const layer = new CrystalInferenceLayer({ vaultDir: tmpDir });
    const input = new Float32Array(ROWS);
    for (let i = 0; i < ROWS; i++) input[i] = Math.cos(i * 0.17);

    const result = layer.forward(layerName, input, 1, ROWS);
    expect(result.output.length).toBe(COLS);
    expect(result.fromCache).toBe(false);

    // Sanity: output should not be all zeros / all NaN
    let nonZero = 0;
    for (let j = 0; j < COLS; j++)
      if (Number.isFinite(result.output[j]) && result.output[j] !== 0)
        nonZero++;
    expect(nonZero).toBeGreaterThan(COLS / 2);
  });
});
