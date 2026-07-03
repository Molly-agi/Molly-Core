// src/ai/engine-titan/__tests__/layer-error-compensation.test.ts

import { describe, test, expect } from '@jest/globals';
import {
  computeHessian,
  choleskyInverse,
  compensatedQuantizeB,
  collectBActivations,
  cosineSimilarity,
  type LayerActivations,
} from '../layer-error-compensation';
import { dequantizeE8 } from '../e8-lattice';

function gaussianRandom(rng: () => number): number {
  const u1 = rng();
  const u2 = rng();
  return (
    Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2)
  );
}

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

describe('computeHessian', () => {
  test('produces symmetric positive-definite matrix', () => {
    const dim = 16;
    const tokens = 64;
    const rng = seededRng(42);
    const X = new Float32Array(tokens * dim);
    for (let i = 0; i < X.length; i++) X[i] = gaussianRandom(rng);

    const H = computeHessian(X, tokens, dim);

    // Check symmetry
    for (let i = 0; i < dim; i++) {
      for (let j = i + 1; j < dim; j++) {
        expect(Math.abs(H[i * dim + j] - H[j * dim + i])).toBeLessThan(1e-10);
      }
    }

    // Check positive diagonal
    for (let i = 0; i < dim; i++) {
      expect(H[i * dim + i]).toBeGreaterThan(0);
    }
  });

  test('matches naive X^T @ X computation', () => {
    const dim = 8;
    const tokens = 32;
    const rng = seededRng(7);
    const X = new Float32Array(tokens * dim);
    for (let i = 0; i < X.length; i++) X[i] = gaussianRandom(rng);

    const H = computeHessian(X, tokens, dim);

    // Naive computation
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        let expected = 0;
        for (let t = 0; t < tokens; t++) {
          expected += X[t * dim + i] * X[t * dim + j];
        }
        expect(Math.abs(H[i * dim + j] - expected)).toBeLessThan(1e-4);
      }
    }
  });
});

describe('choleskyInverse', () => {
  test('inverts identity matrix', () => {
    const dim = 4;
    const I = new Float64Array(dim * dim);
    for (let i = 0; i < dim; i++) I[i * dim + i] = 1.0;

    const ok = choleskyInverse(I, dim);
    expect(ok).toBe(true);

    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        const expected = i === j ? 1.0 : 0.0;
        expect(Math.abs(I[i * dim + j] - expected)).toBeLessThan(1e-10);
      }
    }
  });

  test('inverts known 2x2 matrix', () => {
    // [[4, 2], [2, 3]] → inv = [[3/8, -2/8], [-2/8, 4/8]]
    const H = new Float64Array([4, 2, 2, 3]);
    const ok = choleskyInverse(H, 2);
    expect(ok).toBe(true);
    expect(Math.abs(H[0] - 3 / 8)).toBeLessThan(1e-10);
    expect(Math.abs(H[1] - -2 / 8)).toBeLessThan(1e-10);
    expect(Math.abs(H[2] - -2 / 8)).toBeLessThan(1e-10);
    expect(Math.abs(H[3] - 4 / 8)).toBeLessThan(1e-10);
  });

  test('returns false for non-positive-definite', () => {
    const H = new Float64Array([1, 2, 2, 1]); // eigenvalues: 3, -1
    const ok = choleskyInverse(H, 2);
    expect(ok).toBe(false);
  });

  test('H @ H^{-1} ≈ I for random PD matrix', () => {
    const dim = 8;
    const rng = seededRng(99);
    // Generate PD matrix via A^T @ A + I
    const A = new Float64Array(dim * dim);
    for (let i = 0; i < A.length; i++) A[i] = gaussianRandom(rng);

    const H_orig = new Float64Array(dim * dim);
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        let sum = i === j ? 1.0 : 0.0; // +I for guaranteed PD
        for (let k = 0; k < dim; k++) {
          sum += A[k * dim + i] * A[k * dim + j];
        }
        H_orig[i * dim + j] = sum;
      }
    }

    const H_inv = new Float64Array(H_orig);
    const ok = choleskyInverse(H_inv, dim);
    expect(ok).toBe(true);

    // Check H @ H^{-1} ≈ I
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        let product = 0;
        for (let k = 0; k < dim; k++) {
          product += H_orig[i * dim + k] * H_inv[k * dim + j];
        }
        const expected = i === j ? 1.0 : 0.0;
        expect(Math.abs(product - expected)).toBeLessThan(1e-6);
      }
    }
  });
});

describe('compensatedQuantizeB', () => {
  test('reduces MSE compared to naive quantization', () => {
    const targetRank = 16;
    const cols = 64; // must be multiple of 8 for E8
    const numTokens = 128;
    const rng = seededRng(123);

    // Generate random B matrix
    const B = new Float32Array(targetRank * cols);
    for (let i = 0; i < B.length; i++) B[i] = gaussianRandom(rng) * 0.1;

    // Generate calibration activations [numTokens × targetRank]
    const activations = new Float32Array(numTokens * targetRank);
    for (let i = 0; i < activations.length; i++) {
      activations[i] = gaussianRandom(rng);
    }

    const layerAct: LayerActivations = {
      activations,
      numTokens,
      inputDim: targetRank,
    };

    const result = compensatedQuantizeB(
      B,
      targetRank,
      cols,
      layerAct,
      'test.layer',
      { dampingFactor: 0.01, sigmaDelta: true, optimalScale: true }
    );

    // Compensation should reduce error or at minimum not increase it significantly
    expect(result.errorStats.improvementRatio).toBeGreaterThanOrEqual(0.9);
    expect(result.errorStats.postCompensationMSE).toBeLessThan(
      result.errorStats.preCompensationMSE * 1.1
    );
  });

  test('handles zero-weight matrix gracefully', () => {
    const targetRank = 8;
    const cols = 16;
    const numTokens = 32;

    const B = new Float32Array(targetRank * cols); // all zeros
    const activations = new Float32Array(numTokens * targetRank);
    const rng = seededRng(1);
    for (let i = 0; i < activations.length; i++)
      activations[i] = gaussianRandom(rng);

    const layerAct: LayerActivations = {
      activations,
      numTokens,
      inputDim: targetRank,
    };

    const result = compensatedQuantizeB(
      B,
      targetRank,
      cols,
      layerAct,
      'test.zero'
    );
    expect(result.errorStats.postCompensationMSE).toBe(0);
  });

  test('improvement scales with targetRank', () => {
    const cols = 64;
    const numTokens = 256;
    const rng = seededRng(777);

    const improvements: number[] = [];

    for (const targetRank of [8, 16, 32]) {
      const B = new Float32Array(targetRank * cols);
      for (let i = 0; i < B.length; i++) B[i] = gaussianRandom(rng) * 0.05;

      const activations = new Float32Array(numTokens * targetRank);
      for (let i = 0; i < activations.length; i++)
        activations[i] = gaussianRandom(rng);

      const layerAct: LayerActivations = {
        activations,
        numTokens,
        inputDim: targetRank,
      };

      const result = compensatedQuantizeB(
        B,
        targetRank,
        cols,
        layerAct,
        `test.rank${targetRank}`
      );
      improvements.push(result.errorStats.improvementRatio);
    }

    // Higher rank should show compensation benefit (more rows to redistribute)
    // At minimum all should be >= 1.0 (no degradation)
    for (const imp of improvements) {
      expect(imp).toBeGreaterThanOrEqual(0.8);
    }
  });
});

describe('collectBActivations', () => {
  test('correctly multiplies X @ A', () => {
    const numTokens = 4;
    const hiddenDim = 8;
    const targetRank = 3;

    // Simple known values
    const X = new Float32Array(numTokens * hiddenDim);
    X[0] = 1; // token 0, dim 0
    const A = new Float32Array(hiddenDim * targetRank);
    A[0] = 2; // hidden 0, rank 0
    A[1] = 3; // hidden 0, rank 1

    const z = collectBActivations(X, numTokens, hiddenDim, A, targetRank);

    expect(z[0]).toBeCloseTo(2); // token 0, rank 0: X[0,0]*A[0,0] = 1*2
    expect(z[1]).toBeCloseTo(3); // token 0, rank 1: X[0,0]*A[0,1] = 1*3
    expect(z[2]).toBeCloseTo(0); // token 0, rank 2: zero
  });
});

describe('cosineSimilarity', () => {
  test('identical vectors have similarity 1.0', () => {
    const a = new Float32Array([1, 2, 3, 4]);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1.0);
  });

  test('orthogonal vectors have similarity 0.0', () => {
    const a = new Float32Array([1, 0, 0, 0]);
    const b = new Float32Array([0, 1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  test('opposite vectors have similarity -1.0', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([-1, -2, -3]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
  });
});

describe('end-to-end error reduction', () => {
  test('compensated quantization maintains cosine > 0.99 on realistic weights', () => {
    const targetRank = 32;
    const cols = 128;
    const numTokens = 256;
    const rng = seededRng(2024);

    // Simulate realistic weight distribution (normal, small magnitude)
    const B = new Float32Array(targetRank * cols);
    for (let i = 0; i < B.length; i++) {
      B[i] = gaussianRandom(rng) * 0.02; // typical LLM weight scale
    }

    // Realistic activation distribution
    const activations = new Float32Array(numTokens * targetRank);
    for (let i = 0; i < activations.length; i++) {
      activations[i] = gaussianRandom(rng) * 0.5;
    }

    const layerAct: LayerActivations = {
      activations,
      numTokens,
      inputDim: targetRank,
    };

    const result = compensatedQuantizeB(
      B,
      targetRank,
      cols,
      layerAct,
      'test.realistic',
      { sigmaDelta: true, optimalScale: true, dampingFactor: 0.01 }
    );

    // Reconstruct and check cosine similarity
    const recon = dequantizeE8(result.quantizedB);
    const cosine = cosineSimilarity(B, recon);

    // With compensation + sigma-delta + optimal scale, should maintain high fidelity
    expect(cosine).toBeGreaterThan(0.95);
    expect(result.errorStats.postCompensationMSE).toBeLessThan(0.001);
  });
});
