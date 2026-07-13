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
const tokens = [785, 3974, 13876, 38835];
const targets = [3974, 13876, 38835];
const refLosses = [10.33, 0.91, 0.02];
console.log('=== FOX HUNT — committed reference tokens ===');
console.log('Tokens: [785, 3974, 13876, 38835] ("The quick brown fox")');
console.log('Target avg loss: 3.75\n');
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
const results: any[] = [];
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
  if (pos < tokens.length - 1) {
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
    const hit = maxId === target;
    results.push({ pos, target, loss, maxId, hit, elapsed });
    console.log(
      `pos${pos}: loss=${loss.toFixed(4)} max_id=${maxId} hit=${hit} (ref: loss=${refLosses[pos]}) [${elapsed}s]`
    );
    writeFileSync('/tmp/fox-progress.json', JSON.stringify(results, null, 2));
  } else {
    console.log(`pos${pos}: (no target) [${elapsed}s]`);
  }
}
const avgLoss =
  results.reduce((s: number, r: any) => s + r.loss, 0) / results.length;
console.log(`\n=== RESULT ===`);
console.log(`Avg loss: ${avgLoss.toFixed(4)} (ref: 3.75)`);
console.log(`PPL: ${Math.exp(avgLoss).toFixed(2)} (ref: 42.57)`);
const diff = Math.abs(avgLoss - 3.75);
if (diff < 1.0) console.log(`\nVERDICT: MATCH (within 1 nat)`);
else if (diff < 3.0) console.log(`\nVERDICT: CLOSE (within 3 nats) — review`);
else
  console.log(
    `\nVERDICT: MISMATCH (diff ${diff.toFixed(2)} nats) — bug remains`
  );
