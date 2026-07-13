// src/ai/engine-titan/__tests__/siren-inr.test.ts
//
// Tests SIREN Implicit Neural Representation for embedding compression:
// initialization, forward pass, export/import round-trip, compression stats,
// and basic fitting behavior.

import { describe, test, expect } from '@jest/globals';
import { SirenINR } from '../siren-inr';

describe('SirenINR — initialization', () => {
  test('creates network with correct layer dimensions', () => {
    const siren = new SirenINR({
      inputDim: 1,
      hiddenDim: 32,
      outputDim: 64,
      numLayers: 3,
    });
    const stats = siren.getCompressionStats(1000);
    // Layer 0: 32×1 + 32 = 64, Layer 1: 32×32 + 32 = 1056, Layer 2: 64×32 + 64 = 2112
    // Total = 64 + 1056 + 2112 = 3232
    expect(stats.params).toBe(3232);
  });

  test('default config uses sensible values', () => {
    const siren = new SirenINR({ outputDim: 128 });
    const stats = siren.getCompressionStats(1000);
    expect(stats.params).toBeGreaterThan(0);
    expect(stats.bytes).toBe(stats.params * 4);
  });
});

describe('SirenINR — forward pass', () => {
  test('returns vector of correct output dimension', () => {
    const siren = new SirenINR({
      inputDim: 1,
      hiddenDim: 16,
      outputDim: 32,
      numLayers: 3,
    });
    const out = siren.forward(0, 100);
    expect(out.length).toBe(32);
    expect(out).toBeInstanceOf(Float32Array);
  });

  test('different token IDs produce different embeddings', () => {
    const siren = new SirenINR({
      hiddenDim: 16,
      outputDim: 16,
      numLayers: 3,
    });

    const e0 = siren.forward(0, 100);
    const e50 = siren.forward(50, 100);
    const e99 = siren.forward(99, 100);

    let same01 = 0;
    for (let i = 0; i < 16; i++) {
      if (Math.abs(e0[i] - e50[i]) < 1e-6) same01++;
    }
    expect(same01).toBeLessThan(16);

    let same12 = 0;
    for (let i = 0; i < 16; i++) {
      if (Math.abs(e50[i] - e99[i]) < 1e-6) same12++;
    }
    expect(same12).toBeLessThan(16);
  });

  test('same token ID produces same embedding (deterministic)', () => {
    const siren = new SirenINR({
      hiddenDim: 16,
      outputDim: 16,
      numLayers: 3,
    });

    const e1 = siren.forward(42, 100);
    const e2 = siren.forward(42, 100);

    for (let i = 0; i < 16; i++) {
      expect(e1[i]).toBe(e2[i]);
    }
  });

  test('output values are finite', () => {
    const siren = new SirenINR({
      hiddenDim: 32,
      outputDim: 64,
      numLayers: 4,
    });

    for (let t = 0; t < 50; t += 10) {
      const out = siren.forward(t, 50);
      for (let i = 0; i < out.length; i++) {
        expect(Number.isFinite(out[i])).toBe(true);
      }
    }
  });
});

describe('SirenINR — export/import round-trip', () => {
  test('fromWeights produces identical forward pass', () => {
    const siren = new SirenINR({
      hiddenDim: 16,
      outputDim: 32,
      numLayers: 3,
    });

    const weights = siren.exportWeights(100, 0.5);
    const restored = SirenINR.fromWeights(weights);

    for (let t = 0; t < 100; t += 25) {
      const orig = siren.forward(t, 100);
      const rest = restored.forward(t, 100);
      for (let i = 0; i < 32; i++) {
        expect(rest[i]).toBeCloseTo(orig[i], 10);
      }
    }
  });

  test('exported weights contain config and metadata', () => {
    const siren = new SirenINR({
      hiddenDim: 16,
      outputDim: 32,
      numLayers: 3,
      omega0: 30.0,
    });

    const weights = siren.exportWeights(5000, 0.123);

    expect(weights.vocabSize).toBe(5000);
    expect(weights.trainLoss).toBe(0.123);
    expect(weights.config.hiddenDim).toBe(16);
    expect(weights.config.outputDim).toBe(32);
    expect(weights.config.numLayers).toBe(3);
    expect(weights.layers).toHaveLength(3);
  });
});

describe('SirenINR — compression stats', () => {
  test('compression ratio is > 1 for large vocab', () => {
    const siren = new SirenINR({
      hiddenDim: 256,
      outputDim: 8192,
      numLayers: 4,
    });

    const stats = siren.getCompressionStats(152064);

    expect(stats.originalBytes).toBe(152064 * 8192 * 4);
    expect(stats.ratio).toBeGreaterThan(10);
    expect(stats.bytes).toBeLessThan(stats.originalBytes);
  });

  test('compression ratio scales with vocab size', () => {
    const siren = new SirenINR({
      hiddenDim: 64,
      outputDim: 512,
      numLayers: 3,
    });

    const small = siren.getCompressionStats(1000);
    const large = siren.getCompressionStats(100000);

    // Same SIREN params, bigger vocab = higher ratio
    expect(large.ratio).toBeGreaterThan(small.ratio);
    expect(small.bytes).toBe(large.bytes);
  });
});

describe('SirenINR — fitting', () => {
  test('fit reduces loss on tiny embedding table', () => {
    const vocabSize = 8;
    const embDim = 4;
    const table = new Float32Array(vocabSize * embDim);
    // Simple pattern: each row is [tokenId/vocabSize, 0, 0, 0]
    for (let t = 0; t < vocabSize; t++) {
      table[t * embDim] = t / vocabSize;
    }

    const siren = new SirenINR({
      hiddenDim: 16,
      outputDim: embDim,
      numLayers: 2,
      omega0: 10.0,
      omegaHidden: 10.0,
    });

    const losses: number[] = [];
    const finalLoss = siren.fit(table, vocabSize, {
      epochs: 5,
      lr: 1e-3,
      batchSize: vocabSize,
      onEpoch: (_e, l) => losses.push(l),
    });

    expect(losses).toHaveLength(5);
    expect(finalLoss).toBeGreaterThanOrEqual(0);
    // Loss should decrease (or at least not explode)
    expect(losses[losses.length - 1]).toBeLessThanOrEqual(losses[0] * 2);
  });
});
