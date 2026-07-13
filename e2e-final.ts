/* eslint-disable @typescript-eslint/no-explicit-any */
import { parseGGUF } from '/workspaces/Molly-Core/src/ai/engine-titan/gguf-ingest';
import { readTensorData } from '/workspaces/Molly-Core/src/ai/engine-titan/gguf-dequant';
import { GgufFallbackLoader } from '/workspaces/Molly-Core/src/ai/inference/gguf-fallback-loader';
import { CrystalTransformerDriver } from '/workspaces/Molly-Core/src/ai/inference/crystal-transformer-driver';
import { KvCache } from '/workspaces/Molly-Core/src/ai/inference/kv-cache';
import { writeFileSync } from 'fs';

const GGUF_PATH =
  '/workspaces/Molly-Core/models/qwen2.5-72b-instruct-q4_k_m.gguf';
const NUM_LAYERS = 80,
  HIDDEN = 8192,
  Q_HEADS = 64,
  KV_HEADS = 8,
  HEAD_DIM = 128;
const KV_DIM = KV_HEADS * HEAD_DIM;
const tokens = [220, 28, 8397];
const targets = [28, 8397, 425];

console.log('=== E2E: Original dequant + corrected forward + KV fix ===');
console.log('Ref: pos0=14.82 pos1=15.84 pos2=4.63\n');

const gguf = parseGGUF(GGUF_PATH);
const fallback = new GgufFallbackLoader(GGUF_PATH, 10);
fallback.pin('token_embd.weight');

console.log('Loading norms/biases...');
const layersNorm: any[] = [],
  layersBias: any[] = [];
for (let l = 0; l < NUM_LAYERS; l++) {
  layersNorm.push({
    attnNormGain: readTensorData(
      gguf,
      gguf.tensors.find((t) => t.name === `blk.${l}.attn_norm.weight`)!
    ),
    ffnNormGain: readTensorData(
      gguf,
      gguf.tensors.find((t) => t.name === `blk.${l}.ffn_norm.weight`)!
    ),
  });
  layersBias.push({
    qBias: readTensorData(
      gguf,
      gguf.tensors.find((t) => t.name === `blk.${l}.attn_q.bias`)!
    ),
    kBias: readTensorData(
      gguf,
      gguf.tensors.find((t) => t.name === `blk.${l}.attn_k.bias`)!
    ),
    vBias: readTensorData(
      gguf,
      gguf.tensors.find((t) => t.name === `blk.${l}.attn_v.bias`)!
    ),
  });
}
const finalNorm = readTensorData(
  gguf,
  gguf.tensors.find((t) => t.name === 'output_norm.weight')!
);
console.log('Ready.\n');

const driver = new CrystalTransformerDriver({
  totalLayers: NUM_LAYERS,
  hiddenSize: HIDDEN,
  kvHeads: KV_HEADS,
  qHeads: Q_HEADS,
  headDim: HEAD_DIM,
  ropeTheta: 1000000.0,
});
const kvCache = new KvCache({
  numLayers: NUM_LAYERS,
  kvDim: KV_DIM,
  maxTokens: 64,
});
const layerEngine: any = {
  forward(name: string, input: Float32Array, _s: number, inDim: number) {
    return fallback.forward(name, input, 1, inDim);
  },
  getEmbeddingColumn(name: string, tokenId: number) {
    return fallback.getEmbeddingColumn(name, tokenId);
  },
};

for (let pos = 0; pos < tokens.length; pos++) {
  const start = Date.now();
  const logits = driver.executeTokenPass(
    tokens[pos],
    pos,
    layersNorm,
    layersBias,
    finalNorm,
    kvCache,
    layerEngine
  );
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const target = targets[pos];
  let maxL = -Infinity,
    maxId = 0;
  for (let i = 0; i < logits.length; i++) {
    if (logits[i] > maxL) {
      maxL = logits[i];
      maxId = i;
    }
  }
  let lse = 0;
  for (let i = 0; i < logits.length; i++) lse += Math.exp(logits[i] - maxL);
  lse = Math.log(lse) + maxL;
  const loss = -(logits[target] - lse);
  console.log(
    `pos${pos}: loss=${loss.toFixed(4)} max_id=${maxId} (ref=${[14.82, 15.84, 4.63][pos]}) [${elapsed}s]`
  );
  writeFileSync(
    '/tmp/e2e-progress.json',
    JSON.stringify({ pos, loss, maxId, elapsed })
  );
}
