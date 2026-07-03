#!/usr/bin/env -S npx tsx
// compression-quality.bench.ts
//
// Rank sweep on real tensors from the 3B GGUF.
// For each rank in [8, 16, 32, 64, 128, 256]:
//   decompose → reconstruct (A × B) → measure quality vs original.
//
// Metrics:
//   - Relative Frobenius error: ||W - Ŵ||_F / ||W||_F
//   - Mean row cosine similarity
//   - Compression ratio: (rank*(rows+cols)) / (rows*cols)
//
// Usage: npx tsx src/ai/engine-titan/__tests__/compression-quality.bench.ts

import { parseGGUF } from '../gguf-ingest';
import { readTensorData, iterateTensors } from '../gguf-dequant';
import { LowRankTensorDecomposer } from '../decomposer';
import {
  TitanStreamQuantizer,
  type TitanTensorHeader,
} from '../stream-quantizer';

const GGUF_PATH =
  process.argv[2] ??
  '/home/codespace/.ollama/models/blobs/sha256-5ee4f07cdb9beadbbb293e85803c569b01bd37ed059d2715faa7bb405f31caa6';

const RANKS = [8, 16, 32, 64, 128, 256];
const MAX_TENSORS = 10; // sample up to 10 weight tensors for speed

function reconstruct(
  A: Float32Array,
  B: Float32Array,
  rows: number,
  cols: number,
  rank: number
): Float32Array {
  const out = new Float32Array(rows * cols);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      let s = 0;
      for (let r = 0; r < rank; r++) {
        s += A[i * rank + r] * B[r * cols + j];
      }
      out[i * cols + j] = s;
    }
  }
  return out;
}

function frobeniusNorm(v: Float32Array): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}

function relativeFrobeniusError(
  original: Float32Array,
  reconstructed: Float32Array
): number {
  const normOrig = frobeniusNorm(original);
  if (normOrig === 0) return 0;
  let errSq = 0;
  for (let i = 0; i < original.length; i++) {
    const d = original[i] - reconstructed[i];
    errSq += d * d;
  }
  return Math.sqrt(errSq) / normOrig;
}

function meanRowCosine(
  original: Float32Array,
  reconstructed: Float32Array,
  rows: number,
  cols: number
): number {
  let totalCos = 0;
  for (let i = 0; i < rows; i++) {
    let dot = 0,
      normA = 0,
      normB = 0;
    const off = i * cols;
    for (let j = 0; j < cols; j++) {
      const a = original[off + j];
      const b = reconstructed[off + j];
      dot += a * b;
      normA += a * a;
      normB += b * b;
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    totalCos += denom > 0 ? dot / denom : 1;
  }
  return totalCos / rows;
}

function compressionRatio(rows: number, cols: number, rank: number): number {
  return (rank * (rows + cols)) / (rows * cols);
}

// Also test with ternary quantization on B (what we actually store)
function reconstructWithTernary(
  A: Float32Array,
  B: Float32Array,
  rows: number,
  cols: number,
  rank: number
): Float32Array {
  const quantizer = new TitanStreamQuantizer();
  const header: TitanTensorHeader = {
    layerName: 'bench',
    dimensions: [rank, cols],
    totalElements: rank * cols,
  };
  const quantized = quantizer.quantizeTensorChunk(header, B);

  // Dequantize: unpack ternary {-1,0,+1} * scale
  const dequantB = new Float32Array(rank * cols);
  const packed = quantized.packedBuffer;
  const scale = quantized.scale;
  // 5 trits per byte, packed as base-3 digits
  let elemIdx = 0;
  for (
    let byteIdx = 4;
    byteIdx < packed.length && elemIdx < rank * cols;
    byteIdx++
  ) {
    let val = packed[byteIdx];
    for (let t = 0; t < 5 && elemIdx < rank * cols; t++) {
      const trit = (val % 3) - 1; // map {0,1,2} → {-1,0,+1}
      dequantB[elemIdx++] = trit * scale;
      val = Math.floor(val / 3);
    }
  }

  return reconstruct(A, dequantB, rows, cols, rank);
}

async function main() {
  console.log(`[bench] Loading GGUF: ${GGUF_PATH}`);
  const gguf = parseGGUF(GGUF_PATH);
  console.log(`[bench] Tensors: ${gguf.header.tensorCount}`);

  const decomposer = new LowRankTensorDecomposer();

  // Collect weight tensors (2D, ≥256 elements, small enough to benchmark quickly)
  const candidates: Array<{
    name: string;
    rows: number;
    cols: number;
    data: Float32Array;
  }> = [];
  const MAX_ELEMENTS = 4_000_000; // cap at 4M elements per tensor for speed

  for (const { tensor, index: _index } of iterateTensors(
    gguf,
    (t) =>
      t.dimensions.length === 2 &&
      t.elementCount >= 256 &&
      t.elementCount <= MAX_ELEMENTS
  )) {
    if (candidates.length >= MAX_TENSORS) break;
    try {
      const data = readTensorData(gguf, tensor);
      candidates.push({
        name: tensor.name,
        rows: tensor.dimensions[0],
        cols: tensor.dimensions[1],
        data,
      });
    } catch {
      continue;
    }
  }

  console.log(
    `[bench] Sampled ${candidates.length} tensors (≤${MAX_ELEMENTS} elements each)\n`
  );

  // Header
  console.log(
    'Rank'.padEnd(6) +
      'FrobErr'.padEnd(10) +
      'FrobErr+Q'.padEnd(12) +
      'CosSim'.padEnd(10) +
      'CosSim+Q'.padEnd(11) +
      'Ratio'.padEnd(8) +
      'Verdict'
  );
  console.log('-'.repeat(67));

  for (const rank of RANKS) {
    let totalFrobErr = 0;
    let totalFrobErrQ = 0;
    let totalCos = 0;
    let totalCosQ = 0;
    let totalRatio = 0;
    let count = 0;

    for (const t of candidates) {
      const minDim = Math.min(t.rows, t.cols);
      if (rank >= minDim) continue; // skip if rank exceeds tensor dimensions

      const { matrixA, matrixB } = decomposer.decomposeMatrix(
        t.data,
        t.rows,
        t.cols,
        rank
      );

      // Raw SVD reconstruction
      const recon = reconstruct(matrixA, matrixB, t.rows, t.cols, rank);
      const fErr = relativeFrobeniusError(t.data, recon);
      const cos = meanRowCosine(t.data, recon, t.rows, t.cols);

      // With ternary quantization on B
      const reconQ = reconstructWithTernary(
        matrixA,
        matrixB,
        t.rows,
        t.cols,
        rank
      );
      const fErrQ = relativeFrobeniusError(t.data, reconQ);
      const cosQ = meanRowCosine(t.data, reconQ, t.rows, t.cols);

      const ratio = compressionRatio(t.rows, t.cols, rank);

      totalFrobErr += fErr;
      totalFrobErrQ += fErrQ;
      totalCos += cos;
      totalCosQ += cosQ;
      totalRatio += ratio;
      count++;
    }

    if (count === 0) {
      console.log(`${String(rank).padEnd(6)}(no tensors fit this rank)`);
      continue;
    }

    const avgFrob = totalFrobErr / count;
    const avgFrobQ = totalFrobErrQ / count;
    const avgCos = totalCos / count;
    const avgCosQ = totalCosQ / count;
    const avgRatio = totalRatio / count;

    let verdict = '';
    if (avgCosQ >= 0.99) verdict = 'EXCELLENT';
    else if (avgCosQ >= 0.95) verdict = 'GOOD';
    else if (avgCosQ >= 0.9) verdict = 'USABLE';
    else verdict = 'LOSSY';

    console.log(
      `${String(rank).padEnd(6)}` +
        `${avgFrob.toFixed(4).padEnd(10)}` +
        `${avgFrobQ.toFixed(4).padEnd(12)}` +
        `${avgCos.toFixed(6).padEnd(10)}` +
        `${avgCosQ.toFixed(6).padEnd(11)}` +
        `${avgRatio.toFixed(4).padEnd(8)}` +
        verdict
    );
  }

  console.log('\n[bench] Legend:');
  console.log(
    '  FrobErr   = ||W - A×B||_F / ||W||_F  (lower = better, 0 = perfect)'
  );
  console.log(
    '  FrobErr+Q = same but B is ternary-quantized (what we actually store)'
  );
  console.log(
    '  CosSim    = mean per-row cosine similarity (higher = better, 1.0 = perfect)'
  );
  console.log('  CosSim+Q  = same with ternary quantization');
  console.log(
    '  Ratio     = compressed_params / original_params (lower = smaller output)'
  );
  console.log(
    '  Verdict   = EXCELLENT (≥0.99) | GOOD (≥0.95) | USABLE (≥0.90) | LOSSY (<0.90)'
  );
}

main().catch((e) => {
  console.error(`[bench] Fatal: ${e.stack ?? e.message}`);
  process.exit(1);
});
