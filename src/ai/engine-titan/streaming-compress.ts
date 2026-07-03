// src/ai/engine-titan/streaming-compress.ts

import { parseGGUF, type GGUFTensorInfo } from './gguf-ingest';
import {
  readTensorData,
  iterateTensors,
  estimateTensorMemory,
} from './gguf-dequant';
import { LowRankTensorDecomposer } from './decomposer';
import type { TitanQuantizer } from './quantizer-interface';
import { TernaryQuantizerAdapter } from './quantizer-ternary-adapter';
import { E8QuantizerAdapter } from './quantizer-e8-adapter';
import { CrashSafeVault } from '../agency/memory/vault/crash-safe-vault';
import {
  metadataToWeightCrystal,
  type TitanWeightCrystal,
} from './weight-crystal-adapter';
import type { LayerMetadata } from './orchestrator';
import { applyRHT } from './hadamard-transform';
import {
  compensatedQuantizeB,
  type LayerActivations,
} from './layer-error-compensation';
import { loadCalibrationDataset } from './calibration-dataset';
import { entropyPackE8 } from './e8-entropy';
import { join } from 'path';
import { existsSync } from 'fs';

export interface StreamingCompressOptions {
  ggufPath: string;
  outputDir: string;
  targetRankFn?: (rows: number, cols: number, layerName: string) => number;
  filter?: (tensor: GGUFTensorInfo) => boolean;
  onProgress?: (event: ProgressEvent) => void;
  maxMemoryBytes?: number;
  quantizer?: 'ternary' | 'e8-lattice';
  errorCompensation?: {
    enabled: boolean;
    calibrationDir?: string; // path to calibration-index.json dir
    dampingFactor?: number; // default 0.01
    numCalibrationTokens?: number; // default 128 (subset of full dataset)
  };
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
    quantizer: quantizerKind = 'e8-lattice',
  } = options;

  const gguf = parseGGUF(ggufPath);
  const decomposer = new LowRankTensorDecomposer();
  const q: TitanQuantizer =
    quantizerKind === 'e8-lattice'
      ? new E8QuantizerAdapter()
      : new TernaryQuantizerAdapter();
  const vault = new CrashSafeVault();

  const crystals: TitanWeightCrystal[] = [];
  let compressedTensors = 0;
  let skippedTensors = 0;
  let totalInputBytes = 0;
  let totalOutputBytes = 0;

  // Error compensation: load calibration activations if enabled
  let calibrationActivations: Float32Array | null = null;
  let calibrationTokenCount = 0;
  if (options.errorCompensation?.enabled) {
    const calibDir =
      options.errorCompensation.calibrationDir ?? 'molly_data/calibration';
    if (existsSync(join(calibDir, 'calibration-index.json'))) {
      const dataset = loadCalibrationDataset(calibDir);
      calibrationTokenCount =
        options.errorCompensation.numCalibrationTokens ??
        Math.min(128, dataset.numSequences);
      const tokensToUse = calibrationTokenCount * dataset.seqLength;
      calibrationActivations = new Float32Array(tokensToUse);
      let idx = 0;
      for (
        let s = 0;
        s < calibrationTokenCount && s < dataset.numSequences;
        s++
      ) {
        for (let t = 0; t < dataset.seqLength; t++) {
          calibrationActivations[idx++] =
            dataset.sequences[s][t] / dataset.vocabSize;
        }
      }
    }
  }

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

    // Resume: skip tensors already written to vault (all 3 files must exist)
    const resumePaths = {
      matrixA: join(outputDir, `${tensor.name}.A.f32`),
      packedB: join(outputDir, `${tensor.name}.B.packed`),
      meta: join(outputDir, `${tensor.name}.meta.json`),
    };
    if (
      existsSync(resumePaths.matrixA) &&
      existsSync(resumePaths.packedB) &&
      existsSync(resumePaths.meta)
    ) {
      compressedTensors++;
      onProgress?.({
        tensorName: tensor.name,
        index,
        total,
        phase: 'done',
        memoryEstimate: memEstimate,
      });
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

    // Hadamard RHT: spread heavy-tailed distribution to sub-Gaussian before ternary threshold
    const rhtSeed = (Date.now() ^ (index * 2654435761)) >>> 0;
    const { transformed: matrixBRht, meta: rhtMeta } = applyRHT(
      matrixB,
      targetRank,
      cols,
      rhtSeed
    );

    // GPTQ-style error compensation: if calibration data available, use Hessian-guided
    // error redistribution to minimize output activation error. Falls back to standard
    // quantization if compensation is disabled or calibration data missing.
    let quantizedB;
    if (options.errorCompensation?.enabled && calibrationActivations) {
      const layerAct: LayerActivations = {
        activations: calibrationActivations,
        numTokens: calibrationTokenCount,
        inputDim: targetRank,
      };
      const compensated = compensatedQuantizeB(
        matrixBRht,
        targetRank,
        rhtMeta.paddedCols,
        layerAct,
        tensor.name,
        {
          dampingFactor: options.errorCompensation.dampingFactor ?? 0.01,
          sigmaDelta: true,
          optimalScale: true,
        }
      );
      const packed = entropyPackE8(compensated.quantizedB, 'log8');
      quantizedB = {
        packedBuffer: packed.packedBuffer,
        bitsPerWeight: packed.bitsPerWeight,
        quantizerType: 'e8-lattice' as const,
      };
    } else {
      quantizedB = q.quantize(
        matrixBRht,
        tensor.name,
        targetRank,
        rhtMeta.paddedCols
      );
    }

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
      compressedAt: Date.now(),
      rhtSeed: rhtMeta.seed,
      rhtPaddedCols: rhtMeta.paddedCols,
      quantizerType: quantizedB.quantizerType,
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
