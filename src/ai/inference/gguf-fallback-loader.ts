// Copyright (c) 2026 Molly Labs Inc. Licensed under AGPL-3.0.
// src/ai/inference/gguf-fallback-loader.ts
//
// GGUF fallback for passthrough tensors not in the crystal vault.
// Loads full tensor from GGUF, caches in RAM. Used for FFN layers,
// embeddings, and exempt layers during inference.

import { parseGGUF, type GGUFFile } from '../engine-titan/gguf-ingest';
import { readTensorData } from '../engine-titan/gguf-dequant';

export class GgufFallbackLoader {
  private readonly gguf: GGUFFile;
  private readonly cache = new Map<string, Float32Array>();
  private readonly maxCached: number;

  constructor(ggufPath: string, maxCached = 4) {
    this.gguf = parseGGUF(ggufPath);
    this.maxCached = maxCached;
  }

  /** Get full dequantized tensor by name. Cached with LRU eviction. */
  getTensor(name: string): Float32Array {
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
   * Forward: y = x @ W^T (GGML convention).
   * W is stored as [outFeatures × inFeatures] row-major (ne[0]=out fastest).
   * Correct matmul: y[j] = sum_i(x[i] * W[j * inDim + i])
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
