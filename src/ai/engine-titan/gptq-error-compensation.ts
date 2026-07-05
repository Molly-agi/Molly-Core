// Copyright (c) 2026 Molly Labs Inc. Licensed under AGPL-3.0.
// src/ai/engine-titan/gptq-error-compensation.ts
//
// GPTQ-style layer-wise error compensation for Titan Engine.
//
// During compression, quantization error in layer L propagates to all downstream
// layers. Without compensation, these errors accumulate and the model hallucinates.
//
// This module implements the core GPTQ insight: after compressing each layer,
// measure the output error on calibration data, then adjust the NEXT layer's
// weights to absorb that error — so downstream layers see corrected inputs.
//
// Algorithm:
//   For each layer L (sequentially, layer 0 to N-1):
//     1. Run calibration samples through layers 0..L to get input activations X_L
//     2. Compress layer L weights: W_L → W_L_compressed
//     3. Compute output error: E_L = (W_L - W_L_compressed) @ X_L
//     4. Compute correction for layer L+1: δW_{L+1} = E_L @ X_L^T @ (X_L @ X_L^T)^{-1}
//     5. Apply: W_{L+1} += δW_{L+1} (absorbed before L+1 is compressed)
//
// This is O(N) sequential passes (cannot be parallelized across layers).

export interface CompensationConfig {
  /** Number of calibration samples (rows of activation matrix) */
  numSamples: number;
  /** Hidden dimension of the model */
  hiddenDim: number;
  /** Regularization for pseudo-inverse (prevents numerical instability) */
  lambda?: number;
  /** Maximum correction magnitude (clamp to prevent overcorrection) */
  maxCorrectionNorm?: number;
}

export interface CompensationResult {
  /** Correction matrix to add to next layer's weights [outDim x inDim] */
  correction: Float32Array;
  /** Mean squared error before compensation */
  mseBefore: number;
  /** Mean squared error after compensation (on calibration data) */
  mseAfter: number;
  /** Frobenius norm of the correction (how much we adjusted) */
  correctionNorm: number;
}

/**
 * Compute the error compensation correction for the next layer.
 *
 * Given:
 *   - originalOutput: W_original @ X  [outDim x numSamples]
 *   - compressedOutput: W_compressed @ X  [outDim x numSamples]
 *   - nextLayerInput: X (the input activations) [inDim x numSamples]
 *
 * Returns a correction matrix that, when added to the next layer's weights,
 * minimizes the propagated error on the calibration data.
 */
export function computeLayerCompensation(
  originalOutput: Float32Array,
  compressedOutput: Float32Array,
  calibrationInput: Float32Array,
  outDim: number,
  inDim: number,
  numSamples: number,
  config?: Partial<CompensationConfig>
): CompensationResult {
  const lambda = config?.lambda ?? 1e-4;
  const maxNorm = config?.maxCorrectionNorm ?? 10.0;

  // Step 1: Compute error matrix E = original - compressed [outDim x numSamples]
  const error = new Float32Array(outDim * numSamples);
  let mseBefore = 0;
  for (let i = 0; i < error.length; i++) {
    error[i] = originalOutput[i] - compressedOutput[i];
    mseBefore += error[i] * error[i];
  }
  mseBefore /= error.length;

  // Step 2: Compute X @ X^T [inDim x inDim] (Gram matrix of inputs)
  const gram = new Float32Array(inDim * inDim);
  for (let i = 0; i < inDim; i++) {
    for (let j = 0; j <= i; j++) {
      let dot = 0;
      for (let s = 0; s < numSamples; s++) {
        dot += calibrationInput[i * numSamples + s] * calibrationInput[j * numSamples + s];
      }
      gram[i * inDim + j] = dot;
      gram[j * inDim + i] = dot; // symmetric
    }
    // Tikhonov regularization: add lambda * I to diagonal
    gram[i * inDim + i] += lambda * numSamples;
  }

  // Step 3: Solve for correction via Cholesky-like approach
  // Correction = E @ X^T @ (X @ X^T + λI)^{-1}
  // Simplified: correction[i][j] = sum_s(error[i][s] * input[j][s]) / gram_diag_approx
  // For production: use proper pseudo-inverse. For scaffold: diagonal approximation.
  
  // E @ X^T [outDim x inDim]
  const eXt = new Float32Array(outDim * inDim);
  for (let i = 0; i < outDim; i++) {
    for (let j = 0; j < inDim; j++) {
      let dot = 0;
      for (let s = 0; s < numSamples; s++) {
        dot += error[i * numSamples + s] * calibrationInput[j * numSamples + s];
      }
      eXt[i * inDim + j] = dot;
    }
  }

  // Diagonal approximation of (X @ X^T)^{-1} — fast and stable
  // Full inverse would be O(inDim^3); diagonal is O(inDim)
  const correction = new Float32Array(outDim * inDim);
  for (let i = 0; i < outDim; i++) {
    for (let j = 0; j < inDim; j++) {
      const gramDiag = gram[j * inDim + j]; // diagonal element
      correction[i * inDim + j] = gramDiag > 1e-10 ? eXt[i * inDim + j] / gramDiag : 0;
    }
  }

  // Step 4: Clamp correction norm to prevent overcorrection
  let corrNorm = 0;
  for (let i = 0; i < correction.length; i++) corrNorm += correction[i] * correction[i];
  corrNorm = Math.sqrt(corrNorm);

  if (corrNorm > maxNorm) {
    const scale = maxNorm / corrNorm;
    for (let i = 0; i < correction.length; i++) correction[i] *= scale;
    corrNorm = maxNorm;
  }

  // Step 5: Compute MSE after correction (simulated)
  let mseAfter = 0;
  for (let i = 0; i < outDim; i++) {
    for (let s = 0; s < numSamples; s++) {
      // Residual after correction: error[i][s] - correction[i][:] @ input[:][s]
      let corrected = error[i * numSamples + s];
      for (let j = 0; j < inDim; j++) {
        corrected -= correction[i * inDim + j] * calibrationInput[j * numSamples + s];
      }
      mseAfter += corrected * corrected;
    }
  }
  mseAfter /= (outDim * numSamples);

  return { correction, mseBefore, mseAfter, correctionNorm: corrNorm };
}

/**
 * Apply a correction matrix to weights in-place.
 * weights[outDim x inDim] += correction[outDim x inDim]
 */
export function applyCorrection(
  weights: Float32Array,
  correction: Float32Array
): void {
  if (weights.length !== correction.length) {
    throw new RangeError(`Weight/correction dimension mismatch: ${weights.length} vs ${correction.length}`);
  }
  for (let i = 0; i < weights.length; i++) {
    weights[i] += correction[i];
  }
}

/**
 * Run the full sequential compensation pass across all layers.
 * This is the orchestrator that drives compress → measure → correct → next.
 */
export interface SequentialCompensationOptions {
  numLayers: number;
  hiddenDim: number;
  calibrationSamples: Float32Array[]; // [numSamples] each of length hiddenDim
  compressLayer: (layerIdx: number, inputActivations: Float32Array) => {
    originalOutput: Float32Array;
    compressedOutput: Float32Array;
  };
  getNextLayerWeights: (layerIdx: number) => Float32Array;
  setNextLayerWeights: (layerIdx: number, weights: Float32Array) => void;
  onLayerDone?: (layerIdx: number, result: CompensationResult) => void;
}

export function runSequentialCompensation(opts: SequentialCompensationOptions): {
  totalMseBefore: number;
  totalMseAfter: number;
  layerResults: CompensationResult[];
} {
  const { numLayers, hiddenDim, calibrationSamples, compressLayer, getNextLayerWeights, setNextLayerWeights, onLayerDone } = opts;
  const numSamples = calibrationSamples.length;
  const layerResults: CompensationResult[] = [];
  let totalMseBefore = 0, totalMseAfter = 0;

  // Build calibration matrix [hiddenDim x numSamples] column-major
  const calibMatrix = new Float32Array(hiddenDim * numSamples);
  for (let s = 0; s < numSamples; s++) {
    for (let d = 0; d < hiddenDim; d++) {
      calibMatrix[d * numSamples + s] = calibrationSamples[s][d];
    }
  }

  for (let l = 0; l < numLayers - 1; l++) {
    // Compress layer L and get original vs compressed outputs
    const { originalOutput, compressedOutput } = compressLayer(l, calibMatrix);
    const outDim = originalOutput.length / numSamples;

    // Compute compensation for layer L+1
    const result = computeLayerCompensation(
      originalOutput, compressedOutput, calibMatrix,
      outDim, hiddenDim, numSamples
    );

    layerResults.push(result);
    totalMseBefore += result.mseBefore;
    totalMseAfter += result.mseAfter;
    onLayerDone?.(l, result);

    // Apply correction to next layer's weights
    if (result.correctionNorm > 1e-8) {
      const nextWeights = getNextLayerWeights(l + 1);
      applyCorrection(nextWeights, result.correction);
      setNextLayerWeights(l + 1, nextWeights);
    }

    // Update calibration matrix with compressed layer's output for next iteration
    // (downstream layers see the compressed output, not the original)
    const newCalib = new Float32Array(outDim * numSamples);
    for (let i = 0; i < compressedOutput.length; i++) newCalib[i] = compressedOutput[i];
    // If outDim matches hiddenDim, update in place; otherwise this layer changes dimension
    if (outDim === hiddenDim) {
      calibMatrix.set(newCalib);
    }
  }

  return { totalMseBefore, totalMseAfter, layerResults };
}
