// scripts/titan/compress-worker.ts
// Worker thread — compresses a single tensor and writes crystal files to outputDir.
// Spawned by compress-parallel.ts via worker_threads.
//
// Routing decisions are made by compress-parallel.ts using the same
// selectStrategy + F6 helpers that streaming-compress.ts uses.
// This worker NEVER re-derives policy — it executes what it's told.

import { createHash } from 'crypto';
import { workerData, parentPort } from 'worker_threads';
import {
  parseGGUF,
  type GGUFTensorInfo,
} from '../../src/ai/engine-titan/gguf-ingest';
import { readTensorData } from '../../src/ai/engine-titan/gguf-dequant';
import { LowRankTensorDecomposer } from '../../src/ai/engine-titan/decomposer';
import { TitanStreamQuantizer } from '../../src/ai/engine-titan/stream-quantizer';
import { applyRHT } from '../../src/ai/engine-titan/hadamard-transform';
import {
  quantizeInt8PerRow,
  packInt8RowQuantized,
} from '../../src/ai/engine-titan/int8-row-quantizer';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { CompressionRouting } from './compress-parallel';

export interface WorkerInput {
  ggufPath: string;
  tensorIndex: number;
  outputDir: string;
  routing: CompressionRouting;
}

export type WorkerResult =
  | { status: 'done'; name: string; inputBytes: number; outputBytes: number }
  | { status: 'skip'; name: string; reason: string }
  | { status: 'error'; name: string; error: string };

const { ggufPath, tensorIndex, outputDir, routing } = workerData as WorkerInput;

const gguf = parseGGUF(ggufPath);
const tensor: GGUFTensorInfo = gguf.tensors[tensorIndex];

function reply(result: WorkerResult) {
  parentPort!.postMessage(result);
}

const rows = tensor.dimensions[0];
const cols = tensor.dimensions.length > 1 ? tensor.dimensions[1] : 1;

const safe = tensor.name.replace(/[^a-zA-Z0-9_.]/g, '_');
const paths = {
  A: join(outputDir, `${safe}.A.f32`),
  B: join(outputDir, `${safe}.B.packed`),
  meta: join(outputDir, `${safe}.meta.json`),
};

const isSvdPath = routing.action === 'svd';
const resumeReady = isSvdPath
  ? existsSync(paths.A) && existsSync(paths.B) && existsSync(paths.meta)
  : existsSync(paths.B) && existsSync(paths.meta);

if (resumeReady) {
  reply({ status: 'skip', name: tensor.name, reason: 'already exists' });
  process.exit(0);
}

if (routing.action === 'svd' && routing.rank >= Math.min(rows, cols)) {
  reply({ status: 'skip', name: tensor.name, reason: 'rank >= minDim' });
  process.exit(0);
}

try {
  const weights = readTensorData(gguf, tensor);
  const inputBytes = weights.byteLength;

  // Deterministic RHT seed from tensor name (Fable Batch 02b F10)
  const seedHash = createHash('sha256').update(tensor.name).digest();
  const rhtSeed = seedHash.readUInt32LE(0);

  let outputBytes = 0;

  if (routing.action === 'int8-per-row') {
    const q8 = quantizeInt8PerRow(weights, rows, cols);
    const packedBuf = packInt8RowQuantized(q8);

    writeFileSync(paths.B, packedBuf);
    writeFileSync(
      paths.meta,
      JSON.stringify(
        {
          layerName: tensor.name,
          rows,
          cols,
          compressionPath: 'int8-per-row',
          compressedAt: Date.now(),
        },
        null,
        2
      )
    );
    outputBytes = packedBuf.length;
  } else if (routing.action === 'raw-e8') {
    const quantizer = new TitanStreamQuantizer();
    let bMatrix: Float32Array = weights;
    let bCols = cols;
    let rhtPaddedCols: number | undefined;

    if (routing.rhtEnabled) {
      const { transformed, meta: rhtMeta } = applyRHT(
        weights,
        rows,
        cols,
        rhtSeed
      );
      bMatrix = transformed;
      bCols = rhtMeta.paddedCols;
      rhtPaddedCols = rhtMeta.paddedCols;
    }

    const quantizedB = quantizer.quantizeTensorChunk(
      {
        layerName: tensor.name,
        dimensions: [rows, bCols],
        totalElements: rows * bCols,
      },
      bMatrix
    );

    writeFileSync(paths.B, quantizedB.packedBuffer);
    writeFileSync(
      paths.meta,
      JSON.stringify(
        {
          layerName: tensor.name,
          rows,
          cols,
          compressionPath: routing.rhtEnabled ? 'raw-e8-rht' : 'raw-e8',
          scaleB: quantizedB.scale,
          compressedAt: Date.now(),
          rhtSeed: routing.rhtEnabled ? rhtSeed : undefined,
          rhtPaddedCols,
        },
        null,
        2
      )
    );
    outputBytes = quantizedB.packedBuffer.length;
  } else {
    // SVD path
    const targetRank = routing.rank;
    const decomposer = new LowRankTensorDecomposer();
    const quantizer = new TitanStreamQuantizer();

    const { matrixA, matrixB } = decomposer.decomposeMatrix(
      weights,
      rows,
      cols,
      targetRank
    );

    const { transformed: matrixBRht, meta: rhtMeta } = applyRHT(
      matrixB,
      targetRank,
      cols,
      rhtSeed
    );

    const quantizedB = quantizer.quantizeTensorChunk(
      {
        layerName: tensor.name,
        dimensions: [targetRank, rhtMeta.paddedCols],
        totalElements: targetRank * rhtMeta.paddedCols,
      },
      matrixBRht
    );

    writeFileSync(paths.A, Buffer.from(matrixA.buffer));
    writeFileSync(paths.B, quantizedB.packedBuffer);
    writeFileSync(
      paths.meta,
      JSON.stringify(
        {
          layerName: tensor.name,
          rows,
          cols,
          targetRank,
          compressionPath: 'svd-e8',
          scaleB: quantizedB.scale,
          compressedAt: Date.now(),
          rhtSeed,
          rhtPaddedCols: rhtMeta.paddedCols,
        },
        null,
        2
      )
    );
    outputBytes = matrixA.byteLength + quantizedB.packedBuffer.length;
  }

  reply({ status: 'done', name: tensor.name, inputBytes, outputBytes });
} catch (e) {
  reply({ status: 'error', name: tensor.name, error: (e as Error).message });
}
