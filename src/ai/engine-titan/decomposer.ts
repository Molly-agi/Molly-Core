// src/ai/engine-titan/decomposer.ts
export interface DecomposedLayers {
  readonly matrixA: Float32Array;
  readonly matrixB: Float32Array;
}

export class LowRankTensorDecomposer {
  /**
   * Methodically factorizes a sparse matrix into two low-rank matrices (A * B).
   * Employs memory-safe power iteration to run stably within 16GB Codespaces.
   */
  public decomposeMatrix(
    rawWeights: Float32Array,
    rows: number,
    cols: number,
    targetRank: number
  ): DecomposedLayers {
    if (rawWeights.length !== rows * cols) {
      throw new RangeError(
        'Matrix raw dimensions do not align with flat array data capacity.'
      );
    }
    if (targetRank >= Math.min(rows, cols)) {
      throw new Error(
        'Target rank must be smaller than the matrix dimensions.'
      );
    }

    // Allocate memory blocks for our dense low-rank targets
    const matrixA = new Float32Array(rows * targetRank);
    const matrixB = new Float32Array(targetRank * cols);

    // Work on a mutable copy of the weights array to prevent structural data contamination
    const workingResidualMatrix = new Float32Array(rawWeights);

    // Compute the top singular vectors one by one up to our target rank
    for (let r = 0; r < targetRank; r++) {
      const currentVector = new Float32Array(cols);
      currentVector.fill(1.0); // Initialize vector with a baseline uniform distribution

      // Run power iteration loops to isolate the dominant singular vector
      const maxIterations = 10;
      for (let iter = 0; iter < maxIterations; iter++) {
        // Multiply working matrix by currentVector -> store results in a temporary vector
        const nextVector = new Float32Array(rows);

        for (let i = 0; i < rows; i++) {
          let dotProduct = 0.0;
          for (let j = 0; j < cols; j++) {
            dotProduct +=
              workingResidualMatrix[i * cols + j] * currentVector[j];
          }
          nextVector[i] = dotProduct;
        }

        // Project back to currentVector space
        const updatedVector = new Float32Array(cols);
        let norm = 0.0;
        for (let j = 0; j < cols; j++) {
          let dotProduct = 0.0;
          for (let i = 0; i < rows; i++) {
            dotProduct += workingResidualMatrix[i * cols + j] * nextVector[i];
          }
          updatedVector[j] = dotProduct;
          norm += dotProduct * dotProduct;
        }

        // Normalize
        const magnitude = Math.sqrt(norm) || 1.0;
        for (let j = 0; j < cols; j++) {
          currentVector[j] = updatedVector[j] / magnitude;
        }
      }

      // Store singular vector in Matrix B and its projection in Matrix A
      for (let j = 0; j < cols; j++) {
        matrixB[r * cols + j] = currentVector[j];
      }

      for (let i = 0; i < rows; i++) {
        let dotProduct = 0.0;
        for (let j = 0; j < cols; j++) {
          dotProduct += workingResidualMatrix[i * cols + j] * currentVector[j];
        }
        matrixA[i * targetRank + r] = dotProduct;

        // Deflate the residual matrix
        for (let j = 0; j < cols; j++) {
          workingResidualMatrix[i * cols + j] -= dotProduct * currentVector[j];
        }
      }
    }

    return { matrixA, matrixB };
  }
}
