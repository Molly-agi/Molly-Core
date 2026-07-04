// src/ai/inference/crystal-transformer-driver.ts
//
// Autoregressive forward-pass driver for Qwen 2.5 72B running on Titan crystal vault.
// PRE-norm + GQA (64Q / 8KV) + NeoX-style RoPE + SwiGLU FFN.
//
// Design notes:
// - 1D tensors (norm gains, Q/K/V biases) are NOT in the crystal vault (streaming-compress.ts:57
//   gates on dimensions.length === 2). Loader must pass them in raw from GGUF.
// - vault stores W as [rows × cols] with rows = input dim, cols = output dim, so
//   layerEngine.forward computes input @ A @ B correctly for standard weight orientation.
// - token_embd is [8192, 152064] in vault (GGUF [hidden, vocab]); embedding lookup is a
//   column-gather via getEmbeddingColumn, never a full reconstruction.
// - RoPE is applied at write-time to K; Q is rotated fresh every step. KV cache stores
//   post-RoPE K and post-bias V.

import type { CrystalInferenceLayer } from '../engine-titan/crystal-inference-layer';
import type { KvCache } from './kv-cache';

export interface LayerNormWeights {
  attnNormGain: Float32Array; // length hiddenSize, raw GGUF
  ffnNormGain: Float32Array; // length hiddenSize, raw GGUF
}

export interface LayerBiasWeights {
  qBias: Float32Array; // length hiddenSize (qHeads * headDim)
  kBias: Float32Array; // length kvDim (kvHeads * headDim)
  vBias: Float32Array; // length kvDim (kvHeads * headDim)
}

/** Optional probe callback for layer-level activation diagnostics. */
export type LayerProbe = (name: string, vec: Float32Array) => void;

/** Model geometry — defaults to Qwen 2.5 72B. */
export interface DriverConfig {
  totalLayers?: number;
  hiddenSize?: number;
  kvHeads?: number;
  qHeads?: number;
  headDim?: number;
  ropeTheta?: number;
}

export class CrystalTransformerDriver {
  private readonly totalLayers: number;
  private readonly hiddenSize: number;
  private readonly kvHeads: number;
  private readonly qHeads: number;
  private readonly headDim: number;
  private readonly ropeTheta: number;

  constructor(config?: DriverConfig) {
    this.totalLayers = config?.totalLayers ?? 80;
    this.hiddenSize = config?.hiddenSize ?? 8192;
    this.kvHeads = config?.kvHeads ?? 8;
    this.qHeads = config?.qHeads ?? 64;
    this.headDim = config?.headDim ?? 128;
    this.ropeTheta = config?.ropeTheta ?? 1000000.0;
  }

  private rmsNorm(
    x: Float32Array,
    gain: Float32Array,
    eps = 1e-6
  ): Float32Array {
    const out = new Float32Array(this.hiddenSize);
    let sumSq = 0.0;
    for (let i = 0; i < this.hiddenSize; i++) sumSq += x[i] * x[i];
    const scale = 1.0 / Math.sqrt(sumSq / this.hiddenSize + eps);
    for (let i = 0; i < this.hiddenSize; i++) out[i] = x[i] * scale * gain[i];
    return out;
  }

  // NeoX / Qwen 2.5 RoPE: pair (i, i+head_dim/2), NOT (2i, 2i+1)
  private applyNeoXRoPE(vec: Float32Array, pos: number): Float32Array {
    const out = new Float32Array(this.headDim);
    const half = this.headDim / 2;
    for (let i = 0; i < half; i++) {
      const x0 = vec[i];
      const x1 = vec[i + half];
      const freq = 1.0 / Math.pow(this.ropeTheta, (i * 2) / this.headDim);
      const alpha = pos * freq;
      const cosA = Math.cos(alpha);
      const sinA = Math.sin(alpha);
      out[i] = x0 * cosA - x1 * sinA;
      out[i + half] = x0 * sinA + x1 * cosA;
    }
    return out;
  }

  public executeTokenPass(
    tokenId: number,
    currentPos: number,
    layersNorm: LayerNormWeights[],
    layersBias: LayerBiasWeights[],
    finalNorm: Float32Array,
    kvCache: KvCache,
    layerEngine: CrystalInferenceLayer,
    probe?: LayerProbe
  ): Float32Array {
    // 1. Embedding lookup — column gather, never full reconstruction
    const x = layerEngine.getEmbeddingColumn('token_embd.weight', tokenId);

    // 2. Transformer stack
    for (let l = 0; l < this.totalLayers; l++) {
      const norm = layersNorm[l];
      const bias = layersBias[l];

      // a. Pre-attention RMSNorm
      const h_normed = this.rmsNorm(x, norm.attnNormGain);
      probe?.(`L${l}.h_postnorm`, h_normed);

      // a'. OffQ rotation is folded into weights at QUANTIZATION TIME
      // (streaming-compress pre-rotates: W' = W @ T^{-1}).
      // At inference, activations pass through unmodified.
      // DO NOT apply runtime OffQ here — it breaks the signal path
      // unless weights were conjugated (T @ W @ T^{-1}).
      const h_attn = h_normed;

      // b. Q/K/V projections via crystal vault
      const qProj = layerEngine.forward(
        `blk.${l}.attn_q.weight`,
        h_attn,
        1,
        this.hiddenSize
      ).output;
      const kProj = layerEngine.forward(
        `blk.${l}.attn_k.weight`,
        h_attn,
        1,
        this.hiddenSize
      ).output;
      const vProj = layerEngine.forward(
        `blk.${l}.attn_v.weight`,
        h_attn,
        1,
        this.hiddenSize
      ).output;

      // c. Add 1D biases (skipped by decomposer, loaded raw)
      for (let i = 0; i < qProj.length; i++) qProj[i] += bias.qBias[i];
      for (let i = 0; i < kProj.length; i++) kProj[i] += bias.kBias[i];
      for (let i = 0; i < vProj.length; i++) vProj[i] += bias.vBias[i];

      // d. Head segmentation + NeoX RoPE (Q gets fresh pos, K stored post-RoPE)
      const q = new Float32Array(this.qHeads * this.headDim);
      for (let h = 0; h < this.qHeads; h++) {
        const slice = qProj.subarray(h * this.headDim, (h + 1) * this.headDim);
        q.set(this.applyNeoXRoPE(slice, currentPos), h * this.headDim);
      }
      const k = new Float32Array(this.kvHeads * this.headDim);
      for (let h = 0; h < this.kvHeads; h++) {
        const slice = kProj.subarray(h * this.headDim, (h + 1) * this.headDim);
        k.set(this.applyNeoXRoPE(slice, currentPos), h * this.headDim);
      }
      probe?.(`L${l}.q_postrope`, q);
      probe?.(`L${l}.k_postrope`, k);

      // e. Append to KV cache (per-layer, flat preallocated buffer)
      kvCache.append(l, k, vProj);
      const tokenCount = kvCache.length;

      // f. Grouped attention (qHeads/kvHeads mapping)
      const attnOut = new Float32Array(this.hiddenSize);
      const scaleFactor = 1.0 / Math.sqrt(this.headDim);
      const headsPerGroup = this.qHeads / this.kvHeads;

      for (let h = 0; h < this.qHeads; h++) {
        const kvGroupIdx = Math.floor(h / headsPerGroup);
        const scores = new Float32Array(tokenCount);
        let maxScore = -Infinity;
        const q_head = q.subarray(h * this.headDim, (h + 1) * this.headDim);

        for (let t = 0; t < tokenCount; t++) {
          const kFull = kvCache.getK(l, t);
          const k_hist = kFull.subarray(
            kvGroupIdx * this.headDim,
            (kvGroupIdx + 1) * this.headDim
          );
          let dot = 0;
          for (let d = 0; d < this.headDim; d++) dot += q_head[d] * k_hist[d];
          scores[t] = dot * scaleFactor;
          if (scores[t] > maxScore) maxScore = scores[t];
        }

        let sumExp = 0.0;
        for (let t = 0; t < scores.length; t++) {
          scores[t] = Math.exp(scores[t] - maxScore);
          sumExp += scores[t];
        }
        for (let t = 0; t < scores.length; t++) scores[t] /= sumExp;

        const headContext = new Float32Array(this.headDim);
        for (let t = 0; t < scores.length; t++) {
          const vFull = kvCache.getV(l, t);
          const v_hist = vFull.subarray(
            kvGroupIdx * this.headDim,
            (kvGroupIdx + 1) * this.headDim
          );
          for (let d = 0; d < this.headDim; d++) {
            headContext[d] += scores[t] * v_hist[d];
          }
        }
        attnOut.set(headContext, h * this.headDim);
      }

      // g. Output projection + residual
      const mergedAttn = layerEngine.forward(
        `blk.${l}.attn_output.weight`,
        attnOut,
        1,
        this.hiddenSize
      ).output;
      probe?.(`L${l}.attn_out`, mergedAttn);
      for (let i = 0; i < this.hiddenSize; i++) x[i] += mergedAttn[i];
      probe?.(`L${l}.h_postattn`, Float32Array.from(x));

      // h. Pre-FFN RMSNorm
      const h_ffn = this.rmsNorm(x, norm.ffnNormGain);

      // i. SwiGLU FFN
      const gateProj = layerEngine.forward(
        `blk.${l}.ffn_gate.weight`,
        h_ffn,
        1,
        this.hiddenSize
      ).output;
      const upProj = layerEngine.forward(
        `blk.${l}.ffn_up.weight`,
        h_ffn,
        1,
        this.hiddenSize
      ).output;

      const intermediate = new Float32Array(gateProj.length);
      for (let i = 0; i < gateProj.length; i++) {
        const silu = gateProj[i] * (1.0 / (1.0 + Math.exp(-gateProj[i])));
        intermediate[i] = silu * upProj[i];
      }

      const downProj = layerEngine.forward(
        `blk.${l}.ffn_down.weight`,
        intermediate,
        1,
        intermediate.length
      ).output;
      probe?.(`L${l}.ffn_out`, downProj);
      for (let i = 0; i < this.hiddenSize; i++) x[i] += downProj[i];
      probe?.(`L${l}.h_out`, Float32Array.from(x));
    }

    // 3. Final RMSNorm
    const finalActivation = this.rmsNorm(x, finalNorm);

    // 4. Logits — output.weight [hidden, vocab] via forward().
    // Tied-embedding fallback: Qwen-3B and similar models share token_embd as
    // the output projection (no separate output.weight). If output.weight is
    // absent from the vault, reuse token_embd.weight transparently.
    let logitLayerName = 'output.weight';
    try {
      const logits = layerEngine.forward(
        logitLayerName,
        finalActivation,
        1,
        this.hiddenSize
      ).output;
      return logits;
    } catch (e) {
      if ((e as Error).message?.includes('Crystal not found')) {
        // Tied embeddings: fall back to token_embd.weight
        logitLayerName = 'token_embd.weight';
        const logits = layerEngine.forward(
          logitLayerName,
          finalActivation,
          1,
          this.hiddenSize
        ).output;
        return logits;
      }
      throw e;
    }
  }
}
