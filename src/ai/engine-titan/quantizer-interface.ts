// Copyright (c) 2026 Molly Labs Inc. Licensed under AGPL-3.0.
// src/ai/engine-titan/quantizer-interface.ts
//
// Hot-swap quantizer interface for Titan Engine.
// Both ternary (1.58-bit) and E_8 lattice quantizers implement this interface,
// making them interchangeable in the compression pipeline without touching
// the vault format, decomposer, or inference layer.

export interface QuantizerResult {
  readonly packedBuffer: Buffer;
  readonly bitsPerWeight: number;
  readonly quantizerType: 'ternary' | 'e8-lattice';
}

export interface DequantizedResult {
  readonly weights: Float32Array;
  readonly rows: number;
  readonly cols: number;
}

export interface TitanQuantizer {
  readonly type: 'ternary' | 'e8-lattice';

  quantize(
    weights: Float32Array,
    layerName: string,
    rows: number,
    cols: number
  ): QuantizerResult;

  dequantize(packed: Buffer, rows: number, cols: number): DequantizedResult;
}

// Usage:
//   import { TernaryQuantizerAdapter } from './quantizer-ternary-adapter';
//   import { E8QuantizerAdapter } from './quantizer-e8-adapter';
//   const quantizer: TitanQuantizer = new E8QuantizerAdapter();
//   const result = quantizer.quantize(weights, name, rows, cols);
