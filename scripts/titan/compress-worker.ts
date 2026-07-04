// scripts/titan/compress-worker.ts
// Worker thread — compresses a single tensor and writes crystal files to outputDir.
// Spawned by compress-parallel.ts via worker_threads.

import { workerData, parentPort } from 'worker_threads';
import {
  parseGGUF,
  type GGUFTensorInfo,
} from '../../src/ai/engine-titan/gguf-ingest';
import { readTensorData } from '../../src/ai/engine-titan/gguf-dequant';
import { LowRankTensorDecomposer } from '../../src/ai/engine-titan/decomposer';
import { TitanStreamQuantizer } from '../../src/ai/engine-titan/stream-quantizer';
import { applyRHT } from '../../src/ai/engine-titan/hadamard-transform';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface WorkerInput {
  ggufPath: string;
  tensorIndex: number;
  outputDir: string;
  targetRank: number;
}

export type WorkerResult =
  | { status: 'done'; name: string; inputBytes: number; outputBytes: number }
  | { status: 'skip'; name: string; reason: string }
  | { status: 'error'; name: string; error: string };

const { ggufPath, tensorIndex, outputDir, targetRank } =
  workerData as WorkerInput;

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

if (existsSync(paths.A) && existsSync(paths.B) && existsSync(paths.meta)) {
  reply({ status: 'skip', name: tensor.name, reason: 'already exists' });
  process.exit(0);
}

if (targetRank >= Math.min(rows, cols)) {
  reply({ status: 'skip', name: tensor.name, reason: 'rank >= minDim' });
  process.exit(0);
}

try {
  const weights = readTensorData(gguf, tensor);
  const inputBytes = weights.byteLength;

  const decomposer = new LowRankTensorDecomposer();
  const quantizer = new TitanStreamQuantizer();

  const { matrixA, matrixB } = decomposer.decomposeMatrix(
    weights,
    rows,
    cols,
    targetRank
  );

  const rhtSeed = (Date.now() ^ (tensorIndex * 2654435761)) >>> 0;
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
        scaleB: quantizedB.scale,
        compressedAt: Date.now(),
        rhtSeed: rhtMeta.seed,
        rhtPaddedCols: rhtMeta.paddedCols,
      },
      null,
      2
    )
  );

  const outputBytes = matrixA.byteLength + quantizedB.packedBuffer.length;
  reply({ status: 'done', name: tensor.name, inputBytes, outputBytes });
} catch (e) {
  reply({ status: 'error', name: tensor.name, error: (e as Error).message });
}
