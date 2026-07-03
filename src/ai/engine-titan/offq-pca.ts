// src/ai/engine-titan/offq-pca.ts
//
// OffQ — Taming Structured Outliers via Top-1 PCA Concentration + Hadamard Absorption.
//
// Problem: LLM activations have extreme structured outliers in specific channels
// (post-LayerNorm, before self-attention). These outliers are orders of magnitude
// larger than median values and appear reliably across all sequences/tokens.
//
// If you force these into a uniform low-bit grid, the global scale parameter s
// inflates to cover the outlier, collapsing all normal activations to zero.
//
// Solution (OffQ):
// Step 1: Top-1 PCA rotation — concentrate ALL outlier energy into channel 0.
// Step 2: Hadamard rotation — smears channel 0's energy as a flat x_0/√D offset
//         across all D channels. The network's bias term absorbs this constant.
//
// After OffQ, activations are approximately uniform-variance and safe for
// standard W4A4 (4-bit weight, 4-bit activation) quantization.

export interface OffQState {
  readonly pca1Direction: Float32Array; // unit vector (length = channels)
  readonly channelCount: number;
}

export interface OffQResult {
  readonly transformed: Float32Array; // [tokens × channels], outlier-free
  readonly state: OffQState;
}

/**
 * Computes the Top-1 principal component of activation tensor X [tokens × channels].
 * Uses power iteration (5-10 iterations converges for dominant eigenvalue).
 *
 * The first PC captures the outlier subspace because outlier channels
 * dominate variance by orders of magnitude.
 */
function computeTop1PC(
  X: Float32Array,
  tokens: number,
  channels: number,
  iterations: number = 10
): Float32Array {
  // Initialize with random unit vector
  const pc = new Float32Array(channels);
  for (let j = 0; j < channels; j++) pc[j] = Math.random() - 0.5;
  normalize(pc);

  // Power iteration: v ← X^T X v / ||X^T X v||
  const temp = new Float32Array(tokens);
  const result = new Float32Array(channels);

  for (let iter = 0; iter < iterations; iter++) {
    // temp = X × pc (tokens-length vector)
    for (let i = 0; i < tokens; i++) {
      let dot = 0;
      const base = i * channels;
      for (let j = 0; j < channels; j++) {
        dot += X[base + j] * pc[j];
      }
      temp[i] = dot;
    }

    // result = X^T × temp (channels-length vector)
    result.fill(0);
    for (let i = 0; i < tokens; i++) {
      const base = i * channels;
      const t = temp[i];
      for (let j = 0; j < channels; j++) {
        result[j] += X[base + j] * t;
      }
    }

    // Normalize
    pc.set(result);
    normalize(pc);
  }

  return pc;
}

function normalize(v: Float32Array): void {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  if (norm < 1e-10) return;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
}

/**
 * Step 1: Project outlier energy onto the top-1 PC direction,
 * then rotate the tensor so that ALL outlier variance lands in channel 0.
 *
 * Mathematically: X_rot = X × R where R is an orthogonal matrix whose
 * first column is the top-1 PC. We use Householder reflection for efficiency:
 * R = I - 2vv^T where v = normalize(pc - e_0).
 */
function rotateToChannel0(
  X: Float32Array,
  tokens: number,
  channels: number,
  pc: Float32Array
): Float32Array {
  // Householder vector: maps pc direction onto e_0 = [1,0,0,...,0]
  const v = new Float32Array(channels);
  v.set(pc);
  v[0] -= 1.0;
  const vNorm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));

  const rotated = new Float32Array(tokens * channels);

  if (vNorm < 1e-10) {
    // pc is already aligned with e_0, no rotation needed
    rotated.set(X);
    return rotated;
  }

  // Normalize v
  for (let j = 0; j < channels; j++) v[j] /= vNorm;

  // Apply Householder: x_rot = x - 2(v·x)v for each token
  for (let i = 0; i < tokens; i++) {
    const base = i * channels;
    let dot = 0;
    for (let j = 0; j < channels; j++) {
      dot += X[base + j] * v[j];
    }
    const scale = 2 * dot;
    for (let j = 0; j < channels; j++) {
      rotated[base + j] = X[base + j] - scale * v[j];
    }
  }

  return rotated;
}

/**
 * Step 2: Apply normalized Hadamard transform across channels.
 * After rotation, channel 0 holds the concentrated outlier energy.
 * Hadamard smears it uniformly: x_0/√D appears as a constant offset in every channel.
 * The network's bias absorbs this constant offset.
 *
 * Uses Walsh-Hadamard butterfly (in-place, O(D log D)).
 * Pads to next power of 2 if needed.
 */
function applyHadamard(
  X: Float32Array,
  tokens: number,
  channels: number
): Float32Array {
  // Pad channels to next power of 2
  let D = 1;
  while (D < channels) D <<= 1;

  const result = new Float32Array(tokens * D);

  // Copy with potential padding
  for (let i = 0; i < tokens; i++) {
    for (let j = 0; j < channels; j++) {
      result[i * D + j] = X[i * channels + j];
    }
  }

  // Butterfly Hadamard on each token's channel vector
  const invSqrtD = 1.0 / Math.sqrt(D);
  for (let i = 0; i < tokens; i++) {
    const base = i * D;
    for (let len = 1; len < D; len <<= 1) {
      for (let k = 0; k < D; k += len << 1) {
        for (let m = 0; m < len; m++) {
          const a = result[base + k + m];
          const b = result[base + k + m + len];
          result[base + k + m] = a + b;
          result[base + k + m + len] = a - b;
        }
      }
    }
    // Normalize
    for (let j = 0; j < D; j++) {
      result[base + j] *= invSqrtD;
    }
  }

  // Trim back to original channels if padded
  if (D === channels) return result;
  const trimmed = new Float32Array(tokens * channels);
  for (let i = 0; i < tokens; i++) {
    for (let j = 0; j < channels; j++) {
      trimmed[i * channels + j] = result[i * D + j];
    }
  }
  return trimmed;
}

/**
 * Full OffQ pipeline: PCA concentration → Hadamard absorption.
 *
 * Input: X [tokens × channels] — raw activations with structured outliers
 * Output: transformed tensor (outlier-free, safe for uniform quantization) + state for inverse
 */
export function applyOffQ(
  X: Float32Array,
  tokens: number,
  channels: number
): OffQResult {
  if (X.length !== tokens * channels) {
    throw new RangeError(
      `X length ${X.length} != tokens*channels ${tokens * channels}`
    );
  }

  // Step 1: Find dominant outlier direction
  const pc = computeTop1PC(X, tokens, channels);

  // Step 2: Rotate so outlier energy is in channel 0
  const rotated = rotateToChannel0(X, tokens, channels, pc);

  // Step 3: Hadamard smears channel 0 across all channels
  const transformed = applyHadamard(rotated, tokens, channels);

  return {
    transformed,
    state: { pca1Direction: pc, channelCount: channels },
  };
}

/**
 * Apply OffQ forward using a pre-computed PCA state.
 * Use this at inference time when the outlier direction is already known
 * (structural outliers are fixed per-layer, independent of input tokens).
 */
export function applyOffQForward(
  X: Float32Array,
  tokens: number,
  state: OffQState
): Float32Array {
  const { pca1Direction: pc, channelCount: channels } = state;
  if (X.length !== tokens * channels) {
    throw new RangeError(
      `X length ${X.length} != tokens*channels ${tokens * channels}`
    );
  }
  const rotated = rotateToChannel0(X, tokens, channels, pc);
  return applyHadamard(rotated, tokens, channels);
}

/**
 * Inverse OffQ: Hadamard (self-inverse) → reverse Householder rotation.
 */
export function inverseOffQ(
  transformed: Float32Array,
  tokens: number,
  state: OffQState
): Float32Array {
  const { pca1Direction: pc, channelCount: channels } = state;

  // Inverse Hadamard (Hadamard is self-inverse up to normalization)
  const afterHadamard = applyHadamard(transformed, tokens, channels);

  // Inverse Householder (Householder is self-inverse: H² = I)
  const recovered = rotateToChannel0(afterHadamard, tokens, channels, pc);

  return recovered;
}

/**
 * Measures how concentrated the outlier energy is after OffQ.
 * Returns ratio of max channel variance to mean channel variance.
 * Before OffQ this ratio is huge (100x+); after it should be near 1.
 */
export function measureOutlierConcentration(
  X: Float32Array,
  tokens: number,
  channels: number
): { maxToMeanRatio: number; maxChannel: number } {
  const channelVar = new Float32Array(channels);

  for (let j = 0; j < channels; j++) {
    let sumSq = 0;
    for (let i = 0; i < tokens; i++) {
      const v = X[i * channels + j];
      sumSq += v * v;
    }
    channelVar[j] = sumSq / tokens;
  }

  let maxVar = 0;
  let maxCh = 0;
  let sumVar = 0;
  for (let j = 0; j < channels; j++) {
    sumVar += channelVar[j];
    if (channelVar[j] > maxVar) {
      maxVar = channelVar[j];
      maxCh = j;
    }
  }
  const meanVar = sumVar / channels;

  return { maxToMeanRatio: maxVar / meanVar, maxChannel: maxCh };
}
