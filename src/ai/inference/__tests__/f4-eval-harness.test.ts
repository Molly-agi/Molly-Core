// src/ai/inference/__tests__/f4-eval-harness.test.ts
//
// Tests for the F4 eval harness — verifies the harness itself works correctly.
// Uses synthetic int8 vault (same approach as null-compression-baseline).

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runF4Eval, checkF4Thresholds } from '../f4-eval-harness';
import type {
  LayerNormWeights,
  LayerBiasWeights,
} from '../crystal-transformer-driver';
import {
  quantizeInt8PerRow,
  packInt8RowQuantized,
} from '../../engine-titan/int8-row-quantizer';
import type { LayerMetadata } from '../../engine-titan/orchestrator';

// --- Tiny geometry ---
const TOTAL_LAYERS = 2;
const HIDDEN_SIZE = 64;
const Q_HEADS = 2;
const KV_HEADS = 2;
const HEAD_DIM = 32;
const KV_DIM = KV_HEADS * HEAD_DIM;
const FFN_INTERMEDIATE = 128;
const VOCAB_SIZE = 128;

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s >>> 0) / 4294967296;
  };
}

function makeWeights(rows: number, cols: number, seed: number): Float32Array {
  const rng = seededRandom(seed);
  const w = new Float32Array(rows * cols);
  const scale = Math.sqrt(2 / (rows + cols));
  for (let i = 0; i < w.length; i++) {
    const u1 = rng() || 1e-10;
    const u2 = rng();
    w[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * scale;
  }
  return w;
}

function writeInt8Tensor(
  dir: string,
  name: string,
  weights: Float32Array,
  rows: number,
  cols: number
): void {
  const q = quantizeInt8PerRow(weights, rows, cols);
  const packed = packInt8RowQuantized(q);
  const meta: LayerMetadata = {
    layerName: name,
    rows,
    cols,
    targetRank: 0,
    compressedAt: Date.now(),
    compressionPath: 'int8-per-row',
  };
  writeFileSync(join(dir, `${name}.B.packed`), packed);
  writeFileSync(join(dir, `${name}.meta.json`), JSON.stringify(meta));
}

function buildVault(dir: string): void {
  mkdirSync(dir, { recursive: true });
  let seed = 100;
  const next = () => seed++;

  writeInt8Tensor(
    dir,
    'token_embd.weight',
    makeWeights(HIDDEN_SIZE, VOCAB_SIZE, next()),
    HIDDEN_SIZE,
    VOCAB_SIZE
  );
  writeInt8Tensor(
    dir,
    'output.weight',
    makeWeights(HIDDEN_SIZE, VOCAB_SIZE, next()),
    HIDDEN_SIZE,
    VOCAB_SIZE
  );

  for (let l = 0; l < TOTAL_LAYERS; l++) {
    writeInt8Tensor(
      dir,
      `blk.${l}.attn_q.weight`,
      makeWeights(HIDDEN_SIZE, HIDDEN_SIZE, next()),
      HIDDEN_SIZE,
      HIDDEN_SIZE
    );
    writeInt8Tensor(
      dir,
      `blk.${l}.attn_k.weight`,
      makeWeights(HIDDEN_SIZE, KV_DIM, next()),
      HIDDEN_SIZE,
      KV_DIM
    );
    writeInt8Tensor(
      dir,
      `blk.${l}.attn_v.weight`,
      makeWeights(HIDDEN_SIZE, KV_DIM, next()),
      HIDDEN_SIZE,
      KV_DIM
    );
    writeInt8Tensor(
      dir,
      `blk.${l}.attn_output.weight`,
      makeWeights(HIDDEN_SIZE, HIDDEN_SIZE, next()),
      HIDDEN_SIZE,
      HIDDEN_SIZE
    );
    writeInt8Tensor(
      dir,
      `blk.${l}.ffn_gate.weight`,
      makeWeights(HIDDEN_SIZE, FFN_INTERMEDIATE, next()),
      HIDDEN_SIZE,
      FFN_INTERMEDIATE
    );
    writeInt8Tensor(
      dir,
      `blk.${l}.ffn_up.weight`,
      makeWeights(HIDDEN_SIZE, FFN_INTERMEDIATE, next()),
      HIDDEN_SIZE,
      FFN_INTERMEDIATE
    );
    writeInt8Tensor(
      dir,
      `blk.${l}.ffn_down.weight`,
      makeWeights(FFN_INTERMEDIATE, HIDDEN_SIZE, next()),
      FFN_INTERMEDIATE,
      HIDDEN_SIZE
    );
  }
}

describe('f4-eval-harness', () => {
  const vaultDir = join(tmpdir(), `f4-harness-test-${Date.now()}`);

  const layersNorm: LayerNormWeights[] = Array.from(
    { length: TOTAL_LAYERS },
    () => ({
      attnNormGain: new Float32Array(HIDDEN_SIZE).fill(1),
      ffnNormGain: new Float32Array(HIDDEN_SIZE).fill(1),
    })
  );

  const layersBias: LayerBiasWeights[] = Array.from(
    { length: TOTAL_LAYERS },
    () => ({
      qBias: new Float32Array(HIDDEN_SIZE),
      kBias: new Float32Array(KV_DIM),
      vBias: new Float32Array(KV_DIM),
    })
  );

  const finalNorm = new Float32Array(HIDDEN_SIZE).fill(1);

  beforeAll(() => buildVault(vaultDir));
  afterAll(() => rmSync(vaultDir, { recursive: true, force: true }));

  it('runs 3 windows and produces finite results', () => {
    const rng = seededRandom(42);
    const tokenIds = Array.from({ length: 3 * 64 }, () =>
      Math.floor(rng() * VOCAB_SIZE)
    );

    const result = runF4Eval({
      vaultDir,
      driverConfig: {
        totalLayers: TOTAL_LAYERS,
        hiddenSize: HIDDEN_SIZE,
        qHeads: Q_HEADS,
        kvHeads: KV_HEADS,
        headDim: HEAD_DIM,
      },
      tokenIds,
      windowCount: 3,
      windowSize: 64,
      layersNorm,
      layersBias,
      finalNorm,
      maxHotLayers: 20,
    });

    expect(result.nanDetected).toBe(false);
    expect(result.nanLocation).toBeNull();
    expect(isFinite(result.perplexity)).toBe(true);
    expect(result.perplexity).toBeGreaterThan(0);
    expect(isFinite(result.avgLoss)).toBe(true);
    expect(result.avgLoss).toBeGreaterThan(0);
    expect(result.windowCount).toBe(3);
    expect(result.windowPpls).toHaveLength(3);
    expect(result.tokenCount).toBe(3 * 63); // 3 windows × (64-1) predictions
  });

  it('PPL ratio computed correctly against reference', () => {
    const rng = seededRandom(99);
    const tokenIds = Array.from({ length: 128 }, () =>
      Math.floor(rng() * VOCAB_SIZE)
    );

    const result = runF4Eval({
      vaultDir,
      driverConfig: {
        totalLayers: TOTAL_LAYERS,
        hiddenSize: HIDDEN_SIZE,
        qHeads: Q_HEADS,
        kvHeads: KV_HEADS,
        headDim: HEAD_DIM,
      },
      tokenIds,
      windowCount: 2,
      windowSize: 64,
      layersNorm,
      layersBias,
      finalNorm,
      referencePpl: 100, // fake reference
      maxHotLayers: 20,
    });

    expect(result.pplRatio).not.toBeNull();
    expect(result.pplRatio).toBeCloseTo(result.perplexity / 100, 4);
  });

  it('NaN tripwire fires on poisoned weights', () => {
    // Create a vault with NaN-producing weights (all Infinity would throw at quantize,
    // but we can inject NaN into the norm gains to trigger it)
    const poisonedNorm: LayerNormWeights[] = Array.from(
      { length: TOTAL_LAYERS },
      () => ({
        attnNormGain: new Float32Array(HIDDEN_SIZE).fill(NaN),
        ffnNormGain: new Float32Array(HIDDEN_SIZE).fill(1),
      })
    );

    const rng = seededRandom(42);
    const tokenIds = Array.from({ length: 128 }, () =>
      Math.floor(rng() * VOCAB_SIZE)
    );

    const result = runF4Eval({
      vaultDir,
      driverConfig: {
        totalLayers: TOTAL_LAYERS,
        hiddenSize: HIDDEN_SIZE,
        qHeads: Q_HEADS,
        kvHeads: KV_HEADS,
        headDim: HEAD_DIM,
      },
      tokenIds,
      windowCount: 1,
      windowSize: 64,
      layersNorm: poisonedNorm,
      layersBias,
      finalNorm,
      enableNanTripwire: true,
      maxHotLayers: 20,
    });

    expect(result.nanDetected).toBe(true);
    expect(result.nanLocation).not.toBeNull();
  });

  it('throws on insufficient tokens', () => {
    expect(() =>
      runF4Eval({
        vaultDir,
        driverConfig: {
          totalLayers: TOTAL_LAYERS,
          hiddenSize: HIDDEN_SIZE,
          qHeads: Q_HEADS,
          kvHeads: KV_HEADS,
          headDim: HEAD_DIM,
        },
        tokenIds: [1, 2, 3], // too few
        windowCount: 30,
        windowSize: 2048,
        layersNorm,
        layersBias,
        finalNorm,
      })
    ).toThrow(RangeError);
  });

  describe('checkF4Thresholds', () => {
    it('passes when PPL ratio is below ceiling', () => {
      const result = checkF4Thresholds(
        {
          perplexity: 5.5,
          avgLoss: Math.log(5.5),
          pplRatio: 1.05,
          perLayerKL: [0.01, 0.02],
          nanDetected: false,
          nanLocation: null,
          windowCount: 30,
          tokenCount: 30 * 2047,
          windowPpls: [],
        },
        '1B'
      );
      expect(result.passed).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    it('fails when PPL ratio exceeds ceiling', () => {
      const result = checkF4Thresholds(
        {
          perplexity: 5.5,
          avgLoss: Math.log(5.5),
          pplRatio: 1.2,
          perLayerKL: [],
          nanDetected: false,
          nanLocation: null,
          windowCount: 30,
          tokenCount: 30 * 2047,
          windowPpls: [],
        },
        '1B'
      );
      expect(result.passed).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
      expect(result.failures[0]).toContain('PPL ratio');
    });

    it('fails on NaN detection', () => {
      const result = checkF4Thresholds(
        {
          perplexity: 5.5,
          avgLoss: Math.log(5.5),
          pplRatio: 1.0,
          perLayerKL: [],
          nanDetected: true,
          nanLocation: 'h_postnorm at layer=3',
          windowCount: 1,
          tokenCount: 100,
          windowPpls: [],
        },
        '7B+'
      );
      expect(result.passed).toBe(false);
      expect(result.failures[0]).toContain('NaN');
    });

    it('fails when max KL exceeds 0.20', () => {
      const result = checkF4Thresholds(
        {
          perplexity: 5.5,
          avgLoss: Math.log(5.5),
          pplRatio: 1.0,
          perLayerKL: [0.01, 0.02, 0.25, 0.01], // layer 2 is hot
          nanDetected: false,
          nanLocation: null,
          windowCount: 30,
          tokenCount: 30 * 2047,
          windowPpls: [],
        },
        '3B'
      );
      expect(result.passed).toBe(false);
      expect(result.failures.some((f) => f.includes('Max KL'))).toBe(true);
    });
  });
});
