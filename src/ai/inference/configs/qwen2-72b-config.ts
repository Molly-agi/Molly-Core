// src/ai/inference/configs/qwen2-72b-config.ts
//
// Real Qwen 2.5 72B geometry + 1D weight loader from GGUF.
// Verified against GGUF metadata fields from the actual model file.

import { parseGGUF } from '../../engine-titan/gguf-ingest';
import { readTensorData } from '../../engine-titan/gguf-dequant';
import type {
  DriverConfig,
  LayerNormWeights,
  LayerBiasWeights,
} from '../crystal-transformer-driver';

/**
 * Qwen 2.5 72B Instruct geometry — verified from GGUF metadata.
 * Source: qwen2.* keys in model header.
 */
export const QWEN2_72B_CONFIG: DriverConfig = {
  totalLayers: 80,
  hiddenSize: 8192,
  kvHeads: 8,
  qHeads: 64,
  headDim: 128, // hiddenSize / qHeads = 8192 / 64
  ffnIntermediate: 29568,
  vocabSize: 152064,
  ropeTheta: 1000000.0,
  rmsNormEps: 1e-6,
};

/**
 * Loads all 1D tensors (norms + biases) from GGUF that are NOT in the crystal vault.
 * These are needed by CrystalTransformerDriver at inference time.
 *
 * Returns:
 * - layersNorm[80]: per-layer attention + FFN norm gains
 * - layersBias[80]: per-layer Q/K/V biases
 * - finalNorm: output_norm.weight (final RMSNorm before logit projection)
 */
export function loadGguf1DWeights(ggufPath: string): {
  layersNorm: LayerNormWeights[];
  layersBias: LayerBiasWeights[];
  finalNorm: Float32Array;
} {
  const gguf = parseGGUF(ggufPath);
  const NUM_LAYERS = 80;

  const layersNorm: LayerNormWeights[] = new Array(NUM_LAYERS);
  const layersBias: LayerBiasWeights[] = new Array(NUM_LAYERS);

  for (let l = 0; l < NUM_LAYERS; l++) {
    const attnNorm = gguf.tensors.find(
      (t) => t.name === `blk.${l}.attn_norm.weight`
    );
    const ffnNorm = gguf.tensors.find(
      (t) => t.name === `blk.${l}.ffn_norm.weight`
    );
    const qBias = gguf.tensors.find((t) => t.name === `blk.${l}.attn_q.bias`);
    const kBias = gguf.tensors.find((t) => t.name === `blk.${l}.attn_k.bias`);
    const vBias = gguf.tensors.find((t) => t.name === `blk.${l}.attn_v.bias`);

    if (!attnNorm || !ffnNorm || !qBias || !kBias || !vBias) {
      throw new Error(`Missing 1D tensors for layer ${l}`);
    }

    layersNorm[l] = {
      attnNormGain: readTensorData(gguf, attnNorm),
      ffnNormGain: readTensorData(gguf, ffnNorm),
    };

    layersBias[l] = {
      qBias: readTensorData(gguf, qBias),
      kBias: readTensorData(gguf, kBias),
      vBias: readTensorData(gguf, vBias),
    };
  }

  const outputNorm = gguf.tensors.find((t) => t.name === 'output_norm.weight');
  if (!outputNorm) throw new Error('Missing output_norm.weight');
  const finalNorm = readTensorData(gguf, outputNorm);

  return { layersNorm, layersBias, finalNorm };
}

/**
 * Verify geometry matches GGUF metadata. Throws if mismatch.
 */
export function verifyGeometry(ggufPath: string): void {
  const gguf = parseGGUF(ggufPath);
  const m = gguf.header.metadata;

  const checks: [string, unknown, unknown][] = [
    ['block_count', m.get('qwen2.block_count'), QWEN2_72B_CONFIG.totalLayers],
    [
      'embedding_length',
      m.get('qwen2.embedding_length'),
      QWEN2_72B_CONFIG.hiddenSize,
    ],
    [
      'head_count',
      m.get('qwen2.attention.head_count'),
      QWEN2_72B_CONFIG.qHeads,
    ],
    [
      'head_count_kv',
      m.get('qwen2.attention.head_count_kv'),
      QWEN2_72B_CONFIG.kvHeads,
    ],
    [
      'feed_forward_length',
      m.get('qwen2.feed_forward_length'),
      QWEN2_72B_CONFIG.ffnIntermediate,
    ],
    [
      'rope.freq_base',
      m.get('qwen2.rope.freq_base'),
      QWEN2_72B_CONFIG.ropeTheta,
    ],
  ];

  for (const [name, actual, expected] of checks) {
    if (actual !== expected) {
      throw new Error(
        `Geometry mismatch: ${name} = ${actual}, expected ${expected}`
      );
    }
  }
}
