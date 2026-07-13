/**
 * layer0-activation.test.ts — localize before you globalize
 *
 * Validates the CrystalTransformerDriver's forward pass for a single layer
 * by checking internal checkpoints (post-RMSNorm, post-RoPE, post-attn,
 * post-FFN) against a golden reference computed from uncompressed weights.
 *
 * Uses small model dimensions (hidden=64, 4Q/2KV heads, headDim=16) so the
 * test runs fast in CI while exercising all code paths: GQA, NeoX RoPE,
 * SwiGLU, RMSNorm, and ternary compression noise tolerance.
 *
 * DIAGNOSTIC MAP:
 *   Q/K post-RoPE fails   -> NeoX pairing or rope_theta wrong
 *   attn+outproj fails    -> GQA kvGroupIdx or head slicing wrong
 *   SwiGLU fails          -> ffn_down/gate/up pack or silu order
 *   only h_out fails      -> residual add / norm placement
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CrystalTransformerDriver,
  LayerNormWeights,
  LayerBiasWeights,
  LayerProbe,
  DriverConfig,
} from '../../inference/crystal-transformer-driver';
import { CrystalInferenceLayer } from '../crystal-inference-layer';
import { TitanEngineOrchestrator } from '../orchestrator';
import { E8QuantizerAdapter } from '../quantizer-e8-adapter';
import { KvCache } from '../../inference/kv-cache';

// ── Small model geometry for testing ────────────────────────────────────────
const HIDDEN = 64;
const Q_HEADS = 4;
const KV_HEADS = 2;
const HEAD_DIM = 16; // HIDDEN / Q_HEADS
const FFN_DIM = 128; // typical 2x-4x hidden
const VOCAB = 32;
const RANK = 24; // high enough rank to capture most signal from random weights
const ROPE_THETA = 10000.0;

const CONFIG: DriverConfig = {
  totalLayers: 1,
  hiddenSize: HIDDEN,
  qHeads: Q_HEADS,
  kvHeads: KV_HEADS,
  headDim: HEAD_DIM,
  ropeTheta: ROPE_THETA,
};

// ── Tolerances ──────────────────────────────────────────────────────────────
// E8 lattice quantization (3.5 bits/weight) is much higher fidelity than the
// old ternary path (1.58 bits). These thresholds catch LOGIC bugs (wrong RoPE
// pairing → cos<0.3, wrong GQA index → cos<0.4) while allowing for
// E8+rank compression noise. E8 typically gives cos≈0.90-0.99.
const TOL = {
  cosMin: 0.85,
  relRmseMax: 0.8,
};

// ── Deterministic weight generation ─────────────────────────────────────────
function makeWeights(rows: number, cols: number, seed: number): Float32Array {
  // Generate inherently low-rank weights: W = A_rand @ B_rand
  // This makes SVD decomposition nearly lossless, isolating ternary noise.
  const innerRank = Math.min(rows, cols, RANK);
  const a = new Float32Array(rows * innerRank);
  const b = new Float32Array(innerRank * cols);
  for (let i = 0; i < a.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    a[i] = seed / 4294967296 - 0.5;
  }
  for (let i = 0; i < b.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    b[i] = seed / 4294967296 - 0.5;
  }
  // W = A @ B  (rows×innerRank @ innerRank×cols = rows×cols)
  const w = new Float32Array(rows * cols);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      let sum = 0;
      for (let k = 0; k < innerRank; k++) {
        sum += a[i * innerRank + k] * b[k * cols + j];
      }
      w[i * cols + j] = sum;
    }
  }
  return w;
}

function makeNormGain(size: number): Float32Array {
  // Norm gains are typically ~1.0 with small variation
  const g = new Float32Array(size);
  for (let i = 0; i < size; i++) g[i] = 0.9 + 0.2 * Math.sin(i * 0.7);
  return g;
}

function makeBias(size: number, seed: number): Float32Array {
  const b = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    b[i] = (seed / 4294967296 - 0.5) * 0.1; // small biases
  }
  return b;
}

// ── Reference computation (uncompressed path) ───────────────────────────────
function rmsNorm(
  x: Float32Array,
  gain: Float32Array,
  size: number
): Float32Array {
  const out = new Float32Array(size);
  let sumSq = 0;
  for (let i = 0; i < size; i++) sumSq += x[i] * x[i];
  const scale = 1.0 / Math.sqrt(sumSq / size + 1e-6);
  for (let i = 0; i < size; i++) out[i] = x[i] * scale * gain[i];
  return out;
}

function matmulVec(
  W: Float32Array,
  rows: number,
  cols: number,
  x: Float32Array
): Float32Array {
  // W is [rows × cols] stored row-major. Input x is [rows]. Output is [cols].
  // out[j] = sum_i(x[i] * W[i * cols + j])
  const out = new Float32Array(cols);
  for (let j = 0; j < cols; j++) {
    let sum = 0;
    for (let i = 0; i < rows; i++) {
      sum += x[i] * W[i * cols + j];
    }
    out[j] = sum;
  }
  return out;
}

function applyNeoXRoPE(
  vec: Float32Array,
  pos: number,
  headDim: number,
  ropeTheta: number
): Float32Array {
  const out = new Float32Array(headDim);
  const half = headDim / 2;
  for (let i = 0; i < half; i++) {
    const x0 = vec[i];
    const x1 = vec[i + half];
    const freq = 1.0 / Math.pow(ropeTheta, (i * 2) / headDim);
    const alpha = pos * freq;
    const cosA = Math.cos(alpha);
    const sinA = Math.sin(alpha);
    out[i] = x0 * cosA - x1 * sinA;
    out[i + half] = x0 * sinA + x1 * cosA;
  }
  return out;
}

function embeddingColumn(
  W: Float32Array,
  rows: number,
  cols: number,
  tokenId: number
): Float32Array {
  // Column gather: out[i] = W[i, tokenId]
  const out = new Float32Array(rows);
  for (let i = 0; i < rows; i++) {
    out[i] = W[i * cols + tokenId];
  }
  return out;
}

// ── Metrics ─────────────────────────────────────────────────────────────────
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

function relRmse(a: Float32Array, b: Float32Array): number {
  let se = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    se += d * d;
    nb += b[i] * b[i];
  }
  return Math.sqrt(se) / (Math.sqrt(nb) + 1e-12);
}

// ── Test suite ──────────────────────────────────────────────────────────────
describe('Layer-0 Activation Localization', () => {
  let tmpDir: string;
  const orchestrator = new TitanEngineOrchestrator(new E8QuantizerAdapter());

  // Raw weight matrices (uncompressed) for golden reference
  const W_embd = makeWeights(HIDDEN, VOCAB, 42);
  const W_attn_q = makeWeights(HIDDEN, HIDDEN, 100);
  const W_attn_k = makeWeights(HIDDEN, KV_HEADS * HEAD_DIM, 200);
  const W_attn_v = makeWeights(HIDDEN, KV_HEADS * HEAD_DIM, 300);
  const W_attn_out = makeWeights(HIDDEN, HIDDEN, 400);
  const W_ffn_gate = makeWeights(HIDDEN, FFN_DIM, 500);
  const W_ffn_up = makeWeights(HIDDEN, FFN_DIM, 600);
  const W_ffn_down = makeWeights(FFN_DIM, HIDDEN, 700);
  const W_output = makeWeights(HIDDEN, VOCAB, 800); // final logit projection

  const normGains: LayerNormWeights = {
    attnNormGain: makeNormGain(HIDDEN),
    ffnNormGain: makeNormGain(HIDDEN),
  };
  const biases: LayerBiasWeights = {
    qBias: makeBias(HIDDEN, 10),
    kBias: makeBias(KV_HEADS * HEAD_DIM, 20),
    vBias: makeBias(KV_HEADS * HEAD_DIM, 30),
  };
  const finalNorm = makeNormGain(HIDDEN);

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'layer0-act-'));

    // Compress all weight matrices into the test vault
    await orchestrator.compressModelLayer(
      'token_embd.weight',
      W_embd,
      HIDDEN,
      VOCAB,
      RANK,
      tmpDir
    );
    await orchestrator.compressModelLayer(
      'blk.0.attn_q.weight',
      W_attn_q,
      HIDDEN,
      HIDDEN,
      RANK,
      tmpDir
    );
    await orchestrator.compressModelLayer(
      'blk.0.attn_k.weight',
      W_attn_k,
      HIDDEN,
      KV_HEADS * HEAD_DIM,
      RANK,
      tmpDir
    );
    await orchestrator.compressModelLayer(
      'blk.0.attn_v.weight',
      W_attn_v,
      HIDDEN,
      KV_HEADS * HEAD_DIM,
      RANK,
      tmpDir
    );
    await orchestrator.compressModelLayer(
      'blk.0.attn_output.weight',
      W_attn_out,
      HIDDEN,
      HIDDEN,
      RANK,
      tmpDir
    );
    await orchestrator.compressModelLayer(
      'blk.0.ffn_gate.weight',
      W_ffn_gate,
      HIDDEN,
      FFN_DIM,
      RANK,
      tmpDir
    );
    await orchestrator.compressModelLayer(
      'blk.0.ffn_up.weight',
      W_ffn_up,
      HIDDEN,
      FFN_DIM,
      RANK,
      tmpDir
    );
    await orchestrator.compressModelLayer(
      'blk.0.ffn_down.weight',
      W_ffn_down,
      FFN_DIM,
      HIDDEN,
      RANK,
      tmpDir
    );
    await orchestrator.compressModelLayer(
      'output.weight',
      W_output,
      HIDDEN,
      VOCAB,
      RANK,
      tmpDir
    );
  }, 30_000);

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function computeGoldenReference(tokenId: number, pos: number) {
    // Embedding lookup
    const x = embeddingColumn(W_embd, HIDDEN, VOCAB, tokenId);

    // Pre-attention RMSNorm
    const h_postnorm = rmsNorm(x, normGains.attnNormGain, HIDDEN);

    // Q/K/V projections (uncompressed)
    const qProj = matmulVec(W_attn_q, HIDDEN, HIDDEN, h_postnorm);
    const kProj = matmulVec(W_attn_k, HIDDEN, KV_HEADS * HEAD_DIM, h_postnorm);
    const vProj = matmulVec(W_attn_v, HIDDEN, KV_HEADS * HEAD_DIM, h_postnorm);

    // Add biases
    for (let i = 0; i < qProj.length; i++) qProj[i] += biases.qBias[i];
    for (let i = 0; i < kProj.length; i++) kProj[i] += biases.kBias[i];
    for (let i = 0; i < vProj.length; i++) vProj[i] += biases.vBias[i];

    // NeoX RoPE
    const q_postrope = new Float32Array(Q_HEADS * HEAD_DIM);
    for (let h = 0; h < Q_HEADS; h++) {
      const slice = qProj.subarray(h * HEAD_DIM, (h + 1) * HEAD_DIM);
      q_postrope.set(
        applyNeoXRoPE(slice, pos, HEAD_DIM, ROPE_THETA),
        h * HEAD_DIM
      );
    }
    const k_postrope = new Float32Array(KV_HEADS * HEAD_DIM);
    for (let h = 0; h < KV_HEADS; h++) {
      const slice = kProj.subarray(h * HEAD_DIM, (h + 1) * HEAD_DIM);
      k_postrope.set(
        applyNeoXRoPE(slice, pos, HEAD_DIM, ROPE_THETA),
        h * HEAD_DIM
      );
    }

    // Self-attention (single token at pos 0 — trivial softmax = 1.0)
    // With only 1 token in cache, attention output = V re-arranged by head groups
    const attnOutRaw = new Float32Array(HIDDEN);
    const headsPerGroup = Q_HEADS / KV_HEADS;
    for (let h = 0; h < Q_HEADS; h++) {
      const kvGroupIdx = Math.floor(h / headsPerGroup);
      // Only 1 token in KV cache → softmax is trivially [1.0]
      // headContext = V for this KV group
      const vHead = vProj.subarray(
        kvGroupIdx * HEAD_DIM,
        (kvGroupIdx + 1) * HEAD_DIM
      );
      attnOutRaw.set(vHead, h * HEAD_DIM);
    }

    // Output projection + residual
    const attn_out = matmulVec(W_attn_out, HIDDEN, HIDDEN, attnOutRaw);
    const h_postattn = new Float32Array(HIDDEN);
    for (let i = 0; i < HIDDEN; i++) h_postattn[i] = x[i] + attn_out[i];

    // Pre-FFN RMSNorm
    const h_ffn = rmsNorm(h_postattn, normGains.ffnNormGain, HIDDEN);

    // SwiGLU
    const gate = matmulVec(W_ffn_gate, HIDDEN, FFN_DIM, h_ffn);
    const up = matmulVec(W_ffn_up, HIDDEN, FFN_DIM, h_ffn);
    const intermediate = new Float32Array(FFN_DIM);
    for (let i = 0; i < FFN_DIM; i++) {
      const silu = gate[i] * (1.0 / (1.0 + Math.exp(-gate[i])));
      intermediate[i] = silu * up[i];
    }
    const ffn_out = matmulVec(W_ffn_down, FFN_DIM, HIDDEN, intermediate);

    const h_out = new Float32Array(HIDDEN);
    for (let i = 0; i < HIDDEN; i++) h_out[i] = h_postattn[i] + ffn_out[i];

    return {
      h_postnorm,
      q_postrope,
      k_postrope,
      attn_out,
      h_postattn,
      ffn_out,
      h_out,
    };
  }

  it('driver probe matches golden reference within ternary tolerance', () => {
    const tokenId = 7;
    const pos = 0;

    // Compute golden reference from raw (uncompressed) weights
    const ref = computeGoldenReference(tokenId, pos);

    // Run the real driver with a probe to collect intermediates
    const driver = new CrystalTransformerDriver(CONFIG);
    const layerEngine = new CrystalInferenceLayer({ vaultDir: tmpDir });
    const kvCache = new KvCache({
      numLayers: 1,
      kvDim: KV_HEADS * HEAD_DIM,
      maxTokens: 16,
    });

    const got: Record<string, Float32Array> = {};
    const probe: LayerProbe = (name, vec) => {
      got[name] = Float32Array.from(vec);
    };

    driver.executeTokenPass(
      tokenId,
      pos,
      [normGains],
      [biases],
      finalNorm,
      kvCache,
      layerEngine,
      probe
    );

    // ── Checkpoint comparisons ──────────────────────────────────────────────
    const checks = [
      { name: 'input RMSNorm', got: got['L0.h_postnorm'], ref: ref.h_postnorm },
      { name: 'Q post-RoPE', got: got['L0.q_postrope'], ref: ref.q_postrope },
      { name: 'K post-RoPE', got: got['L0.k_postrope'], ref: ref.k_postrope },
      { name: 'attn + out proj', got: got['L0.attn_out'], ref: ref.attn_out },
      { name: 'h after attn', got: got['L0.h_postattn'], ref: ref.h_postattn },
      { name: 'SwiGLU FFN', got: got['L0.ffn_out'], ref: ref.ffn_out },
      { name: 'h after FFN', got: got['L0.h_out'], ref: ref.h_out },
    ];

    for (const { name, got: g, ref: r } of checks) {
      expect(g).toBeDefined();
      expect(g.length).toBe(r.length);
      const cos = cosine(g, r);
      const rr = relRmse(g, r);
      console.log(
        `  ${cos >= TOL.cosMin && rr <= TOL.relRmseMax ? '✓' : '✗'} ${name}: cos=${cos.toFixed(5)} relRMSE=${rr.toFixed(4)}`
      );
      expect(cos).toBeGreaterThanOrEqual(TOL.cosMin);
      expect(rr).toBeLessThanOrEqual(TOL.relRmseMax);
    }
  });

  it('probe fires for all expected checkpoints', () => {
    const driver = new CrystalTransformerDriver(CONFIG);
    const layerEngine = new CrystalInferenceLayer({ vaultDir: tmpDir });
    const kvCache = new KvCache({
      numLayers: 1,
      kvDim: KV_HEADS * HEAD_DIM,
      maxTokens: 16,
    });

    const probeNames: string[] = [];
    const probe: LayerProbe = (name) => {
      probeNames.push(name);
    };

    driver.executeTokenPass(
      7,
      0,
      [normGains],
      [biases],
      finalNorm,
      kvCache,
      layerEngine,
      probe
    );

    expect(probeNames).toEqual([
      'L0.h_postnorm',
      'L0.q_postrope',
      'L0.k_postrope',
      'L0.attn_out',
      'L0.h_postattn',
      'L0.ffn_out',
      'L0.h_out',
    ]);
  });

  it('detects a NeoX RoPE pairing bug (wrong half offset)', () => {
    // If RoPE paired (2i, 2i+1) instead of (i, i+half), Q/K would differ.
    // This validates diagnostic specificity: RoPE is the isolated signal.
    const tokenId = 3;
    const pos = 5; // non-zero pos so RoPE actually rotates

    const ref = computeGoldenReference(tokenId, pos);

    const driver = new CrystalTransformerDriver(CONFIG);
    const layerEngine = new CrystalInferenceLayer({ vaultDir: tmpDir });
    const kvCache = new KvCache({
      numLayers: 1,
      kvDim: KV_HEADS * HEAD_DIM,
      maxTokens: 16,
    });

    const got: Record<string, Float32Array> = {};
    driver.executeTokenPass(
      tokenId,
      pos,
      [normGains],
      [biases],
      finalNorm,
      kvCache,
      layerEngine,
      (name, vec) => {
        got[name] = Float32Array.from(vec);
      }
    );

    // h_postnorm should match well (no RoPE involved yet)
    const cosNorm = cosine(got['L0.h_postnorm'], ref.h_postnorm);
    expect(cosNorm).toBeGreaterThanOrEqual(TOL.cosMin);

    // Q/K post-RoPE should also match (validates NeoX pairing is correct)
    const cosQ = cosine(got['L0.q_postrope'], ref.q_postrope);
    const cosK = cosine(got['L0.k_postrope'], ref.k_postrope);
    expect(cosQ).toBeGreaterThanOrEqual(TOL.cosMin);
    expect(cosK).toBeGreaterThanOrEqual(TOL.cosMin);
  });

  it('self-test: comparison math correctness', () => {
    const a = Float32Array.from([1, 2, 3, 4]);
    const same = Float32Array.from([1, 2, 3, 4]);
    const noisy = Float32Array.from([1.001, 1.999, 3.002, 3.998]);
    const wrong = Float32Array.from([4, 3, 2, 1]);

    expect(cosine(a, same)).toBeCloseTo(1.0, 5);
    expect(relRmse(a, same)).toBeCloseTo(0.0, 5);

    expect(cosine(noisy, a)).toBeGreaterThan(0.9999);
    expect(relRmse(noisy, a)).toBeLessThan(0.01);

    // Reversed vector should have low cosine for non-symmetric data
    expect(cosine(wrong, a)).toBeLessThan(0.999);
  });
});
