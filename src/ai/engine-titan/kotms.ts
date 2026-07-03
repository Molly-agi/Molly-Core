// src/ai/engine-titan/kotms.ts
//
// KOTMS — Kronecker Orthogonal Tri-Modal Shaping.
//
// Applies a block-Kronecker orthogonal rotation R = R_1 ⊗ R_2 to a weight matrix,
// where each R_i is a signed Hadamard block of size b_i (b_1 · b_2 = paddedCols).
//
// Compared to full-column RHT this trades O(n·log n) for O(n·(log b_1 + log b_2))
// and — once R_1 and R_2 are learned in a fine-tuning phase — reshapes the
// weight distribution into tri-modal peaks aligned with {-1, 0, +1}, giving
// near-optimal ternary quantization. The untrained bootstrap (this file) uses
// per-block randomized Hadamard, which is strictly weaker than full RHT for
// spreading heavy tails but O(log b) faster; use RHT for full-mix compression
// and KOTMS when block-locality is desired (e.g. attention-head grouping).

import { applyRHT, inverseRHT, type RHTMeta } from './hadamard-transform';

export interface KOTMSMeta {
  readonly blockSizes: readonly [number, number];
  readonly rht1: RHTMeta;
  readonly rht2: RHTMeta;
  readonly originalCols: number;
  readonly paddedCols: number;
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Splits n into (b1, b2) with b1·b2 == n and b1 ≈ sqrt(n).
 * Both b1 and b2 are powers of 2 so the block-Hadamard is well-defined.
 * n must itself be a power of 2 (we pad to nextPow2 before calling).
 */
function splitBlocks(n: number): [number, number] {
  const half = Math.floor(Math.log2(n) / 2);
  const b1 = 1 << half;
  const b2 = n / b1;
  return [b1, b2];
}

/**
 * Applies R_1 ⊗ R_2 to each row of the weight matrix.
 * Implementation: reshape row (length paddedCols) as b1 × b2 matrix,
 * apply RHT along columns (R_2), then along rows (R_1). This is exactly
 * the Kronecker rotation on the flattened row.
 */
export function applyKOTMS(
  weights: Float32Array,
  rows: number,
  cols: number,
  seed1: number,
  seed2: number
): { transformed: Float32Array; meta: KOTMSMeta } {
  const paddedCols = nextPow2(cols);
  const [b1, b2] = splitBlocks(paddedCols);

  // Stage A: R_2 along the b2 axis — treat each row as (b1 groups of b2 elements),
  // apply RHT of length b2 to each group.
  const stageA = new Float32Array(rows * paddedCols);
  for (let r = 0; r < rows; r++) {
    for (let g = 0; g < b1; g++) {
      // Slice out one b2-length group and pad-carry from the (possibly shorter) original
      const groupIn = new Float32Array(b2);
      for (let c = 0; c < b2; c++) {
        const originalCol = g * b2 + c;
        groupIn[c] = originalCol < cols ? weights[r * cols + originalCol] : 0;
      }
      const { transformed: groupOut } = applyRHT(groupIn, 1, b2, seed2);
      // groupOut length is b2 (already power-of-2)
      for (let c = 0; c < b2; c++) {
        stageA[r * paddedCols + g * b2 + c] = groupOut[c];
      }
    }
  }

  // Stage B: R_1 along the b1 axis — for each column-slot c in [0..b2),
  // gather the b1 values across groups, apply RHT of length b1, scatter back.
  const stageB = new Float32Array(rows * paddedCols);
  const strip = new Float32Array(b1);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < b2; c++) {
      for (let g = 0; g < b1; g++)
        strip[g] = stageA[r * paddedCols + g * b2 + c];
      const { transformed: stripOut } = applyRHT(strip, 1, b1, seed1);
      for (let g = 0; g < b1; g++)
        stageB[r * paddedCols + g * b2 + c] = stripOut[g];
    }
  }

  const rht1: RHTMeta = { seed: seed1, originalCols: b1, paddedCols: b1 };
  const rht2: RHTMeta = { seed: seed2, originalCols: b2, paddedCols: b2 };
  const meta: KOTMSMeta = {
    blockSizes: [b1, b2],
    rht1,
    rht2,
    originalCols: cols,
    paddedCols,
  };
  return { transformed: stageB, meta };
}

export function inverseKOTMS(
  transformed: Float32Array,
  rows: number,
  meta: KOTMSMeta
): Float32Array {
  const { blockSizes, rht1, rht2, paddedCols, originalCols } = meta;
  const [b1, b2] = blockSizes;

  // Reverse Stage B: invert R_1 along the b1 axis.
  const stageA = new Float32Array(rows * paddedCols);
  const strip = new Float32Array(b1);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < b2; c++) {
      for (let g = 0; g < b1; g++)
        strip[g] = transformed[r * paddedCols + g * b2 + c];
      const stripBack = inverseRHT(strip, 1, rht1);
      for (let g = 0; g < b1; g++)
        stageA[r * paddedCols + g * b2 + c] = stripBack[g];
    }
  }

  // Reverse Stage A: invert R_2 along the b2 axis, then strip padding.
  const recovered = new Float32Array(rows * originalCols);
  const groupIn = new Float32Array(b2);
  for (let r = 0; r < rows; r++) {
    for (let g = 0; g < b1; g++) {
      for (let c = 0; c < b2; c++)
        groupIn[c] = stageA[r * paddedCols + g * b2 + c];
      const groupBack = inverseRHT(groupIn, 1, rht2);
      for (let c = 0; c < b2; c++) {
        const originalCol = g * b2 + c;
        if (originalCol < originalCols) {
          recovered[r * originalCols + originalCol] = groupBack[c];
        }
      }
    }
  }

  return recovered;
}
