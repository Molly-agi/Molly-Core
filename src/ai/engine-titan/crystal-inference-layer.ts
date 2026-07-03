// src/ai/engine-titan/crystal-inference-layer.ts
//
// On-demand crystal load → reconstruct → matmul → evict.
// Peak RAM = hot tier budget, not the full vault size.
// Vault format: {layerName}.A.f32 + {layerName}.B.packed + {layerName}.meta.json

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { TitanDecompressionEngine } from './reconstruction';
import { E8QuantizerAdapter } from './quantizer-e8-adapter';
import { inverseRHT, type RHTMeta } from './hadamard-transform';
import type { LayerMetadata } from './orchestrator';

export interface InferenceLayerOptions {
  vaultDir: string;
  maxHotLayers?: number; // max reconstructed weight matrices held in RAM (default 4)
}

export interface ForwardResult {
  output: Float32Array;
  rows: number;
  cols: number;
  fromCache: boolean;
}

export class CrystalInferenceLayer {
  private readonly vaultDir: string;
  private readonly maxHot: number;
  private readonly engine = new TitanDecompressionEngine();
  private readonly e8Adapter = new E8QuantizerAdapter();

  // LRU: Map preserves insertion order; least-recently-used is first entry
  private readonly hot = new Map<string, Float32Array>();
  private readonly metaCache = new Map<string, LayerMetadata>();

  constructor(opts: InferenceLayerOptions) {
    this.vaultDir = opts.vaultDir;
    this.maxHot = opts.maxHotLayers ?? 4;
  }

  private loadMeta(layerName: string): LayerMetadata {
    const cached = this.metaCache.get(layerName);
    if (cached) return cached;
    const path = join(this.vaultDir, `${layerName}.meta.json`);
    const meta: LayerMetadata = JSON.parse(readFileSync(path, 'utf-8'));
    this.metaCache.set(layerName, meta);
    return meta;
  }

  /**
   * Decode packedB using the adapter matching meta.quantizerType.
   * Undefined/'ternary' → legacy ternary path via TitanDecompressionEngine.
   * 'e8-lattice' → E8QuantizerAdapter, which handles inverseRHT internally.
   * Returns matrixB at [targetRank × cols], RHT already inverted.
   */
  private decodePackedB(
    packedB: Buffer,
    targetRank: number,
    cols: number,
    meta: LayerMetadata
  ): Float32Array {
    const rhtMeta: RHTMeta | undefined =
      meta.rhtSeed != null && meta.rhtPaddedCols != null
        ? {
            seed: meta.rhtSeed,
            originalCols: cols,
            paddedCols: meta.rhtPaddedCols,
          }
        : undefined;

    if (meta.quantizerType === 'e8-lattice') {
      const result = this.e8Adapter.dequantize(
        packedB,
        targetRank,
        cols,
        rhtMeta
      );
      return result.weights;
    }

    // Legacy ternary path (undefined quantizerType treated as ternary).
    const paddedCols = meta.rhtPaddedCols ?? cols;
    let dequantB = this.engine.dequantize(packedB, targetRank * paddedCols);
    if (rhtMeta) {
      dequantB = inverseRHT(dequantB, targetRank, rhtMeta);
    }
    return dequantB;
  }

  /**
   * Read a raw .A.f32 file into a properly-aligned Float32Array.
   * Node's small-file Buffer pool doesn't guarantee 4-byte alignment; copy
   * into a fresh ArrayBuffer so Float32Array construction is always safe.
   */
  private readAlignedF32(path: string, elementCount: number): Float32Array {
    const buf = readFileSync(path);
    const aligned = new ArrayBuffer(elementCount * 4);
    Buffer.from(aligned).set(buf.subarray(0, elementCount * 4));
    return new Float32Array(aligned);
  }

  private evictIfNeeded(): void {
    while (this.hot.size >= this.maxHot) {
      const oldest = this.hot.keys().next().value;
      if (oldest) this.hot.delete(oldest);
    }
  }

  // forward: fused two-step kernel — X@(A@B) = (X@A)@B.
  // Dequantizes B to F32, never materializes full W=[rows×cols].
  // Hot cache stores [A | B_dequant] — ~160MB for token_embd, ~8MB for attn layers.
  forward(
    layerName: string,
    input: Float32Array,
    seqLen: number,
    inDim: number
  ): ForwardResult {
    const wasCached = this.hot.has(layerName);

    const aPath = join(this.vaultDir, `${layerName}.A.f32`);
    const bPath = join(this.vaultDir, `${layerName}.B.packed`);
    const mPath = join(this.vaultDir, `${layerName}.meta.json`);
    if (!existsSync(aPath) || !existsSync(bPath) || !existsSync(mPath)) {
      throw new Error(`Crystal not found in vault: ${layerName}`);
    }

    const meta = this.loadMeta(layerName);
    const { rows, cols, targetRank } = meta;

    // Load A [rows × rank] and dequantize B [rank × cols] on demand
    let matrixA: Float32Array;
    let matrixB: Float32Array;

    if (wasCached) {
      const cached = this.hot.get(layerName)!;
      // cached stores [A | B_dequant] concatenated
      matrixA = cached.subarray(0, rows * targetRank);
      matrixB = cached.subarray(rows * targetRank);
      this.hot.delete(layerName);
      this.hot.set(layerName, cached);
    } else {
      const bBuf = readFileSync(bPath);
      const matrixAFresh = this.readAlignedF32(aPath, rows * targetRank);
      matrixA = matrixAFresh;

      // Decode B via the adapter matching meta.quantizerType.
      // E8 adapter inverts RHT internally; ternary path handles it here.
      matrixB = this.decodePackedB(bBuf, targetRank, cols, meta);

      // Cache A and dequantized B together
      const combined = new Float32Array(rows * targetRank + targetRank * cols);
      combined.set(matrixA, 0);
      combined.set(matrixB, rows * targetRank);
      this.evictIfNeeded();
      this.hot.set(layerName, combined);
    }

    // Fused: temp = input @ A  [seqLen × rank]
    const temp = matmul(input, matrixA, seqLen, inDim, targetRank);
    // output = temp @ B        [seqLen × cols]
    const output = matmul(temp, matrixB, seqLen, targetRank, cols);

    return { output, rows: seqLen, cols, fromCache: wasCached };
  }

  // Column gather: for [rows × cols] weight W = A @ B, returns W[:, tokenId].
  // Used for embedding lookups (token_embd) — avoids materializing full [8192 × 152064].
  // Load-and-cache path is identical to forward(), so hot-tier stays warm across calls.
  getEmbeddingColumn(layerName: string, tokenId: number): Float32Array {
    const meta = this.loadMeta(layerName);
    const { rows, cols, targetRank } = meta;
    if (tokenId < 0 || tokenId >= cols) {
      throw new RangeError(`tokenId ${tokenId} out of range [0, ${cols})`);
    }

    let cached = this.hot.get(layerName);
    if (!cached) {
      const aPath = join(this.vaultDir, `${layerName}.A.f32`);
      const bPath = join(this.vaultDir, `${layerName}.B.packed`);
      if (!existsSync(aPath) || !existsSync(bPath)) {
        throw new Error(`Crystal not found in vault: ${layerName}`);
      }
      const bBuf = readFileSync(bPath);
      const matrixA = this.readAlignedF32(aPath, rows * targetRank);
      const matrixB = this.decodePackedB(bBuf, targetRank, cols, meta);
      const combined = new Float32Array(rows * targetRank + targetRank * cols);
      combined.set(matrixA, 0);
      combined.set(matrixB, rows * targetRank);
      this.evictIfNeeded();
      this.hot.set(layerName, combined);
      cached = combined;
    } else {
      this.hot.delete(layerName);
      this.hot.set(layerName, cached);
    }

    const matrixA = cached.subarray(0, rows * targetRank);
    const matrixB = cached.subarray(rows * targetRank);

    const out = new Float32Array(rows);
    for (let i = 0; i < rows; i++) {
      let sum = 0;
      for (let r = 0; r < targetRank; r++) {
        sum += matrixA[i * targetRank + r] * matrixB[r * cols + tokenId];
      }
      out[i] = sum;
    }
    return out;
  }

  // Evict a specific crystal from hot tier (free RAM explicitly)
  evict(layerName: string): boolean {
    return this.hot.delete(layerName);
  }

  // Evict everything — use between inference calls on memory-constrained device
  evictAll(): void {
    this.hot.clear();
  }

  get hotCount(): number {
    return this.hot.size;
  }

  get hotLayerNames(): string[] {
    return [...this.hot.keys()];
  }
}

// Row-major matmul: A[m×k] × B[k×n] → C[m×n]
// i-p-j loop order: reads A row-wise (aip is loop-invariant across j),
// reads B row-wise (B[bRowOff + j] increments by 1), writes C row-wise.
// Cache-locality-friendly — ~2-4× vs naive i-j-p on large layers.
function matmul(
  A: Float32Array,
  B: Float32Array,
  m: number,
  k: number,
  n: number
): Float32Array {
  const C = new Float32Array(m * n);
  for (let i = 0; i < m; i++) {
    const cRowOff = i * n;
    const aRowOff = i * k;
    for (let p = 0; p < k; p++) {
      const aip = A[aRowOff + p];
      if (aip === 0) continue;
      const bRowOff = p * n;
      for (let j = 0; j < n; j++) {
        C[cRowOff + j] += aip * B[bRowOff + j];
      }
    }
  }
  return C;
}
