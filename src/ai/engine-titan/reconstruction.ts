// Copyright (c) 2026 Molly Labs Inc. Licensed under AGPL-3.0.
// src/ai/engine-titan/reconstruction.ts

import { inverseRHT, type RHTMeta } from './hadamard-transform';

export interface ReconstructionInput {
  readonly matrixA: Float32Array;
  readonly packedB: Buffer;
  readonly rows: number;
  readonly cols: number;
  readonly targetRank: number;
  // Optional RHT metadata — if present, inverse transform applied to matrixB before matmul
  readonly rht?: RHTMeta;
}

export interface ReconstructionResult {
  readonly reconstructed: Float32Array;
  /** Alias for reconstructed — compatibility with integration tests */
  readonly weights: Float32Array;
  readonly rows: number;
  readonly cols: number;
  readonly scaleB: number;
}

export class TitanDecompressionEngine {
  private readonly weightsPerByte = 5;

  /**
   * Unpacks a single compressed 8-bit byte back into 5 distinct ternary values.
   * Bytes 243..255 are invalid — no ternary 5-tuple encodes to them (3^5 = 243).
   * Silent aliasing would corrupt weights; throw so corruption surfaces immediately.
   */
  private unpackTernaryByte(packedByte: number): Int8Array {
    if (packedByte > 242) {
      throw new RangeError(
        `Invalid ternary-packed byte ${packedByte}: max valid value is 242 (3^5 - 1). Payload corrupt.`
      );
    }
    const window = new Int8Array(this.weightsPerByte);
    let state = packedByte;

    for (let i = this.weightsPerByte - 1; i >= 0; i--) {
      const standardizedValue = state % 3;
      window[i] = standardizedValue - 1;
      state = Math.floor(state / 3);
    }

    return window;
  }

  /**
   * Dequantizes a packed ternary buffer back into Float32Array.
   * Layout: [Float32LE scale (4 bytes)] + [packed ternary weights]
   */
  public dequantize(packedBuffer: Buffer, totalElements: number): Float32Array {
    const scale = packedBuffer.readFloatLE(0);
    const output = new Float32Array(totalElements);

    let outputIdx = 0;
    let byteIdx = 4; // skip scale header

    while (outputIdx < totalElements && byteIdx < packedBuffer.length) {
      const ternaryWindow = this.unpackTernaryByte(packedBuffer[byteIdx++]);
      for (
        let w = 0;
        w < this.weightsPerByte && outputIdx < totalElements;
        w++
      ) {
        output[outputIdx++] = ternaryWindow[w] * scale;
      }
    }

    return output;
  }

  /**
   * Reconstructs the full weight matrix from decomposed factors.
   * matrixA is stored as raw Float32Array (rows × targetRank).
   * packedB is a ternary-packed buffer with embedded scale (targetRank × cols).
   */
  public reconstructMatrix(input: ReconstructionInput): ReconstructionResult {
    const { matrixA, packedB, rows, cols, targetRank, rht } = input;

    if (matrixA.length !== rows * targetRank) {
      throw new RangeError(
        `matrixA length ${matrixA.length} != rows*rank ${rows * targetRank}`
      );
    }

    // Dequantize matrixB — size is targetRank × paddedCols if RHT was applied
    const paddedCols = rht ? rht.paddedCols : cols;
    let dequantizedB = this.dequantize(packedB, targetRank * paddedCols);
    const scaleB = packedB.readFloatLE(0);

    // Invert the Hadamard transform to recover original matrixB
    if (rht) {
      dequantizedB = inverseRHT(dequantizedB, targetRank, rht);
    }

    const reconstructed = new Float32Array(rows * cols);

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        let sum = 0.0;
        for (let k = 0; k < targetRank; k++) {
          sum += matrixA[i * targetRank + k] * dequantizedB[k * cols + j];
        }
        reconstructed[i * cols + j] = sum;
      }
    }

    return { reconstructed, weights: reconstructed, rows, cols, scaleB };
  }
}
