// src/ai/inference/gguf-raw-loader.ts
//
// Loads 1D tensors (norm gains + Q/K/V biases) directly from a GGUF file into the
// shape expected by CrystalTransformerDriver.
//
// These tensors bypass the crystal vault because streaming-compress.ts:57 gates on
// dimensions.length === 2. They are cheap to hold in RAM: 80 blocks × (2 norms +
// 3 biases) ≈ ~10MB total.
//
// Bias tolerance: some Qwen variants ship without Q/K/V biases. If a bias tensor is
// missing from the GGUF, a zero-filled Float32Array of the expected length is
// returned so the driver's `qProj[i] += bias.qBias[i]` step becomes a no-op.

import { parseGGUF, type GGUFFile } from '../engine-titan/gguf-ingest';
import { readTensorData } from '../engine-titan/gguf-dequant';
import type {
  LayerNormWeights,
  LayerBiasWeights,
} from './crystal-transformer-driver';

export interface RawTensors {
  layersNorm: LayerNormWeights[];
  layersBias: LayerBiasWeights[];
  finalNorm: Float32Array;
}

export interface RawLoaderOptions {
  totalLayers?: number; // default 80 (Qwen 2.5 72B)
  hiddenSize?: number; // default 8192
  kvDim?: number; // default 1024 (kvHeads * headDim = 8 * 128)
}

function loadOrZero(
  gguf: GGUFFile,
  name: string,
  expectedLen: number,
  tensorMap: Map<string, ReturnType<typeof parseGGUF>['tensors'][number]>
): Float32Array {
  const t = tensorMap.get(name);
  if (!t) return new Float32Array(expectedLen);
  const data = readTensorData(gguf, t);
  if (data.length !== expectedLen) {
    throw new Error(
      `${name}: length mismatch got=${data.length} expected=${expectedLen}`
    );
  }
  return data;
}

function loadRequired(
  gguf: GGUFFile,
  name: string,
  expectedLen: number,
  tensorMap: Map<string, ReturnType<typeof parseGGUF>['tensors'][number]>
): Float32Array {
  const t = tensorMap.get(name);
  if (!t) throw new Error(`Required tensor missing from GGUF: ${name}`);
  const data = readTensorData(gguf, t);
  if (data.length !== expectedLen) {
    throw new Error(
      `${name}: length mismatch got=${data.length} expected=${expectedLen}`
    );
  }
  return data;
}

export function loadRawTensors(
  ggufPath: string,
  opts: RawLoaderOptions = {}
): RawTensors {
  const totalLayers = opts.totalLayers ?? 80;
  const hiddenSize = opts.hiddenSize ?? 8192;
  const kvDim = opts.kvDim ?? 1024;

  const gguf = parseGGUF(ggufPath);
  const tensorMap = new Map(gguf.tensors.map((t) => [t.name, t]));

  const layersNorm: LayerNormWeights[] = [];
  const layersBias: LayerBiasWeights[] = [];

  for (let l = 0; l < totalLayers; l++) {
    layersNorm.push({
      attnNormGain: loadRequired(
        gguf,
        `blk.${l}.attn_norm.weight`,
        hiddenSize,
        tensorMap
      ),
      ffnNormGain: loadRequired(
        gguf,
        `blk.${l}.ffn_norm.weight`,
        hiddenSize,
        tensorMap
      ),
    });

    layersBias.push({
      qBias: loadOrZero(gguf, `blk.${l}.attn_q.bias`, hiddenSize, tensorMap),
      kBias: loadOrZero(gguf, `blk.${l}.attn_k.bias`, kvDim, tensorMap),
      vBias: loadOrZero(gguf, `blk.${l}.attn_v.bias`, kvDim, tensorMap),
    });
  }

  const finalNorm = loadRequired(
    gguf,
    'output_norm.weight',
    hiddenSize,
    tensorMap
  );

  return { layersNorm, layersBias, finalNorm };
}
