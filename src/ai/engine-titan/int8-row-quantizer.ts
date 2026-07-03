// src/ai/engine-titan/int8-row-quantizer.ts
//
// Per-row int8 quantizer for embedding + LM-head layers.
//
// F6 (Fable Batch 03) — embedding rows are per-token identities; rank truncation
// across the vocab erases rare-token distinctions. LM-head error is unattenuated
// logit error. Both are a few percent of parameters and disproportionately
// user-visible if damaged.
//
// This quantizer:
//   - Skips SVD (no A factor)
//   - Skips RHT (avoids the 1.72× pad-to-pow2 inflation on 152064-wide vocab)
//   - Per-row absmax scaling to int8 [-127, 127]
//   - Fp32 scale per row (rows × 4 bytes overhead — tiny vs the int8 body)
//
// Format on disk (in .B.packed):
//   [ fp32 scale per row  × rows ][ int8 data × rows × cols ]
//   Total bytes: rows*4 + rows*cols
//   Bits per weight: (rows*4*8 + rows*cols*8) / (rows*cols) = 8 + 32/cols
//
// For a 152064×8192 token_embd: 8 + 32/8192 ≈ 8.004 bpw. Fixed 8bpw floor,
// negligible per-row overhead. Compare to naive fp16 (16 bpw) → 2× savings.
// Compare to svd-e8 at rank 64 (~4.1 bpw) → 2× worse rate, but no signal loss.
// The trade is deliberate: fidelity-critical layers pay a bit-rate cost.

export interface Int8RowQuantized {
  /** Per-row fp32 scale factor. Length = rows. */
  readonly scales: Float32Array;
  /** Row-major int8 data. Length = rows × cols. */
  readonly data: Int8Array;
  readonly rows: number;
  readonly cols: number;
}

/**
 * Quantize a [rows × cols] weight matrix per-row to int8.
 * Each row gets its own scale = maxAbs / 127. Zero-magnitude rows get scale=1
 * (their int8 data is all zeros, which dequantizes to zero — correct).
 */
export function quantizeInt8PerRow(
  weights: Float32Array,
  rows: number,
  cols: number
): Int8RowQuantized {
  if (weights.length !== rows * cols) {
    throw new RangeError(
      `weights length ${weights.length} != rows*cols ${rows * cols}`
    );
  }
  const scales = new Float32Array(rows);
  const data = new Int8Array(rows * cols);

  for (let r = 0; r < rows; r++) {
    const rowOff = r * cols;
    let maxAbs = 0;
    for (let c = 0; c < cols; c++) {
      const v = Math.abs(weights[rowOff + c]);
      if (v > maxAbs) maxAbs = v;
    }
    if (maxAbs === 0) {
      scales[r] = 1.0; // sentinel — data stays all zero
      continue;
    }
    const scale = maxAbs / 127;
    scales[r] = scale;
    const invScale = 1 / scale;
    for (let c = 0; c < cols; c++) {
      const q = Math.round(weights[rowOff + c] * invScale);
      // Symmetric int8 range: [-127, +127]. Reserve -128 as a sentinel we
      // never emit so decode can trust the full magnitude range.
      data[rowOff + c] = q < -127 ? -127 : q > 127 ? 127 : q;
    }
  }

  return { scales, data, rows, cols };
}

/**
 * Pack scales + data into a single Buffer for vault storage.
 * Layout: [fp32 scales | int8 data]  (little-endian, contiguous).
 */
export function packInt8RowQuantized(q: Int8RowQuantized): Buffer {
  const scaleBytes = q.rows * 4;
  const dataBytes = q.rows * q.cols;
  const buf = Buffer.alloc(scaleBytes + dataBytes);
  // Scales
  const scaleView = new DataView(buf.buffer, buf.byteOffset, scaleBytes);
  for (let i = 0; i < q.rows; i++) {
    scaleView.setFloat32(i * 4, q.scales[i], true);
  }
  // Data
  buf.set(
    new Uint8Array(q.data.buffer, q.data.byteOffset, dataBytes),
    scaleBytes
  );
  return buf;
}

/**
 * Unpack the vault Buffer back into scales + data.
 * Requires knowing rows + cols from LayerMetadata.
 */
export function unpackInt8RowQuantized(
  buf: Buffer,
  rows: number,
  cols: number
): Int8RowQuantized {
  const expectedBytes = rows * 4 + rows * cols;
  if (buf.length !== expectedBytes) {
    throw new RangeError(
      `int8-per-row buffer length ${buf.length} != expected ${expectedBytes} (rows=${rows}, cols=${cols})`
    );
  }
  const scales = new Float32Array(rows);
  const scaleView = new DataView(buf.buffer, buf.byteOffset, rows * 4);
  for (let i = 0; i < rows; i++) {
    scales[i] = scaleView.getFloat32(i * 4, true);
  }
  const data = new Int8Array(rows * cols);
  const dataStart = buf.byteOffset + rows * 4;
  const src = new Int8Array(buf.buffer, dataStart, rows * cols);
  data.set(src);
  return { scales, data, rows, cols };
}

/**
 * Dequantize back to fp32 for direct matmul.
 * Materializes the full [rows × cols] Float32Array — use sparingly.
 * For embedding column gather, prefer `dequantizeInt8Column`.
 */
export function dequantizeInt8PerRow(q: Int8RowQuantized): Float32Array {
  const out = new Float32Array(q.rows * q.cols);
  for (let r = 0; r < q.rows; r++) {
    const scale = q.scales[r];
    const rowOff = r * q.cols;
    for (let c = 0; c < q.cols; c++) {
      out[rowOff + c] = q.data[rowOff + c] * scale;
    }
  }
  return out;
}

/**
 * Column gather without full materialization — for embedding lookups.
 * Returns weights[:, tokenId] as fp32 [rows].
 */
export function dequantizeInt8Column(
  q: Int8RowQuantized,
  tokenId: number
): Float32Array {
  if (tokenId < 0 || tokenId >= q.cols) {
    throw new RangeError(`tokenId ${tokenId} out of range [0, ${q.cols})`);
  }
  const out = new Float32Array(q.rows);
  for (let r = 0; r < q.rows; r++) {
    out[r] = q.data[r * q.cols + tokenId] * q.scales[r];
  }
  return out;
}

/**
 * Reported bits-per-weight for this format at (rows, cols).
 * Used by compression-strategy estimateModelSize.
 */
export function int8PerRowBitsPerWeight(rows: number, cols: number): number {
  return 8 + 32 / cols;
}
