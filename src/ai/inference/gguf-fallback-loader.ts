// Copyright (c) 2026 Molly Labs Inc. Licensed under AGPL-3.0.
// src/ai/inference/gguf-fallback-loader.ts
//
// GGUF fallback for passthrough tensors not in the crystal vault.
// Loads full tensor from GGUF, caches in RAM. Used for FFN layers,
// embeddings, and exempt layers during inference.

import { parseGGUF, type GGUFFile } from '../engine-titan/gguf-ingest';
import { readTensorData } from '../engine-titan/gguf-dequant';
import { getMatmulPool, type MatmulPool } from './matmul-pool';

export class GgufFallbackLoader {
  private readonly gguf: GGUFFile;
  private readonly cache = new Map<string, Float32Array>();
  private readonly pinned = new Map<string, Float32Array>();
  private readonly maxCached: number;
  private pool: MatmulPool | null = null;
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
    this.pool = getMatmulPool();
    await this.pool.waitReady();
    this.poolReady = true;
    console.log(
      `[GgufFallbackLoader] Matmul pool ready (${this.pool.poolSize} workers)`
    );
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

  /**
   * Forward: y = x @ W^T (GGML convention) — PARALLEL via worker threads.
   * Uses all available CPU cores. Falls back to single-threaded if pool not initialized.
   */
  async forwardAsync(
    name: string,
    input: Float32Array,
    inDim: number,
    outDim: number
  ): Promise<Float32Array> {
    const W = this.getTensor(name);
    if (this.poolReady && this.pool) {
      return this.pool.forward(W, input, inDim, outDim);
    }
    // Fallback: single-threaded
    return this.forward(name, input, inDim, outDim);
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
    inDim: number,
    outDim: number
  ): Float32Array {
    const W = this.getTensor(name);
    const output = new Float32Array(outDim);
    for (let j = 0; j < outDim; j++) {
      let sum = 0;
      for (let i = 0; i < inDim; i++) {
        sum += input[i] * W[j * inDim + i];
      }
      output[j] = sum;
    }
    return output;
  }

  get tensorNames(): string[] {
    return this.gguf.tensors.map((t) => t.name);
  }

  hasTensor(name: string): boolean {
    return this.gguf.tensors.some((t) => t.name === name);
  }
}
