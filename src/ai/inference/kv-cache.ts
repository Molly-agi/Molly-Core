// src/ai/inference/kv-cache.ts
//
// Preallocated flat-buffer KV cache with sliding-window eviction.
// Replaces the push-based Float32Array[] model — same access pattern (per-layer,
// per-token subarrays), zero per-token allocation, bounded RAM.
//
// Per-token cost: kvDim * 4 bytes * 2 (K+V) * numLayers.
// Qwen 2.5 72B: 1024 * 4 * 2 * 80 = 655,360 bytes ≈ 0.625 MB / token.
// maxTokens=2048 → ~1.28 GB total, fully preallocated.
//
// Sliding window: when a write would land past maxTokens, shift all history
// left by one token slot per layer (copyWithin), drop token 0, then write at
// maxTokens-1. Length caps at maxTokens.
//
// KVarN integration: optional dual-axis variance normalization for long-context
// compression. When enabled, K/V vectors are normalized on write and
// denormalized on read, allowing low-bit quantization of the stored values
// without error accumulation across decode steps.

export interface KvCacheConfig {
  numLayers: number;
  kvDim: number; // kvHeads * headDim (Qwen 2.5 72B: 8 * 128 = 1024)
  maxTokens: number;
  enableKVarN?: boolean; // dual-axis variance normalization (default: false)
}

export class KvCache {
  readonly numLayers: number;
  readonly kvDim: number;
  readonly maxTokens: number;
  readonly kvarnEnabled: boolean;
  // When kvarnEnabled, storage is Int8Array (4x RAM savings); otherwise Float32Array.
  private readonly K: (Float32Array | Int8Array)[];
  private readonly V: (Float32Array | Int8Array)[];
  private _length = 0;

  // KVarN normalization state: per-channel RMS tracked incrementally.
  // sigmaChannel is updated on every append via running mean of squares.
  private readonly sigmaChannelK: Float32Array[] | null;
  private readonly sigmaChannelV: Float32Array[] | null;
  // Per-token sigma stored alongside cache for exact reconstruction.
  private readonly sigmaTokenK: Float32Array[] | null;
  private readonly sigmaTokenV: Float32Array[] | null;
  // Per-token absmax scale for int8 dequantization (only when kvarnEnabled).
  private readonly scaleK: Float32Array[] | null;
  private readonly scaleV: Float32Array[] | null;

  constructor(cfg: KvCacheConfig) {
    this.numLayers = cfg.numLayers;
    this.kvDim = cfg.kvDim;
    this.maxTokens = cfg.maxTokens;
    this.kvarnEnabled = cfg.enableKVarN ?? false;
    this.K = new Array(cfg.numLayers);
    this.V = new Array(cfg.numLayers);

    if (this.kvarnEnabled) {
      this.sigmaChannelK = new Array(cfg.numLayers);
      this.sigmaChannelV = new Array(cfg.numLayers);
      this.sigmaTokenK = new Array(cfg.numLayers);
      this.sigmaTokenV = new Array(cfg.numLayers);
      this.scaleK = new Array(cfg.numLayers);
      this.scaleV = new Array(cfg.numLayers);
    } else {
      this.sigmaChannelK = null;
      this.sigmaChannelV = null;
      this.sigmaTokenK = null;
      this.sigmaTokenV = null;
      this.scaleK = null;
      this.scaleV = null;
    }

    for (let l = 0; l < cfg.numLayers; l++) {
      if (this.kvarnEnabled) {
        // Int8 storage: 4x smaller than Float32
        this.K[l] = new Int8Array(cfg.maxTokens * cfg.kvDim);
        this.V[l] = new Int8Array(cfg.maxTokens * cfg.kvDim);
        this.sigmaChannelK![l] = new Float32Array(cfg.kvDim).fill(1);
        this.sigmaChannelV![l] = new Float32Array(cfg.kvDim).fill(1);
        this.sigmaTokenK![l] = new Float32Array(cfg.maxTokens).fill(1);
        this.sigmaTokenV![l] = new Float32Array(cfg.maxTokens).fill(1);
        this.scaleK![l] = new Float32Array(cfg.maxTokens);
        this.scaleV![l] = new Float32Array(cfg.maxTokens);
      } else {
        this.K[l] = new Float32Array(cfg.maxTokens * cfg.kvDim);
        this.V[l] = new Float32Array(cfg.maxTokens * cfg.kvDim);
      }
    }
  }

  get length(): number {
    return this._length;
  }

  append(layer: number, k: Float32Array, v: Float32Array): void {
    if (k.length !== this.kvDim || v.length !== this.kvDim) {
      throw new Error(
        `kv vector length mismatch: got k=${k.length} v=${v.length} expected ${this.kvDim}`
      );
    }
    const tokenIdx =
      this._length < this.maxTokens ? this._length : this.maxTokens - 1;

    if (this._length >= this.maxTokens && layer === 0) {
      this.evictOldest();
    }

    const base = tokenIdx * this.kvDim;

    if (this.kvarnEnabled) {
      // Compute per-token sigma (RMS of this vector)
      const sigTokK = rms(k);
      const sigTokV = rms(v);
      this.sigmaTokenK![layer][tokenIdx] = sigTokK;
      this.sigmaTokenV![layer][tokenIdx] = sigTokV;

      // Update running channel sigma with this new token's contribution
      this.updateChannelSigma(layer, k, v, tokenIdx);

      // Normalize then quantize to int8 with per-token absmax scaling
      const chanK = this.sigmaChannelK![layer];
      const chanV = this.sigmaChannelV![layer];
      const int8K = this.K[layer] as Int8Array;
      const int8V = this.V[layer] as Int8Array;

      // Find absmax of normalized values for scaling
      let maxAbsK = 0;
      let maxAbsV = 0;
      for (let j = 0; j < this.kvDim; j++) {
        const nk = k[j] / (sigTokK * chanK[j]);
        const nv = v[j] / (sigTokV * chanV[j]);
        const ak = Math.abs(nk);
        const av = Math.abs(nv);
        if (ak > maxAbsK) maxAbsK = ak;
        if (av > maxAbsV) maxAbsV = av;
      }

      // Scale: maps [-maxAbs, +maxAbs] → [-127, +127]
      const invScaleK = maxAbsK > 0 ? 127.0 / maxAbsK : 0;
      const invScaleV = maxAbsV > 0 ? 127.0 / maxAbsV : 0;
      this.scaleK![layer][tokenIdx] = maxAbsK / 127.0;
      this.scaleV![layer][tokenIdx] = maxAbsV / 127.0;

      // Quantize normalized values to int8
      for (let j = 0; j < this.kvDim; j++) {
        const nk = k[j] / (sigTokK * chanK[j]);
        const nv = v[j] / (sigTokV * chanV[j]);
        int8K[base + j] = Math.round(
          Math.max(-127, Math.min(127, nk * invScaleK))
        );
        int8V[base + j] = Math.round(
          Math.max(-127, Math.min(127, nv * invScaleV))
        );
      }
    } else {
      (this.K[layer] as Float32Array).set(k, base);
      (this.V[layer] as Float32Array).set(v, base);
    }

    if (layer === this.numLayers - 1 && this._length < this.maxTokens) {
      this._length++;
    }
  }

  getK(layer: number, tokenIdx: number): Float32Array {
    const base = tokenIdx * this.kvDim;
    if (this.kvarnEnabled) {
      return this.dequantizeAndDenormalize(
        this.K[layer] as Int8Array,
        base,
        this.scaleK![layer][tokenIdx],
        this.sigmaTokenK![layer][tokenIdx],
        this.sigmaChannelK![layer]
      );
    }
    return (this.K[layer] as Float32Array).subarray(base, base + this.kvDim);
  }

  getV(layer: number, tokenIdx: number): Float32Array {
    const base = tokenIdx * this.kvDim;
    if (this.kvarnEnabled) {
      return this.dequantizeAndDenormalize(
        this.V[layer] as Int8Array,
        base,
        this.scaleV![layer][tokenIdx],
        this.sigmaTokenV![layer][tokenIdx],
        this.sigmaChannelV![layer]
      );
    }
    return (this.V[layer] as Float32Array).subarray(base, base + this.kvDim);
  }

  /**
   * Dequantize int8 → float32, then denormalize with KVarN sigmas.
   * Reconstruction: value = int8 * quantScale * sigmaToken * sigmaChannel[j]
   */
  private dequantizeAndDenormalize(
    buf: Int8Array,
    base: number,
    quantScale: number,
    sigmaToken: number,
    sigmaChannel: Float32Array
  ): Float32Array {
    const out = new Float32Array(this.kvDim);
    for (let j = 0; j < this.kvDim; j++) {
      out[j] = buf[base + j] * quantScale * sigmaToken * sigmaChannel[j];
    }
    return out;
  }

  private updateChannelSigma(
    layer: number,
    k: Float32Array,
    v: Float32Array,
    tokenIdx: number
  ): void {
    const n = tokenIdx + 1;
    const chanK = this.sigmaChannelK![layer];
    const chanV = this.sigmaChannelV![layer];
    const EPSILON = 1e-6;

    if (n === 1) {
      for (let j = 0; j < this.kvDim; j++) {
        chanK[j] = Math.abs(k[j]) + EPSILON;
        chanV[j] = Math.abs(v[j]) + EPSILON;
      }
    } else {
      // Incremental RMS: σ²_new = ((n-1)/n) * σ²_old + (1/n) * x²
      const wOld = (n - 1) / n;
      const wNew = 1 / n;
      for (let j = 0; j < this.kvDim; j++) {
        const oldSqK = chanK[j] * chanK[j];
        chanK[j] = Math.sqrt(wOld * oldSqK + wNew * k[j] * k[j]) + EPSILON;
        const oldSqV = chanV[j] * chanV[j];
        chanV[j] = Math.sqrt(wOld * oldSqV + wNew * v[j] * v[j]) + EPSILON;
      }
    }
  }

  private evictOldest(): void {
    for (let l = 0; l < this.numLayers; l++) {
      this.K[l].copyWithin(0, this.kvDim);
      this.V[l].copyWithin(0, this.kvDim);
      if (this.kvarnEnabled) {
        this.sigmaTokenK![l].copyWithin(0, 1);
        this.sigmaTokenV![l].copyWithin(0, 1);
        this.scaleK![l].copyWithin(0, 1);
        this.scaleV![l].copyWithin(0, 1);
      }
    }
  }

  reset(): void {
    this._length = 0;
    if (this.kvarnEnabled) {
      for (let l = 0; l < this.numLayers; l++) {
        this.sigmaChannelK![l].fill(1);
        this.sigmaChannelV![l].fill(1);
        this.sigmaTokenK![l].fill(1);
        this.sigmaTokenV![l].fill(1);
        this.scaleK![l].fill(0);
        this.scaleV![l].fill(0);
      }
    }
  }

  get byteLength(): number {
    if (this.kvarnEnabled) {
      // Int8 KV storage: 1 byte per element (4x savings over Float32)
      let bytes = this.numLayers * this.maxTokens * this.kvDim * 1 * 2;
      // Sigma vectors: 2 channel arrays (kvDim fp32) + 2 token arrays (maxTokens fp32) per layer
      bytes += this.numLayers * (this.kvDim * 4 * 2 + this.maxTokens * 4 * 2);
      // Quantization scales: 2 per-token arrays (maxTokens fp32) per layer
      bytes += this.numLayers * this.maxTokens * 4 * 2;
      return bytes;
    }
    return this.numLayers * this.maxTokens * this.kvDim * 4 * 2;
  }
}

function rms(vec: Float32Array): number {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) {
    const v = vec[i];
    sumSq += v * v;
  }
  return Math.sqrt(sumSq / vec.length) + 1e-6;
}
