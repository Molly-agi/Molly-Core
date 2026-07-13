// src/ai/engine-titan/__tests__/streaming-compress-routing.test.ts
//
// Tests the pure routing helper functions in streaming-compress.ts:
// isEmbeddingOrLMHead, extractLayerIndex, isFirstOrLastNLayers,
// isFFNProjection, getGGUFBlockCount. These are the decision functions
// that determine which compression path each tensor takes — critical
// for fidelity because wrong routing = wrong compression = garbage output.

import { describe, test, expect } from '@jest/globals';
import {
  isEmbeddingOrLMHead,
  extractLayerIndex,
  isFirstOrLastNLayers,
  isFFNProjection,
  getGGUFBlockCount,
} from '../streaming-compress';

describe('isEmbeddingOrLMHead', () => {
  test('matches GGUF token_embd patterns', () => {
    expect(isEmbeddingOrLMHead('token_embd.weight')).toBe(true);
    expect(isEmbeddingOrLMHead('TOKEN_EMBD.weight')).toBe(true);
  });

  test('matches HuggingFace embed_tokens pattern', () => {
    expect(isEmbeddingOrLMHead('model.embed_tokens.weight')).toBe(true);
  });

  test('matches lm_head pattern', () => {
    expect(isEmbeddingOrLMHead('lm_head.weight')).toBe(true);
    expect(isEmbeddingOrLMHead('LM_HEAD.weight')).toBe(true);
  });

  test('matches output.weight (GGUF LM head)', () => {
    expect(isEmbeddingOrLMHead('output.weight')).toBe(true);
    expect(isEmbeddingOrLMHead('output')).toBe(true);
  });

  test('matches GPT-2 wte/wpe patterns', () => {
    expect(isEmbeddingOrLMHead('transformer.wte.weight')).toBe(true);
    expect(isEmbeddingOrLMHead('wte.weight')).toBe(true);
    expect(isEmbeddingOrLMHead('transformer.wpe.weight')).toBe(true);
    expect(isEmbeddingOrLMHead('wpe.weight')).toBe(true);
  });

  test('rejects attention projections', () => {
    expect(isEmbeddingOrLMHead('blk.0.attn_q.weight')).toBe(false);
    expect(isEmbeddingOrLMHead('model.layers.0.self_attn.q_proj.weight')).toBe(
      false
    );
  });

  test('rejects FFN projections', () => {
    expect(isEmbeddingOrLMHead('blk.0.ffn_gate.weight')).toBe(false);
    expect(isEmbeddingOrLMHead('model.layers.5.mlp.gate_proj.weight')).toBe(
      false
    );
  });

  test('rejects norms', () => {
    expect(isEmbeddingOrLMHead('blk.0.attn_norm.weight')).toBe(false);
    expect(isEmbeddingOrLMHead('output_norm.weight')).toBe(false);
  });
});

describe('extractLayerIndex', () => {
  test('extracts from GGUF blk.N format', () => {
    expect(extractLayerIndex('blk.0.attn_q.weight')).toBe(0);
    expect(extractLayerIndex('blk.79.ffn_gate.weight')).toBe(79);
    expect(extractLayerIndex('blk.12.attn_norm.weight')).toBe(12);
  });

  test('extracts from layer.N format', () => {
    expect(extractLayerIndex('layer.0.attn.q')).toBe(0);
    expect(extractLayerIndex('layer.31.ffn.up')).toBe(31);
  });

  test('extracts from GPT-2 h.N format', () => {
    expect(extractLayerIndex('h.0.attn.c_attn.weight')).toBe(0);
    expect(extractLayerIndex('h.11.mlp.c_fc.weight')).toBe(11);
  });

  test('extracts from HuggingFace .layers.N format', () => {
    expect(extractLayerIndex('model.layers.0.self_attn.q_proj.weight')).toBe(0);
    expect(extractLayerIndex('model.layers.79.mlp.gate_proj.weight')).toBe(79);
  });

  test('returns null for non-layer tensors', () => {
    expect(extractLayerIndex('token_embd.weight')).toBeNull();
    expect(extractLayerIndex('output.weight')).toBeNull();
    expect(extractLayerIndex('output_norm.weight')).toBeNull();
    expect(extractLayerIndex('wte.weight')).toBeNull();
  });

  test('returns null for empty or garbage names', () => {
    expect(extractLayerIndex('')).toBeNull();
    expect(extractLayerIndex('random_name')).toBeNull();
  });
});

describe('isFirstOrLastNLayers', () => {
  test('first 3 layers of 80-layer model are exempt', () => {
    expect(isFirstOrLastNLayers('blk.0.attn_q.weight', 80)).toBe(true);
    expect(isFirstOrLastNLayers('blk.1.attn_q.weight', 80)).toBe(true);
    expect(isFirstOrLastNLayers('blk.2.attn_q.weight', 80)).toBe(true);
    expect(isFirstOrLastNLayers('blk.3.attn_q.weight', 80)).toBe(false);
  });

  test('last 3 layers of 80-layer model are exempt', () => {
    expect(isFirstOrLastNLayers('blk.77.attn_q.weight', 80)).toBe(true);
    expect(isFirstOrLastNLayers('blk.78.attn_q.weight', 80)).toBe(true);
    expect(isFirstOrLastNLayers('blk.79.attn_q.weight', 80)).toBe(true);
    expect(isFirstOrLastNLayers('blk.76.attn_q.weight', 80)).toBe(false);
  });

  test('middle layers are not exempt', () => {
    expect(isFirstOrLastNLayers('blk.40.attn_q.weight', 80)).toBe(false);
    expect(isFirstOrLastNLayers('blk.10.attn_q.weight', 80)).toBe(false);
  });

  test('custom n parameter works', () => {
    expect(isFirstOrLastNLayers('blk.4.attn_q.weight', 80, 5)).toBe(true);
    expect(isFirstOrLastNLayers('blk.5.attn_q.weight', 80, 5)).toBe(false);
    expect(isFirstOrLastNLayers('blk.75.attn_q.weight', 80, 5)).toBe(true);
    expect(isFirstOrLastNLayers('blk.74.attn_q.weight', 80, 5)).toBe(false);
  });

  test('Atlas #A7: small model clamps N to avoid exempting everything', () => {
    // 5-layer model with n=3: effectiveN = floor(5/2) = 2
    // first 2 (idx 0,1) + last 2 (idx 3,4) → middle layer 2 survives
    expect(isFirstOrLastNLayers('blk.0.attn.weight', 5)).toBe(true);
    expect(isFirstOrLastNLayers('blk.1.attn.weight', 5)).toBe(true);
    expect(isFirstOrLastNLayers('blk.2.attn.weight', 5)).toBe(false);
    expect(isFirstOrLastNLayers('blk.3.attn.weight', 5)).toBe(true);
    expect(isFirstOrLastNLayers('blk.4.attn.weight', 5)).toBe(true);
  });

  test('4-layer model with n=3: all layers exempt (boundary case)', () => {
    // effectiveN = floor(4/2) = 2, first 2 + last 2 = all 4
    expect(isFirstOrLastNLayers('blk.0.attn.weight', 4)).toBe(true);
    expect(isFirstOrLastNLayers('blk.1.attn.weight', 4)).toBe(true);
    expect(isFirstOrLastNLayers('blk.2.attn.weight', 4)).toBe(true);
    expect(isFirstOrLastNLayers('blk.3.attn.weight', 4)).toBe(true);
  });

  test('2-layer model clamps to 1', () => {
    expect(isFirstOrLastNLayers('blk.0.attn.weight', 2)).toBe(true);
    expect(isFirstOrLastNLayers('blk.1.attn.weight', 2)).toBe(true);
  });

  test('1-layer model returns false (effectiveN = 0)', () => {
    expect(isFirstOrLastNLayers('blk.0.attn.weight', 1)).toBe(false);
  });

  test('non-layer tensors return false', () => {
    expect(isFirstOrLastNLayers('token_embd.weight', 80)).toBe(false);
    expect(isFirstOrLastNLayers('output.weight', 80)).toBe(false);
  });

  test('totalLayers <= 0 returns false', () => {
    expect(isFirstOrLastNLayers('blk.0.attn.weight', 0)).toBe(false);
    expect(isFirstOrLastNLayers('blk.0.attn.weight', -1)).toBe(false);
  });
});

describe('isFFNProjection', () => {
  test('matches GGUF ffn_gate/ffn_up/ffn_down', () => {
    expect(isFFNProjection('blk.0.ffn_gate.weight')).toBe(true);
    expect(isFFNProjection('blk.5.ffn_up.weight')).toBe(true);
    expect(isFFNProjection('blk.79.ffn_down.weight')).toBe(true);
  });

  test('matches HuggingFace gate_proj/up_proj/down_proj', () => {
    expect(isFFNProjection('model.layers.0.mlp.gate_proj.weight')).toBe(true);
    expect(isFFNProjection('model.layers.0.mlp.up_proj.weight')).toBe(true);
    expect(isFFNProjection('model.layers.0.mlp.down_proj.weight')).toBe(true);
  });

  test('matches GPT-2 mlp fc1/fc2/c_fc/c_proj', () => {
    expect(isFFNProjection('h.0.mlp.c_fc.weight')).toBe(true);
    expect(isFFNProjection('h.0.mlp.c_proj.weight')).toBe(true);
    expect(isFFNProjection('h.0.mlp.fc1.weight')).toBe(true);
    expect(isFFNProjection('h.0.mlp.fc2.weight')).toBe(true);
  });

  test('Atlas #A1: rejects ffn_norm (not a projection)', () => {
    expect(isFFNProjection('blk.0.ffn_norm.weight')).toBe(false);
  });

  test('rejects attention projections', () => {
    expect(isFFNProjection('blk.0.attn_q.weight')).toBe(false);
    expect(isFFNProjection('blk.0.attn_k.weight')).toBe(false);
    expect(isFFNProjection('blk.0.attn_v.weight')).toBe(false);
    expect(isFFNProjection('model.layers.0.self_attn.q_proj.weight')).toBe(
      false
    );
  });

  test('rejects bias tensors', () => {
    expect(isFFNProjection('blk.0.ffn_gate_bias.bias')).toBe(false);
  });

  test('rejects embeddings', () => {
    expect(isFFNProjection('token_embd.weight')).toBe(false);
    expect(isFFNProjection('output.weight')).toBe(false);
  });

  test('rejects norms', () => {
    expect(isFFNProjection('attn_norm.weight')).toBe(false);
    expect(isFFNProjection('output_norm.weight')).toBe(false);
  });
});

describe('getGGUFBlockCount', () => {
  test('extracts llama block count', () => {
    const meta = new Map<string, unknown>([
      ['llama.block_count', 80],
      ['llama.context_length', 4096],
    ]);
    expect(getGGUFBlockCount(meta)).toBe(80);
  });

  test('extracts qwen2 block count', () => {
    const meta = new Map<string, unknown>([['qwen2.block_count', 32]]);
    expect(getGGUFBlockCount(meta)).toBe(32);
  });

  test('extracts mistral block count', () => {
    const meta = new Map<string, unknown>([['mistral.block_count', 32]]);
    expect(getGGUFBlockCount(meta)).toBe(32);
  });

  test('extracts phi3 block count', () => {
    const meta = new Map<string, unknown>([['phi3.block_count', 40]]);
    expect(getGGUFBlockCount(meta)).toBe(40);
  });

  test('returns undefined for non-transformer models', () => {
    const meta = new Map<string, unknown>([
      ['general.name', 'some-model'],
      ['general.architecture', 'diffusion'],
    ]);
    expect(getGGUFBlockCount(meta)).toBeUndefined();
  });

  test('returns undefined for empty metadata', () => {
    const meta = new Map<string, unknown>();
    expect(getGGUFBlockCount(meta)).toBeUndefined();
  });

  test('ignores non-number block_count values', () => {
    const meta = new Map<string, unknown>([['llama.block_count', '80']]);
    expect(getGGUFBlockCount(meta)).toBeUndefined();
  });

  test('returns first match if multiple architectures present', () => {
    const meta = new Map<string, unknown>([
      ['llama.block_count', 80],
      ['qwen2.block_count', 32],
    ]);
    expect(getGGUFBlockCount(meta)).toBe(80);
  });
});
