// Copyright (c) 2026 Molly Labs Inc. Licensed under AGPL-3.0.
// src/ai/engine-titan/gguf-dequant.ts

import { openSync, readSync, closeSync } from 'fs';
import { GGUFType, type GGUFFile, type GGUFTensorInfo } from './gguf-ingest';

export type DequantFn = (
  block: Buffer,
  output: Float32Array,
  outOffset: number
) => void;

function f16ToF32(bits: number): number {
  const sign = (bits >> 15) & 1;
  const exp = (bits >> 10) & 0x1f;
  const frac = bits & 0x3ff;

  if (exp === 0) {
    if (frac === 0) return sign ? -0 : 0;
    const val = (frac / 1024) * Math.pow(2, -14);
    return sign ? -val : val;
  }
  if (exp === 31) {
    return frac === 0 ? (sign ? -Infinity : Infinity) : NaN;
  }
  const val = (1 + frac / 1024) * Math.pow(2, exp - 15);
  return sign ? -val : val;
}

export function dequantBlockQ4_0(
  block: Buffer,
  output: Float32Array,
  outOffset: number
): void {
  const scale = f16ToF32(block.readUInt16LE(0));
  for (let i = 0; i < 16; i++) {
    const byte = block[2 + i];
    const lo = (byte & 0x0f) - 8;
    const hi = ((byte >> 4) & 0x0f) - 8;
    output[outOffset + i * 2] = lo * scale;
    output[outOffset + i * 2 + 1] = hi * scale;
  }
}

export function dequantBlockQ4_1(
  block: Buffer,
  output: Float32Array,
  outOffset: number
): void {
  const scale = f16ToF32(block.readUInt16LE(0));
  const min = f16ToF32(block.readUInt16LE(2));
  for (let i = 0; i < 16; i++) {
    const byte = block[4 + i];
    const lo = byte & 0x0f;
    const hi = (byte >> 4) & 0x0f;
    output[outOffset + i * 2] = lo * scale + min;
    output[outOffset + i * 2 + 1] = hi * scale + min;
  }
}

// Q5_0: 32 weights per block, 22 bytes.
// Layout: [f16 d (2)][qh (4 bytes = 32 high bits)][qs (16 bytes = 32 low nibbles)]
// Each weight = ((lo4 | (hi1 << 4)) - 16) * d
export function dequantBlockQ5_0(
  block: Buffer,
  output: Float32Array,
  outOffset: number
): void {
  const scale = f16ToF32(block.readUInt16LE(0));
  // qh: 4 bytes (uint32) — bit i is the 5th bit of weight i
  const qh = block.readUInt32LE(2);
  // qs: 16 bytes of packed 4-bit quants
  // Layout (matching gguf.quants): positions 0-15 get low nibbles, 16-31 get high nibbles
  for (let i = 0; i < 16; i++) {
    const byte = block[6 + i];
    const lo = byte & 0x0F;
    const hi = (byte >> 4) & 0x0F;
    const qh_lo = (qh >>> i) & 0x01;
    const qh_hi = (qh >>> (i + 16)) & 0x01;
    output[outOffset + i] = ((lo | (qh_lo << 4)) - 16) * scale;
    output[outOffset + i + 16] = ((hi | (qh_hi << 4)) - 16) * scale;
  }
}

export function dequantBlockQ8_0(
  block: Buffer,
  output: Float32Array,
  outOffset: number
): void {
  const scale = f16ToF32(block.readUInt16LE(0));
  for (let i = 0; i < 32; i++) {
    output[outOffset + i] = block.readInt8(2 + i) * scale;
  }
}

export function dequantBlockQ4_K(
  block: Buffer,
  output: Float32Array,
  outOffset: number
): void {
  const d = f16ToF32(block.readUInt16LE(0));
  const dmin = f16ToF32(block.readUInt16LE(2));

  // 12 bytes of packed scales/mins at offset 4
  // First 4 sub-blocks: lower 6 bits of bytes 4..7 (scales), bytes 8..11 (mins)
  // Last 4 sub-blocks: 4-bit low from bytes 12..15, 2-bit high from bytes 4..11 upper
  const scales = new Float32Array(8);
  const mins = new Float32Array(8);

  for (let i = 0; i < 4; i++) {
    scales[i] = block[4 + i] & 0x3F;
    mins[i] = block[4 + i + 4] & 0x3F;
  }
  for (let i = 0; i < 4; i++) {
    const scHi = (block[4 + i] >> 6) & 0x03;
    const mnHi = (block[4 + i + 4] >> 6) & 0x03;
    const scLo = block[4 + 8 + i] & 0x0F;
    const mnLo = (block[4 + 8 + i] >> 4) & 0x0F;
    scales[4 + i] = scLo | (scHi << 4);
    mins[4 + i] = mnLo | (mnHi << 4);
  }

  // 128 bytes of quants at offset 16
  // 4 chunks × 32 bytes each. For chunk j (per ggml-quants.c dequantize_row_q4_K):
  //   32 low nibbles  → output[j*64 .. j*64+31] with scale/min at index 2*j
  //   32 high nibbles → output[j*64+32 .. j*64+63] with scale/min at index 2*j+1
  const qBase = 16;
  for (let j = 0; j < 4; j++) {
    const d1 = d * scales[2 * j];
    const m1 = dmin * mins[2 * j];
    const d2 = d * scales[2 * j + 1];
    const m2 = dmin * mins[2 * j + 1];
    for (let l = 0; l < 32; l++) {
      const qByte = block[qBase + j * 32 + l];
      output[outOffset + j * 64 + l] = d1 * (qByte & 0x0F) - m1;
      output[outOffset + j * 64 + 32 + l] = d2 * ((qByte >> 4) & 0x0F) - m2;
    }
  }
}

export function dequantBlockQ6_K(
  block: Buffer,
  output: Float32Array,
  outOffset: number
): void {
  // Q6_K block: ql[128] + qh[64] + scales[16](int8) + d(f16) = 210 bytes
  // Reference: ggml-quants.c dequantize_row_q6_K
  const ql = block.subarray(0, 128);
  const qh = block.subarray(128, 192);
  const superScale = f16ToF32(block.readUInt16LE(208));

  // Two halves (n=0, n=128), each processes 128 values
  for (let n = 0; n < 256; n += 128) {
    const qlOff = (n / 128) * 64; // ql pointer: 0 for first half, 64 for second
    const qhOff = (n / 128) * 32; // qh pointer: 0 for first half, 32 for second

    for (let l = 0; l < 32; l++) {
      const is = Math.floor(n / 16) + Math.floor(l / 16); // sub-block index for sc

      // 4 values per iteration from the same ql/qh positions
      const qlByte0 = ql[qlOff + l];
      const qlByte32 = ql[qlOff + l + 32];
      const qhByte = qh[qhOff + l];

      const q1 = ((qlByte0 & 0x0f) | (((qhByte >> 0) & 3) << 4)) - 32;
      const q2 = ((qlByte32 & 0x0f) | (((qhByte >> 2) & 3) << 4)) - 32;
      const q3 = ((qlByte0 >> 4) | (((qhByte >> 4) & 3) << 4)) - 32;
      const q4 = ((qlByte32 >> 4) | (((qhByte >> 6) & 3) << 4)) - 32;

      const sc0 = block.readInt8(192 + is + 0);
      const sc2 = block.readInt8(192 + is + 2);
      const sc4 = block.readInt8(192 + is + 4);
      const sc6 = block.readInt8(192 + is + 6);

      output[outOffset + n + l + 0] = superScale * sc0 * q1;
      output[outOffset + n + l + 32] = superScale * sc2 * q2;
      output[outOffset + n + l + 64] = superScale * sc4 * q3;
      output[outOffset + n + l + 96] = superScale * sc6 * q4;
    }
  }
}

export function dequantBlockQ5_K(
  block: Buffer,
  output: Float32Array,
  outOffset: number
): void {
  // Q5_K block: 176 bytes -> 256 values
  // Layout: d(2) + dmin(2) + scales(12) + qh(32) + qs(128) = 176
  const d = f16ToF32(block.readUInt16LE(0));
  const dmin = f16ToF32(block.readUInt16LE(2));

  // Scale/min extraction (same as Q4_K)
  const scales = new Float32Array(8);
  const mins = new Float32Array(8);
  for (let i = 0; i < 4; i++) {
    scales[i] = block[4 + i] & 0x3F;
    mins[i] = block[4 + i + 4] & 0x3F;
  }
  for (let i = 0; i < 4; i++) {
    const scHi = (block[4 + i] >> 6) & 0x03;
    const mnHi = (block[4 + i + 4] >> 6) & 0x03;
    const scLo = block[4 + 8 + i] & 0x0F;
    const mnLo = (block[4 + 8 + i] >> 4) & 0x0F;
    scales[4 + i] = scLo | (scHi << 4);
    mins[4 + i] = mnLo | (mnHi << 4);
  }

  const qhBase = 16;  // 32 bytes of high bits
  const qsBase = 48;  // 128 bytes of low 4-bit quants

  // 4 chunks × 32 bytes each (per ggml-quants.c dequantize_row_q5_K):
  //   32 low nibbles  → output[j*64 .. j*64+31] with scale/min at index 2*j
  //   32 high nibbles → output[j*64+32 .. j*64+63] with scale/min at index 2*j+1
  // High bit for low-nibble value l: (qh[l] >> (2*j)) & 1
  // High bit for high-nibble value l: (qh[l] >> (2*j+1)) & 1
  for (let j = 0; j < 4; j++) {
    const d1 = d * scales[2 * j];
    const m1 = dmin * mins[2 * j];
    const d2 = d * scales[2 * j + 1];
    const m2 = dmin * mins[2 * j + 1];
    for (let l = 0; l < 32; l++) {
      const qsByte = block[qsBase + j * 32 + l];
      const qhByte = block[qhBase + l];
      const lo4 = qsByte & 0x0F;
      const hi4 = (qsByte >> 4) & 0x0F;
      const hbitLo = (qhByte >> (2 * j)) & 1;
      const hbitHi = (qhByte >> (2 * j + 1)) & 1;
      output[outOffset + j * 64 + l] = d1 * (lo4 | (hbitLo << 4)) - m1;
      output[outOffset + j * 64 + 32 + l] = d2 * (hi4 | (hbitHi << 4)) - m2;
    }
  }
}

export function dequantBlockF16(
  block: Buffer,
  output: Float32Array,
  outOffset: number
): void {
  output[outOffset] = f16ToF32(block.readUInt16LE(0));
}

const DEQUANT_DISPATCH: Partial<Record<GGUFType, DequantFn>> = {
  [GGUFType.Q4_0]: dequantBlockQ4_0,
  [GGUFType.Q4_1]: dequantBlockQ4_1,
  [GGUFType.Q5_0]: dequantBlockQ5_0,
  [GGUFType.Q8_0]: dequantBlockQ8_0,
  [GGUFType.Q4_K]: dequantBlockQ4_K,
  [GGUFType.Q5_K]: dequantBlockQ5_K,
  [GGUFType.Q6_K]: dequantBlockQ6_K,
  [GGUFType.F16]: dequantBlockF16,
};

/**
 * Reads and dequantizes a tensor from the GGUF file.
 *
 * ORIENTATION CONTRACT (2026-07-07, post-transpose-bug-fix):
 * - 1D tensors: returned as-is (norms, biases).
 * - 2D tensors: returned as row-major [rows × cols] where:
 *     rows = dimensions[0] (ne[0] in GGUF = output features)
 *     cols = dimensions[1] (ne[1] in GGUF = input features)
 *   GGML stores 2D weights as [out × in] with ne[0] (out) fastest.
 *   This function returns data in that native order WITHOUT transposition.
 *   Callers performing y = x @ W must index as: y[j] = sum_i(x[i] * W[j * cols + i])
 *   where j iterates output dim and i iterates input dim.
 *
 * The CrystalTransformerDriver and GgufFallbackLoader use this convention.
 * The decomposer treats the returned buffer as [rows × cols] for SVD factorization.
 */
export function readTensorData(
  gguf: GGUFFile,
  tensor: GGUFTensorInfo
): Float32Array {
  if (tensor.type === GGUFType.F32) {
    return readTensorF32Direct(gguf, tensor);
  }

  const dequantFn = DEQUANT_DISPATCH[tensor.type];
  if (!dequantFn) {
    throw new Error(
      `Unsupported tensor type for dequantization: ${tensor.type} (${GGUFType[tensor.type] ?? 'unknown'}) for tensor "${tensor.name}"`
    );
  }

  const blockSize = BLOCK_SIZES[tensor.type];
  const typeSize = TYPE_SIZES[tensor.type];
  if (blockSize === undefined || typeSize === undefined) {
    throw new Error(`Unknown block/type size for type ${tensor.type}`);
  }

  const totalBlocks = Math.ceil(tensor.elementCount / blockSize);
  const output = new Float32Array(tensor.elementCount);
  const absoluteOffset = Number(gguf.dataOffset + tensor.offset);

  const fd = openSync(gguf.filePath, 'r');
  try {
    const blockBuf = Buffer.alloc(typeSize);
    for (let b = 0; b < totalBlocks; b++) {
      const filePos = absoluteOffset + b * typeSize;
      readSync(fd, blockBuf, 0, typeSize, filePos);
      dequantFn(blockBuf, output, b * blockSize);
    }
  } finally {
    closeSync(fd);
  }

  return output;
}

function readTensorF32Direct(
  gguf: GGUFFile,
  tensor: GGUFTensorInfo
): Float32Array {
  const absoluteOffset = Number(gguf.dataOffset + tensor.offset);
  const byteLength = tensor.elementCount * 4;
  const buf = Buffer.alloc(byteLength);
  const fd = openSync(gguf.filePath, 'r');
  try {
    readSync(fd, buf, 0, byteLength, absoluteOffset);
  } finally {
    closeSync(fd);
  }
  return new Float32Array(buf.buffer, buf.byteOffset, tensor.elementCount);
}

export interface StreamingCompressionOptions {
  storageDir: string;
  targetRankFn?: (rows: number, cols: number) => number;
  onLayerComplete?: (name: string, index: number, total: number) => void;
  maxMemoryBytes?: number;
}

export const DEFAULT_RANK_FN = (rows: number, cols: number): number => {
  const minDim = Math.min(rows, cols);
  return Math.max(1, Math.min(64, Math.floor(minDim * 0.02)));
};

export function* iterateTensors(
  gguf: GGUFFile,
  filter?: (tensor: GGUFTensorInfo) => boolean
): Generator<{ tensor: GGUFTensorInfo; index: number; total: number }> {
  const tensors = filter ? gguf.tensors.filter(filter) : gguf.tensors;
  for (let i = 0; i < tensors.length; i++) {
    yield { tensor: tensors[i], index: i, total: tensors.length };
  }
}

export function estimateTensorMemory(tensor: GGUFTensorInfo): number {
  return tensor.elementCount * 4;
}

const BLOCK_SIZES: Partial<Record<GGUFType, number>> = {
  [GGUFType.F32]: 1,
  [GGUFType.F16]: 1,
  [GGUFType.Q4_0]: 32,
  [GGUFType.Q4_1]: 32,
  [GGUFType.Q5_0]: 32,
  [GGUFType.Q8_0]: 32,
  [GGUFType.Q4_K]: 256,
  [GGUFType.Q5_K]: 256,
  [GGUFType.Q6_K]: 256,
};

const TYPE_SIZES: Partial<Record<GGUFType, number>> = {
  [GGUFType.F32]: 4,
  [GGUFType.F16]: 2,
  [GGUFType.Q4_0]: 18,
  [GGUFType.Q4_1]: 20,
  [GGUFType.Q5_0]: 22,
  [GGUFType.Q8_0]: 34,
  [GGUFType.Q4_K]: 144,
  [GGUFType.Q5_K]: 176,
  [GGUFType.Q6_K]: 210,
};
