// src/ai/engine-titan/__tests__/f1-f6-strategy-wiring.test.ts
//
// Regression test for F1 (wire selectStrategy) + F6 (embedding/LM-head +
// first/last-N layer exemption) from Fable Batch 03. Covers:
//   - Exemption helpers (isEmbeddingOrLMHead, isFirstOrLastNLayers,
//     isFFNProjection, extractLayerIndex, getGGUFBlockCount)
//   - int8-per-row quantizer round-trip + numerical guards (Atlas B1-B3)
//   - crystal-inference-layer.forward() dispatch on compressionPath for
//     all three paths: svd-e8 (legacy), raw-e8-rht (Category C), int8-per-row
//     (Category D + embedding)
//   - Back-compat: vault without compressionPath field defaults to svd-e8

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  isEmbeddingOrLMHead,
  extractLayerIndex,
  isFirstOrLastNLayers,
  isFFNProjection,
  getGGUFBlockCount,
} from '../streaming-compress';
import {
  quantizeInt8PerRow,
  packInt8RowQuantized,
  unpackInt8RowQuantized,
  dequantizeInt8PerRow,
} from '../int8-row-quantizer';
import { E8QuantizerAdapter } from '../quantizer-e8-adapter';
import { CrystalInferenceLayer } from '../crystal-inference-layer';
import { applyRHT } from '../hadamard-transform';
import { LowRankTensorDecomposer } from '../decomposer';
import type { LayerMetadata } from '../orchestrator';

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
}

function makeRandomMatrix(rows: number, cols: number, seed = 1): Float32Array {
  // Simple LCG for reproducible fixtures
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s / 0x80000000) * 2 - 1;
  };
  const arr = new Float32Array(rows * cols);
  for (let i = 0; i < arr.length; i++) arr[i] = rand() * 0.5;
  return arr;
}

describe('F6 exemption helpers', () => {
  describe('isEmbeddingOrLMHead', () => {
    it('matches GGUF llama/qwen conventions', () => {
      expect(isEmbeddingOrLMHead('token_embd.weight')).toBe(true);
      expect(isEmbeddingOrLMHead('output.weight')).toBe(true);
      expect(isEmbeddingOrLMHead('output')).toBe(true);
    });
    it('matches HuggingFace transformers conventions', () => {
      expect(isEmbeddingOrLMHead('model.embed_tokens.weight')).toBe(true);
      expect(isEmbeddingOrLMHead('lm_head.weight')).toBe(true);
    });
    it('matches GPT-2 conventions', () => {
      expect(isEmbeddingOrLMHead('wte.weight')).toBe(true);
      expect(isEmbeddingOrLMHead('wpe.weight')).toBe(true);
    });
    it('rejects attention and FFN weights', () => {
      expect(isEmbeddingOrLMHead('blk.0.attn_q.weight')).toBe(false);
      expect(isEmbeddingOrLMHead('blk.5.ffn_gate.weight')).toBe(false);
      expect(isEmbeddingOrLMHead('output_norm.weight')).toBe(false);
    });
  });

  describe('extractLayerIndex', () => {
    it('parses GGUF blk.N.* format', () => {
      expect(extractLayerIndex('blk.0.attn_q.weight')).toBe(0);
      expect(extractLayerIndex('blk.79.ffn_down.weight')).toBe(79);
    });
    it('parses layer.N.* and h.N.* conventions', () => {
      expect(extractLayerIndex('layer.5.attn.q')).toBe(5);
      expect(extractLayerIndex('h.10.attn.c_attn.weight')).toBe(10);
    });
    it('parses HuggingFace model.layers.N.* format', () => {
      expect(extractLayerIndex('model.layers.31.self_attn.q_proj.weight')).toBe(
        31
      );
    });
    it('returns null for non-block tensors (Atlas A9)', () => {
      expect(extractLayerIndex('token_embd.weight')).toBeNull();
      expect(extractLayerIndex('output.weight')).toBeNull();
      expect(extractLayerIndex('output_norm.weight')).toBeNull();
    });
  });

  describe('isFirstOrLastNLayers', () => {
    it('exempts first-N and last-N for typical 32-layer model', () => {
      expect(isFirstOrLastNLayers('blk.0.attn_q.weight', 32, 3)).toBe(true);
      expect(isFirstOrLastNLayers('blk.2.attn_q.weight', 32, 3)).toBe(true);
      expect(isFirstOrLastNLayers('blk.3.attn_q.weight', 32, 3)).toBe(false);
      expect(isFirstOrLastNLayers('blk.15.attn_q.weight', 32, 3)).toBe(false);
      expect(isFirstOrLastNLayers('blk.29.attn_q.weight', 32, 3)).toBe(true);
      expect(isFirstOrLastNLayers('blk.31.attn_q.weight', 32, 3)).toBe(true);
    });
    it('clamps N when totalLayers < 2*N (Atlas A7)', () => {
      // 4 layers, n=3 → effective n = floor(4/2) = 2, so blk.0,1,2,3 all in first-2 or last-2
      expect(isFirstOrLastNLayers('blk.0.x.w', 4, 3)).toBe(true);
      expect(isFirstOrLastNLayers('blk.1.x.w', 4, 3)).toBe(true);
      expect(isFirstOrLastNLayers('blk.2.x.w', 4, 3)).toBe(true);
      expect(isFirstOrLastNLayers('blk.3.x.w', 4, 3)).toBe(true);
    });
    it('handles totalLayers=0 and 1 (Atlas A7 extreme)', () => {
      expect(isFirstOrLastNLayers('blk.0.x.w', 0, 3)).toBe(false);
      expect(isFirstOrLastNLayers('blk.0.x.w', 1, 3)).toBe(false);
    });
    it('returns false for non-block tensors', () => {
      expect(isFirstOrLastNLayers('token_embd.weight', 32, 3)).toBe(false);
      expect(isFirstOrLastNLayers('output_norm.weight', 32, 3)).toBe(false);
    });
  });

  describe('isFFNProjection', () => {
    it('matches GGUF ffn_gate/up/down', () => {
      expect(isFFNProjection('blk.5.ffn_gate.weight')).toBe(true);
      expect(isFFNProjection('blk.5.ffn_up.weight')).toBe(true);
      expect(isFFNProjection('blk.5.ffn_down.weight')).toBe(true);
    });
    it('matches HuggingFace gate_proj/up_proj/down_proj', () => {
      expect(isFFNProjection('model.layers.10.mlp.gate_proj.weight')).toBe(
        true
      );
      expect(isFFNProjection('model.layers.10.mlp.up_proj.weight')).toBe(true);
    });
    it('matches GPT-2 mlp.c_fc / c_proj', () => {
      expect(isFFNProjection('h.5.mlp.c_fc.weight')).toBe(true);
      expect(isFFNProjection('h.5.mlp.c_proj.weight')).toBe(true);
    });
    it('rejects ffn_norm (Atlas A1 false-positive guard)', () => {
      expect(isFFNProjection('blk.5.ffn_norm.weight')).toBe(false);
      expect(isFFNProjection('blk.5.ffn_gate.bias')).toBe(false);
      expect(isFFNProjection('blk.5.ffn_down_bias')).toBe(false);
    });
    it('rejects attention weights', () => {
      expect(isFFNProjection('blk.5.attn_q.weight')).toBe(false);
      expect(isFFNProjection('token_embd.weight')).toBe(false);
    });
  });

  describe('getGGUFBlockCount', () => {
    it('extracts llama.block_count', () => {
      const m = new Map<string, unknown>([['llama.block_count', 32]]);
      expect(getGGUFBlockCount(m)).toBe(32);
    });
    it('extracts qwen2.block_count regardless of architecture prefix', () => {
      const m = new Map<string, unknown>([
        ['qwen2.block_count', 80],
        ['unrelated.key', 'foo'],
      ]);
      expect(getGGUFBlockCount(m)).toBe(80);
    });
    it('returns undefined when no block_count key present', () => {
      const m = new Map<string, unknown>([['tokenizer.model', 'llama']]);
      expect(getGGUFBlockCount(m)).toBeUndefined();
    });
  });
});

describe('int8-per-row quantizer (Atlas B1-B3 numerical guards)', () => {
  it('round-trips a well-conditioned matrix at cos > 0.99', () => {
    const W = makeRandomMatrix(64, 128, 42);
    const q = quantizeInt8PerRow(W, 64, 128);
    const packed = packInt8RowQuantized(q);
    const unpacked = unpackInt8RowQuantized(packed, 64, 128);
    const recon = dequantizeInt8PerRow(unpacked);
    expect(cosine(W, recon)).toBeGreaterThan(0.99);
  });

  it('handles all-zero rows without producing NaN (Atlas B1)', () => {
    const W = new Float32Array(4 * 8); // all zeros
    const q = quantizeInt8PerRow(W, 4, 8);
    expect(q.scales[0]).toBe(1.0); // sentinel scale, not NaN
    const recon = dequantizeInt8PerRow(q);
    for (const v of recon) expect(v).toBe(0);
  });

  it('int8 range clamping — no wrap-around to -128', () => {
    // Row where one value would round to +128 or -128 due to float imprecision
    const W = new Float32Array([
      -1.0,
      -1.0,
      -1.0,
      -1.0,
      1.0,
      1.0,
      1.0,
      1.0, // maxAbs=1, scale=1/127
    ]);
    const q = quantizeInt8PerRow(W, 1, 8);
    for (const v of q.data) {
      expect(v).toBeGreaterThanOrEqual(-127);
      expect(v).toBeLessThanOrEqual(127);
    }
  });

  it('unpack throws on wrong buffer size (data integrity guard)', () => {
    const goodBuf = packInt8RowQuantized(
      quantizeInt8PerRow(makeRandomMatrix(4, 8, 1), 4, 8)
    );
    // Truncated buffer
    const truncated = goodBuf.subarray(0, goodBuf.length - 4);
    expect(() => unpackInt8RowQuantized(truncated, 4, 8)).toThrow(/length/);
  });
});

// ─── Integration test: full round-trip through CrystalInferenceLayer ─────────
// Builds vault files by hand for each of the three compressionPaths, then
// calls forward() and verifies dispatch works + output cosine ≥ threshold.

describe('F1+F6 dispatch integration — CrystalInferenceLayer', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = join(tmpdir(), `f1-f6-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  function writeMeta(layerName: string, meta: LayerMetadata) {
    writeFileSync(
      join(tmpDir, `${layerName}.meta.json`),
      JSON.stringify(meta, null, 2)
    );
  }

  function writeBuffer(layerName: string, ext: string, buf: Buffer) {
    writeFileSync(join(tmpDir, `${layerName}.${ext}`), buf);
  }

  it('dispatches int8-per-row path for F6 exempt tensors', () => {
    const rows = 32,
      cols = 64;
    const W = makeRandomMatrix(rows, cols, 7);
    const q = quantizeInt8PerRow(W, rows, cols);
    const packed = packInt8RowQuantized(q);

    writeMeta('token_embd.weight', {
      layerName: 'token_embd.weight',
      rows,
      cols,
      targetRank: cols,
      compressedAt: 1,
      quantizerType: 'int8-per-row',
      compressionPath: 'int8-per-row',
    });
    writeBuffer('token_embd.weight', 'B.packed', packed);

    const layer = new CrystalInferenceLayer({ vaultDir: tmpDir });
    const input = makeRandomMatrix(1, rows, 13); // seqLen=1, hidden=rows
    const result = layer.forward('token_embd.weight', input, 1, rows);

    // Reference: same matmul with un-quantized W
    const ref = new Float32Array(cols);
    for (let j = 0; j < cols; j++) {
      let s = 0;
      for (let i = 0; i < rows; i++) s += input[i] * W[i * cols + j];
      ref[j] = s;
    }
    expect(cosine(result.output, ref)).toBeGreaterThan(0.99);
  });

  it('dispatches raw-e8-rht path for FFN-name tensors', () => {
    const rows = 64,
      cols = 128;
    const W = makeRandomMatrix(rows, cols, 11);
    const seedHash = Buffer.from([0x12, 0x34, 0x56, 0x78]);
    const rhtSeed = seedHash.readUInt32LE(0);
    const { transformed, meta: rhtMeta } = applyRHT(W, rows, cols, rhtSeed);

    const e8 = new E8QuantizerAdapter();
    const rawQ = e8.quantize(
      transformed,
      'blk.5.ffn_gate.weight',
      rows,
      rhtMeta.paddedCols
    );

    writeMeta('blk.5.ffn_gate.weight', {
      layerName: 'blk.5.ffn_gate.weight',
      rows,
      cols,
      targetRank: cols,
      compressedAt: 2,
      rhtSeed,
      rhtPaddedCols: rhtMeta.paddedCols,
      quantizerType: 'e8-lattice',
      compressionPath: 'raw-e8-rht',
    });
    writeBuffer('blk.5.ffn_gate.weight', 'B.packed', rawQ.packedBuffer);

    const layer = new CrystalInferenceLayer({ vaultDir: tmpDir });
    const input = makeRandomMatrix(1, rows, 17);
    const result = layer.forward('blk.5.ffn_gate.weight', input, 1, rows);

    // Reference: matmul with un-quantized W (raw-e8-rht should recover it via inverseRHT + E8 dequant)
    const ref = new Float32Array(cols);
    for (let j = 0; j < cols; j++) {
      let s = 0;
      for (let i = 0; i < rows; i++) s += input[i] * W[i * cols + j];
      ref[j] = s;
    }
    // E8 quantization is lossy but should preserve direction reasonably well
    expect(cosine(result.output, ref)).toBeGreaterThan(0.5);
  });

  it('dispatches legacy svd-e8 path (undefined compressionPath = back-compat)', () => {
    const rows = 32,
      cols = 64,
      targetRank = 8;
    const W = makeRandomMatrix(rows, cols, 19);
    const decomposer = new LowRankTensorDecomposer();
    const { matrixA, matrixB } = decomposer.decomposeMatrix(
      W,
      rows,
      cols,
      targetRank
    );
    const seedHash = Buffer.from([0xab, 0xcd, 0xef, 0x01]);
    const rhtSeed = seedHash.readUInt32LE(0);
    const { transformed, meta: rhtMeta } = applyRHT(
      matrixB,
      targetRank,
      cols,
      rhtSeed
    );
    const e8 = new E8QuantizerAdapter();
    const svdQ = e8.quantize(
      transformed,
      'blk.0.attn_q.weight',
      targetRank,
      rhtMeta.paddedCols
    );

    // Meta WITHOUT compressionPath field — legacy vault format. Read path
    // should default to svd-e8 (Atlas C2 back-compat).
    writeMeta('blk.0.attn_q.weight', {
      layerName: 'blk.0.attn_q.weight',
      rows,
      cols,
      targetRank,
      compressedAt: 3,
      rhtSeed,
      rhtPaddedCols: rhtMeta.paddedCols,
      quantizerType: 'e8-lattice',
      // compressionPath intentionally OMITTED
    });
    writeBuffer(
      'blk.0.attn_q.weight',
      'A.f32',
      Buffer.from(matrixA.buffer as ArrayBuffer)
    );
    writeBuffer('blk.0.attn_q.weight', 'B.packed', svdQ.packedBuffer);

    const layer = new CrystalInferenceLayer({ vaultDir: tmpDir });
    const input = makeRandomMatrix(1, rows, 23);
    const result = layer.forward('blk.0.attn_q.weight', input, 1, rows);

    // Reference
    const ref = new Float32Array(cols);
    for (let j = 0; j < cols; j++) {
      let s = 0;
      for (let i = 0; i < rows; i++) s += input[i] * W[i * cols + j];
      ref[j] = s;
    }
    // Rank-8 SVD is quite lossy on random data; cosine > 0.3 confirms path works
    expect(cosine(result.output, ref)).toBeGreaterThan(0.3);
    expect(result.cols).toBe(cols);
  });

  it('throws when compressionPath = raw-e8-rht but B.packed missing', () => {
    writeMeta('missing.weight', {
      layerName: 'missing.weight',
      rows: 4,
      cols: 8,
      targetRank: 8,
      compressedAt: 4,
      quantizerType: 'e8-lattice',
      compressionPath: 'raw-e8-rht',
    });
    const layer = new CrystalInferenceLayer({ vaultDir: tmpDir });
    expect(() =>
      layer.forward('missing.weight', new Float32Array(4), 1, 4)
    ).toThrow(/raw-e8/);
  });

  it('throws with distinct message for int8-per-row missing B', () => {
    writeMeta('missing-int8.weight', {
      layerName: 'missing-int8.weight',
      rows: 4,
      cols: 8,
      targetRank: 8,
      compressedAt: 5,
      quantizerType: 'int8-per-row',
      compressionPath: 'int8-per-row',
    });
    const layer = new CrystalInferenceLayer({ vaultDir: tmpDir });
    expect(() =>
      layer.forward('missing-int8.weight', new Float32Array(4), 1, 4)
    ).toThrow(/int8-per-row/);
  });
});
