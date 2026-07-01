// src/ai/engine-titan/crystal-inference-layer.ts
//
// On-demand crystal load → reconstruct → matmul → evict.
// Peak RAM = hot tier budget, not the full vault size.
// Vault format: {layerName}.A.f32 + {layerName}.B.packed + {layerName}.meta.json

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { TitanDecompressionEngine } from './reconstruction';
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
      const aBuf = readFileSync(aPath);
      const bBuf = readFileSync(bPath);
      matrixA = new Float32Array(aBuf.buffer, aBuf.byteOffset, aBuf.length / 4);
      matrixB = this.engine.dequantize(bBuf, targetRank * cols);

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
// Pure TS — correct for any size; swap for WASM/BLAS on tablet for performance
function matmul(
  A: Float32Array,
  B: Float32Array,
  m: number,
  k: number,
  n: number
): Float32Array {
  const C = new Float32Array(m * n);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let p = 0; p < k; p++) {
        sum += A[i * k + p] * B[p * n + j];
      }
      C[i * n + j] = sum;
    }
  }
  return C;
}
