import {
  dequantBlockQ4_0,
  dequantBlockQ8_0,
  dequantBlockQ4_1,
  dequantBlockQ5_0,
  dequantBlockF16,
  readTensorData,
  iterateTensors,
  estimateTensorMemory,
} from '../gguf-dequant';
import { GGUFType, type GGUFFile, type GGUFTensorInfo } from '../gguf-ingest';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function f32ToF16Bits(value: number): number {
  if (value === 0) return 0;
  const sign = value < 0 ? 1 : 0;
  const abs = Math.abs(value);
  const exp = Math.floor(Math.log2(abs));
  const biasedExp = exp + 15;
  if (biasedExp >= 31) return (sign << 15) | (31 << 10);
  if (biasedExp <= 0) return sign << 15;
  const frac = Math.round((abs / Math.pow(2, exp) - 1) * 1024);
  return (sign << 15) | (biasedExp << 10) | (frac & 0x3ff);
}

describe('gguf-dequant', () => {
  describe('dequantBlockQ4_0', () => {
    it('dequantizes a block with known scale and nibbles', () => {
      const block = Buffer.alloc(18);
      const scaleBits = f32ToF16Bits(2.0);
      block.writeUInt16LE(scaleBits, 0);

      // Byte at offset 2: lo=0x05 (5-8=-3), hi=0x0C (12-8=4)
      block[2] = 0xc5; // lo nibble=5, hi nibble=12
      // Remaining bytes zero: lo=0 (0-8=-8), hi=0 (0-8=-8)

      const output = new Float32Array(32);
      dequantBlockQ4_0(block, output, 0);

      expect(output[0]).toBeCloseTo(-3 * 2.0, 1); // (5-8)*2 = -6
      expect(output[1]).toBeCloseTo(4 * 2.0, 1); // (12-8)*2 = 8
      expect(output[2]).toBeCloseTo(-8 * 2.0, 1); // (0-8)*2 = -16
    });

    it('produces 32 values per block', () => {
      const block = Buffer.alloc(18);
      block.writeUInt16LE(f32ToF16Bits(1.0), 0);
      for (let i = 0; i < 16; i++) block[2 + i] = 0x88; // both nibbles = 8, (8-8)=0

      const output = new Float32Array(32);
      dequantBlockQ4_0(block, output, 0);

      for (let i = 0; i < 32; i++) {
        expect(output[i]).toBeCloseTo(0, 5);
      }
    });

    it('respects output offset', () => {
      const block = Buffer.alloc(18);
      block.writeUInt16LE(f32ToF16Bits(1.0), 0);
      block[2] = 0x99; // lo=9 (9-8=1), hi=9 (9-8=1)

      const output = new Float32Array(64);
      dequantBlockQ4_0(block, output, 32);

      expect(output[0]).toBe(0);
      expect(output[32]).toBeCloseTo(1.0, 1);
      expect(output[33]).toBeCloseTo(1.0, 1);
    });
  });

  describe('dequantBlockQ5_0', () => {
    it('recovers signed 5-bit values with scale', () => {
      // Q5_0 block layout: [f16 d (2)][qh uint32 LE (4)][qs 16 bytes]
      // Each weight q = ((lo4 | (hi1 << 4)) - 16) * scale
      const block = Buffer.alloc(22);
      block.writeUInt16LE(f32ToF16Bits(0.25), 0);

      // weight 0: lo=0x0, hi=1 -> q = (0 | 16) - 16 = 0  -> 0 * 0.25 = 0
      // weight 1: lo=0xF, hi=0 -> q = (15 | 0)  - 16 = -1 -> -0.25
      // weight 2: lo=0x1, hi=1 -> q = (1 | 16) - 16 = 1  -> 0.25
      // weight 3: lo=0xE, hi=1 -> q = (14 | 16) - 16 = 14 -> 3.5

      // Pack lo nibbles into qs (2 per byte, low nibble = even index)
      block[6] = (0xf << 4) | 0x0; // byte 0: weight 0 lo=0, weight 1 lo=15
      block[7] = (0xe << 4) | 0x1; // byte 1: weight 2 lo=1, weight 3 lo=14

      // qh: bit i is high bit of weight i. Set bits 0, 2, 3.
      block.writeUInt32LE((1 << 0) | (1 << 2) | (1 << 3), 2);

      const output = new Float32Array(32);
      dequantBlockQ5_0(block, output, 0);

      expect(output[0]).toBeCloseTo(0, 5);
      expect(output[1]).toBeCloseTo(-0.25, 5);
      expect(output[2]).toBeCloseTo(0.25, 5);
      expect(output[3]).toBeCloseTo(3.5, 5);
    });

    it('produces exactly 32 values per block', () => {
      const block = Buffer.alloc(22);
      block.writeUInt16LE(f32ToF16Bits(1.0), 0);
      // qh = 0, all lo nibbles = 0 => q = -16, output = -16 * 1.0 = -16
      const output = new Float32Array(32);
      dequantBlockQ5_0(block, output, 0);
      for (let i = 0; i < 32; i++) {
        expect(output[i]).toBeCloseTo(-16, 1);
      }
    });

    it('respects output offset', () => {
      const block = Buffer.alloc(22);
      block.writeUInt16LE(f32ToF16Bits(1.0), 0);
      // qh = 0, lo nibbles = 8 => q = 8 - 16 = -8
      for (let i = 0; i < 16; i++) block[6 + i] = 0x88;
      const output = new Float32Array(64);
      dequantBlockQ5_0(block, output, 32);
      expect(output[0]).toBe(0);
      expect(output[32]).toBeCloseTo(-8, 1);
      expect(output[63]).toBeCloseTo(-8, 1);
    });
  });

  describe('dequantBlockQ4_1', () => {
    it('applies scale and min offset', () => {
      const block = Buffer.alloc(20);
      block.writeUInt16LE(f32ToF16Bits(0.5), 0); // scale
      block.writeUInt16LE(f32ToF16Bits(-1.0), 2); // min
      block[4] = 0x42; // lo=2, hi=4

      const output = new Float32Array(32);
      dequantBlockQ4_1(block, output, 0);

      expect(output[0]).toBeCloseTo(2 * 0.5 + -1.0, 1); // 0
      expect(output[1]).toBeCloseTo(4 * 0.5 + -1.0, 1); // 1
    });
  });

  describe('dequantBlockQ8_0', () => {
    it('dequantizes 32 int8 values by scale', () => {
      const block = Buffer.alloc(34);
      block.writeUInt16LE(f32ToF16Bits(0.25), 0);
      block.writeInt8(4, 2); // 4 * 0.25 = 1.0
      block.writeInt8(-8, 3); // -8 * 0.25 = -2.0
      block.writeInt8(0, 4); // 0 * 0.25 = 0

      const output = new Float32Array(32);
      dequantBlockQ8_0(block, output, 0);

      expect(output[0]).toBeCloseTo(1.0, 1);
      expect(output[1]).toBeCloseTo(-2.0, 1);
      expect(output[2]).toBeCloseTo(0, 5);
    });

    it('handles negative scale', () => {
      const block = Buffer.alloc(34);
      block.writeUInt16LE(f32ToF16Bits(-1.0), 0);
      block.writeInt8(3, 2);

      const output = new Float32Array(32);
      dequantBlockQ8_0(block, output, 0);

      expect(output[0]).toBeCloseTo(-3.0, 1);
    });
  });

  describe('dequantBlockF16', () => {
    it('converts f16 to f32', () => {
      const block = Buffer.alloc(2);
      block.writeUInt16LE(f32ToF16Bits(3.14), 0);

      const output = new Float32Array(1);
      dequantBlockF16(block, output, 0);

      expect(output[0]).toBeCloseTo(3.14, 1);
    });
  });

  describe('readTensorData', () => {
    const testDir = join(tmpdir(), 'gguf-dequant-test-' + process.pid);
    const testFile = join(testDir, 'test.gguf');

    beforeAll(() => {
      mkdirSync(testDir, { recursive: true });
    });

    afterAll(() => {
      try {
        unlinkSync(testFile);
      } catch {}
    });

    it('reads F32 tensors directly', () => {
      const values = new Float32Array([1.0, 2.0, 3.0, 4.0]);
      const dataOffset = 64;
      const tensorOffset = 0;

      const fileBuf = Buffer.alloc(dataOffset + values.byteLength);
      Buffer.from(values.buffer).copy(fileBuf, dataOffset);
      writeFileSync(testFile, fileBuf);

      const gguf: GGUFFile = {
        header: {
          version: 3,
          tensorCount: 1,
          metadataKvCount: 0,
          metadata: new Map(),
        },
        tensors: [],
        dataOffset: BigInt(dataOffset),
        filePath: testFile,
      };
      const tensor: GGUFTensorInfo = {
        name: 'test_f32',
        dimensions: [4],
        type: GGUFType.F32,
        offset: BigInt(tensorOffset),
        elementCount: 4,
      };

      const result = readTensorData(gguf, tensor);
      expect(result.length).toBe(4);
      expect(result[0]).toBeCloseTo(1.0, 5);
      expect(result[3]).toBeCloseTo(4.0, 5);
    });

    it('reads Q8_0 tensors with dequantization', () => {
      const dataOffset = 64;
      const scale = 0.5;
      const scaleBits = f32ToF16Bits(scale);

      // One Q8_0 block: 2 bytes scale + 32 bytes int8 = 34 bytes, produces 32 floats
      const blockBuf = Buffer.alloc(34);
      blockBuf.writeUInt16LE(scaleBits, 0);
      for (let i = 0; i < 32; i++) {
        blockBuf.writeInt8(i - 16, 2 + i); // values: -16..15
      }

      const fileBuf = Buffer.alloc(dataOffset + 34);
      blockBuf.copy(fileBuf, dataOffset);
      writeFileSync(testFile, fileBuf);

      const gguf: GGUFFile = {
        header: {
          version: 3,
          tensorCount: 1,
          metadataKvCount: 0,
          metadata: new Map(),
        },
        tensors: [],
        dataOffset: BigInt(dataOffset),
        filePath: testFile,
      };
      const tensor: GGUFTensorInfo = {
        name: 'test_q8',
        dimensions: [32],
        type: GGUFType.Q8_0,
        offset: BigInt(0),
        elementCount: 32,
      };

      const result = readTensorData(gguf, tensor);
      expect(result.length).toBe(32);
      expect(result[0]).toBeCloseTo(-16 * scale, 1);
      expect(result[16]).toBeCloseTo(0 * scale, 1);
      expect(result[31]).toBeCloseTo(15 * scale, 1);
    });

    it('throws for unsupported tensor types', () => {
      const gguf: GGUFFile = {
        header: {
          version: 3,
          tensorCount: 1,
          metadataKvCount: 0,
          metadata: new Map(),
        },
        tensors: [],
        dataOffset: BigInt(0),
        filePath: testFile,
      };
      const tensor: GGUFTensorInfo = {
        name: 'test_unsupported',
        dimensions: [10],
        type: GGUFType.IQ2_XXS,
        offset: BigInt(0),
        elementCount: 10,
      };

      expect(() => readTensorData(gguf, tensor)).toThrow(
        /Unsupported tensor type/
      );
    });
  });

  describe('iterateTensors', () => {
    it('yields all tensors with index and total', () => {
      const gguf: GGUFFile = {
        header: {
          version: 3,
          tensorCount: 3,
          metadataKvCount: 0,
          metadata: new Map(),
        },
        tensors: [
          {
            name: 'a',
            dimensions: [4],
            type: GGUFType.F32,
            offset: BigInt(0),
            elementCount: 4,
          },
          {
            name: 'b',
            dimensions: [8],
            type: GGUFType.Q4_0,
            offset: BigInt(16),
            elementCount: 8,
          },
          {
            name: 'c',
            dimensions: [16],
            type: GGUFType.Q8_0,
            offset: BigInt(48),
            elementCount: 16,
          },
        ],
        dataOffset: BigInt(0),
        filePath: '',
      };

      const items = [...iterateTensors(gguf)];
      expect(items.length).toBe(3);
      expect(items[0].index).toBe(0);
      expect(items[0].total).toBe(3);
      expect(items[2].tensor.name).toBe('c');
    });

    it('respects filter function', () => {
      const gguf: GGUFFile = {
        header: {
          version: 3,
          tensorCount: 3,
          metadataKvCount: 0,
          metadata: new Map(),
        },
        tensors: [
          {
            name: 'model.layers.0.attn',
            dimensions: [4],
            type: GGUFType.F32,
            offset: BigInt(0),
            elementCount: 4,
          },
          {
            name: 'model.layers.0.norm',
            dimensions: [4],
            type: GGUFType.F32,
            offset: BigInt(16),
            elementCount: 4,
          },
          {
            name: 'model.layers.1.attn',
            dimensions: [4],
            type: GGUFType.F32,
            offset: BigInt(32),
            elementCount: 4,
          },
        ],
        dataOffset: BigInt(0),
        filePath: '',
      };

      const attnOnly = [
        ...iterateTensors(gguf, (t) => t.name.includes('attn')),
      ];
      expect(attnOnly.length).toBe(2);
      expect(attnOnly[0].tensor.name).toBe('model.layers.0.attn');
      expect(attnOnly[1].tensor.name).toBe('model.layers.1.attn');
    });
  });

  describe('estimateTensorMemory', () => {
    it('estimates Float32Array memory for tensor', () => {
      const tensor: GGUFTensorInfo = {
        name: 'big_tensor',
        dimensions: [4096, 4096],
        type: GGUFType.Q4_K,
        offset: BigInt(0),
        elementCount: 4096 * 4096,
      };

      const estimate = estimateTensorMemory(tensor);
      expect(estimate).toBe(4096 * 4096 * 4); // 64MB
    });
  });
});
