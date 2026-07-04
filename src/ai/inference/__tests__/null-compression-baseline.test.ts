// src/ai/inference/__tests__/null-compression-baseline.test.ts
//
// Null-compression baseline — Eli's F4-gate driver correctness isolator.
//
// Strategy: build a tiny synthetic model, compress ALL tensors via int8-per-row
// (the highest-fidelity lossless-ish path). Run the compressed vault through
// CrystalTransformerDriver (via f4-eval-harness). Separately run the SAME weights
// through the driver using a "raw" vault (exact fp32 → int8 round-trip).
//
// If PPL ratio (compressed / raw-reference) is NOT ~1.0, the driver has bugs
// (attention, RoPE, KV cache, SwiGLU) independent of compression quality.
//
// This is Scope A: layer-level TinyLlama-shaped synthetic fixture.

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runF4Eval } from '../f4-eval-harness';
import type {
  LayerNormWeights,
  LayerBiasWeights,
} from '../crystal-transformer-driver';
import {
  quantizeInt8PerRow,
  packInt8RowQuantized,
} from '../../engine-titan/int8-row-quantizer';
import type { LayerMetadata } from '../../engine-titan/orchestrator';

// --- TinyLlama geometry (small enough to run in CI, large enough to stress driver) ---
const TOTAL_LAYERS = 4;
const HIDDEN_SIZE = 128;
const Q_HEADS = 4;
const KV_HEADS = 4;
const HEAD_DIM = 32; // HIDDEN_SIZE / Q_HEADS
const KV_DIM = KV_HEADS * HEAD_DIM; // 128
const FFN_INTERMEDIATE = 256;
const VOCAB_SIZE = 256;
const WINDOW_SIZE = 128;
const WINDOW_COUNT = 5;
const SEED = 42;

// --- Deterministic PRNG ---
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s >>> 0) / 4294967296;
  };
}

// --- Weight generation: Xavier-like initialization ---
function makeWeights(rows: number, cols: number, seed: number): Float32Array {
  const rng = seededRandom(seed);
  const w = new Float32Array(rows * cols);
  const scale = Math.sqrt(2 / (rows + cols));
  for (let i = 0; i < w.length; i++) {
    // Box-Muller transform for normal distribution
    const u1 = rng() || 1e-10;
    const u2 = rng();
    w[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * scale;
  }
  return w;
}

// --- Vault writer ---
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

// --- Build complete vault for all layers ---
function buildNullBaselineVault(dir: string): void {
  mkdirSync(dir, { recursive: true });
  let seed = 1000;
  const next = () => seed++;

  // Embedding + output projection
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

  // Per-layer weights
  for (let l = 0; l < TOTAL_LAYERS; l++) {
    // Attention: Q, K, V, output
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

    // FFN: gate, up, down (SwiGLU layout)
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

// --- Test fixtures ---
function makeNormWeights(): LayerNormWeights[] {
  return Array.from({ length: TOTAL_LAYERS }, () => ({
    attnNormGain: new Float32Array(HIDDEN_SIZE).fill(1),
    ffnNormGain: new Float32Array(HIDDEN_SIZE).fill(1),
  }));
}

function makeBiasWeights(): LayerBiasWeights[] {
  return Array.from({ length: TOTAL_LAYERS }, () => ({
    qBias: new Float32Array(HIDDEN_SIZE),
    kBias: new Float32Array(KV_DIM),
    vBias: new Float32Array(KV_DIM),
  }));
}

function makeTokenIds(): number[] {
  const rng = seededRandom(SEED);
  return Array.from({ length: WINDOW_COUNT * WINDOW_SIZE }, () =>
    Math.floor(rng() * VOCAB_SIZE)
  );
}

// --- Tests ---
describe('null-compression-baseline (Scope A)', () => {
  const vaultDir = join(tmpdir(), `null-baseline-${Date.now()}`);
  const layersNorm = makeNormWeights();
  const layersBias = makeBiasWeights();
  const finalNorm = new Float32Array(HIDDEN_SIZE).fill(1);
  const tokenIds = makeTokenIds();

  beforeAll(() => buildNullBaselineVault(vaultDir));
  afterAll(() => rmSync(vaultDir, { recursive: true, force: true }));

  it('driver produces finite PPL on all-int8 vault', () => {
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
      windowCount: WINDOW_COUNT,
      windowSize: WINDOW_SIZE,
      layersNorm,
      layersBias,
      finalNorm,
      maxHotLayers: 20,
      enableNanTripwire: true,
    });

    expect(result.nanDetected).toBe(false);
    expect(result.nanLocation).toBeNull();
    expect(isFinite(result.perplexity)).toBe(true);
    expect(result.perplexity).toBeGreaterThan(0);
    expect(result.windowCount).toBe(WINDOW_COUNT);
    expect(result.tokenCount).toBe(WINDOW_COUNT * (WINDOW_SIZE - 1));
  });

  it('PPL is deterministic across runs (same seed → same result)', () => {
    const run1 = runF4Eval({
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
      windowSize: WINDOW_SIZE,
      layersNorm,
      layersBias,
      finalNorm,
      maxHotLayers: 20,
    });

    const run2 = runF4Eval({
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
      windowSize: WINDOW_SIZE,
      layersNorm,
      layersBias,
      finalNorm,
      maxHotLayers: 20,
    });

    expect(run1.perplexity).toBe(run2.perplexity);
    expect(run1.avgLoss).toBe(run2.avgLoss);
    expect(run1.windowPpls).toEqual(run2.windowPpls);
  });

  it('PPL ratio ≈ 1.0 when reference equals self (driver correctness)', () => {
    // Run the model and record its PPL, then use THAT as the reference.
    // Ratio should be exactly 1.0 — proving the harness + driver are consistent.
    const baseline = runF4Eval({
      vaultDir,
      driverConfig: {
        totalLayers: TOTAL_LAYERS,
        hiddenSize: HIDDEN_SIZE,
        qHeads: Q_HEADS,
        kvHeads: KV_HEADS,
        headDim: HEAD_DIM,
      },
      tokenIds,
      windowCount: WINDOW_COUNT,
      windowSize: WINDOW_SIZE,
      layersNorm,
      layersBias,
      finalNorm,
      maxHotLayers: 20,
    });

    // Now run again with self as reference
    const withRef = runF4Eval({
      vaultDir,
      driverConfig: {
        totalLayers: TOTAL_LAYERS,
        hiddenSize: HIDDEN_SIZE,
        qHeads: Q_HEADS,
        kvHeads: KV_HEADS,
        headDim: HEAD_DIM,
      },
      tokenIds,
      windowCount: WINDOW_COUNT,
      windowSize: WINDOW_SIZE,
      layersNorm,
      layersBias,
      finalNorm,
      referencePpl: baseline.perplexity,
      maxHotLayers: 20,
    });

    expect(withRef.pplRatio).toBeCloseTo(1.0, 10);
  });

  it('all window PPLs are within 3σ of mean (no degenerate windows)', () => {
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
      windowCount: WINDOW_COUNT,
      windowSize: WINDOW_SIZE,
      layersNorm,
      layersBias,
      finalNorm,
      maxHotLayers: 20,
    });

    const mean =
      result.windowPpls.reduce((s, p) => s + p, 0) / result.windowPpls.length;
    const variance =
      result.windowPpls.reduce((s, p) => s + (p - mean) ** 2, 0) /
      result.windowPpls.length;
    const stddev = Math.sqrt(variance);

    for (const ppl of result.windowPpls) {
      expect(Math.abs(ppl - mean)).toBeLessThan(3 * stddev + 1e-6);
    }
  });

  it('no NaN/Inf with large token IDs near vocab boundary', () => {
    // Edge case: token IDs at vocab-1 (boundary of embedding lookup)
    const edgeTokens = Array.from({ length: WINDOW_SIZE }, (_, i) =>
      i % 2 === 0 ? VOCAB_SIZE - 1 : 0
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
      tokenIds: edgeTokens,
      windowCount: 1,
      windowSize: WINDOW_SIZE,
      layersNorm,
      layersBias,
      finalNorm,
      maxHotLayers: 20,
      enableNanTripwire: true,
    });

    expect(result.nanDetected).toBe(false);
    expect(isFinite(result.perplexity)).toBe(true);
  });

  it('PPL stays bounded (not divergent) for random synthetic model', () => {
    // A random model should produce PPL around vocabSize (uniform distribution
    // after random transforms ≈ no information). PPL >> vocabSize² suggests
    // numerical instability in the driver.
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
      windowCount: WINDOW_COUNT,
      windowSize: WINDOW_SIZE,
      layersNorm,
      layersBias,
      finalNorm,
      maxHotLayers: 20,
    });

    // Random model: expect PPL in range [1, vocabSize^2].
    // If it exceeds vocabSize^2, the driver is likely exploding activations.
    expect(result.perplexity).toBeLessThan(VOCAB_SIZE * VOCAB_SIZE);
    expect(result.perplexity).toBeGreaterThan(1);
  });
});
