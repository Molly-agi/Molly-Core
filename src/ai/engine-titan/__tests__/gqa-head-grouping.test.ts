// src/ai/engine-titan/__tests__/gqa-head-grouping.test.ts
//
// Validates that GQA (Grouped Query Attention) head compression preserves
// the shared K/V alignment property. In GQA, multiple Q heads share a
// single K/V head. If we compress K/V independently, the shared structure
// can be disrupted.
//
// Test approach: simulate a GQA attention computation before and after
// compression of K/V weight matrices, measure attention pattern drift.

import { describe, test, expect } from '@jest/globals';
import { LowRankTensorDecomposer } from '../decomposer';
import {
  compensatedQuantizeB,
  collectBActivations,
  cosineSimilarity,
  type LayerActivations,
} from '../layer-error-compensation';
import { dequantizeE8 } from '../e8-lattice';
import { selectStrategy } from '../compression-strategy';

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function gaussianRandom(rng: () => number): number {
  const u1 = rng() || 1e-10;
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function softmax(logits: Float32Array): Float32Array {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) {
    if (logits[i] > max) max = logits[i];
  }
  const out = new Float32Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    out[i] = Math.exp(logits[i] - max);
    sum += out[i];
  }
  for (let i = 0; i < logits.length; i++) out[i] /= sum;
  return out;
}

function matmul(
  A: Float32Array,
  aRows: number,
  aCols: number,
  B: Float32Array,
  bCols: number
): Float32Array {
  const out = new Float32Array(aRows * bCols);
  for (let i = 0; i < aRows; i++) {
    for (let j = 0; j < bCols; j++) {
      let sum = 0;
      for (let k = 0; k < aCols; k++) {
        sum += A[i * aCols + k] * B[k * bCols + j];
      }
      out[i * bCols + j] = sum;
    }
  }
  return out;
}

interface GQAConfig {
  numQHeads: number;
  numKVHeads: number;
  headDim: number;
  hiddenDim: number;
  seqLen: number;
}

function computeGQAAttention(
  input: Float32Array,
  Wq: Float32Array,
  Wk: Float32Array,
  Wv: Float32Array,
  config: GQAConfig
): Float32Array {
  const { numQHeads, numKVHeads, headDim, hiddenDim, seqLen } = config;
  const qHeadsPerKV = numQHeads / numKVHeads;

  // Q = input @ Wq  [seqLen × (numQHeads * headDim)]
  const Q = matmul(input, seqLen, hiddenDim, Wq, numQHeads * headDim);
  // K = input @ Wk  [seqLen × (numKVHeads * headDim)]
  const K = matmul(input, seqLen, hiddenDim, Wk, numKVHeads * headDim);
  // V = input @ Wv  [seqLen × (numKVHeads * headDim)]
  const V = matmul(input, seqLen, hiddenDim, Wv, numKVHeads * headDim);

  // Compute attention scores per Q head, using shared K/V heads
  const allAttnOutputs = new Float32Array(seqLen * numQHeads * headDim);
  const scale = 1 / Math.sqrt(headDim);

  for (let qh = 0; qh < numQHeads; qh++) {
    const kvh = Math.floor(qh / qHeadsPerKV); // which KV head this Q uses

    for (let t = 0; t < seqLen; t++) {
      // q_t = Q[t, qh*headDim : (qh+1)*headDim]
      const scores = new Float32Array(seqLen);
      for (let s = 0; s <= t; s++) {
        // dot(q_t, k_s) — causal mask
        let dot = 0;
        for (let d = 0; d < headDim; d++) {
          dot +=
            Q[t * numQHeads * headDim + qh * headDim + d] *
            K[s * numKVHeads * headDim + kvh * headDim + d];
        }
        scores[s] = dot * scale;
      }
      // Fill future positions with -Inf for softmax
      for (let s = t + 1; s < seqLen; s++) scores[s] = -1e9;

      const attnWeights = softmax(scores);

      // Weighted sum of V
      for (let d = 0; d < headDim; d++) {
        let sum = 0;
        for (let s = 0; s <= t; s++) {
          sum +=
            attnWeights[s] * V[s * numKVHeads * headDim + kvh * headDim + d];
        }
        allAttnOutputs[t * numQHeads * headDim + qh * headDim + d] = sum;
      }
    }
  }

  return allAttnOutputs;
}

describe('GQA head grouping under compression', () => {
  const config: GQAConfig = {
    numQHeads: 8,
    numKVHeads: 2, // 4 Q heads share each KV head
    headDim: 16,
    hiddenDim: 64, // must be multiple of 8 for E8
    seqLen: 16,
  };

  const rank = 16;
  const rng = seededRng(2026);

  // Generate weight matrices
  const Wq = new Float32Array(
    config.hiddenDim * config.numQHeads * config.headDim
  );
  const Wk = new Float32Array(
    config.hiddenDim * config.numKVHeads * config.headDim
  );
  const Wv = new Float32Array(
    config.hiddenDim * config.numKVHeads * config.headDim
  );
  const input = new Float32Array(config.seqLen * config.hiddenDim);

  // Initialize
  for (let i = 0; i < Wq.length; i++) Wq[i] = gaussianRandom(rng) * 0.02;
  for (let i = 0; i < Wk.length; i++) Wk[i] = gaussianRandom(rng) * 0.02;
  for (let i = 0; i < Wv.length; i++) Wv[i] = gaussianRandom(rng) * 0.02;
  for (let i = 0; i < input.length; i++) input[i] = gaussianRandom(rng) * 0.5;

  test('compression strategy assigns same path to Q and KV in same group', () => {
    const kStrategy = selectStrategy(
      'model.layers.0.self_attn.k_proj',
      config.hiddenDim,
      config.numKVHeads * config.headDim
    );
    const vStrategy = selectStrategy(
      'model.layers.0.self_attn.v_proj',
      config.hiddenDim,
      config.numKVHeads * config.headDim
    );

    // K and V should get the same compression path (same dimensions)
    expect(kStrategy.path).toBe(vStrategy.path);
    expect(kStrategy.rank).toBe(vStrategy.rank);
  });

  test('independently compressed K/V preserves attention pattern', () => {
    const decomposer = new LowRankTensorDecomposer();

    // Original attention output
    const originalAttn = computeGQAAttention(input, Wq, Wk, Wv, config);

    // Compress K and V independently
    const kCols = config.numKVHeads * config.headDim;
    const { matrixA: Ak, matrixB: Bk } = decomposer.decomposeMatrix(
      Wk,
      config.hiddenDim,
      kCols,
      rank
    );
    const { matrixA: Av, matrixB: Bv } = decomposer.decomposeMatrix(
      Wv,
      config.hiddenDim,
      kCols,
      rank
    );

    // Quantize K's B factor
    const zk = collectBActivations(
      input,
      config.seqLen,
      config.hiddenDim,
      Ak,
      rank
    );
    const kAct: LayerActivations = {
      activations: zk,
      numTokens: config.seqLen,
      inputDim: rank,
    };
    const kResult = compensatedQuantizeB(
      new Float32Array(Bk),
      rank,
      kCols,
      kAct,
      'attn.k_proj'
    );

    // Quantize V's B factor
    const zv = collectBActivations(
      input,
      config.seqLen,
      config.hiddenDim,
      Av,
      rank
    );
    const vAct: LayerActivations = {
      activations: zv,
      numTokens: config.seqLen,
      inputDim: rank,
    };
    const vResult = compensatedQuantizeB(
      new Float32Array(Bv),
      rank,
      kCols,
      vAct,
      'attn.v_proj'
    );

    // Reconstruct compressed K and V weight matrices
    const Bk_recon = dequantizeE8(kResult.quantizedB);
    const Bv_recon = dequantizeE8(vResult.quantizedB);

    const Wk_compressed = matmul(Ak, config.hiddenDim, rank, Bk_recon, kCols);
    const Wv_compressed = matmul(Av, config.hiddenDim, rank, Bv_recon, kCols);

    // Compute attention with compressed K/V (Q stays original)
    const compressedAttn = computeGQAAttention(
      input,
      Wq,
      Wk_compressed,
      Wv_compressed,
      config
    );

    // Measure attention output fidelity
    const overallCos = cosineSimilarity(originalAttn, compressedAttn);

    // The core GQA property: all Q heads sharing a KV head should degrade
    // similarly (not one Q head catastrophically worse than its siblings)
    const qHeadsPerKV = config.numQHeads / config.numKVHeads;
    const perHeadCosines: number[] = [];

    for (let qh = 0; qh < config.numQHeads; qh++) {
      const headOriginal = new Float32Array(config.seqLen * config.headDim);
      const headCompressed = new Float32Array(config.seqLen * config.headDim);
      for (let t = 0; t < config.seqLen; t++) {
        for (let d = 0; d < config.headDim; d++) {
          const idx =
            t * config.numQHeads * config.headDim + qh * config.headDim + d;
          headOriginal[t * config.headDim + d] = originalAttn[idx];
          headCompressed[t * config.headDim + d] = compressedAttn[idx];
        }
      }
      perHeadCosines.push(cosineSimilarity(headOriginal, headCompressed));
    }

    // Overall fidelity should be reasonable
    expect(overallCos).toBeGreaterThan(0.7);

    // Check GQA sharing property: heads sharing same KV group should have
    // similar degradation (within 0.15 of each other)
    for (let kvg = 0; kvg < config.numKVHeads; kvg++) {
      const groupStart = kvg * qHeadsPerKV;
      const groupCosines = perHeadCosines.slice(
        groupStart,
        groupStart + qHeadsPerKV
      );
      const groupMin = Math.min(...groupCosines);
      const groupMax = Math.max(...groupCosines);
      expect(groupMax - groupMin).toBeLessThan(0.15);
    }
  });

  test('softmax attenuates KV compression error in attention output', () => {
    const decomposer = new LowRankTensorDecomposer();
    const kCols = config.numKVHeads * config.headDim;

    // Compress only K
    const { matrixA: Ak, matrixB: Bk } = decomposer.decomposeMatrix(
      Wk,
      config.hiddenDim,
      kCols,
      rank
    );
    const zk = collectBActivations(
      input,
      config.seqLen,
      config.hiddenDim,
      Ak,
      rank
    );
    const kAct: LayerActivations = {
      activations: zk,
      numTokens: config.seqLen,
      inputDim: rank,
    };
    const kResult = compensatedQuantizeB(
      new Float32Array(Bk),
      rank,
      kCols,
      kAct,
      'attn.k_proj.amp'
    );

    // Measure K reconstruction error at weight level
    const Bk_recon = dequantizeE8(kResult.quantizedB);
    const kReconFull = matmul(Ak, config.hiddenDim, rank, Bk_recon, kCols);
    const kWeightCos = cosineSimilarity(Wk, kReconFull);

    // Measure how that K error propagates to attention output
    const originalAttn = computeGQAAttention(input, Wq, Wk, Wv, config);
    const kCompressedAttn = computeGQAAttention(
      input,
      Wq,
      kReconFull,
      Wv,
      config
    );
    const attnCos = cosineSimilarity(originalAttn, kCompressedAttn);

    // Key finding: softmax normalization ATTENUATES weight-level error.
    // The attention output is more faithful than the raw weight reconstruction
    // because softmax renormalizes score distributions, washing out small
    // perturbations. This means GQA sharing is less dangerous than a naive
    // "error × sharing_factor" analysis suggests.
    expect(attnCos).toBeGreaterThan(kWeightCos);

    // Attention output should maintain high fidelity even with degraded weights
    expect(attnCos).toBeGreaterThan(0.95);
  });
});
