// src/ai/engine-titan/__tests__/compression-determinism.test.ts
//
// Determinism byte-diff test: compress identical input twice via the same
// pipeline and assert byte-for-byte identical vault output. Verifies that
// no non-deterministic state (timestamps, randomized seeds, allocation
// order) leaks into the persisted crystals.

import { LowRankTensorDecomposer } from '../decomposer';
import { E8QuantizerAdapter } from '../quantizer-e8-adapter';
import { TernaryQuantizerAdapter } from '../quantizer-ternary-adapter';
import { TitanStreamQuantizer } from '../stream-quantizer';

const decomposer = new LowRankTensorDecomposer();

function makeDeterministicWeights(
  rows: number,
  cols: number,
  seed: number
): Float32Array {
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296 - 0.5;
  };
  const w = new Float32Array(rows * cols);
  for (let i = 0; i < w.length; i++) w[i] = rand();
  return w;
}

describe('compression determinism — byte-identical vaults', () => {
  const ROWS = 64;
  const COLS = 64;
  const RANK = 16;
  const SEED = 42;

  describe('SVD + E8 path', () => {
    it('produces byte-identical A.f32 and B.packed across two runs', () => {
      const weights = makeDeterministicWeights(ROWS, COLS, SEED);
      const e8 = new E8QuantizerAdapter();

      const run = () => {
        const { matrixA, matrixB } = decomposer.decomposeMatrix(
          weights,
          ROWS,
          COLS,
          RANK
        );
        const quantResult = e8.quantize(matrixB, 'det.e8', RANK, COLS);
        return {
          aBytes: Buffer.from(matrixA.buffer),
          bBytes: quantResult.packedBuffer,
        };
      };

      const r1 = run();
      const r2 = run();

      expect(r1.aBytes.equals(r2.aBytes)).toBe(true);
      expect(r1.bBytes.equals(r2.bBytes)).toBe(true);
    });

    it('different seeds produce different output', () => {
      const w1 = makeDeterministicWeights(ROWS, COLS, 1);
      const w2 = makeDeterministicWeights(ROWS, COLS, 2);
      const e8 = new E8QuantizerAdapter();

      const compress = (w: Float32Array) => {
        const { matrixB } = decomposer.decomposeMatrix(w, ROWS, COLS, RANK);
        return e8.quantize(matrixB, 'det.e8.diff', RANK, COLS);
      };

      const r1 = compress(w1);
      const r2 = compress(w2);

      expect(r1.packedBuffer.equals(r2.packedBuffer)).toBe(false);
    });
  });

  describe('SVD + ternary path', () => {
    it('produces byte-identical A.f32 and B.packed across two runs', () => {
      const weights = makeDeterministicWeights(ROWS, COLS, SEED);
      const q = new TitanStreamQuantizer();

      const run = () => {
        const { matrixA, matrixB } = decomposer.decomposeMatrix(
          weights,
          ROWS,
          COLS,
          RANK
        );
        const packed = q.quantizeTensorChunk(
          {
            layerName: 'det.tern',
            dimensions: [RANK, COLS],
            totalElements: RANK * COLS,
          },
          matrixB
        );
        return {
          aBytes: Buffer.from(matrixA.buffer),
          bBytes: packed.packedBuffer,
        };
      };

      const r1 = run();
      const r2 = run();

      expect(r1.aBytes.equals(r2.aBytes)).toBe(true);
      expect(r1.bBytes.equals(r2.bBytes)).toBe(true);
    });
  });

  describe('TernaryQuantizerAdapter path', () => {
    it('produces byte-identical output across two runs', () => {
      const weights = makeDeterministicWeights(ROWS, COLS, SEED);
      const adapter = new TernaryQuantizerAdapter();

      const run = () => {
        const { matrixA, matrixB } = decomposer.decomposeMatrix(
          weights,
          ROWS,
          COLS,
          RANK
        );
        const result = adapter.quantize(
          matrixB,
          'det.tern.adapter',
          RANK,
          COLS
        );
        return {
          aBytes: Buffer.from(matrixA.buffer),
          bBytes: result.packedBuffer,
        };
      };

      const r1 = run();
      const r2 = run();

      expect(r1.aBytes.equals(r2.aBytes)).toBe(true);
      expect(r1.bBytes.equals(r2.bBytes)).toBe(true);
    });
  });

  describe('full SVD decomposition determinism', () => {
    it('SVD produces identical singular values and factors across runs', () => {
      const weights = makeDeterministicWeights(ROWS, COLS, SEED);

      const d1 = decomposer.decomposeMatrix(weights, ROWS, COLS, RANK);
      const d2 = decomposer.decomposeMatrix(weights, ROWS, COLS, RANK);

      const a1 = Buffer.from(d1.matrixA.buffer);
      const a2 = Buffer.from(d2.matrixA.buffer);
      const b1 = Buffer.from(d1.matrixB.buffer);
      const b2 = Buffer.from(d2.matrixB.buffer);

      expect(a1.equals(a2)).toBe(true);
      expect(b1.equals(b2)).toBe(true);
    });

    it('handles edge case: all-zero matrix deterministically', () => {
      const zeros = new Float32Array(ROWS * COLS);

      const d1 = decomposer.decomposeMatrix(zeros, ROWS, COLS, RANK);
      const d2 = decomposer.decomposeMatrix(zeros, ROWS, COLS, RANK);

      expect(
        Buffer.from(d1.matrixA.buffer).equals(Buffer.from(d2.matrixA.buffer))
      ).toBe(true);
      expect(
        Buffer.from(d1.matrixB.buffer).equals(Buffer.from(d2.matrixB.buffer))
      ).toBe(true);
    });

    it('handles edge case: rank-1 matrix deterministically', () => {
      const w = new Float32Array(ROWS * COLS);
      for (let i = 0; i < ROWS; i++)
        for (let j = 0; j < COLS; j++)
          w[i * COLS + j] = (i + 1) * (j + 1) * 0.01;

      const d1 = decomposer.decomposeMatrix(w, ROWS, COLS, RANK);
      const d2 = decomposer.decomposeMatrix(w, ROWS, COLS, RANK);

      expect(
        Buffer.from(d1.matrixA.buffer).equals(Buffer.from(d2.matrixA.buffer))
      ).toBe(true);
      expect(
        Buffer.from(d1.matrixB.buffer).equals(Buffer.from(d2.matrixB.buffer))
      ).toBe(true);
    });
  });

  describe('E8 quantizer internal determinism', () => {
    it('lattice rounding is deterministic for boundary values', () => {
      const e8 = new E8QuantizerAdapter();
      const boundaryWeights = new Float32Array(RANK * COLS);
      for (let i = 0; i < boundaryWeights.length; i++) {
        boundaryWeights[i] = i % 2 === 0 ? 0.5 : -0.5;
      }

      const r1 = e8.quantize(boundaryWeights, 'boundary', RANK, COLS);
      const r2 = e8.quantize(boundaryWeights, 'boundary', RANK, COLS);

      expect(r1.packedBuffer.equals(r2.packedBuffer)).toBe(true);
    });
  });
});
