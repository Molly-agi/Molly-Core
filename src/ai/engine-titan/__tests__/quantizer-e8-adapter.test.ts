// src/ai/engine-titan/__tests__/quantizer-e8-adapter.test.ts
//
// Tests the E8 quantizer adapter: round-trip fidelity (quantize → dequantize),
// RHT gating by width threshold, entropy coding toggle, and format auto-detection.

import { describe, test, expect } from '@jest/globals';
import { E8QuantizerAdapter } from '../quantizer-e8-adapter';

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
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function generateWeights(
  rows: number,
  cols: number,
  rng: () => number,
  scale = 0.02
): Float32Array {
  const W = new Float32Array(rows * cols);
  for (let i = 0; i < W.length; i++) W[i] = gaussianRandom(rng) * scale;
  return W;
}

describe('E8QuantizerAdapter — round-trip fidelity', () => {
  test('narrow matrix round-trip with entropy coding', () => {
    const rng = seededRng(42);
    const rows = 64;
    const cols = 64;
    const W = generateWeights(rows, cols, rng);

    const adapter = new E8QuantizerAdapter({ useEntropyCoding: true });
    const result = adapter.quantize(W, 'test.narrow', rows, cols);

    expect(result.quantizerType).toBe('e8-lattice');
    expect(result.bitsPerWeight).toBeGreaterThan(0);
    expect(result.bitsPerWeight).toBeLessThan(16);

    const { weights: reconstructed } = adapter.dequantize(
      result.packedBuffer,
      rows,
      cols
    );

    expect(reconstructed.length).toBe(W.length);
    const cos = cosineSimilarity(W, reconstructed);
    expect(cos).toBeGreaterThan(0.85);
  });

  test('narrow matrix round-trip without entropy coding', () => {
    const rng = seededRng(42);
    const rows = 64;
    const cols = 64;
    const W = generateWeights(rows, cols, rng);

    const adapter = new E8QuantizerAdapter({ useEntropyCoding: false });
    const result = adapter.quantize(W, 'test.no_entropy', rows, cols);

    expect(result.quantizerType).toBe('e8-lattice');

    const { weights: reconstructed } = adapter.dequantize(
      result.packedBuffer,
      rows,
      cols
    );

    const cos = cosineSimilarity(W, reconstructed);
    expect(cos).toBeGreaterThan(0.85);
  });

  test('entropy and non-entropy produce same reconstruction quality', () => {
    const rng1 = seededRng(99);
    const rng2 = seededRng(99);
    const rows = 64;
    const cols = 64;
    const W1 = generateWeights(rows, cols, rng1);
    const W2 = generateWeights(rows, cols, rng2);

    const withEntropy = new E8QuantizerAdapter({ useEntropyCoding: true });
    const withoutEntropy = new E8QuantizerAdapter({ useEntropyCoding: false });

    const r1 = withEntropy.quantize(W1, 'entropy', rows, cols);
    const r2 = withoutEntropy.quantize(W2, 'no_entropy', rows, cols);

    const recon1 = withEntropy.dequantize(r1.packedBuffer, rows, cols);
    const recon2 = withoutEntropy.dequantize(r2.packedBuffer, rows, cols);

    const cos1 = cosineSimilarity(W1, recon1.weights);
    const cos2 = cosineSimilarity(W2, recon2.weights);

    // Both should achieve similar fidelity (within 0.05)
    expect(Math.abs(cos1 - cos2)).toBeLessThan(0.05);
  });

  test('entropy coding produces smaller packed buffer', () => {
    const rng1 = seededRng(77);
    const rng2 = seededRng(77);
    const rows = 64;
    const cols = 64;
    const W1 = generateWeights(rows, cols, rng1);
    const W2 = generateWeights(rows, cols, rng2);

    const withEntropy = new E8QuantizerAdapter({ useEntropyCoding: true });
    const withoutEntropy = new E8QuantizerAdapter({ useEntropyCoding: false });

    const r1 = withEntropy.quantize(W1, 'entropy', rows, cols);
    const r2 = withoutEntropy.quantize(W2, 'no_entropy', rows, cols);

    // Entropy coding should produce a smaller or equal buffer
    expect(r1.packedBuffer.length).toBeLessThanOrEqual(r2.packedBuffer.length);
  });
});

describe('E8QuantizerAdapter — RHT gating', () => {
  test('RHT activates when cols > rhtWidthThreshold', () => {
    const rng = seededRng(55);
    const rows = 32;
    const cols = 128;
    const W = generateWeights(rows, cols, rng);

    const adapter = new E8QuantizerAdapter({
      rhtWidthThreshold: 64,
      useEntropyCoding: false,
    });
    const result = adapter.quantize(W, 'test.wide', rows, cols);

    expect(result.rhtMeta).toBeDefined();
    expect(result.rhtMeta!.paddedCols).toBeGreaterThanOrEqual(cols);
  });

  test('RHT does not activate when cols <= rhtWidthThreshold', () => {
    const rng = seededRng(55);
    const rows = 32;
    const cols = 64;
    const W = generateWeights(rows, cols, rng);

    const adapter = new E8QuantizerAdapter({
      rhtWidthThreshold: 128,
      useEntropyCoding: false,
    });
    const result = adapter.quantize(W, 'test.narrow', rows, cols);

    expect(result.rhtMeta).toBeUndefined();
  });

  test('RHT round-trip preserves fidelity', () => {
    const rng = seededRng(123);
    const rows = 32;
    const cols = 128;
    const W = generateWeights(rows, cols, rng);

    const adapter = new E8QuantizerAdapter({
      rhtWidthThreshold: 64,
      useEntropyCoding: false,
    });
    const result = adapter.quantize(W, 'test.rht_roundtrip', rows, cols);
    const { weights: reconstructed, cols: outCols } = adapter.dequantize(
      result.packedBuffer,
      rows,
      cols,
      result.rhtMeta
    );

    expect(outCols).toBe(cols);
    expect(reconstructed.length).toBe(W.length);

    const cos = cosineSimilarity(W, reconstructed);
    expect(cos).toBeGreaterThan(0.85);
  });

  test('default RHT threshold is 4096', () => {
    const adapter = new E8QuantizerAdapter();
    const rng = seededRng(10);
    const rows = 8;
    const cols = 32;
    const W = generateWeights(rows, cols, rng);

    const result = adapter.quantize(W, 'small', rows, cols);
    expect(result.rhtMeta).toBeUndefined();
  });
});

describe('E8QuantizerAdapter — interface conformance', () => {
  test('type property is e8-lattice', () => {
    const adapter = new E8QuantizerAdapter();
    expect(adapter.type).toBe('e8-lattice');
  });

  test('quantize returns valid QuantizerResult fields', () => {
    const rng = seededRng(33);
    const rows = 16;
    const cols = 16;
    const W = generateWeights(rows, cols, rng);

    const adapter = new E8QuantizerAdapter({ useEntropyCoding: false });
    const result = adapter.quantize(W, 'test.interface', rows, cols);

    expect(result.packedBuffer).toBeInstanceOf(Buffer);
    expect(typeof result.bitsPerWeight).toBe('number');
    expect(result.quantizerType).toBe('e8-lattice');
  });

  test('dequantize returns correct dimensions', () => {
    const rng = seededRng(44);
    const rows = 24;
    const cols = 32;
    const W = generateWeights(rows, cols, rng);

    const adapter = new E8QuantizerAdapter({ useEntropyCoding: false });
    const result = adapter.quantize(W, 'test.dims', rows, cols);
    const deq = adapter.dequantize(result.packedBuffer, rows, cols);

    expect(deq.rows).toBe(rows);
    expect(deq.cols).toBe(cols);
    expect(deq.weights.length).toBe(rows * cols);
  });
});

describe('E8QuantizerAdapter — scale mode', () => {
  test('float16 scale mode produces valid round-trip', () => {
    const rng = seededRng(60);
    const rows = 32;
    const cols = 32;
    const W = generateWeights(rows, cols, rng);

    const adapter = new E8QuantizerAdapter({
      scaleMode: 'float16',
      useEntropyCoding: true,
    });
    const result = adapter.quantize(W, 'test.fp16', rows, cols);
    const { weights } = adapter.dequantize(result.packedBuffer, rows, cols);
    const cos = cosineSimilarity(W, weights);
    expect(cos).toBeGreaterThan(0.8);
  });

  test('log8 scale mode produces valid round-trip', () => {
    const rng = seededRng(60);
    const rows = 32;
    const cols = 32;
    const W = generateWeights(rows, cols, rng);

    const adapter = new E8QuantizerAdapter({
      scaleMode: 'log8',
      useEntropyCoding: true,
    });
    const result = adapter.quantize(W, 'test.log8', rows, cols);
    const { weights } = adapter.dequantize(result.packedBuffer, rows, cols);
    const cos = cosineSimilarity(W, weights);
    expect(cos).toBeGreaterThan(0.8);
  });

  test('float16 achieves equal or better fidelity than log8', () => {
    const rng1 = seededRng(88);
    const rng2 = seededRng(88);
    const rows = 32;
    const cols = 64;
    const W1 = generateWeights(rows, cols, rng1);
    const W2 = generateWeights(rows, cols, rng2);

    const fp16 = new E8QuantizerAdapter({
      scaleMode: 'float16',
      useEntropyCoding: true,
    });
    const log8 = new E8QuantizerAdapter({
      scaleMode: 'log8',
      useEntropyCoding: true,
    });

    const r1 = fp16.quantize(W1, 'fp16', rows, cols);
    const r2 = log8.quantize(W2, 'log8', rows, cols);

    const cos1 = cosineSimilarity(
      W1,
      fp16.dequantize(r1.packedBuffer, rows, cols).weights
    );
    const cos2 = cosineSimilarity(
      W2,
      log8.dequantize(r2.packedBuffer, rows, cols).weights
    );

    // float16 should be >= log8 (Fable Batch 03 F16 finding: log8 has ±2.2% systematic error)
    expect(cos1).toBeGreaterThanOrEqual(cos2 - 0.02);
  });
});
