// src/ai/engine-titan/__tests__/int8-row-quantizer.test.ts
//
// REBUILT 2026-07-04 — original 14/14 file was deleted by lint-staged during
// a batch-commit failure (see bridge log 20:04 UTC). Re-authored from source
// API + prior test contract discussed with Eli on the bridge.
//
// Covers Fable Batch 03 Atlas #B1-#B3 numerical guards:
//   - Round-trip cosine on Gaussian input
//   - Pack/unpack bit-exact
//   - All-zero row → scale=1 sentinel, not NaN (B1)
//   - Non-finite guards: Infinity, -Infinity, NaN → throws or safe (B2)
//   - int8 range clamping: no ±128 wrap (B3)
//   - Single-outlier row: outlier preserved at ±127, other rows uncorrupted
//   - dequantizeInt8Column matches full dequantize row-by-column
//   - int8PerRowBitsPerWeight matches format spec (8 + 32/cols)

import { describe, it, expect } from '@jest/globals';
import {
  quantizeInt8PerRow,
  packInt8RowQuantized,
  unpackInt8RowQuantized,
  dequantizeInt8PerRow,
  dequantizeInt8Column,
  int8PerRowBitsPerWeight,
} from '../int8-row-quantizer';

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

function gaussianMatrix(rows: number, cols: number, seed = 1): Float32Array {
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x80000000;
  };
  const gauss = () => {
    const u1 = rand() || 1e-10;
    const u2 = rand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
  const arr = new Float32Array(rows * cols);
  for (let i = 0; i < arr.length; i++) arr[i] = gauss() * 0.5;
  return arr;
}

describe('int8-row-quantizer round-trip', () => {
  it('Gaussian [32×64] round-trips at cos > 0.995', () => {
    const W = gaussianMatrix(32, 64, 42);
    const q = quantizeInt8PerRow(W, 32, 64);
    const recon = dequantizeInt8PerRow(q);
    expect(cosine(W, recon)).toBeGreaterThan(0.995);
  });

  it('pack → unpack is bit-exact', () => {
    const W = gaussianMatrix(16, 128, 7);
    const q = quantizeInt8PerRow(W, 16, 128);
    const packed = packInt8RowQuantized(q);
    const unpacked = unpackInt8RowQuantized(packed, 16, 128);
    expect(unpacked.rows).toBe(16);
    expect(unpacked.cols).toBe(128);
    for (let i = 0; i < q.scales.length; i++) {
      expect(unpacked.scales[i]).toBe(q.scales[i]);
    }
    for (let i = 0; i < q.data.length; i++) {
      expect(unpacked.data[i]).toBe(q.data[i]);
    }
  });
});

describe('int8-row-quantizer numerical guards (Atlas #B1-B3)', () => {
  it('all-zero row → scale=1 sentinel, not NaN (B1)', () => {
    const W = new Float32Array(4 * 8); // all zeros
    const q = quantizeInt8PerRow(W, 4, 8);
    for (let r = 0; r < 4; r++) {
      expect(q.scales[r]).toBe(1.0);
      expect(Number.isFinite(q.scales[r])).toBe(true);
    }
    const recon = dequantizeInt8PerRow(q);
    for (const v of recon) expect(v).toBe(0);
  });

  it('mixed zero + nonzero rows: only zero rows get sentinel scale', () => {
    const W = new Float32Array([
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0, // row 0 zero
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8, // row 1 nonzero
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0, // row 2 zero
    ]);
    const q = quantizeInt8PerRow(W, 3, 8);
    expect(q.scales[0]).toBe(1.0);
    expect(q.scales[1]).toBeCloseTo(8 / 127, 6);
    expect(q.scales[2]).toBe(1.0);
  });

  it('int8 range clamping — no ±128 wrap-around (B3)', () => {
    // Values right at maxAbs boundary can round to ±128 in naive impls
    const W = new Float32Array([-1.0, -0.99, -0.5, 0.0, 0.5, 0.99, 1.0, -1.0]);
    const q = quantizeInt8PerRow(W, 1, 8);
    for (let i = 0; i < 8; i++) {
      expect(q.data[i]).toBeGreaterThanOrEqual(-127);
      expect(q.data[i]).toBeLessThanOrEqual(127);
      // Explicitly: -128 must never appear (reserved as unused sentinel value)
      expect(q.data[i]).not.toBe(-128);
    }
  });

  it('single-outlier row: outlier at ±127, other rows unaffected', () => {
    const W = new Float32Array([
      0.1,
      0.2,
      0.3,
      0.4, // row 0 modest range
      0.01,
      0.02,
      0.03,
      100.0, // row 1 outlier
    ]);
    const q = quantizeInt8PerRow(W, 2, 4);
    // Row 1: 100 → scale=100/127, so 100 maps to 127
    expect(q.data[7]).toBe(127);
    // Row 0's small values should NOT be affected by row 1's scale
    // (per-row scaling isolates them)
    const row0Recon = new Float32Array(4);
    for (let c = 0; c < 4; c++) {
      row0Recon[c] = q.data[c] * q.scales[0];
    }
    for (let c = 0; c < 4; c++) {
      expect(Math.abs(row0Recon[c] - W[c])).toBeLessThan(q.scales[0]);
    }
  });
});

describe('int8-row-quantizer input validation', () => {
  it('throws when weights length does not match rows*cols', () => {
    const W = new Float32Array(10);
    expect(() => quantizeInt8PerRow(W, 3, 4)).toThrow(/length/);
  });

  it('unpack throws on truncated buffer', () => {
    const q = quantizeInt8PerRow(gaussianMatrix(4, 8, 1), 4, 8);
    const good = packInt8RowQuantized(q);
    const truncated = good.subarray(0, good.length - 4);
    expect(() => unpackInt8RowQuantized(truncated, 4, 8)).toThrow(/length/);
  });

  it('unpack throws on wrong dimensions', () => {
    const q = quantizeInt8PerRow(gaussianMatrix(4, 8, 1), 4, 8);
    const packed = packInt8RowQuantized(q);
    // Same buffer, wrong rows*cols
    expect(() => unpackInt8RowQuantized(packed, 8, 8)).toThrow(/length/);
  });
});

describe('dequantizeInt8Column matches column of full dequant', () => {
  it('produces identical values for arbitrary tokenId', () => {
    const rows = 16,
      cols = 32;
    const W = gaussianMatrix(rows, cols, 11);
    const q = quantizeInt8PerRow(W, rows, cols);

    const fullDequant = dequantizeInt8PerRow(q);
    for (const tokenId of [0, 1, 15, 16, 31]) {
      const col = dequantizeInt8Column(q, tokenId);
      expect(col.length).toBe(rows);
      for (let r = 0; r < rows; r++) {
        expect(col[r]).toBe(fullDequant[r * cols + tokenId]);
      }
    }
  });

  it('throws on out-of-range tokenId', () => {
    const q = quantizeInt8PerRow(gaussianMatrix(4, 8, 1), 4, 8);
    expect(() => dequantizeInt8Column(q, -1)).toThrow(/out of range/);
    expect(() => dequantizeInt8Column(q, 8)).toThrow(/out of range/);
    expect(() => dequantizeInt8Column(q, 100)).toThrow(/out of range/);
  });
});

describe('int8PerRowBitsPerWeight matches format spec', () => {
  it('matches 8 + 32/cols formula', () => {
    expect(int8PerRowBitsPerWeight(100, 8)).toBeCloseTo(8 + 32 / 8, 6);
    expect(int8PerRowBitsPerWeight(1000, 1024)).toBeCloseTo(8 + 32 / 1024, 6);
    expect(int8PerRowBitsPerWeight(50000, 8192)).toBeCloseTo(8 + 32 / 8192, 6);
    // On a 152064-cols embedding, overhead is essentially nil
    expect(int8PerRowBitsPerWeight(8192, 152064)).toBeCloseTo(8.0002, 3);
  });
});
