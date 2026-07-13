// src/ai/engine-titan/__tests__/e8-entropy.test.ts
//
// Tests entropy coding for E8 lattice: pack/unpack round-trip, float16 conversion,
// log8 scale mode, compression ratio measurement, and format detection.

import { describe, test, expect } from '@jest/globals';
import {
  entropyPackE8,
  entropyUnpackE8,
  measureCompressionRatio,
  E8_ENTROPY_MAGIC,
  type E8EntropyPackedLayer,
} from '../e8-entropy';
import type { E8QuantizedLayer, E8QuantizedGroup } from '../e8-lattice';

function makeGroup(
  scale: number,
  coords: number[],
  isHalfShift: boolean
): E8QuantizedGroup {
  const c = new Int8Array(8);
  for (let i = 0; i < 8; i++) c[i] = coords[i] ?? 0;
  return { scale, coords: c, isHalfShift };
}

function makeLayer(
  groups: E8QuantizedGroup[],
  rows = 8,
  cols = 8
): E8QuantizedLayer {
  return {
    layerName: 'test',
    rows,
    cols,
    groupCount: groups.length,
    groups,
    bitsPerWeight: 13,
  };
}

describe('entropyPackE8 / entropyUnpackE8 round-trip', () => {
  test('single group with all-zero coords round-trips', () => {
    const layer = makeLayer([makeGroup(1.5, [0, 0, 0, 0, 0, 0, 0, 0], false)]);
    const packed = entropyPackE8(layer, 'float16');
    const unpacked = entropyUnpackE8(packed);

    expect(unpacked.groupCount).toBe(1);
    expect(unpacked.groups[0].isHalfShift).toBe(false);
    for (let i = 0; i < 8; i++) {
      expect(unpacked.groups[0].coords[i]).toBe(0);
    }
  });

  test('mixed coords round-trip with float16 scale', () => {
    const layer = makeLayer([
      makeGroup(0.25, [-1, 1, 0, -1, 1, 0, 0, 0], false),
      makeGroup(0.5, [1, -1, 3, -3, 0, 0, 1, -1], true),
    ]);
    const packed = entropyPackE8(layer, 'float16');
    const unpacked = entropyUnpackE8(packed);

    expect(unpacked.groupCount).toBe(2);

    // First group coords
    expect(unpacked.groups[0].coords[0]).toBe(-1);
    expect(unpacked.groups[0].coords[1]).toBe(1);
    expect(unpacked.groups[0].coords[2]).toBe(0);
    expect(unpacked.groups[0].isHalfShift).toBe(false);

    // Second group coords
    expect(unpacked.groups[1].coords[2]).toBe(3);
    expect(unpacked.groups[1].coords[3]).toBe(-3);
    expect(unpacked.groups[1].isHalfShift).toBe(true);
  });

  test('rare coords (-7, +7, -6, +6) round-trip', () => {
    const layer = makeLayer([
      makeGroup(1.0, [-7, 7, -6, 6, -5, 5, -4, 4], false),
    ]);
    const packed = entropyPackE8(layer, 'float16');
    const unpacked = entropyUnpackE8(packed);

    for (let i = 0; i < 8; i++) {
      expect(unpacked.groups[0].coords[i]).toBe(layer.groups[0].coords[i]);
    }
  });

  test('log8 scale mode round-trips with acceptable error', () => {
    const layer = makeLayer([
      makeGroup(0.123, [1, -1, 0, 0, 1, -1, 0, 0], false),
    ]);
    const packed = entropyPackE8(layer, 'log8');
    const unpacked = entropyUnpackE8(packed);

    // log8 has ±4.4% relative error
    const scaleError = Math.abs(unpacked.groups[0].scale - 0.123) / 0.123;
    expect(scaleError).toBeLessThan(0.05);
  });

  test('float16 scale mode has higher precision than log8', () => {
    const scale = 0.0371;
    const layer1 = makeLayer([
      makeGroup(scale, [0, 0, 0, 0, 0, 0, 0, 0], false),
    ]);
    const layer2 = makeLayer([
      makeGroup(scale, [0, 0, 0, 0, 0, 0, 0, 0], false),
    ]);

    const fp16 = entropyUnpackE8(entropyPackE8(layer1, 'float16'));
    const log8 = entropyUnpackE8(entropyPackE8(layer2, 'log8'));

    const fp16Err = Math.abs(fp16.groups[0].scale - scale);
    const log8Err = Math.abs(log8.groups[0].scale - scale);

    expect(fp16Err).toBeLessThanOrEqual(log8Err + 1e-6);
  });

  test('many groups round-trip correctly', () => {
    const groups: E8QuantizedGroup[] = [];
    for (let g = 0; g < 64; g++) {
      const coords = [];
      for (let i = 0; i < 8; i++) {
        coords.push(((g * 3 + i * 7) % 15) - 7);
      }
      groups.push(makeGroup(0.1 + g * 0.01, coords, g % 3 === 0));
    }
    const layer = makeLayer(groups, 32, 16);
    const packed = entropyPackE8(layer, 'float16');
    const unpacked = entropyUnpackE8(packed);

    expect(unpacked.groupCount).toBe(64);
    for (let g = 0; g < 64; g++) {
      expect(unpacked.groups[g].isHalfShift).toBe(groups[g].isHalfShift);
      for (let i = 0; i < 8; i++) {
        expect(unpacked.groups[g].coords[i]).toBe(groups[g].coords[i]);
      }
    }
  });
});

describe('entropyPackE8 — format', () => {
  test('packed buffer starts with E8EC magic', () => {
    const layer = makeLayer([makeGroup(1.0, [0, 0, 0, 0, 0, 0, 0, 0], false)]);
    const packed = entropyPackE8(layer, 'float16');
    expect(packed.packedBuffer.readUInt32LE(0)).toBe(E8_ENTROPY_MAGIC);
  });

  test('header contains correct group count, rows, cols', () => {
    const layer = makeLayer(
      [
        makeGroup(1.0, [0, 0, 0, 0, 0, 0, 0, 0], false),
        makeGroup(2.0, [1, 1, 1, 1, 1, 1, 1, 1], false),
      ],
      16,
      32
    );
    const packed = entropyPackE8(layer, 'float16');
    expect(packed.packedBuffer.readUInt32LE(4)).toBe(2);
    expect(packed.packedBuffer.readUInt32LE(8)).toBe(16);
    expect(packed.packedBuffer.readUInt32LE(12)).toBe(32);
  });

  test('flags byte encodes scale mode: 0 = float16, 1 = log8', () => {
    const layer = makeLayer([makeGroup(1.0, [0, 0, 0, 0, 0, 0, 0, 0], false)]);

    const fp16 = entropyPackE8(layer, 'float16');
    expect(fp16.packedBuffer.readUInt32LE(16) & 1).toBe(0);

    const log8 = entropyPackE8(layer, 'log8');
    expect(log8.packedBuffer.readUInt32LE(16) & 1).toBe(1);
  });

  test('reports bits per weight', () => {
    const layer = makeLayer([makeGroup(1.0, [0, 0, 0, 0, 0, 0, 0, 0], false)]);
    const packed = entropyPackE8(layer, 'float16');
    expect(packed.bitsPerWeight).toBeGreaterThan(0);
    expect(packed.bitsPerWeight).toBeLessThan(13);
  });
});

describe('entropyUnpackE8 — error handling', () => {
  test('throws on invalid magic', () => {
    const buf = Buffer.alloc(24);
    buf.writeUInt32LE(0xdeadbeef, 0);
    const packed: E8EntropyPackedLayer = {
      layerName: 'bad',
      rows: 8,
      cols: 8,
      groupCount: 1,
      packedBuffer: buf,
      bitsPerWeight: 0,
    };
    expect(() => entropyUnpackE8(packed)).toThrow(/Invalid E8 entropy header/);
  });
});

describe('measureCompressionRatio', () => {
  test('entropy coding achieves better than naive 13 bytes/group', () => {
    const groups: E8QuantizedGroup[] = [];
    for (let g = 0; g < 16; g++) {
      groups.push(makeGroup(0.5, [0, -1, 1, 0, -1, 1, 0, 0], false));
    }
    const layer = makeLayer(groups, 16, 8);
    const { naiveBitsPerWeight, entropyBitsPerWeight, ratio } =
      measureCompressionRatio(layer);

    expect(naiveBitsPerWeight).toBe(13);
    expect(entropyBitsPerWeight).toBeLessThan(13);
    expect(ratio).toBeGreaterThan(1.0);
  });

  test('uniform small coords compress better than varied large coords', () => {
    const smallGroups = Array.from({ length: 16 }, () =>
      makeGroup(1.0, [0, -1, 1, 0, 0, -1, 1, 0], false)
    );
    const bigGroups = Array.from({ length: 16 }, () =>
      makeGroup(1.0, [-7, 6, -5, 4, -3, 2, -1, 7], false)
    );

    const smallRatio = measureCompressionRatio(makeLayer(smallGroups, 16, 8));
    const bigRatio = measureCompressionRatio(makeLayer(bigGroups, 16, 8));

    expect(smallRatio.entropyBitsPerWeight).toBeLessThan(
      bigRatio.entropyBitsPerWeight
    );
  });
});
