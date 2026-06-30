// src/ai/engine-titan/gguf-ingest.ts

import { openSync, readSync, closeSync } from 'fs';

export interface GGUFTensorInfo {
  name: string;
  dimensions: number[];
  type: GGUFType;
  offset: bigint;
  elementCount: number;
}

export interface GGUFHeader {
  version: number;
  tensorCount: number;
  metadataKvCount: number;
  metadata: Map<string, unknown>;
}

export interface GGUFFile {
  header: GGUFHeader;
  tensors: GGUFTensorInfo[];
  dataOffset: bigint;
  filePath: string;
}

export enum GGUFType {
  F32 = 0,
  F16 = 1,
  Q4_0 = 2,
  Q4_1 = 3,
  Q5_0 = 6,
  Q5_1 = 7,
  Q8_0 = 8,
  Q8_1 = 9,
  Q2_K = 10,
  Q3_K = 11,
  Q4_K = 12,
  Q5_K = 13,
  Q6_K = 14,
  IQ2_XXS = 16,
  IQ2_XS = 17,
  IQ3_XXS = 18,
  IQ1_S = 19,
  IQ4_NL = 20,
  IQ3_S = 21,
  IQ2_S = 22,
  IQ4_XS = 23,
  I8 = 24,
  I16 = 25,
  I32 = 26,
  I64 = 27,
  F64 = 28,
  IQ1_M = 29,
}

const GGUF_MAGIC = 0x46554747; // "GGUF" little-endian
const GGML_TYPE_SIZE: Record<number, number> = {
  [GGUFType.F32]: 4,
  [GGUFType.F16]: 2,
  [GGUFType.Q4_0]: 18, // block_q4_0: 2 + 16
  [GGUFType.Q4_1]: 20, // block_q4_1: 4 + 16
  [GGUFType.Q5_0]: 22,
  [GGUFType.Q5_1]: 24,
  [GGUFType.Q8_0]: 34, // block_q8_0: 2 + 32
  [GGUFType.Q8_1]: 36,
  [GGUFType.Q2_K]: 84,
  [GGUFType.Q3_K]: 110,
  [GGUFType.Q4_K]: 144,
  [GGUFType.Q5_K]: 176,
  [GGUFType.Q6_K]: 210,
};

const GGML_TYPE_BLOCK_SIZE: Record<number, number> = {
  [GGUFType.F32]: 1,
  [GGUFType.F16]: 1,
  [GGUFType.Q4_0]: 32,
  [GGUFType.Q4_1]: 32,
  [GGUFType.Q5_0]: 32,
  [GGUFType.Q5_1]: 32,
  [GGUFType.Q8_0]: 32,
  [GGUFType.Q8_1]: 32,
  [GGUFType.Q2_K]: 256,
  [GGUFType.Q3_K]: 256,
  [GGUFType.Q4_K]: 256,
  [GGUFType.Q5_K]: 256,
  [GGUFType.Q6_K]: 256,
};

enum GGUFMetadataValueType {
  UINT8 = 0,
  INT8 = 1,
  UINT16 = 2,
  INT16 = 3,
  UINT32 = 4,
  INT32 = 5,
  FLOAT32 = 6,
  BOOL = 7,
  STRING = 8,
  ARRAY = 9,
  UINT64 = 10,
  INT64 = 11,
  FLOAT64 = 12,
}

class GGUFReader {
  private fd: number;
  private pos: number = 0;
  private buf: Buffer;

  constructor(filePath: string) {
    this.fd = openSync(filePath, 'r');
    this.buf = Buffer.alloc(8);
  }

  close() {
    closeSync(this.fd);
  }

  readU32(): number {
    readSync(this.fd, this.buf, 0, 4, this.pos);
    this.pos += 4;
    return this.buf.readUInt32LE(0);
  }

  readU64(): bigint {
    readSync(this.fd, this.buf, 0, 8, this.pos);
    this.pos += 8;
    return this.buf.readBigUInt64LE(0);
  }

  readI32(): number {
    readSync(this.fd, this.buf, 0, 4, this.pos);
    this.pos += 4;
    return this.buf.readInt32LE(0);
  }

  readF32(): number {
    readSync(this.fd, this.buf, 0, 4, this.pos);
    this.pos += 4;
    return this.buf.readFloatLE(0);
  }

  readF64(): number {
    readSync(this.fd, this.buf, 0, 8, this.pos);
    this.pos += 8;
    return this.buf.readDoubleLE(0);
  }

  readU8(): number {
    readSync(this.fd, this.buf, 0, 1, this.pos);
    this.pos += 1;
    return this.buf.readUInt8(0);
  }

  readI8(): number {
    readSync(this.fd, this.buf, 0, 1, this.pos);
    this.pos += 1;
    return this.buf.readInt8(0);
  }

  readU16(): number {
    readSync(this.fd, this.buf, 0, 2, this.pos);
    this.pos += 2;
    return this.buf.readUInt16LE(0);
  }

  readI16(): number {
    readSync(this.fd, this.buf, 0, 2, this.pos);
    this.pos += 2;
    return this.buf.readInt16LE(0);
  }

  readString(): string {
    const len = Number(this.readU64());
    if (len > 10_000_000) throw new Error(`String too long: ${len}`);
    const strBuf = Buffer.alloc(len);
    readSync(this.fd, strBuf, 0, len, this.pos);
    this.pos += len;
    return strBuf.toString('utf-8');
  }

  readBool(): boolean {
    return this.readU8() !== 0;
  }

  readMetadataValue(type: GGUFMetadataValueType): unknown {
    switch (type) {
      case GGUFMetadataValueType.UINT8:
        return this.readU8();
      case GGUFMetadataValueType.INT8:
        return this.readI8();
      case GGUFMetadataValueType.UINT16:
        return this.readU16();
      case GGUFMetadataValueType.INT16:
        return this.readI16();
      case GGUFMetadataValueType.UINT32:
        return this.readU32();
      case GGUFMetadataValueType.INT32:
        return this.readI32();
      case GGUFMetadataValueType.FLOAT32:
        return this.readF32();
      case GGUFMetadataValueType.BOOL:
        return this.readBool();
      case GGUFMetadataValueType.STRING:
        return this.readString();
      case GGUFMetadataValueType.UINT64:
        return this.readU64();
      case GGUFMetadataValueType.INT64:
        return this.readU64(); // read as bigint
      case GGUFMetadataValueType.FLOAT64:
        return this.readF64();
      case GGUFMetadataValueType.ARRAY: {
        const elemType = this.readU32() as GGUFMetadataValueType;
        const count = Number(this.readU64());
        const arr: unknown[] = [];
        for (let i = 0; i < count; i++) {
          arr.push(this.readMetadataValue(elemType));
        }
        return arr;
      }
      default:
        throw new Error(`Unknown metadata value type: ${type}`);
    }
  }

  getPosition(): number {
    return this.pos;
  }
}

export function parseGGUF(filePath: string): GGUFFile {
  const reader = new GGUFReader(filePath);

  try {
    // Magic
    const magic = reader.readU32();
    if (magic !== GGUF_MAGIC) {
      throw new Error(
        `Not a GGUF file: magic=0x${magic.toString(16)}, expected 0x${GGUF_MAGIC.toString(16)}`
      );
    }

    // Version
    const version = reader.readU32();
    if (version < 2 || version > 3) {
      throw new Error(`Unsupported GGUF version: ${version}`);
    }

    // Tensor count + metadata KV count
    const tensorCount = Number(reader.readU64());
    const metadataKvCount = Number(reader.readU64());

    // Read metadata
    const metadata = new Map<string, unknown>();
    for (let i = 0; i < metadataKvCount; i++) {
      const key = reader.readString();
      const valueType = reader.readU32() as GGUFMetadataValueType;
      const value = reader.readMetadataValue(valueType);
      metadata.set(key, value);
    }

    // Read tensor infos
    const tensors: GGUFTensorInfo[] = [];
    for (let i = 0; i < tensorCount; i++) {
      const name = reader.readString();
      const nDims = reader.readU32();
      const dimensions: number[] = [];
      for (let d = 0; d < nDims; d++) {
        dimensions.push(Number(reader.readU64()));
      }
      const type = reader.readU32() as GGUFType;
      const offset = reader.readU64();

      let elementCount = 1;
      for (const dim of dimensions) elementCount *= dim;

      tensors.push({ name, dimensions, type, offset, elementCount });
    }

    // Data starts after header, aligned to 32 bytes
    const headerEnd = reader.getPosition();
    const alignment = 32;
    const dataOffset = BigInt(Math.ceil(headerEnd / alignment) * alignment);

    return {
      header: { version, tensorCount, metadataKvCount, metadata },
      tensors,
      dataOffset,
      filePath,
    };
  } finally {
    reader.close();
  }
}

export function getTensorByteSize(tensor: GGUFTensorInfo): number {
  const typeSize = GGML_TYPE_SIZE[tensor.type];
  const blockSize = GGML_TYPE_BLOCK_SIZE[tensor.type];
  if (typeSize === undefined || blockSize === undefined) {
    throw new Error(`Unknown tensor type: ${tensor.type}`);
  }
  return Math.ceil(tensor.elementCount / blockSize) * typeSize;
}

export function readTensorF32(
  gguf: GGUFFile,
  tensor: GGUFTensorInfo
): Float32Array {
  if (tensor.type !== GGUFType.F32) {
    throw new Error(
      `readTensorF32 only supports F32 tensors, got type ${tensor.type} for ${tensor.name}`
    );
  }

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
