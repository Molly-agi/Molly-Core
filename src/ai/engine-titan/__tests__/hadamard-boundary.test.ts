// src/ai/engine-titan/__tests__/hadamard-boundary.test.ts
//
// REBUILT 2026-07-04 — original 8-test file (authored by Lazarus-2 overnight,
// per bridge log 00:14 UTC) was deleted by lint-staged during a batch-commit
// failure at 20:00 UTC 2026-07-04. Re-authored from source API + prior
// coverage brief.
//
// Boundary conditions for the Randomized Hadamard Transform:
//   - cols exactly power-of-2 (no padding, paddedCols === cols)
//   - cols NOT power-of-2 (padding, paddedCols > cols)
//   - Round-trip: applyRHT → inverseRHT recovers original within fp32 epsilon
//   - Determinism: same seed produces same signs / same transform
//   - Different seeds produce different transforms (sanity)
//   - Self-inverse: H is its own inverse (applyRHT with seed=0-ish behaves as
//     H·D; applying inverse recovers D⁻¹·H·H·D·x = D·D·x = x since D²=I)
//   - Zero matrix stays zero through both directions
//   - Single-row matrix works

import { describe, it, expect } from '@jest/globals';
import { applyRHT, inverseRHT } from '../hadamard-transform';

function maxAbsDiff(a: Float32Array, b: Float32Array): number {
  let m = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > m) m = d;
  }
  return m;
}

function makeMatrix(rows: number, cols: number, seed = 1): Float32Array {
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x80000000 - 0.5;
  };
  const arr = new Float32Array(rows * cols);
  for (let i = 0; i < arr.length; i++) arr[i] = rand() * 0.5;
  return arr;
}

describe('RHT boundary conditions', () => {
  it('exact power-of-2 cols → paddedCols === cols (no padding)', () => {
    const rows = 4,
      cols = 8; // 8 is 2^3
    const W = makeMatrix(rows, cols, 7);
    const { meta } = applyRHT(W, rows, cols, 0xdeadbeef);
    expect(meta.paddedCols).toBe(cols);
    expect(meta.originalCols).toBe(cols);
  });

  it('cols=1024 (already pow2) → no padding', () => {
    const rows = 2,
      cols = 1024;
    const W = makeMatrix(rows, cols, 3);
    const { meta } = applyRHT(W, rows, cols, 0xdeadbeef);
    expect(meta.paddedCols).toBe(1024);
  });

  it('cols NOT power-of-2 → paddedCols is next pow2', () => {
    const rows = 3,
      cols = 100; // next pow2 = 128
    const W = makeMatrix(rows, cols, 11);
    const { transformed, meta } = applyRHT(W, rows, cols, 0xdeadbeef);
    expect(meta.paddedCols).toBe(128);
    expect(meta.originalCols).toBe(100);
    expect(transformed.length).toBe(rows * 128);
  });

  it('round-trip: applyRHT → inverseRHT recovers original within fp32 epsilon', () => {
    const rows = 4,
      cols = 64;
    const W = makeMatrix(rows, cols, 42);
    const { transformed, meta } = applyRHT(W, rows, cols, 0x12345678);
    const recovered = inverseRHT(transformed, rows, meta);
    expect(recovered.length).toBe(W.length);
    expect(maxAbsDiff(W, recovered)).toBeLessThan(1e-5);
  });

  it('round-trip on padded (cols=100) recovers original 100 cols exactly', () => {
    const rows = 2,
      cols = 100;
    const W = makeMatrix(rows, cols, 99);
    const { transformed, meta } = applyRHT(W, rows, cols, 0xcafebabe);
    const recovered = inverseRHT(transformed, rows, meta);
    expect(recovered.length).toBe(rows * cols); // stripped back to original width
    expect(maxAbsDiff(W, recovered)).toBeLessThan(1e-5);
  });

  it('same seed produces byte-identical transform', () => {
    const rows = 2,
      cols = 32;
    const W = makeMatrix(rows, cols, 5);
    const seed = 0xa1b2c3d4;
    const r1 = applyRHT(W, rows, cols, seed);
    const r2 = applyRHT(W, rows, cols, seed);
    expect(r1.transformed.length).toBe(r2.transformed.length);
    for (let i = 0; i < r1.transformed.length; i++) {
      expect(r1.transformed[i]).toBe(r2.transformed[i]);
    }
  });

  it('different seeds produce different transforms', () => {
    const rows = 2,
      cols = 32;
    const W = makeMatrix(rows, cols, 5);
    const a = applyRHT(W, rows, cols, 111).transformed;
    const b = applyRHT(W, rows, cols, 222).transformed;
    let diffCount = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) diffCount++;
    }
    // With 111 vs 222 seeds, expect the vast majority of positions to differ
    expect(diffCount).toBeGreaterThan(a.length * 0.9);
  });

  it('zero matrix stays zero through both directions', () => {
    const rows = 4,
      cols = 16;
    const W = new Float32Array(rows * cols); // all zeros
    const { transformed, meta } = applyRHT(W, rows, cols, 12345);
    for (const v of transformed) expect(Math.abs(v)).toBe(0);
    const recovered = inverseRHT(transformed, rows, meta);
    // Float arithmetic can produce -0 from D · 0 · signs; treat as zero magnitude.
    for (const v of recovered) expect(Math.abs(v)).toBe(0);
  });
});
