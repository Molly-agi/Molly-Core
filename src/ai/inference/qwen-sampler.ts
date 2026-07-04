// src/ai/inference/qwen-sampler.ts
//
// Logits → next-token-id sampler. Temperature + top-K + top-P (nucleus).
//
// Perf design: raw logits are [152064]. Naive sort of that per token is ~2M ops
// and 152K throwaway objects, hammering V8's minor GC. Instead we do a single
// linear scan into a size-K sorted array (K ≈ 50), then softmax + top-P on the
// small subset. Total: O(N·K) = ~7.6M ops (K=50, N=152064) with no big allocs
// and only 2K sample-space objects. About 20× less allocation pressure than
// Array.from(logits).map(...).sort().

export interface SamplingOptions {
  temperature?: number; // 0 = greedy argmax, >0 = stochastic. Default 0.7
  topP?: number; // nucleus threshold [0,1]. Default 0.95
  topK?: number; // truncate to top-K choices. Default 50
  rng?: () => number; // injectable RNG for reproducible tests. Default Math.random
}

interface Candidate {
  id: number;
  logit: number;
}

export class QwenSampler {
  static sample(logits: Float32Array, options: SamplingOptions = {}): number {
    const temp = options.temperature ?? 0.7;
    const topP = options.topP ?? 0.95;
    const topK = options.topK ?? 50;
    const rng = options.rng ?? Math.random;

    // Greedy fast path — one pass, no allocation
    if (temp <= 0) {
      let bestId = 0;
      let bestVal = logits[0];
      for (let i = 1; i < logits.length; i++) {
        if (logits[i] > bestVal) {
          bestVal = logits[i];
          bestId = i;
        }
      }
      return bestId;
    }

    // Partial top-K: linear scan into a size-K descending array.
    // Threshold = smallest logit currently in the pool. Skip cheap comparisons first.
    const k = Math.min(Math.max(topK, 1), logits.length);
    const pool: Candidate[] = [];
    let threshold = -Infinity;

    for (let i = 0; i < logits.length; i++) {
      const v = logits[i];
      if (pool.length < k) {
        pool.push({ id: i, logit: v });
        if (pool.length === k) {
          pool.sort((a, b) => b.logit - a.logit);
          threshold = pool[k - 1].logit;
        }
        continue;
      }
      if (v <= threshold) continue;

      // Insert into sorted position, drop tail
      let j = k - 1;
      pool[j] = { id: i, logit: v };
      while (j > 0 && pool[j].logit > pool[j - 1].logit) {
        const tmp = pool[j];
        pool[j] = pool[j - 1];
        pool[j - 1] = tmp;
        j--;
      }
      threshold = pool[k - 1].logit;
    }
    if (pool.length < k) {
      pool.sort((a, b) => b.logit - a.logit);
    }

    // Temperature-scaled softmax on the small subset (stable via max subtraction)
    const maxLogit = pool[0].logit;
    const exps = new Float64Array(pool.length);
    let sumExp = 0;
    for (let i = 0; i < pool.length; i++) {
      const e = Math.exp((pool[i].logit - maxLogit) / temp);
      exps[i] = e;
      sumExp += e;
    }

    // Top-P nucleus: keep smallest prefix whose cumulative prob ≥ topP
    let cumulative = 0;
    let cutoff = pool.length;
    for (let i = 0; i < pool.length; i++) {
      cumulative += exps[i] / sumExp;
      if (cumulative >= topP) {
        cutoff = i + 1;
        break;
      }
    }

    // Renormalize surviving nucleus
    let nucleusSum = 0;
    for (let i = 0; i < cutoff; i++) nucleusSum += exps[i];

    // Inverse-CDF sample
    const roll = rng() * nucleusSum;
    let acc = 0;
    for (let i = 0; i < cutoff; i++) {
      acc += exps[i];
      if (roll <= acc) return pool[i].id;
    }
    return pool[cutoff - 1].id;
  }
}
