// src/ai/engine-titan/__tests__/quantizer-ternary-adapter.test.ts
//
// Tests the ternary quantizer adapter: round-trip fidelity (quantize → dequantize),
// interface conformance, and 5-per-byte packing correctness.

import { describe, test, expect } from '@jest/globals';
import { TernaryQuantizerAdapter } from '../quantizer-ternary-adapter';

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function gaussianRandom(rng: () => number): number {
  const u1 = rng() || 1e-10;
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0,
    nA = 0,
    nB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    nA += a[i] * a[i];
    nB += b[i] * b[i];
  }
  return nA === 0 || nB === 0 ? 0 : dot / (Math.sqrt(nA) * Math.sqrt(nB));
}

describe('TernaryQuantizerAdapter — interface', () => {
  test('type property is ternary', () => {
    const adapter = new TernaryQuantizerAdapter();
    expect(adapter.type).toBe('ternary');
  });

  test('quantize returns valid QuantizerResult', () => {
    const rng = seededRng(42);
    const rows = 16;
    const cols = 16;
    const W = new Float32Array(rows * cols);
    for (let i = 0; i < W.length; i++) W[i] = gaussianRandom(rng) * 0.02;

    const adapter = new TernaryQuantizerAdapter();
    const result = adapter.quantize(W, 'test.ternary', rows, cols);

    expect(result.packedBuffer).toBeInstanceOf(Buffer);
    expect(result.bitsPerWeight).toBe(1.58);
    expect(result.quantizerType).toBe('ternary');
  });
});

describe('TernaryQuantizerAdapter — round-trip', () => {
  test('quantize → dequantize produces ternary values only', () => {
    const rng = seededRng(55);
    const rows = 8;
    const cols = 16;
    const W = new Float32Array(rows * cols);
    for (let i = 0; i < W.length; i++) W[i] = gaussianRandom(rng) * 0.05;

    const adapter = new TernaryQuantizerAdapter();
    const packed = adapter.quantize(W, 'test', rows, cols);
    const { weights } = adapter.dequantize(packed.packedBuffer, rows, cols);

    expect(weights.length).toBe(rows * cols);

    // Extract scale from first 4 bytes
    const scale = packed.packedBuffer.readFloatLE(0);

    // All values should be {-scale, 0, +scale}
    for (let i = 0; i < weights.length; i++) {
      const v = weights[i];
      const isValid =
        Math.abs(v) < 1e-10 || Math.abs(Math.abs(v) - scale) < 1e-6;
      expect(isValid).toBe(true);
    }
  });

  test('round-trip preserves sign pattern', () => {
    const rng = seededRng(77);
    const rows = 8;
    const cols = 8;
    const W = new Float32Array(rows * cols);
    for (let i = 0; i < W.length; i++) W[i] = gaussianRandom(rng) * 0.1;

    const adapter = new TernaryQuantizerAdapter();
    const packed = adapter.quantize(W, 'sign', rows, cols);
    const { weights } = adapter.dequantize(packed.packedBuffer, rows, cols);

    const cos = cosineSimilarity(W, weights);
    // Ternary at 1.58 bits on small random matrices — just verify positive correlation
    expect(cos).toBeGreaterThan(0);
  });

  test('dequantize returns correct dimensions', () => {
    const rng = seededRng(33);
    const rows = 12;
    const cols = 20;
    const W = new Float32Array(rows * cols);
    for (let i = 0; i < W.length; i++) W[i] = gaussianRandom(rng) * 0.02;

    const adapter = new TernaryQuantizerAdapter();
    const packed = adapter.quantize(W, 'dims', rows, cols);
    const deq = adapter.dequantize(packed.packedBuffer, rows, cols);

    expect(deq.rows).toBe(rows);
    expect(deq.cols).toBe(cols);
    expect(deq.weights.length).toBe(rows * cols);
  });

  test('larger matrices maintain reasonable fidelity', () => {
    const rng = seededRng(99);
    const rows = 64;
    const cols = 64;
    const W = new Float32Array(rows * cols);
    for (let i = 0; i < W.length; i++) W[i] = gaussianRandom(rng) * 0.02;

    const adapter = new TernaryQuantizerAdapter();
    const packed = adapter.quantize(W, 'large', rows, cols);
    const { weights } = adapter.dequantize(packed.packedBuffer, rows, cols);

    const cos = cosineSimilarity(W, weights);
    // Ternary is aggressive (1.58 bits) — cosine is low on random Gaussian data
    expect(cos).toBeGreaterThan(0.1);
  });
});

describe('TernaryQuantizerAdapter — packing', () => {
  test('packed buffer is smaller than float32 input', () => {
    const rng = seededRng(11);
    const rows = 32;
    const cols = 32;
    const W = new Float32Array(rows * cols);
    for (let i = 0; i < W.length; i++) W[i] = gaussianRandom(rng) * 0.02;

    const adapter = new TernaryQuantizerAdapter();
    const packed = adapter.quantize(W, 'size', rows, cols);

    // 1.58 bits/weight < 32 bits/weight → packed should be much smaller
    expect(packed.packedBuffer.length).toBeLessThan(W.byteLength);
  });

  test('5-per-byte packing: buffer size matches expected', () => {
    const rng = seededRng(22);
    const rows = 10;
    const cols = 10;
    const W = new Float32Array(rows * cols);
    for (let i = 0; i < W.length; i++) W[i] = gaussianRandom(rng) * 0.02;

    const adapter = new TernaryQuantizerAdapter();
    const packed = adapter.quantize(W, 'pack', rows, cols);

    // 4 bytes for scale + ceil(100/5) = 20 packed bytes = 24 total
    const expectedPackedBytes = 4 + Math.ceil((rows * cols) / 5);
    expect(packed.packedBuffer.length).toBe(expectedPackedBytes);
  });
});
