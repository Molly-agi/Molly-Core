/**
 * Regression tests for the two landmines Fable flagged in layer-error-compensation.ts:
 *   #1: silent B amputation when targetRank > maxRows
 *   #2: per-row E8 grouping misalignment when cols % 8 !== 0
 *
 * Both are latent in production today (real ranks stay ≤256; RHT always pads
 * cols to next-pow-2). But they're data-loss bugs waiting for a config change.
 * These tests pin them shut.
 */

import {
  compensatedQuantizeB,
  type LayerActivations,
} from '../layer-error-compensation';

function makeActivations(
  numTokens: number,
  inputDim: number
): LayerActivations {
  const arr = new Float32Array(numTokens * inputDim);
  for (let i = 0; i < arr.length; i++) arr[i] = Math.sin(i * 0.13) * 0.5;
  return { activations: arr, numTokens, inputDim };
}

describe('layer-error-compensation — landmine guards', () => {
  it('throws when targetRank exceeds maxRows (Landmine 1)', () => {
    const targetRank = 600; // > default maxRows (512)
    const cols = 32;
    const matrixB = new Float32Array(targetRank * cols);
    const activations = makeActivations(16, targetRank);

    expect(() =>
      compensatedQuantizeB(
        matrixB,
        targetRank,
        cols,
        activations,
        'test.landmine1',
        {}
      )
    ).toThrow(/targetRank .* exceeds maxRows/);
  });

  it('accepts targetRank equal to maxRows (boundary)', () => {
    const targetRank = 512;
    const cols = 32;
    const matrixB = new Float32Array(targetRank * cols);
    for (let i = 0; i < matrixB.length; i++)
      matrixB[i] = Math.cos(i * 0.07) * 0.3;
    const activations = makeActivations(16, targetRank);

    const result = compensatedQuantizeB(
      matrixB,
      targetRank,
      cols,
      activations,
      'test.boundary',
      {}
    );
    expect(result.quantizedB.rows).toBe(targetRank);
    // Groups per row = cols/8 = 4; total groups = targetRank * 4
    expect(result.quantizedB.groupCount).toBe(targetRank * (cols / 8));
  });

  it('throws when cols is not a multiple of 8 (Landmine 2)', () => {
    const targetRank = 16;
    const cols = 30; // NOT a multiple of 8
    const matrixB = new Float32Array(targetRank * cols);
    const activations = makeActivations(16, targetRank);

    expect(() =>
      compensatedQuantizeB(
        matrixB,
        targetRank,
        cols,
        activations,
        'test.landmine2',
        {}
      )
    ).toThrow(/must be a multiple of 8/);
  });

  it('accepts cols = 8, 16, 32, 64 (all valid multiples)', () => {
    const targetRank = 8;
    const activations = makeActivations(8, targetRank);

    for (const cols of [8, 16, 32, 64]) {
      const matrixB = new Float32Array(targetRank * cols);
      for (let i = 0; i < matrixB.length; i++) matrixB[i] = 0.1 + i * 0.001;
      expect(() =>
        compensatedQuantizeB(
          matrixB,
          targetRank,
          cols,
          activations,
          `test.cols${cols}`,
          {}
        )
      ).not.toThrow();
    }
  });
});
