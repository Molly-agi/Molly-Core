// src/ai/engine-titan/stream-quantizer.ts

export interface TitanTensorHeader {
  readonly layerName: string;
  readonly dimensions: [number, number];
  readonly totalElements: number;
}

/**
 * Quantized layer output: packed ternary weights + the scale needed to dequantize.
 * scale is stored as the first 4 bytes (Float32LE) of packedBuffer so the
 * payload is self-contained and reconstruction never needs out-of-band metadata.
 */
export interface TitanQuantizedLayer {
  readonly header: TitanTensorHeader;
  /** Packed buffer: [Float32LE scale (4 bytes)] + [packed ternary weights] */
  readonly packedBuffer: Buffer;
  /** Scale factor — also embedded in packedBuffer[0..3] for convenience. */
  readonly scale: number;
}

export class TitanStreamQuantizer {
  // 3^5 = 243, fitting neatly inside a single 8-bit unsigned integer (max 255)
  private readonly weightsPerByte = 5;

  /**
   * Compresses raw FP16/FP32 tensor arrays into packed 1.58-bit ternary streams.
   * Output is self-contained: scale is prepended as Float32LE in the first 4 bytes
   * so reconstruction never needs out-of-band metadata.
   */
  public quantizeTensorChunk(
    header: TitanTensorHeader,
    rawWeights: Float32Array
  ): TitanQuantizedLayer {
    if (!rawWeights || rawWeights.length !== header.totalElements) {
      throw new RangeError(
        'Provided tensor buffer weight dimensions do not match header metadata specs.'
      );
    }

    // Step 1: Calculate the absolute mean value of the layer to determine our quantization scale
    let absoluteSum = 0.0;
    for (let i = 0; i < rawWeights.length; i++) {
      absoluteSum += Math.abs(rawWeights[i]);
    }
    const layerScale = absoluteSum / (rawWeights.length || 1);

    // Step 2: Pre-allocate output buffer: 4-byte scale header + packed weights
    const packedWeightSize = Math.ceil(
      header.totalElements / this.weightsPerByte
    );
    const packedOutputBuffer = Buffer.alloc(4 + packedWeightSize);

    // Embed scale as first 4 bytes (Float32LE) so reconstruction is self-contained
    packedOutputBuffer.writeFloatLE(layerScale, 0);

    const weightBufferWindow = new Int8Array(this.weightsPerByte);
    let windowIndex = 0;
    let byteOutputCursor = 4; // start after scale header

    // Step 3: Run the ternary translation loop (-1, 0, 1)
    for (let i = 0; i < rawWeights.length; i++) {
      const rawVal = rawWeights[i];
      const scaledVal = rawVal / (layerScale || 1.0);

      // Determine nearest ternary representation based on 0.5 step boundaries
      let ternaryValue = 0;
      if (scaledVal > 0.5) ternaryValue = 1;
      else if (scaledVal < -0.5) ternaryValue = -1;

      weightBufferWindow[windowIndex++] = ternaryValue;

      // When our sliding execution window fills up, pack the values into a single byte
      if (windowIndex === this.weightsPerByte) {
        packedOutputBuffer[byteOutputCursor++] =
          this.packTernaryWindow(weightBufferWindow);
        windowIndex = 0;
        weightBufferWindow.fill(0);
      }
    }

    // Flush any remaining weights left in the final processing window
    if (windowIndex > 0) {
      packedOutputBuffer[byteOutputCursor] =
        this.packTernaryWindow(weightBufferWindow);
    }

    return { header, packedBuffer: packedOutputBuffer, scale: layerScale };
  }

  /**
   * Encodes 5 ternary weights mathematically into an 8-bit unsigned byte.
   * Maps values from {-1, 0, 1} to a zero-indexed {0, 1, 2} space.
   */
  private packTernaryWindow(window: Int8Array): number {
    let packedByte = 0;
    for (let i = 0; i < this.weightsPerByte; i++) {
      // Shift values from range [-1, 1] to [0, 2] for safe unsigned bitwise operations
      const standardizedValue = window[i] + 1;
      packedByte = packedByte * 3 + standardizedValue;
    }
    return packedByte & 0xff;
  }
}
