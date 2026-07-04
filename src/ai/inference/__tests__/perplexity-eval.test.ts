// src/ai/inference/__tests__/perplexity-eval.test.ts
//
// Integration test for the perplexity evaluation loop.
// Uses the REAL CrystalTransformerDriver with a tiny config (2 layers, 64 hidden)
// and a MOCK CrystalInferenceLayer to verify the eval math is correct.
//
// Two scenarios:
// 1. Perfect prediction → perplexity ≈ 1.0
// 2. Uniform/random logits → perplexity ≈ vocabSize

import { evaluatePerplexity } from '../perplexity-eval';
import { CrystalTransformerDriver } from '../crystal-transformer-driver';
import type {
  LayerNormWeights,
  LayerBiasWeights,
} from '../crystal-transformer-driver';
import { KvCache } from '../kv-cache';
import type { CrystalInferenceLayer } from '../../engine-titan/crystal-inference-layer';
import type { ForwardResult } from '../../engine-titan/crystal-inference-layer';

// --- Tiny model geometry ---
const HIDDEN_SIZE = 64;
const Q_HEADS = 2;
const KV_HEADS = 2;
const HEAD_DIM = 32; // hiddenSize / qHeads
const TOTAL_LAYERS = 2;
const VOCAB_SIZE = 256;
const FFN_INTERMEDIATE = 64; // keep simple — same as hidden
const SEQ_LENGTH = 32;

// --- Helpers ---

function makeTokenSequence(len: number): number[] {
  return Array.from({ length: len }, (_, i) => i % VOCAB_SIZE);
}

function makeLayerNorms(): LayerNormWeights[] {
  return Array.from({ length: TOTAL_LAYERS }, () => ({
    attnNormGain: new Float32Array(HIDDEN_SIZE).fill(1),
    ffnNormGain: new Float32Array(HIDDEN_SIZE).fill(1),
  }));
}

function makeLayerBiases(): LayerBiasWeights[] {
  // All-zero biases so the transformer pass is a no-op on zero embeddings
  return Array.from({ length: TOTAL_LAYERS }, () => ({
    qBias: new Float32Array(HIDDEN_SIZE),
    kBias: new Float32Array(KV_HEADS * HEAD_DIM),
    vBias: new Float32Array(KV_HEADS * HEAD_DIM),
  }));
}

function makeFinalNorm(): Float32Array {
  return new Float32Array(HIDDEN_SIZE).fill(1);
}

function makeKvCache(): KvCache {
  return new KvCache({
    numLayers: TOTAL_LAYERS,
    kvDim: KV_HEADS * HEAD_DIM,
    maxTokens: SEQ_LENGTH + 4, // headroom
  });
}

/**
 * Returns the expected output dimension for a given layer name in our tiny config.
 */
function getOutputDim(layerName: string): number {
  if (layerName === 'output.weight') return VOCAB_SIZE;
  if (layerName.includes('attn_k.weight')) return KV_HEADS * HEAD_DIM;
  if (layerName.includes('attn_v.weight')) return KV_HEADS * HEAD_DIM;
  if (layerName.includes('ffn_gate.weight')) return FFN_INTERMEDIATE;
  if (layerName.includes('ffn_up.weight')) return FFN_INTERMEDIATE;
  // attn_q, attn_output, ffn_down → hiddenSize
  return HIDDEN_SIZE;
}

// --- Mock: Perfect Prediction ---
// The model "knows" the sequence and always assigns max logit to the correct next token.

class PerfectPredictionLayer {
  private posCounter = 0;
  private readonly tokenSequence: number[];

  constructor(tokenSequence: number[]) {
    this.tokenSequence = tokenSequence;
  }

  reset(): void {
    this.posCounter = 0;
  }

  getEmbeddingColumn(_name: string, _tokenId: number): Float32Array {
    // Zero embedding — transformer pass becomes no-op with zero biases
    return new Float32Array(HIDDEN_SIZE);
  }

  forward(
    layerName: string,
    _input: Float32Array,
    _batchSize: number,
    _inputDim: number
  ): ForwardResult {
    const cols = getOutputDim(layerName);

    if (layerName === 'output.weight') {
      // Return logits with high confidence at the next token position
      const logits = new Float32Array(cols);
      const nextToken = this.tokenSequence[this.posCounter + 1];
      logits[nextToken] = 100.0; // very confident
      this.posCounter++;
      return { output: logits, rows: 1, cols, fromCache: false };
    }

    // All other layers: return zeros (transformer no-op via residual)
    return { output: new Float32Array(cols), rows: 1, cols, fromCache: false };
  }
}

// --- Mock: Uniform (worst-case) ---
// Every forward pass for output.weight returns identical logits → uniform distribution.

class UniformLogitsLayer {
  getEmbeddingColumn(_name: string, _tokenId: number): Float32Array {
    return new Float32Array(HIDDEN_SIZE);
  }

  forward(
    layerName: string,
    _input: Float32Array,
    _batchSize: number,
    _inputDim: number
  ): ForwardResult {
    const cols = getOutputDim(layerName);
    // Uniform logits: all zeros → softmax gives 1/vocabSize for each token
    return { output: new Float32Array(cols), rows: 1, cols, fromCache: false };
  }
}

// --- Tests ---

describe('evaluatePerplexity — eval loop math', () => {
  const driver = new CrystalTransformerDriver({
    totalLayers: TOTAL_LAYERS,
    hiddenSize: HIDDEN_SIZE,
    qHeads: Q_HEADS,
    kvHeads: KV_HEADS,
    headDim: HEAD_DIM,
  });

  const layersNorm = makeLayerNorms();
  const layersBias = makeLayerBiases();
  const finalNorm = makeFinalNorm();

  it('perfect prediction → perplexity ≈ 1.0', () => {
    const tokenIds = makeTokenSequence(SEQ_LENGTH);
    const mockLayer = new PerfectPredictionLayer(tokenIds);
    const kvCache = makeKvCache();

    const result = evaluatePerplexity(
      tokenIds,
      driver,
      mockLayer as unknown as CrystalInferenceLayer,
      layersNorm,
      layersBias,
      finalNorm,
      kvCache
    );

    // With logit=100 at target and 0 elsewhere:
    // log_softmax ≈ 100 - (100 + log(1 + 255*exp(-100))) ≈ 0
    // perplexity = exp(0) = 1.0
    expect(result.perplexity).toBeCloseTo(1.0, 4);
    expect(result.avgLoss).toBeCloseTo(0, 4);
    expect(result.losses).toHaveLength(tokenIds.length - 1);
    expect(result.tokenCount).toBe(tokenIds.length - 1);
  });

  it('uniform logits → perplexity ≈ vocabSize', () => {
    const tokenIds = makeTokenSequence(SEQ_LENGTH);
    const mockLayer = new UniformLogitsLayer();
    const kvCache = makeKvCache();

    const result = evaluatePerplexity(
      tokenIds,
      driver,
      mockLayer as unknown as CrystalInferenceLayer,
      layersNorm,
      layersBias,
      finalNorm,
      kvCache
    );

    // Uniform distribution: P(target) = 1/VOCAB_SIZE
    // loss = -log(1/VOCAB_SIZE) = log(VOCAB_SIZE)
    // perplexity = exp(log(VOCAB_SIZE)) = VOCAB_SIZE
    expect(result.perplexity).toBeCloseTo(VOCAB_SIZE, 0);
    expect(result.avgLoss).toBeCloseTo(Math.log(VOCAB_SIZE), 4);
    expect(result.losses).toHaveLength(tokenIds.length - 1);
    expect(result.tokenCount).toBe(tokenIds.length - 1);
  });

  it('losses array length = tokenIds.length - 1', () => {
    const tokenIds = makeTokenSequence(10);
    const mockLayer = new UniformLogitsLayer();
    const kvCache = makeKvCache();

    const result = evaluatePerplexity(
      tokenIds,
      driver,
      mockLayer as unknown as CrystalInferenceLayer,
      layersNorm,
      layersBias,
      finalNorm,
      kvCache
    );

    expect(result.losses).toHaveLength(9); // 10 tokens → 9 predictions
  });

  it('avgLoss is finite and positive', () => {
    const tokenIds = makeTokenSequence(SEQ_LENGTH);
    const mockLayer = new UniformLogitsLayer();
    const kvCache = makeKvCache();

    const result = evaluatePerplexity(
      tokenIds,
      driver,
      mockLayer as unknown as CrystalInferenceLayer,
      layersNorm,
      layersBias,
      finalNorm,
      kvCache
    );

    expect(Number.isFinite(result.avgLoss)).toBe(true);
    expect(result.avgLoss).toBeGreaterThan(0);
  });

  it('single-token sequence → degenerate result (no predictions possible)', () => {
    const tokenIds = [42];
    const mockLayer = new UniformLogitsLayer();
    const kvCache = makeKvCache();

    const result = evaluatePerplexity(
      tokenIds,
      driver,
      mockLayer as unknown as CrystalInferenceLayer,
      layersNorm,
      layersBias,
      finalNorm,
      kvCache
    );

    expect(result.perplexity).toBe(Infinity);
    expect(result.avgLoss).toBe(Infinity);
    expect(result.tokenCount).toBe(0);
    expect(result.losses).toHaveLength(0);
  });

  it('two-token sequence → exactly one loss value', () => {
    const tokenIds = [5, 10];
    const mockLayer = new PerfectPredictionLayer(tokenIds);
    const kvCache = makeKvCache();

    const result = evaluatePerplexity(
      tokenIds,
      driver,
      mockLayer as unknown as CrystalInferenceLayer,
      layersNorm,
      layersBias,
      finalNorm,
      kvCache
    );

    expect(result.losses).toHaveLength(1);
    expect(result.tokenCount).toBe(1);
    expect(result.perplexity).toBeCloseTo(1.0, 4);
  });
});
