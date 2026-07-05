// Copyright (c) 2026 Molly Labs Inc. Licensed under AGPL-3.0.
// src/ai/engine-titan/e8-entropy.ts
//
// Static Huffman entropy coding for E_8 lattice coordinates.
// Reduces per-group storage from 13 bytes (naive) to ~3-4 bits/weight.
//
// Format:
//   Header: magic + groupCount + rows + cols (16 bytes)
//   Body: bitstream of (float16 scale + 1-bit flag + 8 Huffman-coded coords) per group

import type { E8QuantizedLayer, E8QuantizedGroup } from './e8-lattice';

// --- Float16 conversion (IEEE 754 half-precision) ---

function float32ToFloat16(value: number): number {
  const buf = Buffer.alloc(4);
  buf.writeFloatLE(value, 0);
  const bits = buf.readUInt32LE(0);

  const sign = (bits >>> 31) & 1;
  const exp = (bits >>> 23) & 0xff;
  const frac = bits & 0x7fffff;

  if (exp === 0xff) {
    // Inf/NaN
    return (sign << 15) | 0x7c00 | (frac ? 0x200 : 0);
  }

  if (exp === 0) {
    // Zero / denorm → flush to zero
    return sign << 15;
  }

  const newExp = exp - 127 + 15;

  if (newExp >= 31) {
    // Overflow → Inf
    return (sign << 15) | 0x7c00;
  }

  if (newExp <= 0) {
    // Underflow → denorm or zero
    if (newExp < -10) return sign << 15;
    const shift = 1 - newExp;
    const mantissa = (frac | 0x800000) >>> (13 + shift);
    return (sign << 15) | mantissa;
  }

  return (sign << 15) | (newExp << 10) | (frac >>> 13);
}

function float16ToFloat32(h: number): number {
  const sign = (h >>> 15) & 1;
  const exp = (h >>> 10) & 0x1f;
  const frac = h & 0x3ff;

  let f32Bits: number;

  if (exp === 0) {
    if (frac === 0) {
      f32Bits = sign << 31;
    } else {
      // Denormalized: convert to normalized float32
      let e = -1;
      let f = frac;
      while ((f & 0x400) === 0) {
        f <<= 1;
        e--;
      }
      f &= 0x3ff;
      f32Bits = (sign << 31) | ((e + 127 + 10) << 23) | (f << 13);
    }
  } else if (exp === 31) {
    f32Bits = (sign << 31) | 0x7f800000 | (frac << 13);
  } else {
    f32Bits = (sign << 31) | ((exp - 15 + 127) << 23) | (frac << 13);
  }

  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(f32Bits, 0);
  return buf.readFloatLE(0);
}

// --- Bitstream writer/reader ---

class BitWriter {
  private buf: number[] = [];
  private current = 0;
  private bitPos = 0;

  writeBits(value: number, count: number): void {
    for (let i = count - 1; i >= 0; i--) {
      this.current |= ((value >>> i) & 1) << (7 - this.bitPos);
      this.bitPos++;
      if (this.bitPos === 8) {
        this.buf.push(this.current);
        this.current = 0;
        this.bitPos = 0;
      }
    }
  }

  toBuffer(): Buffer {
    if (this.bitPos > 0) {
      this.buf.push(this.current);
    }
    return Buffer.from(this.buf);
  }

  get totalBits(): number {
    return this.buf.length * 8 + this.bitPos;
  }
}

class BitReader {
  private pos = 0;

  constructor(
    private readonly data: Buffer,
    private bitOffset = 0
  ) {
    this.pos = bitOffset;
  }

  readBits(count: number): number {
    let value = 0;
    for (let i = 0; i < count; i++) {
      const byteIdx = this.pos >>> 3;
      const bitIdx = 7 - (this.pos & 7);
      value = (value << 1) | ((this.data[byteIdx] >>> bitIdx) & 1);
      this.pos++;
    }
    return value;
  }

  get bitsRead(): number {
    return this.pos - this.bitOffset;
  }
}

// --- Static Huffman table for E_8 coordinates ---
// Coord values in practice range from -7 to +7 (Int8, but small).
// Distribution is heavily peaked at 0 for D8 shells and ±1 for half-shift.
// We use a unified table over symbols [-7..7] (15 symbols).
//
// Canonical Huffman: shorter codes for more frequent symbols.
// Table derived from empirical E8 quantization of normalized weight vectors.

interface HuffmanEntry {
  code: number;
  length: number;
}

// Symbol → {code, length} mapping
// Ordered by frequency: 0 > ±1 > ±2 > ±3 > ±4 > ±5 > ±6 > ±7
const HUFFMAN_TABLE: Map<number, HuffmanEntry> = buildStaticTable();

function buildStaticTable(): Map<number, HuffmanEntry> {
  // Canonical Huffman tuned for empirical E8 coordinate distribution.
  // After RMS normalization, coords cluster at {-1, 0, 1} (~26% each).
  // Half-shift groups contribute odd coords (±3, ±5) at higher rates.
  //
  // Optimal lengths (Kraft sum = 1.0):
  //   3 symbols at 2 bits: 0, -1, +1 (most frequent)
  //   2 symbols at 4 bits: -3, +3 (half-shift common)
  //   2 symbols at 5 bits: -2, +2
  //   2 symbols at 6 bits: -5, +5
  //   2 symbols at 7 bits: -4, +4
  //   4 symbols at 8 bits: -6, +6, -7, +7 (rare)
  const symbols: { sym: number; len: number }[] = [
    { sym: 0, len: 2 },
    { sym: -1, len: 2 },
    { sym: 1, len: 2 },
    { sym: -3, len: 4 },
    { sym: 3, len: 4 },
    { sym: -2, len: 5 },
    { sym: 2, len: 5 },
    { sym: -5, len: 6 },
    { sym: 5, len: 6 },
    { sym: -4, len: 7 },
    { sym: 4, len: 7 },
    { sym: -6, len: 8 },
    { sym: 6, len: 8 },
    { sym: -7, len: 8 },
    { sym: 7, len: 8 },
  ];

  // Build canonical codes
  symbols.sort((a, b) => a.len - b.len || a.sym - b.sym);
  const table = new Map<number, HuffmanEntry>();
  let code = 0;
  let prevLen = symbols[0].len;

  for (const { sym, len } of symbols) {
    code <<= len - prevLen;
    table.set(sym, { code, length: len });
    code++;
    prevLen = len;
  }

  return table;
}

// Decode lookup: prebuilt for fast decoding (max code length = 8 bits)
const DECODE_TABLE: { sym: number; len: number }[] = buildDecodeTable();

function buildDecodeTable(): { sym: number; len: number }[] {
  const table: { sym: number; len: number }[] = new Array(256);
  for (const [sym, { code, length }] of HUFFMAN_TABLE) {
    // Fill all entries that start with this code (left-aligned to 8 bits)
    const shift = 8 - length;
    const base = code << shift;
    const count = 1 << shift;
    for (let i = 0; i < count; i++) {
      table[base | i] = { sym, len: length };
    }
  }
  return table;
}

function encodeCoord(writer: BitWriter, coord: number): void {
  const clamped = Math.max(-7, Math.min(7, coord));
  const entry = HUFFMAN_TABLE.get(clamped);
  if (!entry) {
    // Fallback: shouldn't happen with valid E8 coords
    writer.writeBits(0, 2); // encode as 0
    return;
  }
  writer.writeBits(entry.code, entry.length);
}

function decodeCoord(reader: BitReader): number {
  // Peek 8 bits for table lookup. Accesses BitReader internal state via
  // a typed cast (public accessor would be cleaner — deferred; this codepath
  // is hot enough that we don't want a virtual-call barrier).
  interface BitReaderInternals {
    pos: number;
    data: Buffer;
  }
  const r = reader as unknown as BitReaderInternals;
  const byteIdx = r.pos >>> 3;
  const bitIdx = r.pos & 7;
  const data = r.data;

  // Read up to 8 bits (may span 2 bytes)
  let peek = 0;
  if (byteIdx < data.length) {
    peek = data[byteIdx] << bitIdx;
    if (byteIdx + 1 < data.length) {
      peek |= data[byteIdx + 1] >>> (8 - bitIdx);
    }
  }
  peek &= 0xff;

  const entry = DECODE_TABLE[peek];
  if (!entry) {
    reader.readBits(2);
    return 0;
  }

  reader.readBits(entry.len);
  return entry.sym;
}

// --- Public API ---

export const E8_ENTROPY_MAGIC = 0x45384543; // "E8EC"
const HEADER_SIZE = 20; // 4 magic + 4 groupCount + 4 rows + 4 cols + 4 flags

export type ScaleMode = 'float16' | 'log8';

export interface E8EntropyPackedLayer {
  readonly layerName: string;
  readonly rows: number;
  readonly cols: number;
  readonly groupCount: number;
  readonly packedBuffer: Buffer;
  readonly bitsPerWeight: number;
}

// Log8 scale: 8-bit logarithmic quantization of scale values.
// Covers dynamic range 2^-8 to 2^7.9 with ~4.4% relative precision.
// Encode: round(log2(scale) * 16 + 128) clamped to [0, 255]
// Decode: 2^((byte - 128) / 16)
function scaleToLog8(scale: number): number {
  if (scale <= 0) return 0;
  const logVal = Math.log2(scale) * 16 + 128;
  return Math.max(0, Math.min(255, Math.round(logVal)));
}

function log8ToScale(byte: number): number {
  if (byte === 0) return 0;
  return Math.pow(2, (byte - 128) / 16);
}

export function entropyPackE8(
  quantized: E8QuantizedLayer,
  scaleMode: ScaleMode = 'log8'
): E8EntropyPackedLayer {
  const writer = new BitWriter();
  const _scaleBits = scaleMode === 'float16' ? 16 : 8; // reserved for future header validation

  for (let g = 0; g < quantized.groupCount; g++) {
    const { scale, coords, isHalfShift } = quantized.groups[g];

    if (scaleMode === 'float16') {
      writer.writeBits(float32ToFloat16(scale), 16);
    } else {
      writer.writeBits(scaleToLog8(scale), 8);
    }

    writer.writeBits(isHalfShift ? 1 : 0, 1);

    for (let i = 0; i < 8; i++) {
      encodeCoord(writer, coords[i]);
    }
  }

  const body = writer.toBuffer();

  // Header: magic + groupCount + rows + cols + flags (scaleMode in bit 0)
  const packedBuffer = Buffer.alloc(HEADER_SIZE + body.length);
  packedBuffer.writeUInt32LE(E8_ENTROPY_MAGIC, 0);
  packedBuffer.writeUInt32LE(quantized.groupCount, 4);
  packedBuffer.writeUInt32LE(quantized.rows, 8);
  packedBuffer.writeUInt32LE(quantized.cols, 12);
  packedBuffer.writeUInt32LE(scaleMode === 'log8' ? 1 : 0, 16);
  body.copy(packedBuffer, HEADER_SIZE);

  const totalBits = writer.totalBits;
  const totalWeights = quantized.groupCount * 8;
  const bitsPerWeight = totalBits / totalWeights;

  return {
    layerName: quantized.layerName,
    rows: quantized.rows,
    cols: quantized.cols,
    groupCount: quantized.groupCount,
    packedBuffer,
    bitsPerWeight,
  };
}

export function entropyUnpackE8(
  packed: E8EntropyPackedLayer
): E8QuantizedLayer {
  const { packedBuffer, groupCount, rows, cols } = packed;

  const magic = packedBuffer.readUInt32LE(0);
  if (magic !== E8_ENTROPY_MAGIC) {
    throw new Error(
      `Invalid E8 entropy header: expected 0x${E8_ENTROPY_MAGIC.toString(16)}, got 0x${magic.toString(16)}`
    );
  }

  const flags = packedBuffer.readUInt32LE(16);
  const scaleMode: ScaleMode = flags & 1 ? 'log8' : 'float16';

  const reader = new BitReader(packedBuffer, HEADER_SIZE * 8);
  const groups: E8QuantizedGroup[] = new Array(groupCount);

  for (let g = 0; g < groupCount; g++) {
    let scale: number;
    if (scaleMode === 'float16') {
      scale = float16ToFloat32(reader.readBits(16));
    } else {
      scale = log8ToScale(reader.readBits(8));
    }

    const isHalfShift = reader.readBits(1) === 1;

    const coords = new Int8Array(8);
    for (let i = 0; i < 8; i++) {
      coords[i] = decodeCoord(reader);
    }

    groups[g] = { scale, coords, isHalfShift };
  }

  return {
    layerName: packed.layerName,
    rows,
    cols,
    groupCount,
    groups,
    bitsPerWeight: packed.bitsPerWeight,
  };
}

export function entropyPackFromBuffer(
  naiveBuffer: Buffer,
  layerName: string,
  rows: number,
  cols: number,
  scaleMode: ScaleMode = 'log8'
): E8EntropyPackedLayer {
  const bytesPerGroup = 13;
  const groupCount = naiveBuffer.length / bytesPerGroup;
  const groups: E8QuantizedGroup[] = new Array(groupCount);

  for (let g = 0; g < groupCount; g++) {
    const base = g * bytesPerGroup;
    const scale = naiveBuffer.readFloatLE(base);
    const isHalfShift = naiveBuffer[base + 4] === 1;
    const coords = new Int8Array(8);
    for (let i = 0; i < 8; i++) {
      const raw = naiveBuffer[base + 5 + i];
      coords[i] = raw > 127 ? raw - 256 : raw;
    }
    groups[g] = { scale, coords, isHalfShift };
  }

  const layer: E8QuantizedLayer = {
    layerName,
    rows,
    cols,
    groupCount,
    groups,
    bitsPerWeight: 13,
  };

  return entropyPackE8(layer, scaleMode);
}

export function measureCompressionRatio(quantized: E8QuantizedLayer): {
  naiveBitsPerWeight: number;
  entropyBitsPerWeight: number;
  ratio: number;
} {
  const packed = entropyPackE8(quantized);
  return {
    naiveBitsPerWeight: 13,
    entropyBitsPerWeight: packed.bitsPerWeight,
    ratio: 13 / packed.bitsPerWeight,
  };
}
