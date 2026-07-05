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
  // qh is a 32-bit bitmask: bit i is the high bit of weight i
  const qh = block.readUInt32LE(2);
  for (let i = 0; i < 32; i++) {
    const byteIdx = 6 + (i >> 1);
    const byte = block[byteIdx];
    const lo4 = (i & 1) === 0 ? byte & 0x0f : (byte >> 4) & 0x0f;
    const hi1 = (qh >>> i) & 0x01;
    const q = (lo4 | (hi1 << 4)) - 16;
    output[outOffset + i] = q * scale;
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
  const superScale = f16ToF32(block.readUInt16LE(0));
  const superMin = f16ToF32(block.readUInt16LE(2));

  const scalesAndMins = block.subarray(4, 4 + 12);
  const qs = block.subarray(16, 16 + 128);

  for (let j = 0; j < 8; j++) {
    let sc: number, m: number;
    if (j < 4) {
      sc = scalesAndMins[j] & 0x3f;
      m = scalesAndMins[j + 4] & 0x3f;
    } else {
      sc =
        ((scalesAndMins[j + 4] & 0xf0) >> 4) |
        ((scalesAndMins[j - 4] >> 6) << 4);
      m = (scalesAndMins[j + 4] & 0x0f) | ((scalesAndMins[j] >> 6) << 4);
    }

    const d = superScale * sc;
    const dm = superMin * m;

    for (let i = 0; i < 16; i++) {
      const qIdx = j * 16 + i;
      const byteIdx = Math.floor(qIdx / 2);
      const byte = qs[byteIdx];
      const nibble = qIdx % 2 === 0 ? byte & 0x0f : (byte >> 4) & 0x0f;
      output[outOffset + j * 32 + i] = nibble * d - dm;
    }

    for (let i = 0; i < 16; i++) {
      const qIdx = j * 16 + i + 128;
      const byteIdx = Math.floor(qIdx / 2);
      const byte = qs[byteIdx];
      const nibble = qIdx % 2 === 0 ? byte & 0x0f : (byte >> 4) & 0x0f;
      output[outOffset + j * 32 + 16 + i] = nibble * d - dm;
    }
  }
}

export function dequantBlockQ6_K(
  block: Buffer,
  output: Float32Array,
  outOffset: number
): void {
  const ql = block.subarray(0, 128);
  const qh = block.subarray(128, 192);
  const superScale = f16ToF32(block.readUInt16LE(208));

  for (let j = 0; j < 16; j++) {
    const sc = block.readInt8(192 + j);
    const d = superScale * sc;

    for (let i = 0; i < 16; i++) {
      const idx = j * 16 + i;
      const qlIdx = Math.floor(idx / 2);
      const qlByte = ql[qlIdx];
      const qlNibble = idx % 2 === 0 ? qlByte & 0x0f : (qlByte >> 4) & 0x0f;

      const qhIdx = Math.floor(idx / 4);
      const qhShift = (idx % 4) * 2;
      const qhBits = (qh[qhIdx] >> qhShift) & 0x03;

      const q = (qlNibble | (qhBits << 4)) - 32;
      output[outOffset + idx] = q * d;
    }
  }
}

export function dequantBlockQ5_K(
  block: Buffer,
  output: Float32Array,
  outOffset: number
): void {
  const superScale = f16ToF32(block.readUInt16LE(0));
  const superMin = f16ToF32(block.readUInt16LE(2));
  const scalesAndMins = block.subarray(4, 16); // 12 bytes
  const qh = block.subarray(16, 48); // 32 bytes — high bits (1 per weight)
  const qs = block.subarray(48, 176); // 128 bytes — lower 4 bits (2 per byte)

  for (let j = 0; j < 8; j++) {
    let sc: number, m: number;
    if (j < 4) {
      sc = scalesAndMins[j] & 0x3f;
      m = scalesAndMins[j + 4] & 0x3f;
    } else {
      sc =
        ((scalesAndMins[j + 4] & 0xf0) >> 4) |
        ((scalesAndMins[j - 4] >> 6) << 4);
      m = (scalesAndMins[j + 4] & 0x0f) | ((scalesAndMins[j] >> 6) << 4);
    }
    const d = superScale * sc;
    const dm = superMin * m;

    for (let i = 0; i < 32; i++) {
      const l = j * 32 + i;
      const lo4 = (qs[l >> 1] >> ((l & 1) << 2)) & 0x0f;
      const hi1 = (qh[l >> 3] >> (l & 7)) & 0x01;
      output[outOffset + l] = (lo4 | (hi1 << 4)) * d - dm;
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
