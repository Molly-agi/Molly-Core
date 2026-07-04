#!/usr/bin/env -S npx tsx
/* eslint-disable */
// scripts/titan/run-inference.ts
//
// Run a single inference pass on the Titan crystal vault.
// Usage: npx tsx scripts/titan/run-inference.ts [--vault <dir>] [--gguf <path>] [--prompt <text>]

import {
  parseGGUF,
  type GGUFFile,
} from '../../src/ai/engine-titan/gguf-ingest';
import { readTensorData } from '../../src/ai/engine-titan/gguf-dequant';
import { CrystalInferenceLayer } from '../../src/ai/engine-titan/crystal-inference-layer';
import {
  CrystalTransformerDriver,
  type LayerNormWeights,
  type LayerBiasWeights,
} from '../../src/ai/inference/crystal-transformer-driver';
import { KvCache } from '../../src/ai/inference/kv-cache';
import {
  applyQwenChatTemplate,
  IM_END,
} from '../../src/ai/inference/qwen-chat-template';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const getArg = (f: string, d: string | null = null): string | null => {
  const i = args.indexOf(f);
  return i !== -1 ? args[i + 1] : d;
};

const NUM_LAYERS = 80;
const HIDDEN = 8192;
const KV_DIM = 1024; // 8 heads × 128 dim

async function main() {
  const vaultDir =
    getArg('--vault') ?? '/workspaces/Molly-Core/data/titan-crystals-72b';
  const ggufPath = getArg('--gguf') ?? findGguf();
  const prompt = getArg('--prompt') ?? 'Hello! What is 2 + 2?';
  const maxTokens = parseInt(getArg('--max-tokens') ?? '64', 10);

  if (!ggufPath) {
    console.error('No GGUF path. Use --gguf <path>');
    process.exit(1);
  }
  if (!existsSync(vaultDir)) {
    console.error(`Vault dir not found: ${vaultDir}`);
    process.exit(1);
  }

  console.log(`[inference] Vault: ${vaultDir}`);
  console.log(`[inference] GGUF: ${ggufPath}`);
  console.log(`[inference] Prompt: "${prompt}"`);
  console.log(`[inference] Max tokens: ${maxTokens}`);

  // 1. Parse GGUF for metadata and 1D tensors
  console.log(`[inference] Parsing GGUF header...`);
  const gguf = parseGGUF(ggufPath);

  // 2. Extract tokenizer from GGUF metadata → write temp tokenizer.json
  const tokenizerPath = join(vaultDir, 'tokenizer.json');
  if (!existsSync(tokenizerPath)) {
    console.log(`[inference] Extracting tokenizer from GGUF metadata...`);
    extractTokenizer(gguf, tokenizerPath);
  }

  // 3. Load tokenizer
  const { QwenTokenizer } =
    await import('../../src/ai/inference/qwen-tokenizer');
  const tokenizer = new QwenTokenizer(tokenizerPath);
  console.log(`[inference] Tokenizer loaded: ${tokenizer.vocabSize} tokens`);

  // 4. Tokenize prompt using chat template
  const templateText = applyQwenChatTemplate([
    { role: 'user', content: prompt },
  ]);
  const inputIds = tokenizer.encode(templateText);
  console.log(`[inference] Input tokens: ${inputIds.length}`);

  // 5. Load 1D tensors (norm gains, biases) from GGUF
  console.log(`[inference] Loading 1D norm/bias tensors...`);
  const { layersNorm, layersBias, finalNorm } = load1DTensors(gguf);

  // 6. Set up inference engine
  const layerEngine = new CrystalInferenceLayer({
    vaultDir,
    maxHotLayers: 6,
  });
  const kvCache = new KvCache({
    numLayers: NUM_LAYERS,
    kvDim: KV_DIM,
    maxTokens: 2048,
  });
  const driver = new CrystalTransformerDriver();

  console.log(
    `[inference] KV cache: ${(kvCache.byteLength / 1024 / 1024).toFixed(0)} MB`
  );
  console.log(`[inference] Starting generation...`);

  // 7. Prefill: process all input tokens
  const startTime = Date.now();
  for (let i = 0; i < inputIds.length; i++) {
    driver.executeTokenPass(
      inputIds[i],
      i,
      layersNorm,
      layersBias,
      finalNorm,
      kvCache,
      layerEngine
    );
    if (i % 10 === 0) {
      process.stdout.write(
        `\r[inference] Prefill: ${i + 1}/${inputIds.length}`
      );
    }
  }
  console.log(
    `\n[inference] Prefill done (${((Date.now() - startTime) / 1000).toFixed(1)}s)`
  );

  // 8. Decode: generate tokens autoregressively
  const generated: number[] = [];
  let pos = inputIds.length;
  let lastTokenId = inputIds[inputIds.length - 1];

  for (let step = 0; step < maxTokens; step++) {
    const logits = driver.executeTokenPass(
      lastTokenId,
      pos,
      layersNorm,
      layersBias,
      finalNorm,
      kvCache,
      layerEngine
    );

    // Greedy decode: argmax
    let maxVal = -Infinity;
    let maxIdx = 0;
    for (let i = 0; i < logits.length; i++) {
      if (logits[i] > maxVal) {
        maxVal = logits[i];
        maxIdx = i;
      }
    }

    generated.push(maxIdx);
    lastTokenId = maxIdx;
    pos++;

    // Stream decode
    const decoded = tokenizer.decode([maxIdx]);
    process.stdout.write(decoded);

    // Stop on <|im_end|>
    const tail = tokenizer.decode(generated.slice(-10));
    if (tail.includes(IM_END)) break;
  }

  const elapsed = (Date.now() - startTime) / 1000;
  const tps = generated.length / elapsed;
  console.log(
    `\n\n[inference] Generated ${generated.length} tokens in ${elapsed.toFixed(1)}s (${tps.toFixed(2)} tok/s)`
  );
  console.log(
    `[inference] Hot layers: ${layerEngine.hotCount} (${layerEngine.hotLayerNames.join(', ')})`
  );
}

function findGguf(): string | null {
  const blobDir = join(
    process.env.HOME || '/home/codespace',
    '.ollama/models/blobs'
  );
  try {
    const { readdirSync, statSync } = require('fs');
    const files = readdirSync(blobDir);
    let largest = { path: '', size: 0 };
    for (const f of files) {
      const full = join(blobDir, f);
      const st = statSync(full);
      if (st.size > largest.size) largest = { path: full, size: st.size };
    }
    if (largest.size > 1_000_000_000) return largest.path;
  } catch {}
  return null;
}

function extractTokenizer(gguf: GGUFFile, outPath: string): void {
  const meta = gguf.header.metadata;

  const tokens = meta.get('tokenizer.ggml.tokens') as string[] | undefined;
  const merges = meta.get('tokenizer.ggml.merges') as string[] | undefined;
  const addedTokens = meta.get('tokenizer.ggml.added_tokens') as
    | string[]
    | undefined;

  if (!tokens || !merges) {
    throw new Error(
      'GGUF metadata missing tokenizer.ggml.tokens or tokenizer.ggml.merges'
    );
  }

  const vocab: Record<string, number> = {};
  for (let i = 0; i < tokens.length; i++) {
    vocab[tokens[i]] = i;
  }

  const tokenizerJson: any = {
    model: {
      type: 'BPE',
      vocab,
      merges,
    },
    added_tokens: (addedTokens ?? []).map((content, i) => ({
      id: tokens.length + i,
      content,
      special: true,
    })),
  };

  // Qwen 2.5 stores special tokens in the main vocab, not separately
  // Handle known specials
  const knownSpecials = ['<|im_start|>', '<|im_end|>', '<|endoftext|>'];
  const addedList: Array<{ id: number; content: string; special: boolean }> =
    [];
  for (const s of knownSpecials) {
    if (vocab[s] !== undefined) {
      addedList.push({ id: vocab[s], content: s, special: true });
    }
  }
  if (addedList.length > 0) {
    tokenizerJson.added_tokens = addedList;
  }

  writeFileSync(outPath, JSON.stringify(tokenizerJson));
  console.log(
    `[inference] Wrote tokenizer.json (${tokens.length} vocab, ${merges.length} merges)`
  );
}

function load1DTensors(gguf: GGUFFile): {
  layersNorm: LayerNormWeights[];
  layersBias: LayerBiasWeights[];
  finalNorm: Float32Array;
} {
  const layersNorm: LayerNormWeights[] = [];
  const layersBias: LayerBiasWeights[] = [];

  const findTensor = (name: string) => {
    const t = gguf.tensors.find((t) => t.name === name);
    if (!t) throw new Error(`Missing tensor: ${name}`);
    return readTensorData(gguf, t);
  };

  for (let l = 0; l < NUM_LAYERS; l++) {
    const attnNormGain = findTensor(`blk.${l}.attn_norm.weight`);
    const ffnNormGain = findTensor(`blk.${l}.ffn_norm.weight`);
    layersNorm.push({ attnNormGain, ffnNormGain });

    // Biases: Qwen 2.5 has biases on QKV projections
    const qBias = findTensor(`blk.${l}.attn_q.bias`);
    const kBias = findTensor(`blk.${l}.attn_k.bias`);
    const vBias = findTensor(`blk.${l}.attn_v.bias`);
    layersBias.push({ qBias, kBias, vBias });
  }

  const finalNorm = findTensor('output_norm.weight');
  return { layersNorm, layersBias, finalNorm };
}

main().catch((err) => {
  console.error(`[inference] Fatal: ${err.stack ?? err.message}`);
  process.exit(1);
});
