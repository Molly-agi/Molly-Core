// src/ai/engine-titan/__tests__/offq-calibrate.test.ts
//
// Tests OffQ PCA calibration: per-layer state computation, serialization
// round-trip, and outlier concentration reduction measurement.

import { describe, test, expect } from '@jest/globals';
import {
  calibrateOffQ,
  serializeOffQStates,
  deserializeOffQStates,
} from '../offq-calibrate';

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

function generateActivations(
  tokens: number,
  channels: number,
  rng: () => number,
  outlierChannel = -1
): Float32Array {
  const X = new Float32Array(tokens * channels);
  for (let t = 0; t < tokens; t++) {
    for (let c = 0; c < channels; c++) {
      X[t * channels + c] = gaussianRandom(rng) * 0.1;
      if (c === outlierChannel) {
        X[t * channels + c] *= 50;
      }
    }
  }
  return X;
}

describe('calibrateOffQ', () => {
  test('produces one state per layer', () => {
    const rng = seededRng(42);
    const tokens = 16;
    const channels = 8;
    const layers = 3;

    const samples = Array.from({ length: layers }, () =>
      generateActivations(tokens, channels, rng)
    );

    const result = calibrateOffQ(samples, { tokens, channels, layers });

    expect(result.states).toHaveLength(layers);
    expect(result.reductionRatios).toHaveLength(layers);
  });

  test('each state has correct channel count', () => {
    const rng = seededRng(55);
    const tokens = 16;
    const channels = 32;
    const layers = 2;

    const samples = Array.from({ length: layers }, () =>
      generateActivations(tokens, channels, rng)
    );

    const result = calibrateOffQ(samples, { tokens, channels, layers });

    for (const state of result.states) {
      expect(state.channelCount).toBe(channels);
      expect(state.pca1Direction.length).toBe(channels);
    }
  });

  test('PCA direction is unit-norm', () => {
    const rng = seededRng(77);
    const tokens = 32;
    const channels = 16;
    const layers = 1;

    const samples = [generateActivations(tokens, channels, rng, 3)];
    const result = calibrateOffQ(samples, { tokens, channels, layers });

    let norm = 0;
    for (let i = 0; i < channels; i++) {
      norm += result.states[0].pca1Direction[i] ** 2;
    }
    expect(Math.sqrt(norm)).toBeCloseTo(1.0, 2);
  });

  test('reduction ratio is positive for outlier-heavy activations', () => {
    const rng = seededRng(99);
    const tokens = 32;
    const channels = 16;
    const layers = 1;

    const samples = [generateActivations(tokens, channels, rng, 0)];
    const result = calibrateOffQ(samples, { tokens, channels, layers });

    expect(result.reductionRatios[0]).toBeGreaterThan(0);
  });

  test('throws on layer count mismatch', () => {
    const rng = seededRng(11);
    const samples = [generateActivations(8, 8, rng)];

    expect(() =>
      calibrateOffQ(samples, { tokens: 8, channels: 8, layers: 3 })
    ).toThrow(/Expected 3 activation samples/);
  });

  test('throws on activation dimension mismatch', () => {
    const samples = [new Float32Array(100)];

    expect(() =>
      calibrateOffQ(samples, { tokens: 8, channels: 8, layers: 1 })
    ).toThrow(/expected 64 elements/);
  });
});

describe('serializeOffQStates / deserializeOffQStates round-trip', () => {
  test('serialize and deserialize produces identical states', () => {
    const rng = seededRng(42);
    const tokens = 16;
    const channels = 8;
    const layers = 3;

    const samples = Array.from({ length: layers }, () =>
      generateActivations(tokens, channels, rng, 2)
    );

    const { states } = calibrateOffQ(samples, { tokens, channels, layers });

    const buf = serializeOffQStates(states);
    const restored = deserializeOffQStates(buf);

    expect(restored).toHaveLength(states.length);
    for (let l = 0; l < states.length; l++) {
      expect(restored[l].channelCount).toBe(states[l].channelCount);
      for (let c = 0; c < states[l].channelCount; c++) {
        expect(restored[l].pca1Direction[c]).toBeCloseTo(
          states[l].pca1Direction[c],
          5
        );
      }
    }
  });

  test('buffer starts with OFFQ magic', () => {
    const samples = [generateActivations(8, 4, seededRng(33))];
    const { states } = calibrateOffQ(samples, {
      tokens: 8,
      channels: 4,
      layers: 1,
    });

    const buf = serializeOffQStates(states);
    expect(buf.readUInt32LE(0)).toBe(0x4f464651);
  });

  test('throws on invalid magic', () => {
    const buf = Buffer.alloc(12);
    buf.writeUInt32LE(0xdeadbeef, 0);
    expect(() => deserializeOffQStates(buf)).toThrow(
      /Invalid OffQ state magic/
    );
  });
});
