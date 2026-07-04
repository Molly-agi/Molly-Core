/* eslint-disable */
// scripts/titan/rht-e8-integration.ts
// John — T007: Prove RHT preprocessing improves E8 quantization on real weights.
// Compare: raw E8 vs RHT→E8 on same tensors. Report cosine + Frobenius.

import { parseGGUF } from '../../src/ai/engine-titan/gguf-ingest';
import { readTensorData } from '../../src/ai/engine-titan/gguf-dequant';
import {
  applyRHT,
  inverseRHT,
} from '../../src/ai/engine-titan/hadamard-transform';
import { quantizeE8, dequantizeE8 } from '../../src/ai/engine-titan/e8-lattice';

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

function mse(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum / a.length;
}

async function main() {
  const ggufPath =
    process.argv[2] ||
    '/workspaces/Molly-Core/models/tinyllama-1.1b-q4_k_m.gguf';
  const maxTensors = parseInt(process.argv[3] || '6', 10);

  console.log('=== T007: RHT + E8 INTEGRATION TEST ===');
  console.log(
    'Question: Does RHT preprocessing improve E8 lattice quantization?'
  );
  console.log('GGUF:', ggufPath, '\n');

  const gguf = parseGGUF(ggufPath);
  const candidates = gguf.tensors.filter(
    (t) =>
      t.dimensions.length === 2 &&
      t.elementCount >= 256 &&
      t.elementCount <= 2_000_000
  );

  console.log(`Testing ${Math.min(maxTensors, candidates.length)} tensors\n`);
  console.log(
    `${'Tensor'.padEnd(30)} ${'Raw E8 Cos'.padEnd(13)} ${'RHT+E8 Cos'.padEnd(13)} ${'Delta'.padEnd(8)} ${'Raw Frob'.padEnd(10)} ${'RHT Frob'.padEnd(10)}`
  );
  console.log('-'.repeat(85));

  let rawCosSum = 0,
    rhtCosSum = 0,
    count = 0;
  let rawFrobSum = 0,
    rhtFrobSum = 0;

  for (const tensor of candidates.slice(0, maxTensors)) {
    const rows = tensor.dimensions[0];
    const cols = tensor.dimensions[1];
    let weights: Float32Array;
    try {
      weights = readTensorData(gguf, tensor);
    } catch {
      continue;
    }

    // PATH 1: Raw E8 quantization (no preprocessing)
    const rawQuantized = quantizeE8(weights, tensor.name, rows, cols);
    const rawRecon = dequantizeE8(rawQuantized);
    const rawCos = cosineSimilarity(weights, rawRecon);
    const rawFrob = relativeFrobenius(weights, rawRecon);

    // PATH 2: RHT → E8 → inverse RHT
    const rhtSeed = 0xdeadbeef;
    const { transformed: rhtWeights, meta: rhtMeta } = applyRHT(
      weights,
      rows,
      cols,
      rhtSeed
    );
    const rhtQuantized = quantizeE8(
      rhtWeights,
      tensor.name,
      rows,
      rhtMeta.paddedCols
    );
    const rhtRecon = dequantizeE8(rhtQuantized);
    // Inverse RHT to get back to original space
    const rhtRecovered = inverseRHT(rhtRecon, rows, rhtMeta);
    const rhtCos = cosineSimilarity(weights, rhtRecovered);
    const rhtFrob = relativeFrobenius(weights, rhtRecovered);

    const delta = (((rhtCos - rawCos) / rawCos) * 100).toFixed(2);
    const sign = rhtCos > rawCos ? '+' : '';

    console.log(
      `${tensor.name.substring(0, 29).padEnd(30)} ${rawCos.toFixed(8).padEnd(13)} ${rhtCos.toFixed(8).padEnd(13)} ${(sign + delta + '%').padEnd(8)} ${rawFrob.toFixed(6).padEnd(10)} ${rhtFrob.toFixed(6).padEnd(10)}`
    );

    rawCosSum += rawCos;
    rhtCosSum += rhtCos;
    rawFrobSum += rawFrob;
    rhtFrobSum += rhtFrob;
    count++;
  }

  console.log('-'.repeat(85));
  console.log(
    `${'AVERAGE'.padEnd(30)} ${(rawCosSum / count).toFixed(8).padEnd(13)} ${(rhtCosSum / count).toFixed(8).padEnd(13)} ${((((rhtCosSum - rawCosSum) / rawCosSum) * 100).toFixed(2) + '%').padEnd(8)} ${(rawFrobSum / count).toFixed(6).padEnd(10)} ${(rhtFrobSum / count).toFixed(6).padEnd(10)}`
  );

  console.log('\n=== VERDICT ===\n');
  if (rhtCosSum > rawCosSum) {
    console.log('RHT IMPROVES E8 quantization. Add to pipeline.');
    console.log(
      `Average improvement: ${(((rhtCosSum - rawCosSum) / rawCosSum) * 100).toFixed(2)}% cosine`
    );
  } else {
    console.log(
      'RHT does NOT improve E8 quantization. E8 geometry alone is sufficient.'
    );
    console.log(
      `Average difference: ${(((rhtCosSum - rawCosSum) / rawCosSum) * 100).toFixed(2)}% cosine`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
