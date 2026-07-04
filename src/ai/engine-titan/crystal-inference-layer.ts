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
import {
  unpackInt8RowQuantized,
  type Int8RowQuantized,
} from './int8-row-quantizer';
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
  // B2 fix: int8 layers cache compact representation (scales + Int8Array)
  // instead of materialized fp32. ~4× less RAM per cached layer.
  private readonly hotInt8 = new Map<string, Int8RowQuantized>();
  private readonly metaCache = new Map<string, LayerMetadata>();

  constructor(opts: InferenceLayerOptions) {
    this.vaultDir = opts.vaultDir;
    this.maxHot = opts.maxHotLayers ?? 4;
  }

  private loadMeta(layerName: string): LayerMetadata {
    const cached = this.metaCache.get(layerName);
    if (cached) return cached;
    const path = join(this.vaultDir, `${layerName}.meta.json`);
    if (!existsSync(path)) {
      throw new Error(`Crystal not found in vault: ${layerName}`);
    }
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
    while (this.hot.size + this.hotInt8.size >= this.maxHot) {
      // Evict from whichever cache has the oldest entry (by insertion order).
      // Check both first-keys and evict the one that was inserted first.
      const oldestF32 = this.hot.keys().next().value;
      const oldestI8 = this.hotInt8.keys().next().value;
      if (oldestF32 && !oldestI8) {
        this.hot.delete(oldestF32);
      } else if (oldestI8 && !oldestF32) {
        this.hotInt8.delete(oldestI8);
      } else if (oldestF32) {
        // Both have entries — evict f32 first (larger footprint)
        this.hot.delete(oldestF32);
      }
    }
  }

  // forward: dispatch on meta.compressionPath.
  //   'svd-e8' (or undefined for legacy vaults) → fused X@(A@B) — current path
  //   'raw-e8' / 'raw-e8-rht'                  → X @ dequant(B), no A factor
  //   'int8-per-row'                            → X @ (scales · int8B), no A factor
  //
  // For SVD path: dequantizes B to F32, never materializes full W=[rows×cols].
  // Hot cache stores [A | B_dequant] for reuse across generation steps.
  // For raw/int8 paths: hot cache stores just B_dequant (no A to concat).
  forward(
    layerName: string,
    input: Float32Array,
    seqLen: number,
    inDim: number
  ): ForwardResult {
    const meta = this.loadMeta(layerName);
    const path = meta.compressionPath ?? 'svd-e8';
    if (path === 'int8-per-row') {
      return this.forwardInt8PerRow(layerName, input, seqLen, meta);
    }
    if (path === 'raw-e8' || path === 'raw-e8-rht') {
      return this.forwardRawE8(layerName, input, seqLen, meta);
    }
    return this.forwardSvd(layerName, input, seqLen, inDim, meta);
  }

  // Legacy SVD path — matmul chain input @ A @ B.
  private forwardSvd(
    layerName: string,
    input: Float32Array,
    seqLen: number,
    inDim: number,
    meta: LayerMetadata
  ): ForwardResult {
    const wasCached = this.hot.has(layerName);

    const aPath = join(this.vaultDir, `${layerName}.A.f32`);
    const bPath = join(this.vaultDir, `${layerName}.B.packed`);
    const mPath = join(this.vaultDir, `${layerName}.meta.json`);
    if (!existsSync(aPath) || !existsSync(bPath) || !existsSync(mPath)) {
      throw new Error(`Crystal not found in vault (svd-e8): ${layerName}`);
    }

    const { rows, cols, targetRank } = meta;

    let matrixA: Float32Array;
    let matrixB: Float32Array;

    if (wasCached) {
      const cached = this.hot.get(layerName)!;
      matrixA = cached.subarray(0, rows * targetRank);
      matrixB = cached.subarray(rows * targetRank);
      this.hot.delete(layerName);
      this.hot.set(layerName, cached);
    } else {
      const bBuf = readFileSync(bPath);
      matrixA = this.readAlignedF32(aPath, rows * targetRank);
      matrixB = this.decodePackedB(bBuf, targetRank, cols, meta);

      const combined = new Float32Array(rows * targetRank + targetRank * cols);
      combined.set(matrixA, 0);
      combined.set(matrixB, rows * targetRank);
      this.evictIfNeeded();
      this.hot.set(layerName, combined);
    }

    const temp = matmul(input, matrixA, seqLen, inDim, targetRank);
    const output = matmul(temp, matrixB, seqLen, targetRank, cols);

    return { output, rows: seqLen, cols, fromCache: wasCached };
  }

  // Raw-E8 path — B stores the whole weight matrix [rows × cols] (or paddedCols
  // if RHT was applied). No A factor. output = input @ dequant(B).
  private forwardRawE8(
    layerName: string,
    input: Float32Array,
    seqLen: number,
    meta: LayerMetadata
  ): ForwardResult {
    const wasCached = this.hot.has(layerName);
    const bPath = join(this.vaultDir, `${layerName}.B.packed`);
    if (!existsSync(bPath)) {
      throw new Error(`Crystal not found in vault (raw-e8): ${layerName}`);
    }
    const { rows, cols } = meta;

    let bMatrix: Float32Array;
    if (wasCached) {
      bMatrix = this.hot.get(layerName)!;
      this.hot.delete(layerName);
      this.hot.set(layerName, bMatrix);
    } else {
      const bBuf = readFileSync(bPath);
      // For raw-e8, the "targetRank" dimension of the SVD-style decode is
      // actually `rows` (B stores the full weight matrix). decodePackedB
      // handles inverseRHT internally when meta.rhtSeed is set.
      bMatrix = this.decodePackedB(bBuf, rows, cols, meta);
      this.evictIfNeeded();
      this.hot.set(layerName, bMatrix);
    }

    const output = matmul(input, bMatrix, seqLen, rows, cols);
    return { output, rows: seqLen, cols, fromCache: wasCached };
  }

  // Int8-per-row path — keeps compact Int8Array + scales in hot cache.
  // Fused matmul applies per-row scale inline: never materializes full fp32.
  // RAM: rows*cols bytes (int8) + rows*4 bytes (scales) vs rows*cols*4 (fp32).
  private forwardInt8PerRow(
    layerName: string,
    input: Float32Array,
    seqLen: number,
    meta: LayerMetadata
  ): ForwardResult {
    const wasCached = this.hotInt8.has(layerName);
    const bPath = join(this.vaultDir, `${layerName}.B.packed`);
    if (!existsSync(bPath)) {
      throw new Error(
        `Crystal not found in vault (int8-per-row): ${layerName}`
      );
    }
    const { rows, cols } = meta;

    let q: Int8RowQuantized;
    if (wasCached) {
      q = this.hotInt8.get(layerName)!;
      this.hotInt8.delete(layerName);
      this.hotInt8.set(layerName, q);
    } else {
      const bBuf = readFileSync(bPath);
      q = unpackInt8RowQuantized(bBuf, rows, cols);
      this.evictIfNeeded();
      this.hotInt8.set(layerName, q);
    }

    const output = matmulInt8Scaled(input, q, seqLen, rows, cols);
    return { output, rows: seqLen, cols, fromCache: wasCached };
  }

  // Column gather: returns W[:, tokenId] for embedding lookups.
  // Dispatches on compressionPath like forward() does.
  getEmbeddingColumn(layerName: string, tokenId: number): Float32Array {
    const meta = this.loadMeta(layerName);
    const { cols } = meta;
    if (tokenId < 0 || tokenId >= cols) {
      throw new RangeError(`tokenId ${tokenId} out of range [0, ${cols})`);
    }

    const path = meta.compressionPath ?? 'svd-e8';

    if (path === 'int8-per-row') {
      return this.getEmbeddingColumnInt8(layerName, tokenId, meta);
    }
    if (path === 'raw-e8' || path === 'raw-e8-rht') {
      return this.getEmbeddingColumnRawE8(layerName, tokenId, meta);
    }
    return this.getEmbeddingColumnSvd(layerName, tokenId, meta);
  }

  // Int8 column gather — extracts W[:, tokenId] directly from packed data.
  // Never materializes full fp32 matrix. O(rows) work.
  private getEmbeddingColumnInt8(
    layerName: string,
    tokenId: number,
    meta: LayerMetadata
  ): Float32Array {
    const { rows, cols } = meta;
    const bPath = join(this.vaultDir, `${layerName}.B.packed`);
    if (!existsSync(bPath)) {
      throw new Error(
        `Crystal not found in vault (int8-per-row): ${layerName}`
      );
    }

    let q: Int8RowQuantized;
    const cached = this.hotInt8.get(layerName);
    if (cached) {
      q = cached;
      this.hotInt8.delete(layerName);
      this.hotInt8.set(layerName, q);
    } else {
      const bBuf = readFileSync(bPath);
      q = unpackInt8RowQuantized(bBuf, rows, cols);
      this.evictIfNeeded();
      this.hotInt8.set(layerName, q);
    }

    const out = new Float32Array(rows);
    for (let r = 0; r < rows; r++) {
      out[r] = q.data[r * cols + tokenId] * q.scales[r];
    }
    return out;
  }

  // Raw-E8 column gather — dequant full matrix, extract column.
  private getEmbeddingColumnRawE8(
    layerName: string,
    tokenId: number,
    meta: LayerMetadata
  ): Float32Array {
    const { rows, cols } = meta;
    const bPath = join(this.vaultDir, `${layerName}.B.packed`);
    if (!existsSync(bPath)) {
      throw new Error(`Crystal not found in vault (raw-e8): ${layerName}`);
    }

    let bMatrix: Float32Array;
    const cached = this.hot.get(layerName);
    if (cached) {
      bMatrix = cached;
      this.hot.delete(layerName);
      this.hot.set(layerName, bMatrix);
    } else {
      const bBuf = readFileSync(bPath);
      bMatrix = this.decodePackedB(bBuf, rows, cols, meta);
      this.evictIfNeeded();
      this.hot.set(layerName, bMatrix);
    }

    const out = new Float32Array(rows);
    for (let i = 0; i < rows; i++) {
      out[i] = bMatrix[i * cols + tokenId];
    }
    return out;
  }

  // SVD column gather — factored: W[:, tokenId] = A @ B[:, tokenId]
  private getEmbeddingColumnSvd(
    layerName: string,
    tokenId: number,
    meta: LayerMetadata
  ): Float32Array {
    const { rows, cols, targetRank } = meta;

    let cached = this.hot.get(layerName);
    if (!cached) {
      const aPath = join(this.vaultDir, `${layerName}.A.f32`);
      const bPath = join(this.vaultDir, `${layerName}.B.packed`);
      if (!existsSync(aPath) || !existsSync(bPath)) {
        throw new Error(`Crystal not found in vault (svd-e8): ${layerName}`);
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
    return this.hot.delete(layerName) || this.hotInt8.delete(layerName);
  }

  // Evict everything — use between inference calls on memory-constrained device
  evictAll(): void {
    this.hot.clear();
    this.hotInt8.clear();
  }

  get hotCount(): number {
    return this.hot.size + this.hotInt8.size;
  }

  get hotLayerNames(): string[] {
    return [...this.hot.keys(), ...this.hotInt8.keys()];
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

// Fused int8 matmul: A[m×k] × (scales[k] · int8B[k×n]) → C[m×n]
// Applies per-row scale inside the inner loop. Never builds the fp32 copy.
// Same i-p-j loop order for cache locality.
function matmulInt8Scaled(
  A: Float32Array,
  q: Int8RowQuantized,
  m: number,
  k: number,
  n: number
): Float32Array {
  const C = new Float32Array(m * n);
  const { data, scales } = q;
  for (let i = 0; i < m; i++) {
    const cRowOff = i * n;
    const aRowOff = i * k;
    for (let p = 0; p < k; p++) {
      const aip = A[aRowOff + p];
      if (aip === 0) continue;
      const scaledAip = aip * scales[p];
      const bRowOff = p * n;
      for (let j = 0; j < n; j++) {
        C[cRowOff + j] += scaledAip * data[bRowOff + j];
      }
    }
  }
  return C;
}
