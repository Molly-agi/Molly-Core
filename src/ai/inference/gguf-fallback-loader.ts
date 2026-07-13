// Copyright (c) 2026 Molly Labs Inc. Licensed under AGPL-3.0.
// src/ai/inference/gguf-fallback-loader.ts
//
// GGUF fallback for passthrough tensors not in the crystal vault.
// Loads full tensor from GGUF, caches in RAM. Used for FFN layers,
// embeddings, and exempt layers during inference.

import { parseGGUF, type GGUFFile } from '../engine-titan/gguf-ingest';
import { readTensorData } from '../engine-titan/gguf-dequant';
// MatmulPool imported lazily in initPool() to avoid webpack bundling tsx/esbuild

export class GgufFallbackLoader {
  private readonly gguf: GGUFFile;
  private readonly cache = new Map<string, Float32Array>();
  private readonly pinned = new Map<string, Float32Array>();
  private readonly maxCached: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- lazily imported MatmulPool
  private pool: any | null = null;
  private poolReady = false;

  constructor(ggufPath: string, maxCached = 10) {
    this.gguf = parseGGUF(ggufPath);
    this.maxCached = maxCached;
  }

  /**
   * Initialize the parallel matmul pool. Call once before inference.
   * If not called, forward() falls back to single-threaded.
   */
  async initPool(): Promise<void> {
    if (this.poolReady) return;
    // Dynamic import to avoid webpack bundling tsx/esbuild
    const { getMatmulPool } = await import('./matmul-pool');
    this.pool = getMatmulPool();
    await this.pool.waitReady();
    this.poolReady = true;
    console.log(
      `[GgufFallbackLoader] Matmul pool ready (${this.pool.poolSize} workers)`
    );
  }

  /**
   * Pre-dequantize and cache ALL weight tensors in RAM.
   * Call once at startup for models that fit in memory (e.g., 3B = ~10GB dequanted).
   * After warmup, all forward() calls are pure matmul — no dequant overhead.
   */
  warmup(): void {
    const weights = this.gguf.tensors.filter(
      (t) => t.name.includes('.weight') && !this.pinned.has(t.name)
    );
    console.log(`[GgufFallbackLoader] Warming up ${weights.length} tensors...`);
    const start = Date.now();
    for (const tensor of weights) {
      if (this.cache.has(tensor.name)) continue;
      const data = readTensorData(this.gguf, tensor);
      this.cache.set(tensor.name, data);
    }
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const sizeMB =
      [...this.cache.values()].reduce((s, v) => s + v.byteLength, 0) / 1e6;
    console.log(
      `[GgufFallbackLoader] Warmup complete: ${weights.length} tensors, ${sizeMB.toFixed(0)}MB, ${elapsed}s`
    );

    // Pre-convert large tensors to SharedArrayBuffer for zero first-token penalty
    if (this.pool) {
      const largeTensors = [...this.cache.values()].filter(
        (v) => v.length >= 512
      );
      console.log(
        `[GgufFallbackLoader] Pre-warming ${largeTensors.length} SharedArrayBuffers...`
      );
      this.pool.prewarmTensors(largeTensors);
      console.log(`[GgufFallbackLoader] SAB pre-warm complete`);
    }
  }

  /**
   * Pin a tensor permanently in memory (exempt from LRU eviction).
   * Use for token_embd which is accessed every single token.
   */
  pin(name: string): void {
    if (this.pinned.has(name)) return;
    const tensor = this.gguf.tensors.find((t) => t.name === name);
    if (!tensor) throw new Error(`Tensor not found in GGUF: ${name}`);
    const data = readTensorData(this.gguf, tensor);
    this.pinned.set(name, data);
    // Remove from LRU if it was there
    this.cache.delete(name);
  }

  /** Get full dequantized tensor by name. Pinned tensors served instantly. LRU for the rest. */
  getTensor(name: string): Float32Array {
    // Check pinned first (zero-cost, no eviction)
    const pinnedVal = this.pinned.get(name);
    if (pinnedVal) return pinnedVal;

    if (this.cache.has(name)) {
      const val = this.cache.get(name)!;
      this.cache.delete(name);
      this.cache.set(name, val);
      return val;
    }

    const tensor = this.gguf.tensors.find((t) => t.name === name);
    if (!tensor) throw new Error(`Tensor not found in GGUF: ${name}`);

    const data = readTensorData(this.gguf, tensor);

    // LRU eviction
    while (this.cache.size >= this.maxCached) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(name, data);
    return data;
  }

  /**
   * Get embedding vector for a token.
   * token_embd is stored as [hidden × vocab] in GGML (ne[0]=hidden fastest).
   * Embedding for tokenId is a contiguous slice: buf[tokenId * hidden .. (tokenId+1) * hidden].
   */
  getColumn(
    name: string,
    colIdx: number,
    rows: number,
    _cols: number
  ): Float32Array {
    const full = this.getTensor(name);
    // Contiguous slice — GGML ne[0] (rows/hidden) is the fastest dimension
    const col = new Float32Array(rows);
    const offset = colIdx * rows;
    for (let r = 0; r < rows; r++) {
      col[r] = full[offset + r];
    }
    return col;
  }

  getEmbeddingColumn(layerName: string, tokenId: number): Float32Array {
    const info = this.gguf.tensors.find((t) => t.name === layerName);
    if (!info) throw new Error(`Tensor not found: ${layerName}`);
    const rows = info.dimensions[0];
    const cols = info.dimensions.length > 1 ? info.dimensions[1] : 1;
    return this.getColumn(layerName, tokenId, rows, cols);
  }

  /**
   * Forward: y = x @ W^T (GGML convention) — PARALLEL via worker threads.
   * Small tensors (outDim < 512) run on main thread to avoid dispatch overhead.
   * Uses all available CPU cores for large tensors.
   */
  async forwardAsync(
    name: string,
    input: Float32Array,
    inDim: number,
    outDim: number
  ): Promise<Float32Array> {
    const W = this.getTensor(name);
    // Small tensors: main thread is faster than worker dispatch overhead
    if (!this.poolReady || !this.pool || outDim < 512) {
      const output = new Float32Array(outDim);
      for (let j = 0; j < outDim; j++) {
        let sum = 0;
        for (let i = 0; i < inDim; i++) sum += input[i] * W[j * inDim + i];
        output[j] = sum;
      }
      return output;
    }
    return this.pool.forward(W, input, inDim, outDim);
  }

  /**
   * Forward: y = x @ W^T (GGML convention) — single-threaded.
   * GGML stores weight buffer with ne[0] (=inFeatures for linear layers) as fastest dimension.
   * For tensor with ne=[in, out]: element W(in=i, out=j) = buffer[j * ne[0] + i] = buffer[j * inDim + i]
   * Matmul: y[j] = sum_i(x[i] * W[j * inDim + i])
   */
  forward(
    name: string,
    input: Float32Array,
    seqLen: number,
    inDim: number
  ): { output: Float32Array; rows: number; cols: number; fromCache: boolean } {
    const info = this.gguf.tensors.find((t) => t.name === name);
    if (!info) throw new Error(`Tensor not found: ${name}`);
    const outDim = info.dimensions[0];
    const W = this.getTensor(name);
    const output = new Float32Array(seqLen * outDim);
    for (let s = 0; s < seqLen; s++) {
      const inputOffset = s * inDim;
      const outputOffset = s * outDim;
      for (let j = 0; j < outDim; j++) {
        let sum = 0;
        for (let i = 0; i < inDim; i++) {
          sum += input[inputOffset + i] * W[j * inDim + i];
        }
        output[outputOffset + j] = sum;
      }
    }
    return { output, rows: seqLen, cols: outDim, fromCache: false };
  }

  get tensorNames(): string[] {
    return this.gguf.tensors.map((t) => t.name);
  }

  hasTensor(name: string): boolean {
    return this.gguf.tensors.some((t) => t.name === name);
  }
}
