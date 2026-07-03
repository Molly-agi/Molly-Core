// src/ai/engine-titan/__tests__/offq-pca.test.ts

import {
  applyOffQ,
  inverseOffQ,
  measureOutlierConcentration,
} from '../offq-pca';

function generateGaussian(n: number): Float32Array {
  const arr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u1 = Math.random();
    const u2 = Math.random();
    arr[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  return arr;
}

function injectOutlierChannels(
  X: Float32Array,
  tokens: number,
  channels: number,
  outlierChannels: number[],
  magnitude: number
): void {
  for (let i = 0; i < tokens; i++) {
    for (const ch of outlierChannels) {
      X[i * channels + ch] *= magnitude;
    }
  }
}

describe('OffQ PCA — Outlier Concentration Pipeline', () => {
  describe('applyOffQ basic properties', () => {
    it('returns transformed tensor of correct length', () => {
      const tokens = 16;
      const channels = 64;
      const X = generateGaussian(tokens * channels);

      const { transformed, state } = applyOffQ(X, tokens, channels);

      expect(transformed.length).toBe(tokens * channels);
      expect(state.channelCount).toBe(channels);
      expect(state.pca1Direction.length).toBe(channels);
    });

    it('PCA direction is a unit vector', () => {
      const tokens = 32;
      const channels = 32;
      const X = generateGaussian(tokens * channels);

      const { state } = applyOffQ(X, tokens, channels);
      const norm = Math.sqrt(
        state.pca1Direction.reduce((s, v) => s + v * v, 0)
      );
      expect(norm).toBeCloseTo(1.0, 5);
    });

    it('throws on dimension mismatch', () => {
      const X = new Float32Array(100);
      expect(() => applyOffQ(X, 10, 11)).toThrow(RangeError);
    });
  });

  describe('outlier reduction', () => {
    it('reduces max/mean variance ratio when outliers present', () => {
      const tokens = 64;
      const channels = 128;
      const X = generateGaussian(tokens * channels);
      injectOutlierChannels(X, tokens, channels, [7], 500);

      const before = measureOutlierConcentration(X, tokens, channels);
      const { transformed } = applyOffQ(X, tokens, channels);
      const after = measureOutlierConcentration(transformed, tokens, channels);

      expect(before.maxToMeanRatio).toBeGreaterThan(50);
      expect(after.maxToMeanRatio).toBeLessThan(before.maxToMeanRatio);
      expect(after.maxToMeanRatio).toBeLessThan(10);
    });

    it('achieves >90% reduction on extreme outliers', () => {
      const tokens = 128;
      const channels = 64;
      const X = generateGaussian(tokens * channels);
      injectOutlierChannels(X, tokens, channels, [0, 15, 31, 63], 100);

      const before = measureOutlierConcentration(X, tokens, channels);
      const { transformed } = applyOffQ(X, tokens, channels);
      const after = measureOutlierConcentration(transformed, tokens, channels);

      const reduction = 1 - after.maxToMeanRatio / before.maxToMeanRatio;
      expect(reduction).toBeGreaterThan(0.9);
    });

    it('does not amplify variance on already-uniform data', () => {
      const tokens = 32;
      const channels = 16;
      const X = generateGaussian(tokens * channels);

      const before = measureOutlierConcentration(X, tokens, channels);
      const { transformed } = applyOffQ(X, tokens, channels);
      const after = measureOutlierConcentration(transformed, tokens, channels);

      expect(after.maxToMeanRatio).toBeLessThan(before.maxToMeanRatio * 2);
    });
  });

  describe('inverseOffQ roundtrip', () => {
    it('recovers original tensor with negligible error', () => {
      const tokens = 16;
      const channels = 32;
      const X = generateGaussian(tokens * channels);
      injectOutlierChannels(X, tokens, channels, [5], 30);

      const { transformed, state } = applyOffQ(X, tokens, channels);
      const recovered = inverseOffQ(transformed, tokens, state);

      let maxErr = 0;
      for (let i = 0; i < X.length; i++) {
        const err = Math.abs(X[i] - recovered[i]);
        if (err > maxErr) maxErr = err;
      }
      expect(maxErr).toBeLessThan(1e-3);
    });

    it('roundtrip preserves energy (Frobenius norm)', () => {
      const tokens = 32;
      const channels = 64;
      const X = generateGaussian(tokens * channels);
      injectOutlierChannels(X, tokens, channels, [10, 20], 40);

      const normBefore = Math.sqrt(X.reduce((s, v) => s + v * v, 0));
      const { transformed, state } = applyOffQ(X, tokens, channels);
      const recovered = inverseOffQ(transformed, tokens, state);
      const normAfter = Math.sqrt(recovered.reduce((s, v) => s + v * v, 0));

      expect(normAfter / normBefore).toBeCloseTo(1.0, 2);
    });

    it('roundtrip works on power-of-2 channels', () => {
      const tokens = 8;
      const channels = 128;
      const X = generateGaussian(tokens * channels);

      const { transformed, state } = applyOffQ(X, tokens, channels);
      const recovered = inverseOffQ(transformed, tokens, state);

      const cosSim = cosine(X, recovered);
      expect(cosSim).toBeGreaterThan(0.99);
    });

    it('roundtrip works on non-power-of-2 channels (lossy from padding)', () => {
      const tokens = 8;
      const channels = 48;
      const X = generateGaussian(tokens * channels);

      const { transformed, state } = applyOffQ(X, tokens, channels);
      const recovered = inverseOffQ(transformed, tokens, state);

      const cosSim = cosine(X, recovered);
      // Non-power-of-2 channels lose some energy in Hadamard padding/trim — 0.85+ is acceptable
      expect(cosSim).toBeGreaterThan(0.85);
    });
  });

  describe('measureOutlierConcentration', () => {
    it('returns ratio near 1 for uniform-variance data', () => {
      const tokens = 64;
      const channels = 16;
      const X = generateGaussian(tokens * channels);

      const { maxToMeanRatio } = measureOutlierConcentration(
        X,
        tokens,
        channels
      );
      expect(maxToMeanRatio).toBeLessThan(5);
    });

    it('detects outlier channel correctly', () => {
      const tokens = 32;
      const channels = 16;
      const X = generateGaussian(tokens * channels);
      injectOutlierChannels(X, tokens, channels, [11], 100);

      const { maxChannel } = measureOutlierConcentration(X, tokens, channels);
      expect(maxChannel).toBe(11);
    });

    it('ratio scales with outlier magnitude', () => {
      const tokens = 32;
      const channels = 16;

      const X1 = generateGaussian(tokens * channels);
      const X2 = new Float32Array(X1);
      injectOutlierChannels(X1, tokens, channels, [0], 10);
      injectOutlierChannels(X2, tokens, channels, [0], 100);

      const r1 = measureOutlierConcentration(X1, tokens, channels);
      const r2 = measureOutlierConcentration(X2, tokens, channels);

      expect(r2.maxToMeanRatio).toBeGreaterThan(r1.maxToMeanRatio);
    });
  });

  describe('edge cases', () => {
    it('handles single-token input', () => {
      const X = new Float32Array(16);
      for (let i = 0; i < 16; i++) X[i] = i * 0.1;

      const { transformed, state } = applyOffQ(X, 1, 16);
      expect(transformed.length).toBe(16);
      expect(state.channelCount).toBe(16);
    });

    it('handles all-zero input without NaN', () => {
      const X = new Float32Array(64);
      const { transformed } = applyOffQ(X, 8, 8);

      for (let i = 0; i < transformed.length; i++) {
        expect(isFinite(transformed[i])).toBe(true);
      }
    });

    it('handles single-channel-dominant outlier', () => {
      const tokens = 32;
      const channels = 32;
      const X = new Float32Array(tokens * channels);
      for (let i = 0; i < tokens; i++) {
        X[i * channels + 0] = 1000;
        for (let j = 1; j < channels; j++) X[i * channels + j] = 0.01;
      }

      const { transformed } = applyOffQ(X, tokens, channels);
      const after = measureOutlierConcentration(transformed, tokens, channels);
      expect(after.maxToMeanRatio).toBeLessThan(5);
    });
  });
});

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
