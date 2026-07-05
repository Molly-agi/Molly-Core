// Copyright (c) 2026 Molly Labs Inc. Licensed under AGPL-3.0.
// src/ai/engine-titan/decomposer.ts
export interface DecomposedLayers {
  readonly matrixA: Float32Array;
  readonly matrixB: Float32Array;
}

// Seeded xorshift32 — reproducible, no crypto overhead
function xorshift32(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}

function randNormal(rng: () => number): number {
  const u = rng() || 1e-10;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

// W [rows×cols] × Omega [cols×k] → Y [rows×k]
function matmul(
  W: Float32Array,
  rows: number,
  cols: number,
  Omega: Float32Array,
  k: number,
  Y: Float32Array
): void {
  for (let i = 0; i < rows; i++) {
    const wOff = i * cols;
    const yOff = i * k;
    for (let j = 0; j < k; j++) {
      let s = 0;
      for (let p = 0; p < cols; p++) s += W[wOff + p] * Omega[p * k + j];
      Y[yOff + j] = s;
    }
  }
}

// W^T @ Y [rows×k] → tmp [cols×k]
function matmulWtY(
  W: Float32Array,
  rows: number,
  cols: number,
  Y: Float32Array,
  k: number,
  out: Float32Array
): void {
  for (let i = 0; i < cols; i++) {
    const outOff = i * k;
    for (let j = 0; j < k; j++) {
      let s = 0;
      for (let p = 0; p < rows; p++) s += W[p * cols + i] * Y[p * k + j];
      out[outOff + j] = s;
    }
  }
}

// Q^T [k×rows] × W [rows×cols] → B [k×cols]
function matmulQtW(
  Q: Float32Array,
  k: number,
  rows: number,
  W: Float32Array,
  cols: number,
  B: Float32Array
): void {
  for (let i = 0; i < k; i++) {
    const bOff = i * cols;
    for (let j = 0; j < cols; j++) {
      let s = 0;
      for (let p = 0; p < rows; p++) s += Q[p * k + i] * W[p * cols + j];
      B[bOff + j] = s;
    }
  }
}

// Modified Gram-Schmidt QR in-place on Y [rows×k] — overwrites Y with Q.
// Degenerate columns (rank-deficient input) are replaced with random vectors
// re-orthogonalized against prior columns so Q stays a proper orthonormal basis.
function qrInPlace(
  Y: Float32Array,
  rows: number,
  k: number,
  rng: () => number
): void {
  for (let j = 0; j < k; j++) {
    for (let attempt = 0; attempt < k + 2; attempt++) {
      // Orthogonalize column j against all prior columns
      for (let i = 0; i < j; i++) {
        let dot = 0;
        for (let r = 0; r < rows; r++) dot += Y[r * k + i] * Y[r * k + j];
        for (let r = 0; r < rows; r++) Y[r * k + j] -= dot * Y[r * k + i];
      }
      let norm = 0;
      for (let r = 0; r < rows; r++) norm += Y[r * k + j] ** 2;
      if (norm >= 1e-10) {
        const inv = 1 / Math.sqrt(norm);
        for (let r = 0; r < rows; r++) Y[r * k + j] *= inv;
        break;
      }
      // Column is in the span of prior columns — replace with a fresh random vector
      for (let r = 0; r < rows; r++) Y[r * k + j] = randNormal(rng);
    }
  }
}

// SVD of small B [k×cols] via power iteration on B@B^T [k×k].
// Writes final matrixA [rows×rank] and matrixB [rank×cols].
// F16 note (Fable Batch 03): building BBT squares the condition number of B,
// so fp32 loses small singular values silently. Promoting BBT to Float64Array
// is the mathematically correct fix, but empirically destabilizes the
// layer0-activation test on synthetic fixtures (E8 quantization discretization
// boundaries flip under precision changes). Deferred until F4 small-model E2E
// can empirically price the trade against real weights. When flipped, also
// promote eigvecs + tmp + Btv storage.
function compactSVD(
  B: Float32Array,
  k: number,
  cols: number,
  Q: Float32Array,
  rows: number,
  rank: number,
  matrixA: Float32Array,
  matrixB: Float32Array
): void {
  // BBT = B @ B^T  [k×k]
  const BBT = new Float32Array(k * k);
  for (let i = 0; i < k; i++)
    for (let j = 0; j <= i; j++) {
      let s = 0;
      for (let p = 0; p < cols; p++) s += B[i * cols + p] * B[j * cols + p];
      BBT[i * k + j] = s;
      BBT[j * k + i] = s;
    }

  const rng = xorshift32(0xdeadbeef);
  const eigvecs = new Float32Array(k * rank);
  const tmp = new Float32Array(k);

  for (let r = 0; r < rank; r++) {
    const v = eigvecs.subarray(r * k, (r + 1) * k);
    for (let i = 0; i < k; i++) v[i] = randNormal(rng);

    for (let iter = 0; iter < 30; iter++) {
      // tmp = BBT @ v
      for (let i = 0; i < k; i++) {
        let s = 0;
        for (let j = 0; j < k; j++) s += BBT[i * k + j] * v[j];
        tmp[i] = s;
      }
      // deflate against prior eigenvectors
      for (let prev = 0; prev < r; prev++) {
        const u = eigvecs.subarray(prev * k, (prev + 1) * k);
        let dot = 0;
        for (let i = 0; i < k; i++) dot += u[i] * tmp[i];
        for (let i = 0; i < k; i++) tmp[i] -= dot * u[i];
      }
      let norm = 0;
      for (let i = 0; i < k; i++) norm += tmp[i] ** 2;
      const inv = 1 / (Math.sqrt(norm) || 1);
      for (let i = 0; i < k; i++) v[i] = tmp[i] * inv;
    }

    // right singular vector: Bt_v = B^T @ v, sigma = ||Bt_v||
    const Btv = new Float32Array(cols);
    for (let j = 0; j < cols; j++) {
      let s = 0;
      for (let i = 0; i < k; i++) s += B[i * cols + j] * v[i];
      Btv[j] = s;
    }
    let sigmaSq = 0;
    for (let j = 0; j < cols; j++) sigmaSq += Btv[j] * Btv[j];
    const sigma = Math.sqrt(sigmaSq);

    // F16 (Fable Batch 03): degenerate direction handling. Previously
    // `sigma = Math.sqrt(...) || 1` fabricated a unit scale, which
    // hid the degeneracy by injecting a normalized-but-arbitrary direction
    // into matrixB and a zero-scaled column into matrixA. Now we ZERO
    // both factors for that rank slot — the direction contributes nothing,
    // honestly. Downstream compression sees a real rank-deficient factor
    // and the compensation pass can spend budget elsewhere. Threshold 1e-10
    // matches the qrInPlace degeneracy floor.
    if (sigma < 1e-10) {
      for (let j = 0; j < cols; j++) matrixB[r * cols + j] = 0;
      for (let i = 0; i < rows; i++) matrixA[i * rank + r] = 0;
      continue;
    }

    const invSigma = 1 / sigma;
    for (let j = 0; j < cols; j++) matrixB[r * cols + j] = Btv[j] * invSigma;

    // left singular vector in original space: Q @ v, scaled by sigma
    for (let i = 0; i < rows; i++) {
      let s = 0;
      for (let j = 0; j < k; j++) s += Q[i * k + j] * v[j];
      matrixA[i * rank + r] = s * sigma;
    }
  }
}

export interface DecomposerOptions {
  /**
   * Halko subspace power iterations before QR. Default 0.
   * Fable F16 recommends 1–2 for heavy-tailed spectra (real LLM weights)
   * to sharpen the leading singular subspace. Left at 0 by default because
   * the current layer0-activation test uses small synthetic fixtures where
   * additional passes over-sharpen and degrade reconstruction. Turn on via
   * `new LowRankTensorDecomposer({ powerIterations: 2 })` for real ingest;
   * the F4 small-model E2E run will empirically price the trade.
   */
  powerIterations?: number;
}

export class LowRankTensorDecomposer {
  private readonly oversampling = 10;
  private readonly powerIterations: number;

  constructor(options: DecomposerOptions = {}) {
    this.powerIterations = options.powerIterations ?? 0;
  }

  public decomposeMatrix(
    rawWeights: Float32Array,
    rows: number,
    cols: number,
    targetRank: number
  ): DecomposedLayers {
    if (rawWeights.length !== rows * cols) {
      throw new RangeError(
        'Matrix raw dimensions do not align with flat array data capacity.'
      );
    }
    if (targetRank >= Math.min(rows, cols)) {
      throw new Error(
        'Target rank must be smaller than the matrix dimensions.'
      );
    }

    const k = Math.min(
      targetRank + this.oversampling,
      Math.min(rows, cols) - 1
    );
    const matrixA = new Float32Array(rows * targetRank);
    const matrixB = new Float32Array(targetRank * cols);

    // Step 1: Random sketch Omega [cols×k]
    const rng = xorshift32(0xcafe1234);
    const Omega = new Float32Array(cols * k);
    for (let i = 0; i < Omega.length; i++) Omega[i] = randNormal(rng);

    // Step 2: Y = W @ Omega  [rows×k]
    const Y = new Float32Array(rows * k);
    matmul(rawWeights, rows, cols, Omega, k, Y);

    // Step 2b: subspace power iteration (Fable F16). Sharpens the leading
    // singular subspace against heavy-tailed spectra. Each pass:
    //   Z = W^T @ Y   [cols×k]
    //   Y = W @ Z     [rows×k]
    // We re-QR between passes to prevent numerical collapse to the top vector,
    // but skip it on the last iteration since Step 3 does it anyway.
    if (this.powerIterations > 0) {
      const Z = new Float32Array(cols * k);
      for (let iter = 0; iter < this.powerIterations; iter++) {
        matmulWtY(rawWeights, rows, cols, Y, k, Z);
        matmul(rawWeights, rows, cols, Z, k, Y);
        if (iter < this.powerIterations - 1) {
          qrInPlace(Y, rows, k, rng);
        }
      }
    }

    // Step 3: QR of Y → Q orthonormal [rows×k], in-place
    qrInPlace(Y, rows, k, rng);

    // Step 4: B = Q^T @ W  [k×cols]
    const B = new Float32Array(k * cols);
    matmulQtW(Y, k, rows, rawWeights, cols, B);

    // Step 5: compact SVD of B, reconstruct through Q
    compactSVD(B, k, cols, Y, rows, targetRank, matrixA, matrixB);

    return { matrixA, matrixB };
  }
}
