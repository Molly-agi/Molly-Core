// src/ai/engine-titan/reconstruction.ts

export interface ReconstructionInput {
  readonly matrixA: Float32Array;
  readonly packedB: Buffer;
  readonly rows: number;
  readonly cols: number;
  readonly targetRank: number;
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
   */
  private unpackTernaryByte(packedByte: number): Int8Array {
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
    const { matrixA, packedB, rows, cols, targetRank } = input;

    if (matrixA.length !== rows * targetRank) {
      throw new RangeError(
        `matrixA length ${matrixA.length} != rows*rank ${rows * targetRank}`
      );
    }

    const dequantizedB = this.dequantize(packedB, targetRank * cols);
    const scaleB = packedB.readFloatLE(0);

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
