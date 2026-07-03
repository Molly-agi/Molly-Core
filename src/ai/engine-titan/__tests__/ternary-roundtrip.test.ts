/**
 * ternary-roundtrip.test.ts — sequence-level roundtrip against the REAL quantizer
 *
 * Guards against the digit-order bug flagged in review: a byte-level checksum
 * cannot distinguish MSD-first pack + LSD-first unpack (bytes identical,
 * sequence reversed). This test asserts on the unpacked ternary values,
 * position by position, using asymmetric fixtures where reversal IS detectable.
 *
 * Companion script (kept as `.script.mjs.bak`) demonstrates the failure mode
 * with a reference implementation. This file hits the production code path:
 * TitanStreamQuantizer → dequantize via TitanDecompressionEngine.
 */

import {
  TitanStreamQuantizer,
  type TitanTensorHeader,
} from '../stream-quantizer';
import { TitanDecompressionEngine } from '../reconstruction';

const quantizer = new TitanStreamQuantizer();
const engine = new TitanDecompressionEngine();

/**
 * Feed a Float32Array where each value is exactly ±scale or 0, so the ternary
 * quantizer maps 1:1 with no loss. The resulting sequence of dequantized values
 * exactly matches the input up to floating-point equality.
 */
function ternarySafeFloats(pattern: number[], scale = 2): Float32Array {
  const out = new Float32Array(pattern.length);
  for (let i = 0; i < pattern.length; i++) out[i] = pattern[i] * scale;
  return out;
}

function toTernaryPattern(recovered: Float32Array, scale: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < recovered.length; i++) {
    const v = recovered[i];
    if (Math.abs(v - scale) < 1e-4) out.push(1);
    else if (Math.abs(v + scale) < 1e-4) out.push(-1);
    else out.push(0);
  }
  return out;
}

function quantizeDequantize(pattern: number[]): number[] {
  const raw = ternarySafeFloats(pattern);
  const header: TitanTensorHeader = {
    layerName: 'roundtrip-fixture',
    dimensions: [1, pattern.length],
    totalElements: pattern.length,
  };
  const packed = quantizer.quantizeTensorChunk(header, raw);
  const recovered = engine.dequantize(packed.packedBuffer, pattern.length);
  return toTernaryPattern(recovered, packed.scale);
}

describe('ternary-roundtrip — sequence-level order preservation', () => {
  it('recovers the EXACT sequence for an asymmetric 5-tuple', () => {
    // Asymmetric fixture — reversal within the 5-group is detectable.
    // A symmetric fixture like [1, 0, 0, 0, 1] would MASK an LSD-mispack bug.
    const asymmetric = [-1, -1, 0, 1, 1];
    const recovered = quantizeDequantize(asymmetric);
    expect(recovered).toEqual(asymmetric);
  });

  it('preserves order across a run spanning many 5-groups', () => {
    // 500 ternary values spanning 100 packed bytes, positional pattern
    // designed so per-group reversal produces a different sequence.
    const pattern: number[] = [];
    for (let i = 0; i < 500; i++) {
      pattern.push(((i * 3) % 5) - 2); // -2..2 wrap → clamp to {-1,0,1}
      pattern[pattern.length - 1] = Math.max(
        -1,
        Math.min(1, pattern[pattern.length - 1])
      );
    }
    const recovered = quantizeDequantize(pattern);
    expect(recovered).toEqual(pattern);
  });

  it('distinguishes the reversed-within-group failure mode', () => {
    // The bug's fingerprint is per-group reversal. Assert directly on this
    // shape so a future regression can be identified from the failing test alone.
    const original = [-1, 0, 1, 0, -1, 1, 1, -1, 0, 0];
    const perGroupReversed = [0, 1, 0, -1, -1, 0, 0, -1, 1, 1];
    // Sanity: they are actually different sequences
    expect(original).not.toEqual(perGroupReversed);
    const recovered = quantizeDequantize(original);
    expect(recovered).toEqual(original);
    expect(recovered).not.toEqual(perGroupReversed);
  });

  it('rejects invalid packed bytes (>= 243)', () => {
    // 3^5 = 243, so byte values 243..255 encode no valid ternary 5-tuple.
    // Silent aliasing would corrupt weights; unpack must throw.
    const packed = Buffer.alloc(5);
    packed.writeFloatLE(1.0, 0); // scale header
    packed[4] = 243;
    expect(() => engine.dequantize(packed, 5)).toThrow(RangeError);
  });

  it('accepts the maximum valid byte (242)', () => {
    // Boundary check: byte 242 is the highest legal value (encodes [1,1,1,1,1]).
    const packed = Buffer.alloc(5);
    packed.writeFloatLE(1.0, 0);
    packed[4] = 242;
    const out = engine.dequantize(packed, 5);
    // [1, 1, 1, 1, 1] × scale 1.0 = [1, 1, 1, 1, 1]
    for (let i = 0; i < 5; i++) expect(out[i]).toBeCloseTo(1, 5);
  });

  it('packed buffer size is 4-byte scale header + ceil(n/5) bytes', () => {
    const n = 500;
    const header: TitanTensorHeader = {
      layerName: 'size-check',
      dimensions: [1, n],
      totalElements: n,
    };
    const raw = new Float32Array(n).fill(1);
    const packed = quantizer.quantizeTensorChunk(header, raw);
    expect(packed.packedBuffer.length).toBe(4 + Math.ceil(n / 5));
  });
});
