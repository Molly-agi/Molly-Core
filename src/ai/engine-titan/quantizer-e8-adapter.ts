// src/ai/engine-titan/quantizer-e8-adapter.ts
//
// Adapter wrapping E_8 lattice quantizer behind the TitanQuantizer interface.
// Includes conditional RHT gate and entropy coding (static Huffman + log8 scale).

import {
  TitanQuantizer,
  QuantizerResult,
  DequantizedResult,
} from './quantizer-interface';
import {
  quantizeE8,
  dequantizeE8,
  packE8,
  unpackE8,
  E8PackedLayer,
} from './e8-lattice';
import {
  entropyPackE8,
  entropyUnpackE8,
  E8_ENTROPY_MAGIC,
  type E8EntropyPackedLayer,
  type ScaleMode,
} from './e8-entropy';
import { applyRHT, inverseRHT, type RHTMeta } from './hadamard-transform';

export interface E8AdapterOptions {
  /** Width threshold: apply RHT only when cols > this value. Default 4096. */
  rhtWidthThreshold?: number;
  /** Fixed seed for RHT reproducibility. Default 0xdeadbeef. */
  rhtSeed?: number;
  /** Enable entropy coding (Huffman + log8 scale). Default true. */
  useEntropyCoding?: boolean;
  /** Scale quantization mode for entropy coding. Default 'log8'. */
  scaleMode?: ScaleMode;
}

export interface E8QuantizerResultWithMeta extends QuantizerResult {
  /** RHT metadata, present only if RHT was applied. Store in crystal .meta.json for dequant. */
  readonly rhtMeta?: RHTMeta;
}

export class E8QuantizerAdapter implements TitanQuantizer {
  readonly type = 'e8-lattice' as const;
  private readonly rhtWidthThreshold: number;
  private readonly rhtSeed: number;
  private readonly useEntropyCoding: boolean;
  private readonly scaleMode: ScaleMode;

  constructor(options?: E8AdapterOptions) {
    this.rhtWidthThreshold = options?.rhtWidthThreshold ?? 4096;
    this.rhtSeed = options?.rhtSeed ?? 0xdeadbeef;
    this.useEntropyCoding = options?.useEntropyCoding ?? true;
    this.scaleMode = options?.scaleMode ?? 'log8';
  }

  quantize(
    weights: Float32Array,
    layerName: string,
    rows: number,
    cols: number
  ): E8QuantizerResultWithMeta {
    let inputWeights = weights;
    let rhtMeta: RHTMeta | undefined;
    let effectiveCols = cols;

    if (cols > this.rhtWidthThreshold) {
      const { transformed, meta } = applyRHT(weights, rows, cols, this.rhtSeed);
      inputWeights = transformed;
      rhtMeta = meta;
      effectiveCols = meta.paddedCols;
    }

    const quantized = quantizeE8(inputWeights, layerName, rows, effectiveCols);

    if (this.useEntropyCoding) {
      const packed = entropyPackE8(quantized, this.scaleMode);
      return {
        packedBuffer: packed.packedBuffer,
        bitsPerWeight: packed.bitsPerWeight,
        quantizerType: 'e8-lattice',
        rhtMeta,
      };
    }

    const packed = packE8(quantized);
    return {
      packedBuffer: packed.packedBuffer,
      bitsPerWeight: quantized.bitsPerWeight,
      quantizerType: 'e8-lattice',
      rhtMeta,
    };
  }

  dequantize(
    packed: Buffer,
    rows: number,
    cols: number,
    rhtMeta?: RHTMeta
  ): DequantizedResult {
    const effectiveCols = rhtMeta ? rhtMeta.paddedCols : cols;
    let quantized;

    // Auto-detect format by magic header
    if (packed.length >= 4 && packed.readUInt32LE(0) === E8_ENTROPY_MAGIC) {
      const entropyPacked: E8EntropyPackedLayer = {
        layerName: '',
        rows,
        cols: effectiveCols,
        groupCount: packed.readUInt32LE(4),
        packedBuffer: packed,
        bitsPerWeight: 0,
      };
      quantized = entropyUnpackE8(entropyPacked);
    } else {
      const totalElements = rows * effectiveCols;
      const padded =
        totalElements % 8 === 0
          ? totalElements
          : totalElements + (8 - (totalElements % 8));
      const groupCount = padded / 8;

      const packedLayer: E8PackedLayer = {
        layerName: '',
        rows,
        cols: effectiveCols,
        groupCount,
        packedBuffer: packed,
        bitsPerWeight: 13,
      };
      quantized = unpackE8(packedLayer);
    }

    let weights = dequantizeE8(quantized);

    if (rhtMeta) {
      weights = inverseRHT(weights, rows, rhtMeta);
    }

    return { weights, rows, cols };
  }
}
