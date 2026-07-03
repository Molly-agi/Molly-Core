import { applyRHT, inverseRHT } from '../hadamard-transform';

describe('hadamard-transform', () => {
  describe('applyRHT', () => {
    it('returns paddedCols = next power of 2 >= cols', () => {
      const weights = new Float32Array(3 * 6).fill(1);
      const { meta } = applyRHT(weights, 3, 6, 42);
      expect(meta.paddedCols).toBe(8);
      expect(meta.originalCols).toBe(6);
    });

    it('returns paddedCols == cols when cols is already a power of 2', () => {
      const weights = new Float32Array(2 * 8).fill(1);
      const { meta } = applyRHT(weights, 2, 8, 1);
      expect(meta.paddedCols).toBe(8);
      expect(meta.originalCols).toBe(8);
    });

    it('output shape is rows * paddedCols', () => {
      const rows = 4;
      const cols = 1024;
      const weights = new Float32Array(rows * cols).fill(0.5);
      const { transformed, meta } = applyRHT(weights, rows, cols, 99);
      expect(transformed.length).toBe(rows * meta.paddedCols);
      expect(meta.paddedCols).toBe(1024);
    });

    it('is deterministic: same seed produces identical output', () => {
      const weights = new Float32Array(2 * 4);
      for (let i = 0; i < weights.length; i++) weights[i] = i * 0.1;

      const { transformed: a } = applyRHT(weights, 2, 4, 12345);
      const { transformed: b } = applyRHT(weights, 2, 4, 12345);
      expect(Array.from(a)).toEqual(Array.from(b));
    });

    it('different seeds produce different outputs', () => {
      const weights = new Float32Array(2 * 16);
      for (let i = 0; i < weights.length; i++) weights[i] = i * 0.1;

      const { transformed: a } = applyRHT(weights, 2, 16, 111);
      const { transformed: b } = applyRHT(weights, 2, 16, 222);
      expect(Array.from(a)).not.toEqual(Array.from(b));
    });

    it('spreads a single-element outlier across all dimensions', () => {
      const rows = 1;
      const cols = 8;
      const weights = new Float32Array(cols);
      weights[0] = 1000; // single outlier

      const { transformed } = applyRHT(weights, rows, cols, 7);
      const maxVal = Math.max(...Array.from(transformed).map(Math.abs));
      const minVal = Math.min(...Array.from(transformed).map(Math.abs));
      // Outlier should be spread — max/min ratio should be much less than 1000
      expect(maxVal / (minVal + 1e-8)).toBeLessThan(100);
    });
  });

  describe('inverseRHT', () => {
    it('perfectly round-trips a power-of-2 matrix', () => {
      const rows = 4;
      const cols = 8;
      const original = new Float32Array(rows * cols);
      for (let i = 0; i < original.length; i++) original[i] = (i - 20) * 0.7;

      const { transformed, meta } = applyRHT(original, rows, cols, 1337);
      const recovered = inverseRHT(transformed, rows, meta);

      expect(recovered.length).toBe(rows * cols);
      for (let i = 0; i < original.length; i++) {
        expect(recovered[i]).toBeCloseTo(original[i], 4);
      }
    });

    it('round-trips a non-power-of-2 matrix (strips padding)', () => {
      const rows = 2;
      const cols = 6;
      const original = new Float32Array(rows * cols);
      for (let i = 0; i < original.length; i++) original[i] = i * 1.5;

      const { transformed, meta } = applyRHT(original, rows, cols, 42);
      expect(meta.paddedCols).toBe(8);

      const recovered = inverseRHT(transformed, rows, meta);
      expect(recovered.length).toBe(rows * cols);
      for (let i = 0; i < original.length; i++) {
        expect(recovered[i]).toBeCloseTo(original[i], 4);
      }
    });

    it('round-trips the K/V attention shape [rank=16 × cols=1024]', () => {
      const rows = 16;
      const cols = 1024;
      const original = new Float32Array(rows * cols);
      for (let i = 0; i < original.length; i++)
        original[i] = Math.sin(i * 0.001);

      const { transformed, meta } = applyRHT(original, rows, cols, 0xdeadbeef);
      const recovered = inverseRHT(transformed, rows, meta);

      let maxError = 0;
      for (let i = 0; i < original.length; i++) {
        maxError = Math.max(maxError, Math.abs(recovered[i] - original[i]));
      }
      expect(maxError).toBeLessThan(1e-4);
    });
  });
});
