import { LowRankTensorDecomposer } from '../decomposer';

const decomposer = new LowRankTensorDecomposer();

function makeMatrix(
  rows: number,
  cols: number,
  fill: number | 'random' = 'random'
): Float32Array {
  const m = new Float32Array(rows * cols);
  for (let i = 0; i < m.length; i++) {
    m[i] = fill === 'random' ? Math.random() * 2 - 1 : fill;
  }
  return m;
}

function matMul(
  A: Float32Array,
  B: Float32Array,
  rows: number,
  rank: number,
  cols: number
): Float32Array {
  const result = new Float32Array(rows * cols);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      let sum = 0;
      for (let k = 0; k < rank; k++) {
        sum += A[i * rank + k] * B[k * cols + j];
      }
      result[i * cols + j] = sum;
    }
  }
  return result;
}

function frobeniusError(
  original: Float32Array,
  reconstructed: Float32Array
): number {
  let sum = 0;
  for (let i = 0; i < original.length; i++) {
    const diff = original[i] - reconstructed[i];
    sum += diff * diff;
  }
  let origNorm = 0;
  for (let i = 0; i < original.length; i++)
    origNorm += original[i] * original[i];
  return Math.sqrt(sum) / (Math.sqrt(origNorm) || 1);
}

describe('LowRankTensorDecomposer', () => {
  it('throws when weight array length does not match rows*cols', () => {
    expect(() =>
      decomposer.decomposeMatrix(new Float32Array(10), 4, 4, 2)
    ).toThrow(RangeError);
  });

  it('throws when targetRank >= min(rows, cols)', () => {
    const m = makeMatrix(4, 4, 1);
    expect(() => decomposer.decomposeMatrix(m, 4, 4, 4)).toThrow();
  });

  it('returns matrixA with shape (rows x rank) and matrixB with shape (rank x cols)', () => {
    const rows = 8,
      cols = 6,
      rank = 2;
    const m = makeMatrix(rows, cols);
    const { matrixA, matrixB } = decomposer.decomposeMatrix(
      m,
      rows,
      cols,
      rank
    );
    expect(matrixA.length).toBe(rows * rank);
    expect(matrixB.length).toBe(rank * cols);
  });

  it('A*B approximates the original matrix (low relative Frobenius error on rank-1 matrix)', () => {
    // A rank-1 matrix decomposes perfectly at rank=1
    const rows = 10,
      cols = 8;
    const u = new Float32Array(rows).map(() => Math.random());
    const v = new Float32Array(cols).map(() => Math.random());
    const rankOneMatrix = new Float32Array(rows * cols);
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) rankOneMatrix[i * cols + j] = u[i] * v[j];

    const { matrixA, matrixB } = decomposer.decomposeMatrix(
      rankOneMatrix,
      rows,
      cols,
      1
    );
    const reconstructed = matMul(matrixA, matrixB, rows, 1, cols);
    expect(frobeniusError(rankOneMatrix, reconstructed)).toBeLessThan(0.01);
  });

  it('higher rank captures more of a random matrix (error decreases with rank)', () => {
    const rows = 12,
      cols = 10;
    const m = makeMatrix(rows, cols);
    const { matrixA: A1, matrixB: B1 } = decomposer.decomposeMatrix(
      m,
      rows,
      cols,
      1
    );
    const { matrixA: A3, matrixB: B3 } = decomposer.decomposeMatrix(
      m,
      rows,
      cols,
      3
    );
    const e1 = frobeniusError(m, matMul(A1, B1, rows, 1, cols));
    const e3 = frobeniusError(m, matMul(A3, B3, rows, 3, cols));
    expect(e3).toBeLessThan(e1);
  });

  it('does not mutate the original weight array', () => {
    const m = makeMatrix(6, 4);
    const snapshot = new Float32Array(m);
    decomposer.decomposeMatrix(m, 6, 4, 2);
    for (let i = 0; i < m.length; i++) {
      expect(m[i]).toBeCloseTo(snapshot[i], 5);
    }
  });
});
