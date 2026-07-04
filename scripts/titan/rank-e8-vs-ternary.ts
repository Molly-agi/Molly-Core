/* eslint-disable */
// scripts/titan/rank-e8-vs-ternary.ts
// John's head-to-head: E8 lattice vs Ternary on same tensors + ranks.
// Reports cosine similarity, relative Frobenius, compression ratio for both.

import { parseGGUF } from '../../src/ai/engine-titan/gguf-ingest';
import { readTensorData } from '../../src/ai/engine-titan/gguf-dequant';
import { LowRankTensorDecomposer } from '../../src/ai/engine-titan/decomposer';
import { TitanStreamQuantizer } from '../../src/ai/engine-titan/stream-quantizer';
import { TitanDecompressionEngine } from '../../src/ai/engine-titan/reconstruction';
import { applyRHT } from '../../src/ai/engine-titan/hadamard-transform';
import {
  quantizeE8,
  dequantizeE8,
  packE8,
} from '../../src/ai/engine-titan/e8-lattice';

const RANKS = [30, 48, 64, 96, 128];

function relativeFrobenius(
  original: Float32Array,
  reconstructed: Float32Array
): number {
  let origNormSq = 0,
    errSq = 0;
  for (let i = 0; i < original.length; i++) {
    origNormSq += original[i] * original[i];
    const d = original[i] - reconstructed[i];
    errSq += d * d;
  }
  if (origNormSq === 0) return 0;
  return Math.sqrt(errSq) / Math.sqrt(origNormSq);
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Reconstruct from SVD + E8 (matrixB quantized with E8 instead of ternary)
function reconstructSvdE8(
  matrixA: Float32Array,
  matrixB: Float32Array,
  rows: number,
  cols: number,
  rank: number
): Float32Array {
  // Quantize matrixB [rank x cols] with E8
  const e8Quantized = quantizeE8(matrixB, 'B', rank, cols);
  const e8Dequant = dequantizeE8(e8Quantized);

  // matmul: A [rows x rank] @ B_dequant [rank x cols] = W [rows x cols]
  const result = new Float32Array(rows * cols);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      let sum = 0;
      for (let k = 0; k < rank; k++) {
        sum += matrixA[i * rank + k] * e8Dequant[k * cols + j];
      }
      result[i * cols + j] = sum;
    }
  }
  return result;
}

async function main() {
  const ggufPath =
    process.argv[2] ||
    '/workspaces/Molly-Core/models/tinyllama-1.1b-q4_k_m.gguf';
  const maxTensors = parseInt(process.argv[3] || '4', 10);

  console.log('=== E8 vs TERNARY HEAD-TO-HEAD ===');
  console.log('GGUF:', ggufPath);
  console.log('Ranks:', RANKS.join(', '));
  console.log('Max tensors:', maxTensors, '\n');

  const gguf = parseGGUF(ggufPath);
  const decomposer = new LowRankTensorDecomposer();
  const quantizer = new TitanStreamQuantizer();
  const decompressor = new TitanDecompressionEngine();

  const candidates = gguf.tensors.filter(
    (t) =>
      t.dimensions.length === 2 &&
      Math.min(t.dimensions[0], t.dimensions[1]) > RANKS[RANKS.length - 1] + 10
  );

  console.log(
    `Found ${candidates.length} candidates (using first ${maxTensors})\n`
  );
  const tensorsToTest = candidates.slice(0, maxTensors);

  for (const tensor of tensorsToTest) {
    const rows = tensor.dimensions[0];
    const cols = tensor.dimensions[1];
    let weights: Float32Array;
    try {
      weights = readTensorData(gguf, tensor);
    } catch (e) {
      console.log(`  SKIP ${tensor.name}: ${(e as Error).message}`);
      continue;
    }

    console.log(`── ${tensor.name} [${rows}x${cols}] ──`);
    console.log(
      `${'Rank'.padEnd(6)} | ${'Ternary Cos'.padEnd(13)} ${'E8 Cos'.padEnd(13)} | ${'Tern RelFrob'.padEnd(13)} ${'E8 RelFrob'.padEnd(13)} | ${'Delta'.padEnd(8)}`
    );
    console.log('-'.repeat(80));

    for (const rank of RANKS) {
      if (rank >= Math.min(rows, cols)) continue;

      // SVD decompose
      const { matrixA, matrixB } = decomposer.decomposeMatrix(
        weights,
        rows,
        cols,
        rank
      );

      // --- TERNARY PATH (with RHT) ---
      const rhtSeed = 0xdeadbeef;
      const { transformed: matrixBRht, meta: rhtMeta } = applyRHT(
        matrixB,
        rank,
        cols,
        rhtSeed
      );
      const header = {
        layerName: tensor.name,
        dimensions: [rank, rhtMeta.paddedCols] as [number, number],
        totalElements: rank * rhtMeta.paddedCols,
      };
      const quantizedB = quantizer.quantizeTensorChunk(header, matrixBRht);
      const ternaryRecon = decompressor.reconstructMatrix({
        matrixA,
        packedB: quantizedB.packedBuffer,
        rows,
        cols,
        targetRank: rank,
        rht: rhtMeta,
      });
      const ternCos = cosineSimilarity(weights, ternaryRecon.weights);
      const ternFrob = relativeFrobenius(weights, ternaryRecon.weights);

      // --- E8 PATH (on raw matrixB, no RHT needed — E8 handles the geometry) ---
      const e8Recon = reconstructSvdE8(matrixA, matrixB, rows, cols, rank);
      const e8Cos = cosineSimilarity(weights, e8Recon);
      const e8Frob = relativeFrobenius(weights, e8Recon);

      const delta = (((e8Cos - ternCos) / ternCos) * 100).toFixed(1);
      const deltaSign = e8Cos > ternCos ? '+' : '';

      console.log(
        `${String(rank).padEnd(6)} | ${ternCos.toFixed(8).padEnd(13)} ${e8Cos.toFixed(8).padEnd(13)} | ` +
          `${ternFrob.toFixed(6).padEnd(13)} ${e8Frob.toFixed(6).padEnd(13)} | ${deltaSign}${delta}%`
      );
    }
    console.log('');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
