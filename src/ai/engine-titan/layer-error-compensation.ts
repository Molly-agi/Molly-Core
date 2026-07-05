// Copyright (c) 2026 Molly Labs Inc. Licensed under AGPL-3.0.
// src/ai/engine-titan/layer-error-compensation.ts
//
// GPTQ-style layer-wise error compensation for Titan Engine.
//
// Key insight: B [targetRank × cols] receives input z = X @ A, shape [batch × targetRank].
// The Hessian H = z^T @ z is only [targetRank × targetRank] — at most 256×256, trivial.
// We iterate over rows of B (targetRank iterations), quantize each row with E8,
// then redistribute error to remaining rows via H^{-1}.
//
// End-to-end accumulated-error behavior across a full transformer stack has NOT
// been measured on real weights + real activations — the production feeder in
// streaming-compress.ts currently supplies token IDs where per-layer activations
// are required (see FABLE finding 02a-#2). Wire real activation capture through
// the sequential-mode helpers below before quoting any error-accumulation number.

import {
  quantizeE8,
  dequantizeE8,
  type E8QuantizedLayer,
  type E8QuantizedGroup,
} from './e8-lattice';

export interface CompensationConfig {
  dampingFactor: number; // fraction of mean(diag(H)) to add; default 0.01
  blockSize: number; // rows to process per GPTQ block; default 1 (row-by-row)
  sigmaDelta: boolean; // enable E8 sigma-delta within each row; default true
  optimalScale: boolean; // enable multi-scale E8 search; default true
  maxRows: number; // max rows to compensate (if targetRank > this, cap); default 512
}

export interface CompensationResult {
  quantizedB: E8QuantizedLayer;
  errorStats: {
    preCompensationMSE: number;
    postCompensationMSE: number;
    improvementRatio: number;
    maxRowError: number;
  };
}

export interface LayerActivations {
  activations: Float32Array; // [numTokens × inputDim], row-major
  numTokens: number;
  inputDim: number;
}

const DEFAULT_CONFIG: CompensationConfig = {
  dampingFactor: 0.01,
  blockSize: 1,
  sigmaDelta: true,
  optimalScale: true,
  maxRows: 512,
};

/**
 * Computes the Hessian proxy H = X^T @ X for input activations X.
 * Result is [inputDim × inputDim] symmetric positive semi-definite.
 */
export function computeHessian(
  activations: Float32Array,
  numTokens: number,
  inputDim: number
): Float64Array {
  const H = new Float64Array(inputDim * inputDim);

  for (let t = 0; t < numTokens; t++) {
    const rowOffset = t * inputDim;
    for (let i = 0; i < inputDim; i++) {
      const xi = activations[rowOffset + i];
      for (let j = i; j < inputDim; j++) {
        const val = xi * activations[rowOffset + j];
        H[i * inputDim + j] += val;
        if (i !== j) H[j * inputDim + i] += val;
      }
    }
  }

  return H;
}

/**
 * Adds damping to Hessian diagonal for numerical stability.
 * λ = dampingFactor × mean(diag(H))
 */
function addDamping(H: Float64Array, dim: number, dampingFactor: number): void {
  let diagSum = 0;
  for (let i = 0; i < dim; i++) diagSum += H[i * dim + i];
  const lambda = dampingFactor * (diagSum / dim);
  for (let i = 0; i < dim; i++) H[i * dim + i] += lambda;
}

/**
 * Inverts a symmetric positive-definite matrix via Cholesky decomposition.
 * In-place: overwrites H with H^{-1}.
 */
export function choleskyInverse(H: Float64Array, dim: number): boolean {
  const L = new Float64Array(dim * dim);

  // Cholesky L @ L^T = H
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = H[i * dim + j];
      for (let k = 0; k < j; k++) {
        sum -= L[i * dim + k] * L[j * dim + k];
      }
      if (i === j) {
        if (sum <= 0) return false;
        L[i * dim + j] = Math.sqrt(sum);
      } else {
        L[i * dim + j] = sum / L[j * dim + j];
      }
    }
  }

  // Invert L (lower triangular)
  const Linv = new Float64Array(dim * dim);
  for (let i = 0; i < dim; i++) {
    Linv[i * dim + i] = 1.0 / L[i * dim + i];
    for (let j = i + 1; j < dim; j++) {
      let sum = 0;
      for (let k = i; k < j; k++) {
        sum -= L[j * dim + k] * Linv[k * dim + i];
      }
      Linv[j * dim + i] = sum / L[j * dim + j];
    }
  }

  // H^{-1} = L^{-T} @ L^{-1}
  for (let i = 0; i < dim; i++) {
    for (let j = i; j < dim; j++) {
      let sum = 0;
      for (let k = j; k < dim; k++) {
        sum += Linv[k * dim + i] * Linv[k * dim + j];
      }
      H[i * dim + j] = sum;
      H[j * dim + i] = sum;
    }
  }

  return true;
}

/**
 * Collects activations for matrix B by multiplying calibration data through A.
 * z = X @ A, where X is [numTokens × hidden] and A is [hidden × targetRank].
 * Result z is [numTokens × targetRank].
 */
export function collectBActivations(
  calibrationActivations: Float32Array,
  numTokens: number,
  hiddenDim: number,
  matrixA: Float32Array,
  targetRank: number
): Float32Array {
  const z = new Float32Array(numTokens * targetRank);

  for (let t = 0; t < numTokens; t++) {
    const xOffset = t * hiddenDim;
    const zOffset = t * targetRank;
    for (let r = 0; r < targetRank; r++) {
      let sum = 0;
      for (let h = 0; h < hiddenDim; h++) {
        sum +=
          calibrationActivations[xOffset + h] * matrixA[h * targetRank + r];
      }
      z[zOffset + r] = sum;
    }
  }

  return z;
}

/**
 * GPTQ-compensated E8 quantization of matrix B.
 *
 * Algorithm:
 * 1. Compute H = z^T @ z where z = calibration activations projected through A
 * 2. Invert H (Cholesky — guaranteed PD after damping)
 * 3. Process rows of B one at a time (GPTQ order):
 *    a. Quantize entire row with E8 (sigma-delta handles within-row error)
 *    b. Compute per-element error δ_j = B[j,:] - dequant(quant(B[j,:]))
 *    c. For remaining rows m > j: B[m,:] -= (H_inv[j,m] / H_inv[j,j]) × δ_j
 * 4. Return quantized result with error statistics
 *
 * The Hessian is only [targetRank × targetRank] (max 256×256 = 512KB).
 * Each GPTQ iteration processes one row of cols elements.
 * Total iterations: targetRank (15-256). Very fast.
 */
export function compensatedQuantizeB(
  matrixB: Float32Array,
  targetRank: number,
  cols: number,
  layerActivations: LayerActivations,
  layerName: string,
  config: Partial<CompensationConfig> = {}
): CompensationResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Landmine 1 guard: silent B amputation.
  // Old behavior clamped effectiveRank = min(targetRank, maxRows) and only
  // emitted groups for effectiveRank rows. Dequant then filled the remaining
  // rows with zeros — latent data-loss bug wearing a config option's clothes.
  // Fail loud instead. Callers who want partial compensation must set maxRows
  // explicitly and accept the truncation via an explicit API, not a silent one.
  if (targetRank > cfg.maxRows) {
    throw new RangeError(
      `compensatedQuantizeB: targetRank ${targetRank} exceeds maxRows ${cfg.maxRows}. ` +
        `Silent row truncation is a data-loss bug. Raise maxRows or reduce targetRank.`
    );
  }

  // Landmine 2 guard: per-row E8 grouping assumes cols is a multiple of 8.
  // Each row is E8-quantized independently with its own tail padding, but
  // dequantizeE8 indexes groups continuously across the flat output array.
  // Non-multiple-of-8 cols would misalign every row after the first.
  // Production survives only because RHT pads cols to next-pow-2 (always ≥8
  // and always divisible by 8) — make the assumption explicit for future callers.
  if (cols % 8 !== 0) {
    throw new RangeError(
      `compensatedQuantizeB: cols ${cols} must be a multiple of 8 for per-row E8 grouping. ` +
        `Apply RHT padding upstream (streaming-compress.ts already does this) before calling.`
    );
  }

  const effectiveRank = Math.min(targetRank, cfg.maxRows);

  // 1. Compute Hessian H = z^T @ z [targetRank × targetRank]
  const H = computeHessian(
    layerActivations.activations,
    layerActivations.numTokens,
    layerActivations.inputDim
  );

  // 2. Damping + Cholesky inverse
  addDamping(H, effectiveRank, cfg.dampingFactor);
  const invOk = choleskyInverse(H, effectiveRank);

  if (!invOk) {
    // Fallback: quantize without compensation (still uses sigma-delta)
    const fallback = quantizeE8(matrixB, layerName, targetRank, cols, {
      sigmaDelta: cfg.sigmaDelta,
      optimalScale: cfg.optimalScale,
    });
    const fallbackRecon = dequantizeE8(fallback);
    const mse = computeMSE(matrixB, fallbackRecon);
    return {
      quantizedB: fallback,
      errorStats: {
        preCompensationMSE: mse,
        postCompensationMSE: mse,
        improvementRatio: 1.0,
        maxRowError: 0,
      },
    };
  }

  // H now contains H^{-1} [targetRank × targetRank]
  const Hinv = H;

  // Make a working copy of B (we'll modify it during compensation)
  const B = new Float32Array(matrixB);

  // Pre-compensation: quantize naively for comparison
  const naiveQuantized = quantizeE8(
    new Float32Array(matrixB),
    layerName,
    targetRank,
    cols,
    { sigmaDelta: cfg.sigmaDelta, optimalScale: cfg.optimalScale }
  );
  const naiveRecon = dequantizeE8(naiveQuantized);
  const preCompMSE = computeMSE(matrixB, naiveRecon);

  // 3. GPTQ row-wise compensation
  // Each row is independently E8-quantized. Per-row quantized results are assembled
  // into the final output (NOT re-quantized as a single pass, which would create
  // sigma-delta state mismatch across rows).
  const allRowGroups: E8QuantizedGroup[][] = new Array(effectiveRank);
  let maxRowError = 0;
  let totalBitsWeighted = 0;

  for (let j = 0; j < effectiveRank; j++) {
    const rowOffset = j * cols;
    const row = B.subarray(rowOffset, rowOffset + cols);

    // Quantize this single row using E8
    const rowQuantized = quantizeE8(
      new Float32Array(row),
      `${layerName}_row${j}`,
      1,
      cols,
      { sigmaDelta: cfg.sigmaDelta, optimalScale: cfg.optimalScale }
    );
    const rowRecon = dequantizeE8(rowQuantized);
    allRowGroups[j] = [...rowQuantized.groups];
    totalBitsWeighted += rowQuantized.bitsPerWeight;

    // Compute row error
    const delta = new Float32Array(cols);
    let rowMSE = 0;
    for (let k = 0; k < cols; k++) {
      delta[k] = row[k] - rowRecon[k];
      rowMSE += delta[k] * delta[k];
    }
    rowMSE /= cols;
    if (rowMSE > maxRowError) maxRowError = rowMSE;

    // Compensate remaining rows using H^{-1}
    const Hjj = Hinv[j * effectiveRank + j];
    if (Math.abs(Hjj) < 1e-12) continue;

    for (let m = j + 1; m < effectiveRank; m++) {
      const Hjm = Hinv[j * effectiveRank + m];
      const scale = Hjm / Hjj;
      const mOffset = m * cols;
      for (let k = 0; k < cols; k++) {
        B[mOffset + k] -= scale * delta[k];
      }
    }
  }

  // 4. Assemble final quantized layer from per-row results
  // This avoids sigma-delta state leaking across rows (which would happen with
  // a single-pass re-quantization and produce worse results than naive).
  const assembledGroups: E8QuantizedGroup[] = [];
  for (let j = 0; j < effectiveRank; j++) {
    for (const g of allRowGroups[j]) assembledGroups.push(g);
  }

  const compensatedQuantized: E8QuantizedLayer = {
    layerName,
    rows: targetRank,
    cols,
    groupCount: assembledGroups.length,
    groups: assembledGroups,
    bitsPerWeight: totalBitsWeighted / effectiveRank,
  };
  const compensatedRecon = dequantizeE8(compensatedQuantized);
  const postCompMSE = computeMSE(matrixB, compensatedRecon);

  return {
    quantizedB: compensatedQuantized,
    errorStats: {
      preCompensationMSE: preCompMSE,
      postCompensationMSE: postCompMSE,
      improvementRatio: preCompMSE > 0 ? preCompMSE / postCompMSE : 1.0,
      maxRowError,
    },
  };
}

/**
 * Sequential layer error compensation for the full model.
 * Processes layers in order (0..79), collecting post-quantization activations
 * from each layer to feed into the next, so that downstream layers adapt to
 * upstream quantization error.
 *
 * This function coordinates the full pipeline:
 * 1. Load calibration dataset (token IDs → embeddings → layer activations)
 * 2. For each layer sequentially:
 *    a. Collect real activations (using already-quantized upstream layers)
 *    b. Apply GPTQ-compensated E8 quantization to B
 *    c. Store compensated crystal
 *    d. Propagate activations through quantized layer for next iteration
 */
export interface SequentialCompensationConfig extends CompensationConfig {
  numCalibrationTokens: number; // how many tokens to use (subset of full dataset)
  onLayerComplete?: (event: LayerCompensationEvent) => void;
}

export interface LayerCompensationEvent {
  layerIndex: number;
  layerName: string;
  preCompMSE: number;
  postCompMSE: number;
  improvementRatio: number;
  cumulativeError: number;
}

export interface SequentialCompensationResult {
  layerResults: CompensationResult[];
  totalPreCompError: number;
  totalPostCompError: number;
  overallImprovement: number;
  meanBitsPerWeight: number;
}

/**
 * Propagates activations through a single quantized layer.
 * out = x @ A @ dequant(quantizedB)
 * Used to generate input activations for the next layer in sequential mode.
 */
export function propagateActivations(
  input: Float32Array,
  numTokens: number,
  hiddenDim: number,
  matrixA: Float32Array,
  targetRank: number,
  quantizedB: E8QuantizedLayer,
  cols: number
): Float32Array {
  const B_recon = dequantizeE8(quantizedB);
  const output = new Float32Array(numTokens * cols);

  for (let t = 0; t < numTokens; t++) {
    const xOff = t * hiddenDim;
    const outOff = t * cols;

    // z = x @ A [1 × targetRank]
    const z = new Float32Array(targetRank);
    for (let r = 0; r < targetRank; r++) {
      let sum = 0;
      for (let h = 0; h < hiddenDim; h++) {
        sum += input[xOff + h] * matrixA[h * targetRank + r];
      }
      z[r] = sum;
    }

    // out = z @ B [1 × cols]
    for (let c = 0; c < cols; c++) {
      let sum = 0;
      for (let r = 0; r < targetRank; r++) {
        sum += z[r] * B_recon[r * cols + c];
      }
      output[outOff + c] = sum;
    }
  }

  return output;
}

function computeMSE(
  original: Float32Array,
  reconstructed: Float32Array
): number {
  let sumSq = 0;
  const len = Math.min(original.length, reconstructed.length);
  for (let i = 0; i < len; i++) {
    const d = original[i] - reconstructed[i];
    sumSq += d * d;
  }
  return sumSq / len;
}

/**
 * Computes cosine similarity between two vectors.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0,
    normA = 0,
    normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Estimates total model error by running calibration through all layers
 * and comparing original vs quantized output activations.
 */
export function estimateModelError(
  originalOutputs: Float32Array,
  quantizedOutputs: Float32Array,
  numTokens: number,
  outputDim: number
): { mse: number; cosine: number; maxTokenError: number } {
  let totalMSE = 0;
  let maxTokenErr = 0;

  for (let t = 0; t < numTokens; t++) {
    const off = t * outputDim;
    const origSlice = originalOutputs.subarray(off, off + outputDim);
    const quantSlice = quantizedOutputs.subarray(off, off + outputDim);

    let tokenMSE = 0;
    for (let i = 0; i < outputDim; i++) {
      const d = origSlice[i] - quantSlice[i];
      tokenMSE += d * d;
    }
    tokenMSE /= outputDim;
    totalMSE += tokenMSE;
    if (tokenMSE > maxTokenErr) maxTokenErr = tokenMSE;
  }

  return {
    mse: totalMSE / numTokens,
    cosine: cosineSimilarity(originalOutputs, quantizedOutputs),
    maxTokenError: maxTokenErr,
  };
}
