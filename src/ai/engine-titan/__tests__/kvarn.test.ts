import { applyKVarN, inverseKVarN } from '../kvarn';

describe('kvarn', () => {
  it('returns sigmaRow length = rows and sigmaCol length = cols', () => {
    const rows = 5;
    const cols = 8;
    const kv = new Float32Array(rows * cols).fill(1);
    const { meta } = applyKVarN(kv, rows, cols);
    expect(meta.sigmaRow.length).toBe(rows);
    expect(meta.sigmaCol.length).toBe(cols);
  });

  it('round-trips exactly for a uniform tensor', () => {
    const rows = 4;
    const cols = 6;
    const kv = new Float32Array(rows * cols);
    for (let i = 0; i < kv.length; i++) kv[i] = i * 0.5 - 2;
    const { normalized, meta } = applyKVarN(kv, rows, cols);
    const recovered = inverseKVarN(normalized, meta);
    for (let i = 0; i < kv.length; i++) {
      expect(recovered[i]).toBeCloseTo(kv[i], 4);
    }
  });

  it('normalized tensor has approximately unit row/column RMS', () => {
    const rows = 16;
    const cols = 32;
    const kv = new Float32Array(rows * cols);
    // Inject strong row-1 outliers and column-1 outliers
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        let v = (Math.random() - 0.5) * 0.1;
        if (i === 1) v *= 50; // outlier row
        if (j === 1) v *= 30; // outlier col
        kv[i * cols + j] = v;
      }
    }
    const { normalized } = applyKVarN(kv, rows, cols);

    // Every row RMS should be close to 1
    for (let i = 0; i < rows; i++) {
      let sq = 0;
      for (let j = 0; j < cols; j++) sq += normalized[i * cols + j] ** 2;
      const rms = Math.sqrt(sq / cols);
      expect(rms).toBeGreaterThan(0.1);
      expect(rms).toBeLessThan(10);
    }
  });

  it('reduces the outlier-to-median ratio (bitwidth pressure)', () => {
    const rows = 8;
    const cols = 8;
    const kv = new Float32Array(rows * cols);
    for (let i = 0; i < kv.length; i++) kv[i] = (Math.random() - 0.5) * 0.01;
    // Two dominant outlier tokens
    for (let j = 0; j < cols; j++) kv[0 * cols + j] = 100;
    for (let j = 0; j < cols; j++) kv[1 * cols + j] = -100;

    const rawMax = Math.max(...Array.from(kv).map(Math.abs));
    const { normalized } = applyKVarN(kv, rows, cols);
    const normMax = Math.max(...Array.from(normalized).map(Math.abs));

    // Normalized dynamic range should be far tighter than raw
    expect(normMax).toBeLessThan(rawMax / 10);
  });

  it('handles zero rows/cols without producing NaN', () => {
    const rows = 3;
    const cols = 4;
    const kv = new Float32Array(rows * cols);
    // Row 0 is all zeros, column 2 is all zeros
    for (let i = 1; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        if (j !== 2) kv[i * cols + j] = 1.5;
      }
    }
    const { normalized, meta } = applyKVarN(kv, rows, cols);
    for (let i = 0; i < normalized.length; i++) {
      expect(isFinite(normalized[i])).toBe(true);
    }
    const recovered = inverseKVarN(normalized, meta);
    for (let i = 0; i < kv.length; i++) {
      expect(recovered[i]).toBeCloseTo(kv[i], 4);
    }
  });

  it('throws when input length is wrong', () => {
    const kv = new Float32Array(10);
    expect(() => applyKVarN(kv, 3, 4)).toThrow(RangeError);
  });
});
