// src/ai/engine-titan/kvarn.ts
//
// KVarN — Dual-axis Variance Normalization for KV-cache compression.
//
// Given a KV-cache tensor K of shape [tokens × channels], attention scores are
// dominated by a few high-variance rows (tokens) and a few high-variance
// columns (channels). Naive per-tensor scaling wastes bits on those extremes.
//
// KVarN normalizes each entry by the geometric coupling of its row and column
// standard deviations:
//
//     K_normalized[i, j] = K[i, j] / (σ_token[i] · σ_channel[j])
//
// After normalization the tensor is approximately unit-variance in both axes,
// so ternary/low-bit quantization spends bits uniformly. To reconstruct,
// multiply back by the same σ pair — both sigma vectors are stored.
//
// This is a math module: it does NOT touch the runtime KV cache. Callers wire
// it into the KV-cache compressor when that infrastructure lands.

export interface KVarNMeta {
  readonly rows: number;
  readonly cols: number;
  readonly sigmaRow: Float32Array; // length = rows
  readonly sigmaCol: Float32Array; // length = cols
  readonly epsilon: number;
}

const DEFAULT_EPSILON = 1e-6;

/**
 * Computes σ_row[i] = sqrt(mean_j K[i,j]²) and σ_col[j] = sqrt(mean_i K[i,j]²).
 * We use RMS (not std with mean subtraction) because attention math is
 * translation-sensitive and KV entries carry meaningful sign+magnitude.
 */
function computeSigmas(
  kv: Float32Array,
  rows: number,
  cols: number,
  epsilon: number
): { sigmaRow: Float32Array; sigmaCol: Float32Array } {
  const sigmaRow = new Float32Array(rows);
  const sigmaCol = new Float32Array(cols);
  const rowSumSq = new Float64Array(rows);
  const colSumSq = new Float64Array(cols);

  for (let i = 0; i < rows; i++) {
    const base = i * cols;
    for (let j = 0; j < cols; j++) {
      const v = kv[base + j];
      const sq = isFinite(v) ? v * v : 0;
      rowSumSq[i] += sq;
      colSumSq[j] += sq;
    }
  }

  for (let i = 0; i < rows; i++)
    sigmaRow[i] = Math.sqrt(rowSumSq[i] / cols) + epsilon;
  for (let j = 0; j < cols; j++)
    sigmaCol[j] = Math.sqrt(colSumSq[j] / rows) + epsilon;

  return { sigmaRow, sigmaCol };
}

export function applyKVarN(
  kv: Float32Array,
  rows: number,
  cols: number,
  epsilon: number = DEFAULT_EPSILON
): { normalized: Float32Array; meta: KVarNMeta } {
  if (kv.length !== rows * cols) {
    throw new RangeError(`kv length ${kv.length} != rows*cols ${rows * cols}`);
  }

  const { sigmaRow, sigmaCol } = computeSigmas(kv, rows, cols, epsilon);
  const normalized = new Float32Array(rows * cols);

  for (let i = 0; i < rows; i++) {
    const sr = sigmaRow[i];
    const base = i * cols;
    for (let j = 0; j < cols; j++) {
      normalized[base + j] = kv[base + j] / (sr * sigmaCol[j]);
    }
  }

  return {
    normalized,
    meta: { rows, cols, sigmaRow, sigmaCol, epsilon },
  };
}

export function inverseKVarN(
  normalized: Float32Array,
  meta: KVarNMeta
): Float32Array {
  const { rows, cols, sigmaRow, sigmaCol } = meta;
  if (normalized.length !== rows * cols) {
    throw new RangeError(
      `normalized length ${normalized.length} != rows*cols ${rows * cols}`
    );
  }
  const recovered = new Float32Array(rows * cols);
  for (let i = 0; i < rows; i++) {
    const sr = sigmaRow[i];
    const base = i * cols;
    for (let j = 0; j < cols; j++) {
      recovered[base + j] = normalized[base + j] * (sr * sigmaCol[j]);
    }
  }
  return recovered;
}
