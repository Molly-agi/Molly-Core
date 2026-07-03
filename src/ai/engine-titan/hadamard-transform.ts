// src/ai/engine-titan/hadamard-transform.ts
//
// Randomized Hadamard Transform (RHT) preprocessing for ternary quantization.
// Spreading heavy-tailed weight distributions to sub-Gaussian before the
// 0.5-threshold ternary step dramatically reduces quantization error.
//
// Transform: x' = H · (D · x)
//   D = random ±1 diagonal, reproducible from seed
//   H = normalized Walsh-Hadamard matrix (in-place, O(n log n))
//
// Inverse:   x = D · (H · x')   (H is its own inverse when normalized, D² = I)

export interface RHTMeta {
  seed: number;
  originalCols: number;
  paddedCols: number;
}

// Seeded LCG — fast and reproducible across JS runtimes
function makeSigns(size: number, seed: number): Int8Array {
  const signs = new Int8Array(size);
  let s = seed >>> 0;
  for (let i = 0; i < size; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    signs[i] = s >>> 31 ? -1 : 1;
  }
  return signs;
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// In-place normalized Walsh-Hadamard Transform on a Float32 subarray.
// n must be a power of 2. Normalized by 1/sqrt(n) so H·H = I (self-inverse).
function fwht(x: Float32Array, offset: number, n: number): void {
  for (let h = 1; h < n; h <<= 1) {
    for (let i = offset; i < offset + n; i += h << 1) {
      for (let j = i; j < i + h; j++) {
        const a = x[j];
        const b = x[j + h];
        x[j] = a + b;
        x[j + h] = a - b;
      }
    }
  }
  const scale = 1.0 / Math.sqrt(n);
  for (let i = offset; i < offset + n; i++) x[i] *= scale;
}

/**
 * Apply RHT to a [rows × cols] weight matrix (row-major).
 * Returns a [rows × paddedCols] transformed matrix.
 * paddedCols is the next power of 2 ≥ cols.
 */
export function applyRHT(
  weights: Float32Array,
  rows: number,
  cols: number,
  seed: number
): { transformed: Float32Array; meta: RHTMeta } {
  const paddedCols = nextPow2(cols);
  const signs = makeSigns(paddedCols, seed);
  const out = new Float32Array(rows * paddedCols);

  for (let r = 0; r < rows; r++) {
    const base = r * paddedCols;
    // Apply sign flip D and copy into output row (padding stays 0)
    for (let c = 0; c < cols; c++) {
      out[base + c] = weights[r * cols + c] * signs[c];
    }
    // Apply H in-place
    fwht(out, base, paddedCols);
  }

  return { transformed: out, meta: { seed, originalCols: cols, paddedCols } };
}

/**
 * Inverse RHT: recover original [rows × originalCols] from [rows × paddedCols].
 * Inverse = apply H (same as forward, since H is self-inverse), then apply D.
 */
export function inverseRHT(
  transformed: Float32Array,
  rows: number,
  meta: RHTMeta
): Float32Array {
  const { seed, originalCols, paddedCols } = meta;
  const signs = makeSigns(paddedCols, seed);

  // Work in-place on a copy so we don't mutate the input
  const work = new Float32Array(transformed);

  for (let r = 0; r < rows; r++) {
    const base = r * paddedCols;
    fwht(work, base, paddedCols); // inverse H = H (self-inverse)
    for (let c = 0; c < paddedCols; c++) {
      work[base + c] *= signs[c]; // inverse D = D
    }
  }

  if (originalCols === paddedCols) return work;

  // Strip zero padding — copy only originalCols per row
  const result = new Float32Array(rows * originalCols);
  for (let r = 0; r < rows; r++) {
    result.set(
      work.subarray(r * paddedCols, r * paddedCols + originalCols),
      r * originalCols
    );
  }
  return result;
}
