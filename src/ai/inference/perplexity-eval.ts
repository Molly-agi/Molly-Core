// src/ai/inference/perplexity-eval.ts
//
// Perplexity evaluation loop for crystal-compressed models.
// Takes tokenized input, runs forward pass per token, computes cross-entropy
// loss against ground truth (next token), returns perplexity = exp(avg_loss).
//
// Usage:
//   const ppl = evaluatePerplexity(tokenIds, driver, layerEngine, normWeights, biasWeights, finalNorm, kvCache);
//   console.log(`Perplexity: ${ppl.perplexity.toFixed(2)}`);

import type {
  CrystalTransformerDriver,
  LayerNormWeights,
  LayerBiasWeights,
} from './crystal-transformer-driver';
import type { CrystalInferenceLayer } from '../engine-titan/crystal-inference-layer';
import type { KvCache } from './kv-cache';
import { assertFinite } from '../engine-titan/nan-tripwire';

export interface PerplexityResult {
  /** exp(average cross-entropy loss) — lower is better */
  perplexity: number;
  /** Average cross-entropy loss in nats */
  avgLoss: number;
  /** Total tokens evaluated (excludes first token which has no prediction target) */
  tokenCount: number;
  /** Per-token losses for analysis */
  losses: number[];
}

/**
 * Stable log-softmax: log(exp(x_i) / sum(exp(x_j))) = x_i - log(sum(exp(x_j - max)))  - max
 * Avoids overflow by subtracting max before exp.
 */
function logSoftmax(logits: Float32Array, targetIdx: number): number {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) {
    if (logits[i] > max) max = logits[i];
  }

  let sumExp = 0;
  for (let i = 0; i < logits.length; i++) {
    sumExp += Math.exp(logits[i] - max);
  }

  const logSumExp = Math.log(sumExp) + max;
  return logits[targetIdx] - logSumExp;
}

/**
 * Evaluate perplexity on a sequence of token IDs.
 *
 * For each position t (starting at t=0), the model predicts the distribution
 * over the next token. We measure how surprised it is by the actual next token
 * (cross-entropy). Perplexity = exp(average surprise).
 *
 * Lower perplexity = better model. Baseline for 72B Q4_K: ~5-7 on WikiText-2.
 * After our compression: target < 10 (usable), ideal < 7 (competitive).
 */
export function evaluatePerplexity(
  tokenIds: number[],
  driver: CrystalTransformerDriver,
  layerEngine: CrystalInferenceLayer,
  layersNorm: LayerNormWeights[],
  layersBias: LayerBiasWeights[],
  finalNorm: Float32Array,
  kvCache: KvCache
): PerplexityResult {
  if (tokenIds.length < 2) {
    return {
      perplexity: Infinity,
      avgLoss: Infinity,
      tokenCount: 0,
      losses: [],
    };
  }

  const losses: number[] = [];
  let totalLoss = 0;

  // Reset KV cache for fresh evaluation
  kvCache.reset();

  for (let pos = 0; pos < tokenIds.length - 1; pos++) {
    const tokenId = tokenIds[pos];
    const targetId = tokenIds[pos + 1]; // ground truth next token

    // Forward pass: get logits for position
    const logits = driver.executeTokenPass(
      tokenId,
      pos,
      layersNorm,
      layersBias,
      finalNorm,
      kvCache,
      layerEngine
    );

    // NaN tripwire: catch poison logits before they produce meaningless loss
    assertFinite('logits', pos, logits);

    // Cross-entropy loss: -log P(target | context)
    const logProb = logSoftmax(logits, targetId);
    const loss = -logProb; // nats (natural log)

    losses.push(loss);
    totalLoss += loss;
  }

  const tokenCount = losses.length;
  const avgLoss = totalLoss / tokenCount;
  const perplexity = Math.exp(avgLoss);

  return { perplexity, avgLoss, tokenCount, losses };
}

/**
 * Evaluate perplexity on multiple sequences and return the average.
 * Each sequence is evaluated independently (KV cache reset between them).
 */
export function evaluatePerplexityBatch(
  sequences: number[][],
  driver: CrystalTransformerDriver,
  layerEngine: CrystalInferenceLayer,
  layersNorm: LayerNormWeights[],
  layersBias: LayerBiasWeights[],
  finalNorm: Float32Array,
  kvCache: KvCache,
  onProgress?: (done: number, total: number, ppl: number) => void
): PerplexityResult {
  let totalLoss = 0;
  let totalTokens = 0;
  const allLosses: number[] = [];

  for (let i = 0; i < sequences.length; i++) {
    const result = evaluatePerplexity(
      sequences[i],
      driver,
      layerEngine,
      layersNorm,
      layersBias,
      finalNorm,
      kvCache
    );

    totalLoss += result.avgLoss * result.tokenCount;
    totalTokens += result.tokenCount;
    allLosses.push(...result.losses);

    const runningPpl = Math.exp(totalLoss / totalTokens);
    onProgress?.(i + 1, sequences.length, runningPpl);
  }

  const avgLoss = totalTokens > 0 ? totalLoss / totalTokens : Infinity;
  return {
    perplexity: Math.exp(avgLoss),
    avgLoss,
    tokenCount: totalTokens,
    losses: allLosses,
  };
}
