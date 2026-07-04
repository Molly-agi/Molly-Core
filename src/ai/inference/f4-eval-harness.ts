// src/ai/inference/f4-eval-harness.ts
//
// F4 Acceptance Gate — Eval Harness
//
// Takes a crystal vault + GGUF (for 1D tensors), runs N windows of 2048 tokens
// through CrystalTransformerDriver, computes PPL + per-layer KL + NaN tripwire.
//
// Output: { pplRatio, avgLoss, perLayerKL[], nanDetected, windowCount }
//
// Usage:
//   const result = await runF4Eval({
//     vaultDir: './data/titan-crystals-72b',
//     ggufPath: './models/qwen2.5-72b-q4_k.gguf',
//     windowCount: 30,
//     windowSize: 2048,
//     tokenIds: [...], // pre-tokenized eval corpus
//   });

import { CrystalTransformerDriver } from './crystal-transformer-driver';
import type {
  LayerNormWeights,
  LayerBiasWeights,
  DriverConfig,
  LayerProbe,
} from './crystal-transformer-driver';
import { CrystalInferenceLayer } from '../engine-titan/crystal-inference-layer';
import { KvCache } from './kv-cache';
import { assertFinite, NonFiniteError } from '../engine-titan/nan-tripwire';

// --- Types ---

export interface F4EvalConfig {
  /** Path to crystal vault directory */
  vaultDir: string;
  /** Driver geometry config (from GGUF metadata or manual) */
  driverConfig: DriverConfig;
  /** Pre-tokenized evaluation corpus (flat array of token IDs) */
  tokenIds: number[];
  /** Number of non-overlapping windows to evaluate (default 30) */
  windowCount?: number;
  /** Tokens per window (default 2048) */
  windowSize?: number;
  /** 1D weights: layer norms, biases, final norm — loaded from GGUF externally */
  layersNorm: LayerNormWeights[];
  layersBias: LayerBiasWeights[];
  finalNorm: Float32Array;
  /** Reference perplexity (from uncompressed model) for ratio calculation */
  referencePpl?: number;
  /** Optional reference logits per window for KL computation */
  referenceLogits?: Float32Array[][];
  /** Max hot layers in inference cache (default 8) */
  maxHotLayers?: number;
  /** Enable NaN tripwire (default true) */
  enableNanTripwire?: boolean;
  /** Progress callback */
  onProgress?: (window: number, total: number, ppl: number) => void;
}

export interface F4EvalResult {
  /** exp(avgLoss) — raw perplexity of the compressed model */
  perplexity: number;
  /** Average cross-entropy loss (nats) */
  avgLoss: number;
  /** Ratio vs reference: compressedPpl / referencePpl. Target: ≤ threshold. */
  pplRatio: number | null;
  /** Per-layer mean KL divergence (if reference logits provided) */
  perLayerKL: number[];
  /** Whether any NaN was detected during eval */
  nanDetected: boolean;
  /** If NaN detected, which checkpoint/layer triggered it */
  nanLocation: string | null;
  /** Number of windows evaluated */
  windowCount: number;
  /** Total tokens evaluated */
  tokenCount: number;
  /** Per-window perplexities for analysis */
  windowPpls: number[];
}

// --- Core ---

/**
 * Stable log-softmax avoiding overflow.
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
  return logits[targetIdx] - Math.log(sumExp) - max;
}

/**
 * KL divergence between two logit distributions: KL(P || Q)
 * P = softmax(refLogits), Q = softmax(compLogits)
 */
function klDivergence(
  refLogits: Float32Array,
  compLogits: Float32Array
): number {
  const n = refLogits.length;

  // Compute log-softmax for both
  let maxRef = -Infinity,
    maxComp = -Infinity;
  for (let i = 0; i < n; i++) {
    if (refLogits[i] > maxRef) maxRef = refLogits[i];
    if (compLogits[i] > maxComp) maxComp = compLogits[i];
  }

  let sumExpRef = 0,
    sumExpComp = 0;
  for (let i = 0; i < n; i++) {
    sumExpRef += Math.exp(refLogits[i] - maxRef);
    sumExpComp += Math.exp(compLogits[i] - maxComp);
  }

  const logSumRef = Math.log(sumExpRef) + maxRef;
  const logSumComp = Math.log(sumExpComp) + maxComp;

  let kl = 0;
  for (let i = 0; i < n; i++) {
    const logP = refLogits[i] - logSumRef;
    const logQ = compLogits[i] - logSumComp;
    const p = Math.exp(logP);
    if (p > 1e-10) {
      kl += p * (logP - logQ);
    }
  }
  return Math.max(0, kl); // Clamp rounding errors
}

/**
 * Run the F4 evaluation harness.
 * Evaluates compressed model perplexity across N windows.
 */
export function runF4Eval(config: F4EvalConfig): F4EvalResult {
  const windowCount = config.windowCount ?? 30;
  const windowSize = config.windowSize ?? 2048;
  const enableTripwire = config.enableNanTripwire ?? true;

  const totalTokensNeeded = windowCount * windowSize;
  if (config.tokenIds.length < totalTokensNeeded) {
    throw new RangeError(
      `Need ${totalTokensNeeded} tokens for ${windowCount} windows × ${windowSize} tokens, ` +
        `but corpus has only ${config.tokenIds.length}`
    );
  }

  const driver = new CrystalTransformerDriver(config.driverConfig);
  const layerEngine = new CrystalInferenceLayer({
    vaultDir: config.vaultDir,
    maxHotLayers: config.maxHotLayers ?? 8,
  });

  const totalLayers = config.driverConfig.totalLayers ?? 80;
  const kvDim =
    (config.driverConfig.kvHeads ?? 8) * (config.driverConfig.headDim ?? 128);

  const tripwire: LayerProbe | undefined = enableTripwire
    ? (name: string, vec: Float32Array) => {
        // Parse layer number from probe name (e.g., "L5.h_postnorm" → 5)
        const match = name.match(/^L(\d+)\./);
        const layer = match ? parseInt(match[1], 10) : -1;
        assertFinite(name, layer, vec);
      }
    : undefined;

  let totalLoss = 0;
  let totalTokens = 0;
  let nanDetected = false;
  let nanLocation: string | null = null;
  const windowPpls: number[] = [];
  const perLayerKL: number[] = new Array(totalLayers).fill(0);
  let klSamples = 0;

  for (let w = 0; w < windowCount; w++) {
    const windowStart = w * windowSize;
    const windowTokens = config.tokenIds.slice(
      windowStart,
      windowStart + windowSize
    );

    const kvCache = new KvCache({
      numLayers: totalLayers,
      kvDim,
      maxTokens: windowSize,
    });

    let windowLoss = 0;
    let windowTokenCount = 0;

    for (let pos = 0; pos < windowTokens.length - 1; pos++) {
      const tokenId = windowTokens[pos];
      const targetId = windowTokens[pos + 1];

      try {
        const logits = driver.executeTokenPass(
          tokenId,
          pos,
          config.layersNorm,
          config.layersBias,
          config.finalNorm,
          kvCache,
          layerEngine,
          tripwire
        );

        // NaN check on final logits (belt + suspenders with tripwire)
        for (let i = 0; i < logits.length; i++) {
          if (!Number.isFinite(logits[i])) {
            nanDetected = true;
            nanLocation = `logits at window=${w}, pos=${pos}, index=${i}`;
            break;
          }
        }

        if (nanDetected) break;

        // Cross-entropy loss
        const logProb = logSoftmax(logits, targetId);
        const loss = -logProb;
        windowLoss += loss;
        windowTokenCount++;
        totalLoss += loss;
        totalTokens++;

        // Per-layer KL if reference logits available
        if (config.referenceLogits && config.referenceLogits[w]) {
          const refLogits = config.referenceLogits[w][pos];
          if (refLogits) {
            const kl = klDivergence(refLogits, logits);
            // Attribute KL to the last layer (output projection)
            // True per-layer KL requires probing each layer output
            perLayerKL[totalLayers - 1] += kl;
            klSamples++;
          }
        }
      } catch (err) {
        if (err instanceof NonFiniteError) {
          nanDetected = true;
          nanLocation = `${err.checkpoint} at layer=${err.layer}, index=${err.index}, value=${err.value}`;
          break;
        }
        throw err;
      }
    }

    if (nanDetected) break;

    const windowAvgLoss = windowLoss / windowTokenCount;
    const windowPpl = Math.exp(windowAvgLoss);
    windowPpls.push(windowPpl);

    config.onProgress?.(w + 1, windowCount, windowPpl);
  }

  // Normalize per-layer KL
  if (klSamples > 0) {
    for (let l = 0; l < totalLayers; l++) {
      perLayerKL[l] /= klSamples;
    }
  }

  const avgLoss = totalTokens > 0 ? totalLoss / totalTokens : Infinity;
  const perplexity = Math.exp(avgLoss);
  const pplRatio =
    config.referencePpl != null && config.referencePpl > 0
      ? perplexity / config.referencePpl
      : null;

  return {
    perplexity,
    avgLoss,
    pplRatio,
    perLayerKL,
    nanDetected,
    nanLocation,
    windowCount: windowPpls.length,
    tokenCount: totalTokens,
    windowPpls,
  };
}

/**
 * Check F4 result against acceptance thresholds.
 * Returns { passed, failures[] } for each gate.
 */
export function checkF4Thresholds(
  result: F4EvalResult,
  modelSize: '1B' | '3B' | '7B+'
): { passed: boolean; failures: string[] } {
  const failures: string[] = [];

  // NaN gate — immediate fail
  if (result.nanDetected) {
    failures.push(`NaN detected: ${result.nanLocation}`);
  }

  // PPL ratio gate
  if (result.pplRatio != null) {
    const ceiling = modelSize === '1B' ? 1.15 : modelSize === '3B' ? 1.1 : 1.08;
    if (result.pplRatio > ceiling) {
      failures.push(
        `PPL ratio ${result.pplRatio.toFixed(4)} exceeds ${modelSize} ceiling ${ceiling}`
      );
    }
  }

  // KL gate (if data available)
  const klValues = result.perLayerKL.filter((v) => v > 0);
  if (klValues.length > 0) {
    const meanKL = klValues.reduce((a, b) => a + b, 0) / klValues.length;
    const maxKL = Math.max(...klValues);
    const sorted = [...klValues].sort((a, b) => a - b);
    const p95KL = sorted[Math.floor(sorted.length * 0.95)] ?? maxKL;

    if (meanKL > 0.05) {
      failures.push(`Mean KL ${meanKL.toFixed(4)} exceeds threshold 0.05`);
    }
    if (maxKL > 0.2) {
      failures.push(`Max KL ${maxKL.toFixed(4)} exceeds threshold 0.20`);
    }
    if (p95KL > 0.1) {
      failures.push(`P95 KL ${p95KL.toFixed(4)} exceeds threshold 0.10`);
    }
  }

  return { passed: failures.length === 0, failures };
}
