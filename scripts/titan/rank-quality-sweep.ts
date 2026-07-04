// scripts/titan/rank-quality-sweep.ts
// John's rank quality sweep: test ranks 30/48/64/96/128 on real weight tensors.
// Reports Frobenius norm error and cosine similarity for each rank.

import { parseGGUF } from '../../src/ai/engine-titan/gguf-ingest';
import { readTensorData } from '../../src/ai/engine-titan/gguf-dequant';
import { LowRankTensorDecomposer } from '../../src/ai/engine-titan/decomposer';
import { TitanStreamQuantizer } from '../../src/ai/engine-titan/stream-quantizer';
import { TitanDecompressionEngine } from '../../src/ai/engine-titan/reconstruction';
import { applyRHT } from '../../src/ai/engine-titan/hadamard-transform';

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

function psnr(original: Float32Array, reconstructed: Float32Array): number {
  let maxVal = 0,
    mse = 0;
  for (let i = 0; i < original.length; i++) {
    const a = Math.abs(original[i]);
    if (a > maxVal) maxVal = a;
    const d = original[i] - reconstructed[i];
    mse += d * d;
  }
  mse /= original.length;
  if (mse === 0) return Infinity;
  return 10 * Math.log10((maxVal * maxVal) / mse);
}

interface SweepResult {
  layerName: string;
  rows: number;
  cols: number;
  rank: number;
  relativeFrob: number;
  cosine: number;
  psnrDb: number;
  compressionRatio: number;
}

async function main() {
  const ggufPath =
    process.argv[2] ||
    '/workspaces/Molly-Core/models/tinyllama-1.1b-q4_k_m.gguf';
  const maxTensors = parseInt(process.argv[3] || '6', 10);

  console.log('=== RANK QUALITY SWEEP ===');
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

  if (candidates.length === 0) {
    console.error('No suitable tensors found (need min dim > 138)');
    process.exit(1);
  }

  console.log(
    `Found ${candidates.length} candidate tensors (using first ${maxTensors})\n`
  );
  const results: SweepResult[] = [];
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
      `${'Rank'.padEnd(6)} ${'RelFrob'.padEnd(10)} ${'Cosine'.padEnd(12)} ${'PSNR(dB)'.padEnd(10)} ${'Ratio'.padEnd(8)}`
    );
    console.log('-'.repeat(50));

    for (const rank of RANKS) {
      if (rank >= Math.min(rows, cols)) {
        console.log(
          `  rank ${rank}: SKIP (>= min dim ${Math.min(rows, cols)})`
        );
        continue;
      }

      const { matrixA, matrixB } = decomposer.decomposeMatrix(
        weights,
        rows,
        cols,
        rank
      );
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

      const reconstructed = decompressor.reconstructMatrix({
        matrixA,
        packedB: quantizedB.packedBuffer,
        rows,
        cols,
        targetRank: rank,
        rht: rhtMeta,
      });

      const relFrob = relativeFrobenius(weights, reconstructed.weights);
      const cosine = cosineSimilarity(weights, reconstructed.weights);
      const psnrVal = psnr(weights, reconstructed.weights);
      const originalBytes = weights.byteLength;
      const compressedBytes =
        matrixA.byteLength + quantizedB.packedBuffer.length;
      const ratio = originalBytes / compressedBytes;

      results.push({
        layerName: tensor.name,
        rows,
        cols,
        rank,
        relativeFrob: relFrob,
        cosine,
        psnrDb: psnrVal,
        compressionRatio: ratio,
      });

      console.log(
        `${String(rank).padEnd(6)} ${relFrob.toFixed(6).padEnd(10)} ${cosine.toFixed(8).padEnd(12)} ${(psnrVal === Infinity ? 'Inf' : psnrVal.toFixed(2)).padEnd(10)} ${(ratio.toFixed(2) + 'x').padEnd(8)}`
      );
    }
    console.log('');
  }

  console.log('=== SUMMARY: AVERAGE ACROSS ALL TENSORS ===\n');
  console.log(
    `${'Rank'.padEnd(6)} ${'Avg RelFrob'.padEnd(14)} ${'Avg Cosine'.padEnd(14)} ${'Avg PSNR'.padEnd(12)} ${'Avg Ratio'.padEnd(10)}`
  );
  console.log('-'.repeat(56));

  for (const rank of RANKS) {
    const forRank = results.filter((r) => r.rank === rank);
    if (forRank.length === 0) continue;
    const avgFrob =
      forRank.reduce((s, r) => s + r.relativeFrob, 0) / forRank.length;
    const avgCos = forRank.reduce((s, r) => s + r.cosine, 0) / forRank.length;
    const avgPsnr = forRank.reduce((s, r) => s + r.psnrDb, 0) / forRank.length;
    const avgRatio =
      forRank.reduce((s, r) => s + r.compressionRatio, 0) / forRank.length;
    console.log(
      `${String(rank).padEnd(6)} ${avgFrob.toFixed(6).padEnd(14)} ${avgCos.toFixed(8).padEnd(14)} ${avgPsnr.toFixed(2).padEnd(12)} ${(avgRatio.toFixed(2) + 'x').padEnd(10)}`
    );
  }

  console.log('\n=== EDGE CASES ===\n');
  const worst = results.reduce(
    (w, r) => (r.cosine < w.cosine ? r : w),
    results[0]
  );
  console.log(
    `Worst cosine: ${worst.layerName} rank=${worst.rank} cos=${worst.cosine.toFixed(8)} relFrob=${worst.relativeFrob.toFixed(6)}`
  );

  const cliffLayers = results.filter((r) => r.cosine < 0.9);
  if (cliffLayers.length > 0) {
    console.log(
      `\nCLIFF ALERT: ${cliffLayers.length} results below 0.9 cosine:`
    );
    for (const r of cliffLayers)
      console.log(
        `   ${r.layerName} rank=${r.rank} cos=${r.cosine.toFixed(6)}`
      );
  } else {
    console.log('No cliff detected (all results above 0.9 cosine).');
  }

  const viable = results.filter((r) => r.cosine > 0.95);
  if (viable.length > 0) {
    const sweetSpot = viable.reduce(
      (best, r) => (r.compressionRatio > best.compressionRatio ? r : best),
      viable[0]
    );
    console.log(
      `\nSweet spot (cos>0.95, best ratio): rank=${sweetSpot.rank} ratio=${sweetSpot.compressionRatio.toFixed(2)}x cos=${sweetSpot.cosine.toFixed(8)}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
