// src/ai/engine-titan/optimal-ternary.ts
//
// E2M-ATQ — Euclidean Asymmetric Ternary Quantizer.
// Finds (scale α, threshold t) that minimize ||w - α · ternary(w, t)||²
// where ternary(w, t) = sign(w) · [|w| > t].
//
// Given a fixed threshold t, the closed-form optimal α is:
//   α = sum(|w_i| : |w_i| > t) / count(|w_i| > t)
//
// The residual error at that α reduces to:
//   E(t) = sum(w²) - α² · count(|w_i| > t)
//
// So minimizing E is equivalent to maximizing  α² · count = (sum_above)² / count.
// We sweep t over a 256-bin histogram — O(N + BINS) — and return the best.

export interface OptimalTernary {
  /** Reconstruction magnitude α — multiply the stored {-1, 0, 1} by this to recover. */
  scale: number;
  /** Threshold t on |w| — values with |w| ≤ t quantize to 0. */
  threshold: number;
}

const HIST_BINS = 256;

export function findOptimalTernary(w: Float32Array): OptimalTernary {
  const N = w.length;
  if (N === 0) return { scale: 1, threshold: Infinity };

  let maxAbs = 0;
  for (let i = 0; i < N; i++) {
    const v = w[i];
    if (!isFinite(v)) continue;
    const a = v < 0 ? -v : v;
    if (a > maxAbs) maxAbs = a;
  }
  if (maxAbs === 0) return { scale: 0, threshold: Infinity };

  const binWidth = maxAbs / HIST_BINS;
  const binCount = new Uint32Array(HIST_BINS);
  const binSum = new Float64Array(HIST_BINS);

  for (let i = 0; i < N; i++) {
    const v = w[i];
    if (!isFinite(v)) continue;
    const a = v < 0 ? -v : v;
    let bin = Math.floor(a / binWidth);
    if (bin >= HIST_BINS) bin = HIST_BINS - 1;
    binCount[bin]++;
    binSum[bin] += a;
  }

  // Suffix sums: suffSum[k] = sum of |w_i| in bins [k..HIST_BINS-1]
  // suffCount[k] = count of |w_i| in bins [k..HIST_BINS-1]
  const suffSum = new Float64Array(HIST_BINS + 1);
  const suffCount = new Uint32Array(HIST_BINS + 1);
  for (let k = HIST_BINS - 1; k >= 0; k--) {
    suffSum[k] = suffSum[k + 1] + binSum[k];
    suffCount[k] = suffCount[k + 1] + binCount[k];
  }

  // Sweep boundary k (threshold t = k * binWidth). We include k = 0 (keep everything)
  // and stop before k = HIST_BINS (which would empty the "above" set).
  let bestK = 0;
  let bestScore = -1;
  for (let k = 0; k < HIST_BINS; k++) {
    const c = suffCount[k];
    if (c === 0) break; // suffix empty from here on
    const s = suffSum[k];
    const score = (s * s) / c;
    if (score > bestScore) {
      bestScore = score;
      bestK = k;
    }
  }

  const threshold = bestK * binWidth;
  const c = suffCount[bestK];
  const scale = c > 0 ? suffSum[bestK] / c : 1;

  return { scale, threshold };
}
