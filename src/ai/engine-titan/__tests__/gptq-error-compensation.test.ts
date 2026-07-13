// src/ai/engine-titan/__tests__/gptq-error-compensation.test.ts
//
// Tests GPTQ-style cross-layer error compensation: computeLayerCompensation,
// applyCorrection, and runSequentialCompensation.

import { describe, test, expect } from '@jest/globals';
import {
  computeLayerCompensation,
  applyCorrection,
  runSequentialCompensation,
} from '../gptq-error-compensation';

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

function matmul(
  A: Float32Array,
  aRows: number,
  aCols: number,
  B: Float32Array,
  bCols: number
): Float32Array {
  const out = new Float32Array(aRows * bCols);
  for (let i = 0; i < aRows; i++) {
    for (let j = 0; j < bCols; j++) {
      let sum = 0;
      for (let k = 0; k < aCols; k++) {
        sum += A[i * aCols + k] * B[k * bCols + j];
      }
      out[i * bCols + j] = sum;
    }
  }
  return out;
}

describe('computeLayerCompensation', () => {
  test('zero error produces zero correction', () => {
    const outDim = 4;
    const inDim = 4;
    const numSamples = 8;

    const output = new Float32Array(outDim * numSamples);
    for (let i = 0; i < output.length; i++) output[i] = i * 0.1;

    const input = new Float32Array(inDim * numSamples);
    for (let i = 0; i < input.length; i++) input[i] = i * 0.05;

    const result = computeLayerCompensation(
      output,
      output, // same as original → zero error
      input,
      outDim,
      inDim,
      numSamples
    );

    expect(result.mseBefore).toBeCloseTo(0, 10);
    expect(result.correctionNorm).toBeCloseTo(0, 10);
    expect(result.mseAfter).toBeCloseTo(0, 10);
  });

  test('compensation reduces MSE on calibration data', () => {
    const rng = seededRng(42);
    const outDim = 8;
    const inDim = 8;
    const numSamples = 16;

    const original = new Float32Array(outDim * numSamples);
    const compressed = new Float32Array(outDim * numSamples);
    const input = new Float32Array(inDim * numSamples);

    for (let i = 0; i < original.length; i++) {
      original[i] = gaussianRandom(rng) * 0.5;
      compressed[i] = original[i] + gaussianRandom(rng) * 0.05;
    }
    for (let i = 0; i < input.length; i++) {
      input[i] = gaussianRandom(rng) * 0.3;
    }

    const result = computeLayerCompensation(
      original,
      compressed,
      input,
      outDim,
      inDim,
      numSamples
    );

    expect(result.mseBefore).toBeGreaterThan(0);
    expect(result.mseAfter).toBeLessThan(result.mseBefore);
    expect(result.correctionNorm).toBeGreaterThan(0);
  });

  test('correction is clamped by maxCorrectionNorm', () => {
    const rng = seededRng(99);
    const outDim = 4;
    const inDim = 4;
    const numSamples = 8;

    const original = new Float32Array(outDim * numSamples);
    const compressed = new Float32Array(outDim * numSamples);
    const input = new Float32Array(inDim * numSamples);

    for (let i = 0; i < original.length; i++) {
      original[i] = gaussianRandom(rng) * 10.0;
      compressed[i] = original[i] + gaussianRandom(rng) * 5.0;
    }
    for (let i = 0; i < input.length; i++) input[i] = gaussianRandom(rng);

    const result = computeLayerCompensation(
      original,
      compressed,
      input,
      outDim,
      inDim,
      numSamples,
      { maxCorrectionNorm: 0.5 }
    );

    expect(result.correctionNorm).toBeLessThanOrEqual(0.5 + 1e-6);
  });

  test('larger lambda produces smaller correction', () => {
    const rng1 = seededRng(77);
    const rng2 = seededRng(77);
    const outDim = 4;
    const inDim = 4;
    const numSamples = 16;

    const makeData = (rng: () => number) => {
      const orig = new Float32Array(outDim * numSamples);
      const comp = new Float32Array(outDim * numSamples);
      const inp = new Float32Array(inDim * numSamples);
      for (let i = 0; i < orig.length; i++) {
        orig[i] = gaussianRandom(rng);
        comp[i] = orig[i] + gaussianRandom(rng) * 0.1;
      }
      for (let i = 0; i < inp.length; i++) inp[i] = gaussianRandom(rng);
      return { orig, comp, inp };
    };

    const d1 = makeData(rng1);
    const d2 = makeData(rng2);

    const smallLambda = computeLayerCompensation(
      d1.orig,
      d1.comp,
      d1.inp,
      outDim,
      inDim,
      numSamples,
      { lambda: 1e-6 }
    );
    const largeLambda = computeLayerCompensation(
      d2.orig,
      d2.comp,
      d2.inp,
      outDim,
      inDim,
      numSamples,
      { lambda: 1.0 }
    );

    expect(largeLambda.correctionNorm).toBeLessThan(smallLambda.correctionNorm);
  });
});

describe('applyCorrection', () => {
  test('adds correction to weights in-place', () => {
    const weights = Float32Array.from([1, 2, 3, 4]);
    const correction = Float32Array.from([0.1, -0.1, 0.2, -0.2]);

    applyCorrection(weights, correction);

    expect(weights[0]).toBeCloseTo(1.1);
    expect(weights[1]).toBeCloseTo(1.9);
    expect(weights[2]).toBeCloseTo(3.2);
    expect(weights[3]).toBeCloseTo(3.8);
  });

  test('throws on dimension mismatch', () => {
    const weights = Float32Array.from([1, 2, 3]);
    const correction = Float32Array.from([0.1, -0.1]);

    expect(() => applyCorrection(weights, correction)).toThrow(
      /dimension mismatch/
    );
  });

  test('zero correction leaves weights unchanged', () => {
    const weights = Float32Array.from([1, 2, 3, 4]);
    const correction = new Float32Array(4);

    applyCorrection(weights, correction);

    expect(weights[0]).toBe(1);
    expect(weights[1]).toBe(2);
    expect(weights[2]).toBe(3);
    expect(weights[3]).toBe(4);
  });
});

describe('runSequentialCompensation', () => {
  test('sequential pass processes all layers and reduces total MSE', () => {
    const rng = seededRng(42);
    const numLayers = 4;
    const hiddenDim = 8;
    const numSamples = 16;

    const weights: Float32Array[] = [];
    for (let l = 0; l < numLayers; l++) {
      const W = new Float32Array(hiddenDim * hiddenDim);
      for (let i = 0; i < W.length; i++) W[i] = gaussianRandom(rng) * 0.1;
      weights.push(W);
    }

    const calibSamples: Float32Array[] = [];
    for (let s = 0; s < numSamples; s++) {
      const sample = new Float32Array(hiddenDim);
      for (let d = 0; d < hiddenDim; d++) sample[d] = gaussianRandom(rng) * 0.5;
      calibSamples.push(sample);
    }

    const result = runSequentialCompensation({
      numLayers,
      hiddenDim,
      calibrationSamples: calibSamples,
      compressLayer: (_layerIdx, inputActivations) => {
        const W = weights[_layerIdx];
        const original = matmul(
          W,
          hiddenDim,
          hiddenDim,
          inputActivations,
          numSamples
        );
        const compressed = new Float32Array(original.length);
        for (let i = 0; i < original.length; i++) {
          compressed[i] = original[i] + gaussianRandom(rng) * 0.01;
        }
        return { originalOutput: original, compressedOutput: compressed };
      },
      getNextLayerWeights: (idx) => new Float32Array(weights[idx]),
      setNextLayerWeights: (idx, w) => {
        weights[idx] = w;
      },
    });

    // Should process numLayers - 1 compensation steps
    expect(result.layerResults).toHaveLength(numLayers - 1);
    expect(result.totalMseAfter).toBeLessThan(result.totalMseBefore);
  });

  test('calls onLayerDone callback for each layer', () => {
    const rng = seededRng(55);
    const hiddenDim = 4;
    const numSamples = 4;
    const numLayers = 3;

    const weights: Float32Array[] = [];
    for (let l = 0; l < numLayers; l++) {
      const W = new Float32Array(hiddenDim * hiddenDim);
      for (let i = 0; i < W.length; i++) W[i] = gaussianRandom(rng) * 0.1;
      weights.push(W);
    }

    const samples = Array.from({ length: numSamples }, () => {
      const s = new Float32Array(hiddenDim);
      for (let i = 0; i < hiddenDim; i++) s[i] = gaussianRandom(rng);
      return s;
    });

    const layersDone: number[] = [];

    runSequentialCompensation({
      numLayers,
      hiddenDim,
      calibrationSamples: samples,
      compressLayer: (_idx, _inp) => {
        const orig = new Float32Array(hiddenDim * numSamples);
        const comp = new Float32Array(hiddenDim * numSamples);
        for (let i = 0; i < orig.length; i++) {
          orig[i] = gaussianRandom(rng);
          comp[i] = orig[i] + gaussianRandom(rng) * 0.01;
        }
        return { originalOutput: orig, compressedOutput: comp };
      },
      getNextLayerWeights: (idx) => new Float32Array(weights[idx]),
      setNextLayerWeights: (idx, w) => {
        weights[idx] = w;
      },
      onLayerDone: (idx) => layersDone.push(idx),
    });

    expect(layersDone).toEqual([0, 1]);
  });
});
