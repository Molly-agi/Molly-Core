#!/usr/bin/env -S npx tsx
// scripts/titan/compress-70b.ts
//
// Run the Titan streaming compression pipeline on a real 70B GGUF model.
// Usage: npx tsx scripts/titan/compress-70b.ts [--gguf <path>] [--output <dir>]

import { streamingCompress } from '../../src/ai/engine-titan/streaming-compress';
import { parseGGUF } from '../../src/ai/engine-titan/gguf-ingest';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const getArg = (f: string, d: string | null = null): string | null => {
  const i = args.indexOf(f);
  return i !== -1 ? args[i + 1] : d;
};

function findOllamaGguf(_modelName: string): string | null {
  const blobDir = join(
    process.env.HOME || '/home/codespace',
    '.ollama/models/blobs'
  );
  try {
    const files = readdirSync(blobDir);
    let largest = { path: '', size: 0 };
    for (const f of files) {
      const full = join(blobDir, f);
      const st = statSync(full);
      if (st.size > largest.size) {
        largest = { path: full, size: st.size };
      }
    }
    if (largest.size > 1_000_000_000) return largest.path;
  } catch {}
  return null;
}

async function main() {
  const ggufPath =
    getArg('--gguf') ?? findOllamaGguf('qwen2.5:72b-instruct-q4_K_M');
  const outputDir =
    getArg('--output') ?? '/workspaces/Molly-Core/data/titan-crystals-72b';

  if (!ggufPath) {
    console.error(
      'No GGUF path provided and could not auto-detect. Use --gguf <path>'
    );
    process.exit(1);
  }

  console.log(`[titan-72b] GGUF: ${ggufPath}`);
  console.log(`[titan-72b] Output: ${outputDir}`);
  console.log(`[titan-72b] Parsing header...`);

  const gguf = parseGGUF(ggufPath);
  console.log(
    `[titan-72b] Model: ${gguf.header.metadata.get('general.name') ?? 'unknown'}`
  );
  console.log(`[titan-72b] Tensors: ${gguf.header.tensorCount}`);
  console.log(`[titan-72b] Version: ${gguf.header.version}`);

  const weightTensors = gguf.tensors.filter(
    (t) => t.dimensions.length === 2 && t.elementCount >= 256
  );
  console.log(
    `[titan-72b] Weight tensors (2D, ≥256 elements): ${weightTensors.length}`
  );

  const totalParams = weightTensors.reduce((s, t) => s + t.elementCount, 0);
  console.log(
    `[titan-72b] Total weight parameters: ${(totalParams / 1e9).toFixed(2)}B`
  );

  console.log(`[titan-72b] Starting streaming compression...`);
  const startTime = Date.now();

  const result = await streamingCompress({
    ggufPath,
    outputDir,
    targetRankFn: (rows, cols, layerName) => {
      // Cornerstone tensors: token_embd + output head. Bump rank to preserve
      // semantic fidelity — each row is a full-vocab token vector; rank 64 blurs
      // similar tokens and the error compounds through every forward pass.
      if (layerName === 'token_embd.weight' || layerName === 'output.weight') {
        return Math.min(256, Math.min(rows, cols) - 1);
      }
      const minDim = Math.min(rows, cols);
      return Math.max(1, Math.min(64, Math.floor(minDim * 0.015)));
    },
    onProgress: (ev) => {
      if (ev.phase === 'read') {
        const pct = ((ev.index / ev.total) * 100).toFixed(1);
        const mem = (ev.memoryEstimate / 1024 / 1024).toFixed(0);
        console.log(
          `[titan-72b] [${pct}%] ${ev.tensorName} (${mem}MB) — reading...`
        );
      } else if (ev.phase === 'done') {
        const pct = (((ev.index + 1) / ev.total) * 100).toFixed(1);
        console.log(`[titan-72b] [${pct}%] ${ev.tensorName} — done`);
      }
    },
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n[titan-72b] === COMPLETE ===`);
  console.log(`[titan-72b] Time: ${elapsed}s`);
  console.log(`[titan-72b] Compressed: ${result.compressedTensors} tensors`);
  console.log(`[titan-72b] Skipped: ${result.skippedTensors} tensors`);
  console.log(
    `[titan-72b] Input: ${(result.totalInputBytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  );
  console.log(
    `[titan-72b] Output: ${(result.totalOutputBytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  );
  console.log(
    `[titan-72b] Compression ratio: ${(result.compressionRatio * 100).toFixed(1)}%`
  );
  console.log(`[titan-72b] Crystal modules: ${result.crystals.length}`);
}

main().catch((err) => {
  console.error(`[titan-72b] Fatal: ${err.stack ?? err.message}`);
  process.exit(1);
});
