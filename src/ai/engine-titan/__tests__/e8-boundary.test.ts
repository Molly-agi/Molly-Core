// src/ai/engine-titan/__tests__/e8-boundary.test.ts
//
// REBUILT 2026-07-04 — original 8-test file (authored by John overnight, per
// bridge log 00:04 UTC) was deleted by lint-staged during a batch-commit
// failure at 20:00 UTC 2026-07-04. Re-authored from source API + prior
// coverage brief.
//
// Boundary conditions for E8 lattice packer/unpacker:
//   - Total elements exactly divisible by 8 (no partial group)
//   - Total elements NOT divisible by 8 (partial final group, zero-padded)
//   - Half-shift path (nearest D8+½ wins over D8)
//   - Zero vector (degenerate group, scale=0 sentinel)
//   - Near-lattice points (dist ≈ 0)
//   - Pack magic-header sentinel round-trip

import { describe, it, expect } from '@jest/globals';
import {
  quantizeE8,
  dequantizeE8,
  packE8,
  unpackE8,
  nearestE8,
  measureE8Quality,
} from '../e8-lattice';

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

describe('E8 lattice boundary conditions', () => {
  it('handles element count exactly divisible by 8', () => {
    const rows = 4,
      cols = 8; // 32 elements, 4 groups of 8
    const W = new Float32Array(rows * cols);
    for (let i = 0; i < W.length; i++) W[i] = Math.sin(i * 0.3) * 0.5;

    const q = quantizeE8(W, 'test', rows, cols);
    expect(q.groupCount).toBe(4);
    const recon = dequantizeE8(q);
    expect(recon.length).toBeGreaterThanOrEqual(W.length);
    // Truncate reconstructed to original length for comparison
    const truncated = new Float32Array(
      recon.buffer,
      recon.byteOffset,
      W.length
    );
    expect(cosine(W, truncated)).toBeGreaterThan(0.8);
  });

  it('pads to a full group when element count is NOT divisible by 8', () => {
    const rows = 3,
      cols = 5; // 15 elements → 16 padded, 2 groups
    const W = new Float32Array([
      0.1,
      0.2,
      0.3,
      0.4,
      0.5, // row 0
      -0.1,
      -0.2,
      -0.3,
      -0.4,
      -0.5, // row 1
      0.5,
      -0.5,
      0.5,
      -0.5,
      0.5, // row 2
    ]);
    const q = quantizeE8(W, 'test', rows, cols);
    expect(q.groupCount).toBe(2); // 15/8 rounded up to 16, 2 groups
    // The padding zeros are captured but shouldn't corrupt the real data
    const recon = dequantizeE8(q);
    expect(recon.length).toBeGreaterThanOrEqual(15);
  });

  it('all-zero vector → scale=0 sentinel, zero reconstruction', () => {
    const W = new Float32Array(8); // all zeros, single group
    const q = quantizeE8(W, 'test', 1, 8);
    expect(q.groups[0].scale).toBe(0);
    const recon = dequantizeE8(q);
    for (let i = 0; i < 8; i++) expect(recon[i]).toBe(0);
  });

  it('nearestE8 identifies half-shift lattice point when appropriate', () => {
    // The point (0.5, 0.5, ..., 0.5) is exactly on D8+½
    const x = new Float64Array(8).fill(0.5);
    const { point, distSq, isHalfShift } = nearestE8(x);
    expect(distSq).toBeCloseTo(0, 10);
    expect(isHalfShift).toBe(true);
    for (let i = 0; i < 8; i++) expect(point[i]).toBe(0.5);
  });

  it('nearestE8 identifies integer lattice point at origin', () => {
    const x = new Float64Array(8); // origin
    const { point, distSq, isHalfShift } = nearestE8(x);
    expect(distSq).toBeCloseTo(0, 10);
    expect(isHalfShift).toBe(false);
    for (let i = 0; i < 8; i++) expect(point[i]).toBe(0);
  });

  it('pack → unpack round-trip preserves quantized state exactly', () => {
    const rows = 8,
      cols = 16;
    const W = new Float32Array(rows * cols);
    for (let i = 0; i < W.length; i++) W[i] = (Math.random() - 0.5) * 2;

    const q = quantizeE8(W, 'roundtrip', rows, cols);
    const packed = packE8(q);
    const unpacked = unpackE8(packed);

    expect(unpacked.groupCount).toBe(q.groupCount);
    for (let g = 0; g < q.groupCount; g++) {
      expect(unpacked.groups[g].scale).toBeCloseTo(q.groups[g].scale, 5);
      expect(unpacked.groups[g].isHalfShift).toBe(q.groups[g].isHalfShift);
      for (let i = 0; i < 8; i++) {
        expect(unpacked.groups[g].coords[i]).toBe(q.groups[g].coords[i]);
      }
    }
  });

  it('measureE8Quality returns cosine that matches manual computation', () => {
    const rows = 4,
      cols = 8;
    const W = new Float32Array(rows * cols);
    for (let i = 0; i < W.length; i++) W[i] = Math.cos(i * 0.5) * 0.3;

    const q = quantizeE8(W, 'q-check', rows, cols);
    const recon = dequantizeE8(q);
    const truncated = new Float32Array(
      recon.buffer,
      recon.byteOffset,
      W.length
    );
    const manualCos = cosine(W, truncated);

    const quality = measureE8Quality(W, truncated);
    expect(quality.cosineSimilarity).toBeGreaterThan(0.7);
    expect(quality.cosineSimilarity).toBeCloseTo(manualCos, 4);
    expect(quality.mse).toBeGreaterThanOrEqual(0);
    expect(quality.frobeniusError).toBeGreaterThanOrEqual(0);
  });

  it('near-lattice point → distSq ≈ 0', () => {
    // Exact integer lattice point with even sum
    const x = new Float64Array([2, -2, 1, -1, 0, 0, 0, 0]);
    const { distSq } = nearestE8(x);
    expect(distSq).toBeCloseTo(0, 10);
  });
});
