#!/usr/bin/env -S npx tsx
/* eslint-disable */
// scripts/titan/compress-parallel.ts
// Parallel Titan compression using worker_threads — one worker per core.
// Usage: npx tsx scripts/titan/compress-parallel.ts [--gguf <path>] [--output <dir>] [--workers <n>]

import { Worker } from 'worker_threads';
import { parseGGUF, GGUFType } from '../../src/ai/engine-titan/gguf-ingest';
import {
  selectStrategy,
  type StrategyConfig,
} from '../../src/ai/engine-titan/compression-strategy';
import {
  isEmbeddingOrLMHead,
  isFFNProjection,
  isFirstOrLastNLayers,
  getGGUFBlockCount,
} from '../../src/ai/engine-titan/streaming-compress';
import { cpus, totalmem } from 'os';
import { mkdirSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const getArg = (f: string, d: string | null = null): string | null => {
  const i = args.indexOf(f);
  return i !== -1 ? args[i + 1] : d;
};

function findLargestOllamaBlob(): string | null {
  const blobDir = join(
    process.env.HOME || '/home/codespace',
    '.ollama/models/blobs'
  );
  try {
    const { readdirSync, statSync } = require('fs') as typeof import('fs');
    const files = readdirSync(blobDir);
    let best = { path: '', size: 0 };
    for (const f of files) {
      const p = join(blobDir, f);
      const s = statSync(p).size;
      if (s > best.size) best = { path: p, size: s };
    }
    return best.size > 1e9 ? best.path : null;
  } catch {
    return null;
  }
}

export type CompressionRouting =
  | { action: 'svd'; rank: number; rhtEnabled: boolean }
  | { action: 'raw-e8'; rhtEnabled: boolean }
  | { action: 'int8-per-row' }
  | { action: 'skip'; reason: string };

function isSourceQuantized(ggufType: GGUFType): boolean {
  return (
    ggufType === GGUFType.Q4_K ||
    ggufType === GGUFType.Q5_K ||
    ggufType === GGUFType.Q6_K ||
    ggufType === GGUFType.Q4_0 ||
    ggufType === GGUFType.Q4_1 ||
    ggufType === GGUFType.Q5_0 ||
    ggufType === GGUFType.Q5_1
  );
}

function routeTensor(
  name: string,
  rows: number,
  cols: number,
  totalLayers: number | undefined,
  sourceType: GGUFType,
  strategyConfig?: StrategyConfig
): CompressionRouting {
  const exempted =
    isEmbeddingOrLMHead(name) ||
    (totalLayers !== undefined && isFirstOrLastNLayers(name, totalLayers, 3));

  if (exempted) {
    return { action: 'int8-per-row' };
  }

  // Fable directive: Q4_K source + FFN = passthrough. Re-quantizing an
  // already-quantized FFN stacks two lossy quantizers for negligible size win.
  if (isFFNProjection(name) && isSourceQuantized(sourceType)) {
    return {
      action: 'skip',
      reason: 'FFN passthrough (source already quantized)',
    };
  }

  if (isFFNProjection(name)) {
    const strategy = selectStrategy(name, rows, cols, strategyConfig);
    return { action: 'raw-e8', rhtEnabled: strategy.rhtEnabled };
  }

  const strategy = selectStrategy(name, rows, cols, strategyConfig);
  if (strategy.path === 'raw-e8' || strategy.path === 'raw-e8-rht') {
    return { action: 'raw-e8', rhtEnabled: strategy.rhtEnabled };
  }

  const rank = strategy.rank ?? 128;
  if (rank >= Math.min(rows, cols)) {
    return { action: 'skip', reason: 'rank >= minDim' };
  }
  return { action: 'svd', rank, rhtEnabled: true };
}

const MAX_ELEMENTS_PER_TENSOR = 64_000_000; // 256MB float32 — skip larger

async function main() {
  const ggufPath = getArg('--gguf') ?? (await findLargestOllamaBlob());
  const outputDir = getArg('--output') ?? '/tmp/titan-crystals-72b';
  const numWorkers = parseInt(getArg('--workers') ?? String(cpus().length), 10);

  if (!ggufPath) {
    console.error('No GGUF found. Use --gguf <path>');
    process.exit(1);
  }

  mkdirSync(outputDir, { recursive: true });

  console.log(`[parallel] GGUF: ${ggufPath}`);
  console.log(`[parallel] Output: ${outputDir}`);
  console.log(`[parallel] Workers: ${numWorkers} (of ${cpus().length} cores)`);
  console.log(
    `[parallel] RAM: ${(totalmem() / 1024 / 1024 / 1024).toFixed(1)}GB`
  );

  const gguf = parseGGUF(ggufPath);
  const modelName = gguf.header.metadata.get('general.name') ?? 'unknown';
  console.log(
    `[parallel] Model: ${modelName} — ${gguf.header.tensorCount} tensors`
  );

  const targets = gguf.tensors
    .map((t, i) => ({ tensor: t, index: i }))
    .filter(
      ({ tensor: t }) =>
        t.dimensions.length === 2 &&
        t.elementCount >= 256 &&
        t.elementCount <= MAX_ELEMENTS_PER_TENSOR
    );

  const totalParams = targets.reduce(
    (s, { tensor: t }) => s + t.elementCount,
    0
  );
  console.log(
    `[parallel] Compressible tensors: ${targets.length} (${(totalParams / 1e9).toFixed(2)}B params)`
  );
  console.log(`[parallel] Starting...\n`);

  const workerScript = resolve(__dirname, 'compress-worker.ts');
  const startTime = Date.now();
  let done = 0,
    skipped = 0,
    errors = 0;
  let totalIn = 0,
    totalOut = 0;

  const totalLayers = getGGUFBlockCount(gguf.header.metadata);

  // Pre-route all tensors using the single source of truth
  const routed = targets
    .map(({ tensor, index }) => {
      const rows = tensor.dimensions[0];
      const cols = tensor.dimensions.length > 1 ? tensor.dimensions[1] : 1;
      const routing = routeTensor(
        tensor.name,
        rows,
        cols,
        totalLayers,
        tensor.type
      );
      return { tensor, index, routing };
    })
    .filter(({ routing }) => routing.action !== 'skip');

  const routeSkipped = targets.length - routed.length;
  skipped += routeSkipped;
  if (routeSkipped > 0) {
    console.log(`[parallel] Strategy-skipped: ${routeSkipped} tensors`);
  }

  // Worker pool — keep numWorkers active at all times
  const queue = [...routed];
  let active = 0;

  await new Promise<void>((resolveAll) => {
    function dispatch() {
      while (active < numWorkers && queue.length > 0) {
        const { tensor, index, routing } = queue.shift()!;

        active++;
        const worker = new Worker(workerScript, {
          workerData: {
            ggufPath,
            tensorIndex: index,
            outputDir,
            routing,
          },
          execArgv: [
            '--require',
            resolve(process.cwd(), 'node_modules/tsx/dist/cjs/index.cjs'),
          ],
        });

        worker.on('message', (result) => {
          if (result.status === 'done') {
            done++;
            totalIn += result.inputBytes;
            totalOut += result.outputBytes;
          } else if (result.status === 'skip') {
            skipped++;
          } else {
            errors++;
            console.error(`[parallel] ERROR ${result.name}: ${result.error}`);
          }
        });

        worker.on('exit', () => {
          active--;
          const total = done + skipped + errors;
          const pct = ((total / targets.length) * 100).toFixed(1);
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          const ratio =
            totalIn > 0 ? ((totalOut / totalIn) * 100).toFixed(2) : '?';
          if (total % 10 === 0 || total <= 3) {
            console.log(
              `[parallel] [${pct}%] done=${done} skip=${skipped} err=${errors} elapsed=${elapsed}s ratio=${ratio}%`
            );
          }
          if (queue.length === 0 && active === 0) {
            resolveAll();
          } else {
            dispatch();
          }
        });

        worker.on('error', (err) => {
          errors++;
          console.error(`[parallel] Worker error: ${err.message}`);
        });
      }
    }

    dispatch();
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const ratio = totalIn > 0 ? ((totalOut / totalIn) * 100).toFixed(2) : '0';

  console.log(`\n[parallel] ====== COMPLETE ======`);
  console.log(`[parallel] Time:     ${elapsed}s`);
  console.log(`[parallel] Done:     ${done} tensors`);
  console.log(`[parallel] Skipped:  ${skipped}`);
  console.log(`[parallel] Errors:   ${errors}`);
  console.log(`[parallel] Input:    ${(totalIn / 1e9).toFixed(3)} GB`);
  console.log(`[parallel] Output:   ${(totalOut / 1e6).toFixed(1)} MB`);
  console.log(`[parallel] Ratio:    ${ratio}% of original`);
  console.log(`[parallel] Crystals: ${done} modules written to ${outputDir}`);
}

main().catch((err) => {
  console.error(`[parallel] Fatal: ${err.stack ?? err.message}`);
  process.exit(1);
});
