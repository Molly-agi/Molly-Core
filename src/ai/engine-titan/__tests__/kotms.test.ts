import { applyKOTMS, inverseKOTMS } from '../kotms';

describe('kotms', () => {
  it('produces paddedCols = next power of 2', () => {
    const rows = 3;
    const cols = 10;
    const w = new Float32Array(rows * cols).fill(1);
    const { meta } = applyKOTMS(w, rows, cols, 1, 2);
    expect(meta.paddedCols).toBe(16);
    expect(meta.originalCols).toBe(cols);
    expect(meta.blockSizes[0] * meta.blockSizes[1]).toBe(16);
  });

  it('block sizes multiply to paddedCols and both are powers of 2', () => {
    const rows = 1;
    const cols = 1024;
    const w = new Float32Array(rows * cols).fill(0.1);
    const { meta } = applyKOTMS(w, rows, cols, 5, 7);
    const [b1, b2] = meta.blockSizes;
    expect(b1 * b2).toBe(1024);
    expect(Number.isInteger(Math.log2(b1))).toBe(true);
    expect(Number.isInteger(Math.log2(b2))).toBe(true);
  });

  it('round-trips a power-of-2 matrix exactly', () => {
    const rows = 4;
    const cols = 64;
    const original = new Float32Array(rows * cols);
    for (let i = 0; i < original.length; i++) original[i] = Math.sin(i * 0.1);

    const { transformed, meta } = applyKOTMS(original, rows, cols, 111, 222);
    const recovered = inverseKOTMS(transformed, rows, meta);

    expect(recovered.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(recovered[i]).toBeCloseTo(original[i], 4);
    }
  });

  it('round-trips a non-power-of-2 matrix (strips padding)', () => {
    const rows = 2;
    const cols = 12;
    const original = new Float32Array(rows * cols);
    for (let i = 0; i < original.length; i++) original[i] = (i - 5) * 0.3;

    const { transformed, meta } = applyKOTMS(original, rows, cols, 9, 99);
    expect(meta.paddedCols).toBe(16);

    const recovered = inverseKOTMS(transformed, rows, meta);
    expect(recovered.length).toBe(rows * cols);
    for (let i = 0; i < original.length; i++) {
      expect(recovered[i]).toBeCloseTo(original[i], 4);
    }
  });

  it('is deterministic for the same seeds', () => {
    const rows = 2;
    const cols = 16;
    const w = new Float32Array(rows * cols);
    for (let i = 0; i < w.length; i++) w[i] = i * 0.1;
    const a = applyKOTMS(w, rows, cols, 42, 43);
    const b = applyKOTMS(w, rows, cols, 42, 43);
    expect(Array.from(a.transformed)).toEqual(Array.from(b.transformed));
  });

  it('spreads a single outlier across the block', () => {
    const rows = 1;
    const cols = 16;
    const w = new Float32Array(cols);
    w[0] = 1000;
    const { transformed } = applyKOTMS(w, rows, cols, 17, 91);
    const maxVal = Math.max(...Array.from(transformed).map(Math.abs));
    const minVal = Math.min(...Array.from(transformed).map(Math.abs));
    expect(maxVal / (minVal + 1e-8)).toBeLessThan(100);
  });
});
