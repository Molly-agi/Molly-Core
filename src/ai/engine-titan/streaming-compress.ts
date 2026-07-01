// src/ai/engine-titan/streaming-compress.ts

import { parseGGUF, type GGUFTensorInfo } from './gguf-ingest';
import {
  readTensorData,
  iterateTensors,
  estimateTensorMemory,
} from './gguf-dequant';
import { LowRankTensorDecomposer } from './decomposer';
import {
  TitanStreamQuantizer,
  type TitanTensorHeader,
} from './stream-quantizer';
import { CrashSafeVault } from '../agency/memory/vault/crash-safe-vault';
import {
  metadataToWeightCrystal,
  type TitanWeightCrystal,
} from './weight-crystal-adapter';
import type { LayerMetadata } from './orchestrator';
import { join } from 'path';

export interface StreamingCompressOptions {
  ggufPath: string;
  outputDir: string;
  targetRankFn?: (rows: number, cols: number, layerName: string) => number;
  filter?: (tensor: GGUFTensorInfo) => boolean;
  onProgress?: (event: ProgressEvent) => void;
  maxMemoryBytes?: number;
}

export interface ProgressEvent {
  tensorName: string;
  index: number;
  total: number;
  phase: 'read' | 'decompose' | 'quantize' | 'store' | 'done';
  memoryEstimate: number;
}

export interface StreamingCompressResult {
  totalTensors: number;
  compressedTensors: number;
  skippedTensors: number;
  crystals: TitanWeightCrystal[];
  totalInputBytes: number;
  totalOutputBytes: number;
  compressionRatio: number;
}

const DEFAULT_RANK_FN = (rows: number, cols: number): number => {
  const minDim = Math.min(rows, cols);
  return Math.max(1, Math.min(64, Math.floor(minDim * 0.015)));
};

const DEFAULT_MAX_MEMORY = 8 * 1024 * 1024 * 1024; // 8GB ceiling — accommodates 72B token_embd (~5GB) + working set

function isWeightTensor(tensor: GGUFTensorInfo): boolean {
  return tensor.dimensions.length === 2 && tensor.elementCount >= 256;
}

export async function streamingCompress(
  options: StreamingCompressOptions
): Promise<StreamingCompressResult> {
  const {
    ggufPath,
    outputDir,
    targetRankFn = DEFAULT_RANK_FN,
    filter = isWeightTensor,
    onProgress,
    maxMemoryBytes = DEFAULT_MAX_MEMORY,
  } = options;

  const gguf = parseGGUF(ggufPath);
  const decomposer = new LowRankTensorDecomposer();
  const quantizer = new TitanStreamQuantizer();
  const vault = new CrashSafeVault();

  const crystals: TitanWeightCrystal[] = [];
  let compressedTensors = 0;
  let skippedTensors = 0;
  let totalInputBytes = 0;
  let totalOutputBytes = 0;

  for (const { tensor, index, total } of iterateTensors(gguf, filter)) {
    const memEstimate = estimateTensorMemory(tensor);

    if (memEstimate > maxMemoryBytes) {
      skippedTensors++;
      onProgress?.({
        tensorName: tensor.name,
        index,
        total,
        phase: 'done',
        memoryEstimate: memEstimate,
      });
      continue;
    }

    onProgress?.({
      tensorName: tensor.name,
      index,
      total,
      phase: 'read',
      memoryEstimate: memEstimate,
    });

    const rows = tensor.dimensions[0];
    const cols = tensor.dimensions.length > 1 ? tensor.dimensions[1] : 1;
    const targetRank = targetRankFn(rows, cols, tensor.name);

    if (targetRank >= Math.min(rows, cols)) {
      skippedTensors++;
      continue;
    }

    let weights: Float32Array;
    try {
      weights = readTensorData(gguf, tensor);
    } catch {
      skippedTensors++;
      continue;
    }

    totalInputBytes += weights.byteLength;

    onProgress?.({
      tensorName: tensor.name,
      index,
      total,
      phase: 'decompose',
      memoryEstimate: memEstimate,
    });

    const { matrixA, matrixB } = decomposer.decomposeMatrix(
      weights,
      rows,
      cols,
      targetRank
    );

    // Release original weights immediately
    weights = null!;

    onProgress?.({
      tensorName: tensor.name,
      index,
      total,
      phase: 'quantize',
      memoryEstimate: memEstimate,
    });

    const header: TitanTensorHeader = {
      layerName: tensor.name,
      dimensions: [targetRank, cols],
      totalElements: targetRank * cols,
    };

    const quantizedB = quantizer.quantizeTensorChunk(header, matrixB);

    onProgress?.({
      tensorName: tensor.name,
      index,
      total,
      phase: 'store',
      memoryEstimate: memEstimate,
    });

    const paths = {
      matrixA: join(outputDir, `${tensor.name}.A.f32`),
      packedB: join(outputDir, `${tensor.name}.B.packed`),
      meta: join(outputDir, `${tensor.name}.meta.json`),
    };

    const meta: LayerMetadata = {
      layerName: tensor.name,
      rows,
      cols,
      targetRank,
      scaleB: quantizedB.scale,
      compressedAt: Date.now(),
    };

    await vault.writeFile(paths.matrixA, Buffer.from(matrixA.buffer), {
      createDirectoryIfMissing: true,
    });
    await vault.writeFile(paths.packedB, quantizedB.packedBuffer, {
      createDirectoryIfMissing: true,
    });
    await vault.writeFile(
      paths.meta,
      Buffer.from(JSON.stringify(meta, null, 2)),
      { createDirectoryIfMissing: true }
    );

    const outputSize = matrixA.byteLength + quantizedB.packedBuffer.length;
    totalOutputBytes += outputSize;

    const crystal = metadataToWeightCrystal(meta, outputDir);
    crystals.push(crystal);
    compressedTensors++;

    onProgress?.({
      tensorName: tensor.name,
      index,
      total,
      phase: 'done',
      memoryEstimate: memEstimate,
    });
  }

  return {
    totalTensors: gguf.tensors.length,
    compressedTensors,
    skippedTensors,
    crystals,
    totalInputBytes,
    totalOutputBytes,
    compressionRatio:
      totalInputBytes > 0 ? totalOutputBytes / totalInputBytes : 0,
  };
}
