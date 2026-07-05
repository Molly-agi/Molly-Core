// Copyright (c) 2026 Molly Labs Inc. Licensed under AGPL-3.0.
// src/ai/engine-titan/e8-lattice.ts
//
// E_8 Lattice Vector Quantizer for Titan Engine.
//
// The E_8 lattice is the densest sphere packing in 8 dimensions (kissing number
// 240). It minimizes quantization noise (Normalized Second Moment) optimally,
// making it the ideal codebook geometry for sub-3-bit weight compression.
//
// Construction: E_8 = D_8 ∪ (D_8 + ½) where:
//   D_8 = { x ∈ Z^8 : sum(x) ≡ 0 mod 2 }
//   The half-shift adds (½,½,½,½,½,½,½,½) to every D_8 point.
//
// Nearest-point algorithm (Conway-Sloane): O(8) per vector, exact.
// No codebook search required — we compute the nearest lattice point directly.

export interface E8QuantizedGroup {
  readonly scale: number;
  readonly coords: Int8Array; // 8 lattice coordinates per group
  readonly isHalfShift: boolean; // true = D_8 + ½ shell, false = D_8 shell
}

export interface E8QuantizedLayer {
  readonly layerName: string;
  readonly rows: number;
  readonly cols: number;
  readonly groupCount: number;
  readonly groups: E8QuantizedGroup[];
  readonly bitsPerWeight: number;
}

export interface E8PackedLayer {
  readonly layerName: string;
  readonly rows: number;
  readonly cols: number;
  readonly groupCount: number;
  readonly packedBuffer: Buffer;
  readonly bitsPerWeight: number;
}

/**
 * Finds the nearest D_8 lattice point to a given 8D vector.
 * D_8 = { x ∈ Z^8 : sum(x_i) is even }
 *
 * Algorithm:
 * 1. Round each coordinate to nearest integer
 * 2. If sum is odd, flip the coordinate with largest rounding error
 */
function nearestD8(x: Float64Array): { point: Float64Array; distSq: number } {
  const rounded = new Float64Array(8);
  const errors = new Float64Array(8);
  let sum = 0;
  let maxErrIdx = 0;
  let maxErr = -1;

  for (let i = 0; i < 8; i++) {
    rounded[i] = Math.round(x[i]);
    errors[i] = Math.abs(x[i] - rounded[i]);
    sum += rounded[i];
    if (errors[i] > maxErr) {
      maxErr = errors[i];
      maxErrIdx = i;
    }
  }

  // D_8 constraint: sum must be even
  if (sum % 2 !== 0) {
    // Flip the coordinate with largest rounding error
    if (x[maxErrIdx] > rounded[maxErrIdx]) {
      rounded[maxErrIdx] += 1;
    } else {
      rounded[maxErrIdx] -= 1;
    }
  }

  let distSq = 0;
  for (let i = 0; i < 8; i++) {
    const d = x[i] - rounded[i];
    distSq += d * d;
  }

  return { point: rounded, distSq };
}

/**
 * Finds the nearest D_8 + (½,...,½) lattice point.
 * These are points where all coordinates are half-integers with even sum.
 *
 * Algorithm: shift input by -½, find nearest D_8, shift result back by +½.
 */
function nearestD8Half(x: Float64Array): {
  point: Float64Array;
  distSq: number;
} {
  const shifted = new Float64Array(8);
  for (let i = 0; i < 8; i++) shifted[i] = x[i] - 0.5;

  const { point } = nearestD8(shifted);

  for (let i = 0; i < 8; i++) point[i] += 0.5;

  let distSq = 0;
  for (let i = 0; i < 8; i++) {
    const d = x[i] - point[i];
    distSq += d * d;
  }

  return { point, distSq };
}

/**
 * Finds the exact nearest E_8 lattice point using Conway-Sloane algorithm.
 * E_8 = D_8 ∪ (D_8 + ½) — take whichever candidate is closer.
 *
 * Time complexity: O(8) — constant per group of 8 weights.
 */
export function nearestE8(x: Float64Array): {
  point: Float64Array;
  distSq: number;
  isHalfShift: boolean;
} {
  if (x.length !== 8) {
    throw new RangeError(
      `E_8 nearest-point requires exactly 8 dimensions, got ${x.length}`
    );
  }

  const d8 = nearestD8(x);
  const d8h = nearestD8Half(x);

  if (d8.distSq <= d8h.distSq) {
    return { point: d8.point, distSq: d8.distSq, isHalfShift: false };
  }
  return { point: d8h.point, distSq: d8h.distSq, isHalfShift: true };
}

/**
 * Quantizes a weight vector using E_8 lattice geometry.
 *
 * Process:
 * 1. Split weights into groups of 8
 * 2. Per group: compute scale (RMS), normalize, find nearest E_8 point
 * 3. Store: scale + lattice coordinates + shell flag
 *
 * The scale captures magnitude; the lattice point captures direction
 * in the optimal sphere-packing geometry.
 */
export interface E8QuantizeOptions {
  sigmaDelta?: boolean;
  optimalScale?: boolean;
}

export function quantizeE8(
  weights: Float32Array,
  layerName: string,
  rows: number,
  cols: number,
  options?: E8QuantizeOptions
): E8QuantizedLayer {
  const useSigmaDelta = options?.sigmaDelta ?? false;
  const useOptimalScale = options?.optimalScale ?? true;
  const totalElements = weights.length;
  const padded =
    totalElements % 8 === 0
      ? totalElements
      : totalElements + (8 - (totalElements % 8));
  const groupCount = padded / 8;
  const groups: E8QuantizedGroup[] = new Array(groupCount);

  const vec = new Float64Array(8);
  const errorAccum = new Float64Array(8);
  const SCALE_CANDIDATES = [0.8, 0.9, 1.0, 1.1, 1.2];

  for (let g = 0; g < groupCount; g++) {
    const offset = g * 8;

    let sumSq = 0;
    for (let i = 0; i < 8; i++) {
      const idx = offset + i;
      const w = idx < totalElements ? weights[idx] : 0;
      const raw = isFinite(w) ? w : 0;
      vec[i] = useSigmaDelta ? raw + errorAccum[i] : raw;
      sumSq += vec[i] * vec[i];
    }

    const baseScale = Math.sqrt(sumSq / 8);

    if (baseScale < 1e-10) {
      groups[g] = {
        scale: 0,
        coords: new Int8Array(8),
        isHalfShift: false,
      };
      if (useSigmaDelta) {
        for (let i = 0; i < 8; i++) errorAccum[i] = vec[i];
      }
      continue;
    }

    let bestScale = baseScale;
    const bestCoords = new Int8Array(8);
    let bestHalf = false;
    let bestMse = Infinity;

    const candidates = useOptimalScale ? SCALE_CANDIDATES : [1.0];

    for (const mult of candidates) {
      const tryScale = baseScale * mult;
      const invS = 1.0 / tryScale;
      const normalized = new Float64Array(8);
      for (let i = 0; i < 8; i++) normalized[i] = vec[i] * invS;

      const { point, isHalfShift } = nearestE8(normalized);

      let mse = 0;
      for (let i = 0; i < 8; i++) {
        const recon = isHalfShift ? point[i] * tryScale : point[i] * tryScale;
        const diff = vec[i] - recon;
        mse += diff * diff;
      }

      if (mse < bestMse) {
        bestMse = mse;
        bestScale = tryScale;
        bestHalf = isHalfShift;
        if (isHalfShift) {
          for (let i = 0; i < 8; i++) bestCoords[i] = Math.round(point[i] * 2);
        } else {
          for (let i = 0; i < 8; i++) bestCoords[i] = Math.round(point[i]);
        }
      }
    }

    if (useSigmaDelta) {
      for (let i = 0; i < 8; i++) {
        const reconstructed = bestHalf
          ? (bestCoords[i] / 2) * bestScale
          : bestCoords[i] * bestScale;
        const idx = offset + i;
        const raw =
          idx < totalElements ? (isFinite(weights[idx]) ? weights[idx] : 0) : 0;
        errorAccum[i] = raw + errorAccum[i] - reconstructed;
      }
    }

    groups[g] = { scale: bestScale, coords: bestCoords, isHalfShift: bestHalf };
  }

  return {
    layerName,
    rows,
    cols,
    groupCount,
    groups,
    bitsPerWeight: computeEffectiveBits(groups),
  };
}

/**
 * Reconstructs weights from E_8 quantized representation.
 */
export function dequantizeE8(quantized: E8QuantizedLayer): Float32Array {
  const totalElements = quantized.rows * quantized.cols;
  const result = new Float32Array(totalElements);

  for (let g = 0; g < quantized.groupCount; g++) {
    const { scale, coords, isHalfShift } = quantized.groups[g];
    const offset = g * 8;

    for (let i = 0; i < 8; i++) {
      if (offset + i >= totalElements) break;
      let coordVal: number;
      if (isHalfShift) {
        coordVal = coords[i] / 2; // recover half-integer
      } else {
        coordVal = coords[i];
      }
      result[offset + i] = coordVal * scale;
    }
  }

  return result;
}

/**
 * Packs E_8 quantized layer into compact binary format.
 *
 * Per-group layout:
 *   [Float32LE scale (4 bytes)] [1 bit shell flag + 7 reserved (1 byte)] [8 × Int8 coords (8 bytes)]
 *   = 13 bytes per group of 8 weights
 *   = 13 bits per weight (before entropy coding)
 *
 * NOTE: This is the naive packing. With entropy coding on the coordinate
 * distribution (which clusters near zero), effective rate drops to ~2-3 bits/weight.
 * A production implementation would use ANS or range coding on the coordinate stream.
 */
export function packE8(quantized: E8QuantizedLayer): E8PackedLayer {
  const bytesPerGroup = 13; // 4 (scale) + 1 (flags) + 8 (coords)
  const packedBuffer = Buffer.alloc(quantized.groupCount * bytesPerGroup);

  for (let g = 0; g < quantized.groupCount; g++) {
    const base = g * bytesPerGroup;
    const { scale, coords, isHalfShift } = quantized.groups[g];

    packedBuffer.writeFloatLE(scale, base);
    packedBuffer[base + 4] = isHalfShift ? 1 : 0;
    for (let i = 0; i < 8; i++) {
      packedBuffer[base + 5 + i] = coords[i] & 0xff; // Int8 as unsigned byte
    }
  }

  return {
    layerName: quantized.layerName,
    rows: quantized.rows,
    cols: quantized.cols,
    groupCount: quantized.groupCount,
    packedBuffer,
    bitsPerWeight: quantized.bitsPerWeight,
  };
}

/**
 * Unpacks binary buffer back to E_8 quantized layer.
 */
export function unpackE8(packed: E8PackedLayer): E8QuantizedLayer {
  const bytesPerGroup = 13;
  const groups: E8QuantizedGroup[] = new Array(packed.groupCount);

  for (let g = 0; g < packed.groupCount; g++) {
    const base = g * bytesPerGroup;
    const scale = packed.packedBuffer.readFloatLE(base);
    const isHalfShift = packed.packedBuffer[base + 4] === 1;
    const coords = new Int8Array(8);
    for (let i = 0; i < 8; i++) {
      const raw = packed.packedBuffer[base + 5 + i];
      coords[i] = raw > 127 ? raw - 256 : raw; // unsigned → signed
    }
    groups[g] = { scale, coords, isHalfShift };
  }

  return {
    layerName: packed.layerName,
    rows: packed.rows,
    cols: packed.cols,
    groupCount: packed.groupCount,
    groups,
    bitsPerWeight: packed.bitsPerWeight,
  };
}

/**
 * Computes effective bits per weight based on coordinate distribution.
 * Naive: 13 bytes / 8 weights = 13 bits/weight.
 * With coordinate entropy: typically 2-4 bits/weight depending on distribution.
 */
function computeEffectiveBits(_groups: E8QuantizedGroup[]): number {
  // Naive packing rate (before entropy coding). Groups arg reserved for future
  // per-group entropy accounting; currently returns a constant bpw.
  return (13 * 8) / 8; // 13 bits per weight in current packing
}

/**
 * Generates the 240 E_8 root vectors (minimal vectors at distance √2).
 * Useful for codebook-based approaches where we index into a fixed table.
 *
 * The 240 roots fall into three classes:
 * 1. Permutations of (±1, ±1, 0, 0, 0, 0, 0, 0): C(8,2) × 2² = 112 vectors
 * 2. (±½, ±½, ±½, ±½, ±½, ±½, ±½, ±½) with even number of minus signs: 128 vectors
 * Total: 112 + 128 = 240
 */
export function generateE8Roots(): Float64Array[] {
  const roots: Float64Array[] = [];

  // Class 1: permutations of (±1, ±1, 0, 0, 0, 0, 0, 0)
  for (let i = 0; i < 8; i++) {
    for (let j = i + 1; j < 8; j++) {
      for (const si of [-1, 1]) {
        for (const sj of [-1, 1]) {
          const v = new Float64Array(8);
          v[i] = si;
          v[j] = sj;
          roots.push(v);
        }
      }
    }
  }

  // Class 2: (±½)^8 with even number of minus signs
  for (let mask = 0; mask < 256; mask++) {
    let negCount = 0;
    for (let bit = 0; bit < 8; bit++) {
      if (mask & (1 << bit)) negCount++;
    }
    if (negCount % 2 === 0) {
      const v = new Float64Array(8);
      for (let bit = 0; bit < 8; bit++) {
        v[bit] = mask & (1 << bit) ? -0.5 : 0.5;
      }
      roots.push(v);
    }
  }

  return roots;
}

/**
 * Measures quantization quality: compares original weights to E_8-reconstructed.
 * Returns Frobenius norm of error and cosine similarity.
 */
export function measureE8Quality(
  original: Float32Array,
  reconstructed: Float32Array
): { frobeniusError: number; cosineSimilarity: number; mse: number } {
  if (original.length !== reconstructed.length) {
    throw new RangeError('Length mismatch');
  }

  let sumSqErr = 0;
  let dotProduct = 0;
  let normOrig = 0;
  let normRecon = 0;

  for (let i = 0; i < original.length; i++) {
    const o = original[i];
    const r = reconstructed[i];
    const diff = o - r;
    sumSqErr += diff * diff;
    dotProduct += o * r;
    normOrig += o * o;
    normRecon += r * r;
  }

  const frobeniusError = Math.sqrt(sumSqErr);
  const mse = sumSqErr / original.length;
  const cosineSimilarity =
    normOrig > 0 && normRecon > 0
      ? dotProduct / (Math.sqrt(normOrig) * Math.sqrt(normRecon))
      : 0;

  return { frobeniusError, cosineSimilarity, mse };
}
