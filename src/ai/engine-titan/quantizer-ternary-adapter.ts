// Copyright (c) 2026 Molly Labs Inc. Licensed under AGPL-3.0.
// src/ai/engine-titan/quantizer-ternary-adapter.ts
//
// Adapter wrapping existing TitanStreamQuantizer behind the TitanQuantizer interface.

import {
  TitanQuantizer,
  QuantizerResult,
  DequantizedResult,
} from './quantizer-interface';
import { TitanStreamQuantizer } from './stream-quantizer';

export class TernaryQuantizerAdapter implements TitanQuantizer {
  readonly type = 'ternary' as const;
  private readonly quantizer = new TitanStreamQuantizer();

  quantize(
    weights: Float32Array,
    layerName: string,
    rows: number,
    cols: number
  ): QuantizerResult {
    const result = this.quantizer.quantizeTensorChunk(
      { layerName, dimensions: [rows, cols], totalElements: weights.length },
      weights
    );
    return {
      packedBuffer: result.packedBuffer,
      bitsPerWeight: 1.58,
      quantizerType: 'ternary',
    };
  }

  dequantize(packed: Buffer, rows: number, cols: number): DequantizedResult {
    const totalElements = rows * cols;
    const weights = this.unpackTernary(packed, totalElements);
    return { weights, rows, cols };
  }

  private unpackTernary(packed: Buffer, totalElements: number): Float32Array {
    const scale = packed.readFloatLE(0);
    const result = new Float32Array(totalElements);
    let outIdx = 0;

    for (
      let byteIdx = 4;
      byteIdx < packed.length && outIdx < totalElements;
      byteIdx++
    ) {
      let state = packed[byteIdx];
      for (let i = 4; i >= 0; i--) {
        if (outIdx >= totalElements) break;
        const val = (state % 3) - 1; // {0,1,2} → {-1,0,1}
        result[outIdx++] = val * scale;
        state = Math.floor(state / 3);
      }
    }

    return result;
  }
}
