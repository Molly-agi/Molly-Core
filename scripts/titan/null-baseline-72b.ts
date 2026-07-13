#!/usr/bin/env -S npx tsx
// scripts/titan/null-baseline-72b.ts
//
// Null-compression baseline for Qwen 2.5 72B.
// Runs inference directly on GGUF (fallback loader, no crystals).
// Writes per-window results to JSONL — crash-safe, resumable.
//
// Usage: npx tsx scripts/titan/null-baseline-72b.ts

import { appendFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { cpus } from 'os';
import { parseGGUF } from '../../src/ai/engine-titan/gguf-ingest';
import { readTensorData } from '../../src/ai/engine-titan/gguf-dequant';
import { GgufFallbackLoader } from '../../src/ai/inference/gguf-fallback-loader';
import type { CrystalInferenceLayer } from '../../src/ai/engine-titan/crystal-inference-layer';
import {
  CrystalTransformerDriver,
  type LayerNormWeights,
  type LayerBiasWeights,
} from '../../src/ai/inference/crystal-transformer-driver';
import { KvCache } from '../../src/ai/inference/kv-cache';
import { evaluatePerplexity } from '../../src/ai/inference/perplexity-eval';
import {
  loadEvalCorpus,
  pinHashes,
} from '../../src/ai/inference/eval-corpus-loader';

const GGUF_PATH =
  '/workspaces/Molly-Core/models/qwen2.5-72b-instruct-q4_k_m.gguf';
const OUTPUT_DIR = '/workspaces/Molly-Core/docs/benchmarks/reports';
const CHECKPOINT_FILE = join(OUTPUT_DIR, 'null-baseline-72b-checkpoint.jsonl');
const WINDOW_SIZE = 2048;
const NUM_LAYERS = 80;
const HIDDEN = 8192;
const Q_HEADS = 64;
const KV_HEADS = 8;
const HEAD_DIM = 128;
const _WORKER_COUNT = Math.min(15, cpus().length - 1);

function getCompletedWindows(): Set<number> {
  const done = new Set<number>();
  if (existsSync(CHECKPOINT_FILE)) {
    const lines = readFileSync(CHECKPOINT_FILE, 'utf-8').trim().split('\n');
    for (const line of lines) {
      if (!line) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.windowIndex !== undefined) done.add(entry.windowIndex);
      } catch {}
    }
  }
  return done;
}

async function main() {
  console.log('=== NULL-COMPRESSION BASELINE — Qwen 2.5 72B ===');
  console.log(`CPUs: ${cpus().length}`);
  console.log(`GGUF: ${GGUF_PATH}`);
  console.log(`Checkpoint: ${CHECKPOINT_FILE}\n`);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Load corpus
  console.log('[1/4] Loading eval corpus...');
  const calibDir = join(process.cwd(), 'data/calibration');
  const corpus = loadEvalCorpus({
    tokenizerPath: join(calibDir, 'tokenizer.json'),
    wikiTextTestPath: join(calibDir, 'wikitext2-test.txt'),
    wikiTextTrainPath: join(calibDir, 'wikitext2-train.txt'),
  });
  const pins = pinHashes(corpus);
  console.log(`  Eval tokens: ${pins.evalTokenCount}`);
  console.log(`  Eval SHA: ${pins.evalSetSha256.slice(0, 16)}...`);

  // Slice into windows
  const allTokens = Array.from(corpus.evalTokenIds);
  const windows: number[][] = [];
  for (let i = 0; i + WINDOW_SIZE <= allTokens.length; i += WINDOW_SIZE) {
    windows.push(allTokens.slice(i, i + WINDOW_SIZE));
  }
  console.log(`  Windows: ${windows.length} x ${WINDOW_SIZE} tokens`);

  // Check resume state
  const completed = getCompletedWindows();
  if (completed.size > 0) {
    console.log(`  RESUMING: ${completed.size}/${windows.length} already done`);
  }

  // Load GGUF + model weights
  console.log('\n[2/4] Loading GGUF + 1D weights...');
  const gguf = parseGGUF(GGUF_PATH);
  const fallback = new GgufFallbackLoader(GGUF_PATH, 10);
  fallback.pin('token_embd.weight');

  console.log('[3/4] Initializing parallel worker pool...');
  await fallback.initPool();

  const layersNorm: LayerNormWeights[] = [];
  const layersBias: LayerBiasWeights[] = [];
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

  const driver = new CrystalTransformerDriver({
    numLayers: NUM_LAYERS,
    hiddenSize: HIDDEN,
    numHeads: Q_HEADS,
    numKvHeads: KV_HEADS,
    headDim: HEAD_DIM,
    vocabSize: pins.vocabSize,
    fallbackLoader: fallback,
  });

  const kvCache = new KvCache({
    numLayers: NUM_LAYERS,
    maxTokens: WINDOW_SIZE + 64,
    kvDim: KV_HEADS * HEAD_DIM,
  });

  // Run eval — per window, append to JSONL
  console.log('\n[4/4] Running null-baseline perplexity eval...\n');
  const startTime = Date.now();
  let totalLoss = 0;
  let totalTokens = 0;
  let windowsDone = completed.size;

  for (let w = 0; w < windows.length; w++) {
    if (completed.has(w)) {
      // Accumulate from checkpoint for running average
      continue;
    }

    const windowStart = Date.now();
    const result = evaluatePerplexity(
      windows[w],
      driver,
      fallback as unknown as CrystalInferenceLayer,
      layersNorm,
      layersBias,
      finalNorm,
      kvCache
    );

    totalLoss += result.avgLoss * result.tokenCount;
    totalTokens += result.tokenCount;
    windowsDone++;

    const windowElapsed = ((Date.now() - windowStart) / 1000).toFixed(1);
    const runningPpl = Math.exp(totalLoss / totalTokens);
    const tokPerSec = (
      result.tokenCount /
      ((Date.now() - windowStart) / 1000)
    ).toFixed(1);

    // Append to checkpoint JSONL (crash-safe)
    const entry = {
      windowIndex: w,
      perplexity: result.perplexity,
      avgLoss: result.avgLoss,
      tokenCount: result.tokenCount,
      elapsed: parseFloat(windowElapsed),
      tokPerSec: parseFloat(tokPerSec),
      timestamp: new Date().toISOString(),
    };
    appendFileSync(CHECKPOINT_FILE, JSON.stringify(entry) + '\n');

    console.log(
      `  [${windowsDone}/${windows.length}] window=${w} ppl=${result.perplexity.toFixed(2)} ` +
        `running=${runningPpl.toFixed(2)} ${tokPerSec} tok/s (${windowElapsed}s)`
    );
  }

  // Final summary
  const totalElapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const finalPpl = totalTokens > 0 ? Math.exp(totalLoss / totalTokens) : NaN;

  const summary = {
    type: 'FINAL',
    model: 'qwen2.5-72b-instruct-q4_k_m',
    compression: 'none (null baseline)',
    perplexity: finalPpl,
    avgLoss: totalTokens > 0 ? totalLoss / totalTokens : NaN,
    totalTokens,
    windowCount: windows.length,
    windowSize: WINDOW_SIZE,
    evalSha256: pins.evalSetSha256,
    elapsedMinutes: parseFloat(totalElapsed),
    timestamp: new Date().toISOString(),
  };
  appendFileSync(CHECKPOINT_FILE, JSON.stringify(summary) + '\n');

  console.log(`\n${'='.repeat(60)}`);
  console.log(`NULL-COMPRESSION BASELINE COMPLETE — ${totalElapsed} min`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Perplexity: ${finalPpl.toFixed(4)}`);
  console.log(`  Avg Loss:   ${(totalLoss / totalTokens).toFixed(6)} nats`);
  console.log(`  Tokens:     ${totalTokens}`);
  console.log(`  Windows:    ${windows.length}`);
  console.log(`  Report:     ${CHECKPOINT_FILE}`);
}

main().catch((err) => {
  console.error('FATAL:', err.stack ?? err.message);
  process.exit(1);
});
