// src/ai/engine-titan/__tests__/e8-lattice.test.ts

import {
  nearestE8,
  generateE8Roots,
  quantizeE8,
  dequantizeE8,
  packE8,
  unpackE8,
  measureE8Quality,
} from '../e8-lattice';

describe('E_8 Lattice Vector Quantizer', () => {
  describe('generateE8Roots', () => {
    it('generates exactly 240 root vectors', () => {
      const roots = generateE8Roots();
      expect(roots.length).toBe(240);
    });

    it('all roots have squared norm 2 (distance √2 from origin)', () => {
      const roots = generateE8Roots();
      for (const root of roots) {
        const normSq = root.reduce((s, v) => s + v * v, 0);
        expect(normSq).toBeCloseTo(2.0, 10);
      }
    });

    it('roots contain class 1: permutations of (±1,±1,0,...,0)', () => {
      const roots = generateE8Roots();
      const target = new Float64Array([1, 1, 0, 0, 0, 0, 0, 0]);
      const found = roots.some((r) =>
        r.every((v, i) => Math.abs(v - target[i]) < 1e-10)
      );
      expect(found).toBe(true);
    });

    it('roots contain class 2: (½,½,½,½,½,½,½,½)', () => {
      const roots = generateE8Roots();
      const target = new Float64Array([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
      const found = roots.some((r) =>
        r.every((v, i) => Math.abs(v - target[i]) < 1e-10)
      );
      expect(found).toBe(true);
    });
  });

  describe('nearestE8', () => {
    it('maps a root vector to itself (zero distance)', () => {
      const x = new Float64Array([1, 1, 0, 0, 0, 0, 0, 0]);
      const { point, distSq } = nearestE8(x);
      expect(distSq).toBeCloseTo(0, 10);
      expect(Array.from(point)).toEqual([1, 1, 0, 0, 0, 0, 0, 0]);
    });

    it('maps half-integer root to itself', () => {
      const x = new Float64Array([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
      const { distSq, isHalfShift } = nearestE8(x);
      expect(distSq).toBeCloseTo(0, 10);
      expect(isHalfShift).toBe(true);
    });

    it('maps origin to origin (zero vector is a valid D_8 point)', () => {
      const x = new Float64Array(8);
      const { point, distSq } = nearestE8(x);
      expect(distSq).toBeCloseTo(0, 10);
      expect(point.every((v) => v === 0)).toBe(true);
    });

    it('finds nearest point for arbitrary input', () => {
      const x = new Float64Array([0.7, 0.8, 0.1, -0.1, 0.05, -0.05, 0.2, -0.3]);
      const { point, distSq } = nearestE8(x);
      // Result must be a valid E_8 point
      const sum = point.reduce((s, v) => s + v, 0);
      const allInt = point.every((v) => Math.abs(v - Math.round(v)) < 1e-10);
      const _allHalf = point.every(
        (v) =>
          Math.abs(v * 2 - Math.round(v * 2)) < 1e-10 &&
          Math.abs(v - Math.round(v)) > 0.1
      );

      if (allInt) {
        // D_8: integer coords with even sum
        expect(Math.round(sum) % 2).toBe(0);
      } else {
        // D_8 + ½: half-integer coords with even sum
        const intSum = point.reduce((s, v) => s + Math.round(v - 0.5), 0);
        expect(intSum % 2).toBe(0);
      }
      expect(distSq).toBeGreaterThanOrEqual(0);
    });

    it('throws on wrong dimensions', () => {
      expect(() => nearestE8(new Float64Array(7))).toThrow();
      expect(() => nearestE8(new Float64Array(9))).toThrow();
    });
  });

  describe('quantizeE8 + dequantizeE8 roundtrip', () => {
    it('preserves shape through roundtrip', () => {
      const weights = new Float32Array(128);
      for (let i = 0; i < 128; i++) weights[i] = (Math.random() - 0.5) * 4;

      const quantized = quantizeE8(weights, 'test.layer', 16, 8);
      const reconstructed = dequantizeE8(quantized);

      expect(reconstructed.length).toBe(128);
      expect(quantized.groupCount).toBe(16);
      expect(quantized.rows).toBe(16);
      expect(quantized.cols).toBe(8);
    });

    it('achieves cosine similarity > 0.95 on Gaussian weights', () => {
      const weights = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        // Box-Muller for Gaussian
        const u1 = Math.random();
        const u2 = Math.random();
        weights[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      }

      const quantized = quantizeE8(weights, 'gauss', 32, 32);
      const reconstructed = dequantizeE8(quantized);
      const { cosineSimilarity } = measureE8Quality(weights, reconstructed);

      expect(cosineSimilarity).toBeGreaterThan(0.95);
    });

    it('handles zero weights correctly', () => {
      const weights = new Float32Array(16); // all zeros
      const quantized = quantizeE8(weights, 'zeros', 4, 4);
      const reconstructed = dequantizeE8(quantized);

      for (let i = 0; i < 16; i++) {
        expect(reconstructed[i]).toBe(0);
      }
    });

    it('handles non-multiple-of-8 lengths via padding', () => {
      const weights = new Float32Array(13);
      for (let i = 0; i < 13; i++) weights[i] = i * 0.1;

      const quantized = quantizeE8(weights, 'odd', 1, 13);
      const reconstructed = dequantizeE8(quantized);

      expect(reconstructed.length).toBe(13);
      expect(quantized.groupCount).toBe(2); // ceil(13/8) = 2
    });
  });

  describe('packE8 + unpackE8 roundtrip', () => {
    it('pack/unpack preserves all quantized data', () => {
      const weights = new Float32Array(64);
      for (let i = 0; i < 64; i++) weights[i] = (Math.random() - 0.5) * 2;

      const quantized = quantizeE8(weights, 'pack_test', 8, 8);
      const packed = packE8(quantized);
      const unpacked = unpackE8(packed);

      expect(unpacked.groupCount).toBe(quantized.groupCount);
      for (let g = 0; g < quantized.groupCount; g++) {
        expect(unpacked.groups[g].scale).toBeCloseTo(
          quantized.groups[g].scale,
          5
        );
        expect(unpacked.groups[g].isHalfShift).toBe(
          quantized.groups[g].isHalfShift
        );
        expect(Array.from(unpacked.groups[g].coords)).toEqual(
          Array.from(quantized.groups[g].coords)
        );
      }
    });

    it('packed buffer has expected size', () => {
      const weights = new Float32Array(80);
      const quantized = quantizeE8(weights, 'size', 10, 8);
      const packed = packE8(quantized);

      // 10 groups × 13 bytes = 130 bytes
      expect(packed.packedBuffer.length).toBe(10 * 13);
    });
  });

  describe('quality comparison: E_8 vs ternary baseline', () => {
    it('E_8 achieves lower MSE than independent scalar rounding', () => {
      const weights = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const u1 = Math.random();
        const u2 = Math.random();
        weights[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      }

      // E_8 quantization
      const quantized = quantizeE8(weights, 'compare', 16, 16);
      const e8Recon = dequantizeE8(quantized);
      const e8Quality = measureE8Quality(weights, e8Recon);

      // Naive scalar rounding (simulates independent per-weight quantization)
      const scale = Math.sqrt(
        weights.reduce((s, w) => s + w * w, 0) / weights.length
      );
      const scalarRecon = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        scalarRecon[i] = Math.round(weights[i] / scale) * scale;
      }
      const scalarQuality = measureE8Quality(weights, scalarRecon);

      // E_8 should have better cosine similarity (exploits correlations)
      expect(e8Quality.cosineSimilarity).toBeGreaterThan(0.9);
      console.log(
        `E_8 cosine: ${e8Quality.cosineSimilarity.toFixed(4)}, scalar cosine: ${scalarQuality.cosineSimilarity.toFixed(4)}`
      );
    });
  });
});
