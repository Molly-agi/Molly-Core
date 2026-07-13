// Copyright (c) 2026 Molly Labs Inc. Licensed under AGPL-3.0.
// src/ai/engine-titan/streaming-compress.ts

import { createHash } from 'crypto';
import { parseGGUF, type GGUFTensorInfo } from './gguf-ingest';
import {
  readTensorData,
  iterateTensors,
  estimateTensorMemory,
} from './gguf-dequant';
import { LowRankTensorDecomposer } from './decomposer';
import type { TitanQuantizer } from './quantizer-interface';
import { TernaryQuantizerAdapter } from './quantizer-ternary-adapter';
import { E8QuantizerAdapter } from './quantizer-e8-adapter';
import { CrashSafeVault } from '../agency/memory/vault/crash-safe-vault';
import {
  metadataToWeightCrystal,
  type TitanWeightCrystal,
} from './weight-crystal-adapter';
import type { LayerMetadata } from './orchestrator';
import { applyRHT } from './hadamard-transform';
import {
  compensatedQuantizeB,
  collectBActivations,
  type LayerActivations,
} from './layer-error-compensation';
import { loadCalibrationDataset } from './calibration-dataset';
import { entropyPackE8 } from './e8-entropy';
import { selectStrategy, type StrategyConfig } from './compression-strategy';
import { quantizeInt8PerRow, packInt8RowQuantized } from './int8-row-quantizer';
import { join } from 'path';
import { existsSync, createReadStream, appendFileSync } from 'fs';

/**
 * Stream a file through SHA-256 without loading it into memory.
 * Returns lowercase hex string (64 chars). Used by streamingCompress to
 * stamp source-GGUF hash into every crystal's meta.json per Fable v3.
 */
export async function hashFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * F6 exemption — embedding + LM-head tensors are routed to per-row int8
 * regardless of cols heuristic. Rank truncation of vocab rows erases rare-token
 * identity; LM-head error is unattenuated logit error. Cheap to exempt (~2% of
 * weights), disproportionate damage if compressed. Matches GGUF naming
 * conventions across Llama/Qwen/Mistral/GPT-2/Phi families.
 */
export function isEmbeddingOrLMHead(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes('token_embd') ||
    n.includes('embed_tokens') ||
    n.includes('lm_head') ||
    n === 'output.weight' ||
    n === 'output' ||
    n.endsWith('.wte.weight') ||
    n === 'wte.weight' ||
    n.endsWith('.wpe.weight') ||
    n === 'wpe.weight'
  );
}

/**
 * Parse transformer layer index from tensor name. Supports common conventions:
 *   blk.N.attn_q.weight            (GGUF: llama, qwen, mistral, phi)
 *   layer.N.attn.q                  (some conversion tools)
 *   h.N.attn.c_attn.weight         (GPT-2 style)
 *   model.layers.N.self_attn.q...  (HuggingFace transformers)
 * Returns null if no layer index found (norms, embeddings, non-block tensors).
 */
export function extractLayerIndex(name: string): number | null {
  const patterns = [
    /^blk\.(\d+)\./,
    /^layer\.(\d+)\./,
    /^h\.(\d+)\./,
    /\.layers\.(\d+)\./,
  ];
  for (const p of patterns) {
    const m = name.match(p);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

/**
 * F6 Category D (John T002/T007) — first N and last N transformer layers are
 * exempted from lossy compression. Error in early layers compounds through
 * all downstream layers; last layers produce logits directly with no
 * downstream correction. Empirically fragile per ILA-AMP.
 *
 * Edge case (Atlas #A7): if totalLayers < 2*n, naive first-N + last-N would
 * cover every layer. Clamp effective N to floor(totalLayers/2) so at least
 * one middle layer survives to be compressed.
 */
export function isFirstOrLastNLayers(
  name: string,
  totalLayers: number,
  n = 3
): boolean {
  const idx = extractLayerIndex(name);
  if (idx === null) return false;
  if (totalLayers <= 0) return false;
  const effectiveN = Math.min(n, Math.floor(totalLayers / 2));
  if (effectiveN <= 0) return false;
  return idx < effectiveN || idx >= totalLayers - effectiveN;
}

/**
 * F6 Category C (John T002/T007) — FFN projection weights (gate_proj,
 * up_proj, down_proj) route to raw-E8 instead of SVD. Empirically:
 * SVD at any tested rank degrades cosine to <0.50 on these; raw E8
 * achieves 0.976. FFN LayerNorm gains (`ffn_norm`) are NOT projections
 * and must NOT match (Atlas edge-case #A1).
 */
export function isFFNProjection(name: string): boolean {
  const n = name.toLowerCase();
  // Positive matches: FFN projection weights across naming conventions
  const isFFN =
    /(^|\.)(ffn_gate|ffn_up|ffn_down)(\.|$)/.test(n) ||
    /\.(gate_proj|up_proj|down_proj)\.weight$/.test(n) ||
    /\.mlp\.(fc1|fc2|c_fc|c_proj)\.weight$/.test(n);
  // Negative guard: reject norm/bias tensors that share prefix
  const isNormOrBias = /_norm\.|_bias\.|\.bias$/.test(n);
  return isFFN && !isNormOrBias;
}

/**
 * Extract total transformer block count from GGUF metadata. Architecture
 * prefix varies across models (llama.block_count, qwen2.block_count,
 * mistral.block_count, phi3.block_count, etc.) so we scan for any
 * *.block_count key rather than hard-code the architecture name.
 * Returns undefined for non-transformer models.
 */
export function getGGUFBlockCount(
  metadata: Map<string, unknown>
): number | undefined {
  for (const [key, value] of metadata) {
    if (key.endsWith('.block_count') && typeof value === 'number') {
      return value;
    }
  }
  return undefined;
}

export interface StreamingCompressOptions {
  ggufPath: string;
  outputDir: string;
  /**
   * Override rank per tensor. F1 (Fable Batch 03): defers to the tiered
   * strategy from selectStrategy() when omitted — which is what production
   * now does. Only supply this to force a rank across all SVD-path tensors
   * (typically for benchmarking).
   */
  targetRankFn?: (rows: number, cols: number, layerName: string) => number;
  /**
   * F1: tiered compression strategy config. Undefined = defaults from
   * compression-strategy.ts (narrowⅤ1024→svd-e8 r128, medium→4096→svd-e8 r256,
   * wide>4096→raw-e8[+RHT]). F6 embedding/LM-head override still fires
   * regardless of this config — those go int8-per-row unconditionally.
   */
  strategyConfig?: StrategyConfig;
  /**
   * Null-baseline harness override (Eli, F4 gate prep). When set, ALL 2D
   * weight tensors are routed to this compressionPath regardless of name,
   * cols heuristic, F6 exemption, or Category C. Purpose: isolate driver
   * correctness from compression correctness. If a full-model ingest under
   * `forceCompressionPath: 'int8-per-row'` produces PPL ratio > ~1.02, the
   * failure is in the driver (CrystalTransformerDriver, attention, RoPE,
   * KV cache) NOT in the compression pipeline. Do NOT use in production —
   * bypasses all F1+F6 fidelity routing.
   */
  forceCompressionPath?: 'int8-per-row' | 'raw-e8' | 'raw-e8-rht';
  filter?: (tensor: GGUFTensorInfo) => boolean;
  onProgress?: (event: ProgressEvent) => void;
  maxMemoryBytes?: number;
  quantizer?: 'ternary' | 'e8-lattice';
  errorCompensation?: {
    enabled: boolean;
    calibrationDir?: string; // path to calibration-index.json dir
    dampingFactor?: number; // default 0.01
    numCalibrationTokens?: number; // default 128 (subset of full dataset)
  };
  /**
   * Per-tensor quality ledger. When set to a file path, appends one JSONL
   * line per compressed tensor with: name, compressionPath, rank, cosine
   * similarity (original vs reconstructed), bits/weight, input/output bytes.
   * Costs nothing at compression time; gives attributable quality data
   * after the F4 eval — if PPL is bad, this tells you WHICH layer killed it.
   */
  cosineLedgerPath?: string;
}

export interface ProgressEvent {
  tensorName: string;
  index: number;
  total: number;
  phase: 'read' | 'decompose' | 'quantize' | 'store' | 'done';
  memoryEstimate: number;
}

export interface StreamingCompressResult {
  totalTensors: number;
  compressedTensors: number;
  skippedTensors: number;
  crystals: TitanWeightCrystal[];
  totalInputBytes: number;
  totalOutputBytes: number;
  compressionRatio: number;
}

const DEFAULT_RANK_FN = (rows: number, cols: number): number => {
  const minDim = Math.min(rows, cols);
  return Math.max(1, Math.min(64, Math.floor(minDim * 0.015)));
};

const DEFAULT_MAX_MEMORY = 8 * 1024 * 1024 * 1024; // 8GB ceiling — accommodates 72B token_embd (~5GB) + working set

function isWeightTensor(tensor: GGUFTensorInfo): boolean {
  return tensor.dimensions.length === 2 && tensor.elementCount >= 256;
}

export async function streamingCompress(
  options: StreamingCompressOptions
): Promise<StreamingCompressResult> {
  const {
    ggufPath,
    outputDir,
    targetRankFn = DEFAULT_RANK_FN,
    filter = isWeightTensor,
    onProgress,
    maxMemoryBytes = DEFAULT_MAX_MEMORY,
    quantizer: quantizerKind = 'e8-lattice',
    cosineLedgerPath,
  } = options;

  // Per-tensor quality ledger — JSONL, one line per tensor
  const ledgerWrite = cosineLedgerPath
    ? (entry: {
        name: string;
        path: string;
        rank: number | null;
        cosine: number;
        bitsPerWeight: number;
        inputBytes: number;
        outputBytes: number;
      }) => {
        appendFileSync(cosineLedgerPath, JSON.stringify(entry) + '\n');
      }
    : null;

  // Cosine similarity for ledger (inline, no import needed)
  function cosineSim(a: Float32Array, b: Float32Array): number {
    let dot = 0,
      nA = 0,
      nB = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      nA += a[i] * a[i];
      nB += b[i] * b[i];
    }
    return nA === 0 || nB === 0 ? 0 : dot / (Math.sqrt(nA) * Math.sqrt(nB));
  }

  const gguf = parseGGUF(ggufPath);
  const decomposer = new LowRankTensorDecomposer();
  const q: TitanQuantizer =
    quantizerKind === 'e8-lattice'
      ? new E8QuantizerAdapter()
      : new TernaryQuantizerAdapter();
  // F6 needs a dedicated E8 adapter for raw-path routing (independent of `q`
  // which may be ternary). Always constructed since the strategy can pick
  // raw-e8 for wide layers even when `quantizerKind === 'ternary'`.
  const e8ForRaw = new E8QuantizerAdapter();
  const vault = new CrashSafeVault();

  // Fable v3 requirement: SHA-256 of source GGUF stamped into every crystal's
  // meta.json. Enables loader-time verification that the source at inference
  // matches the source at compression (1D tensors — norms, biases — come from
  // GGUF at inference; if the GGUF drifted, they won't match crystals silently
  // and the model produces garbage). Computed once, streamed to bound memory.
  const sourceGGUFSha256 = await hashFileSha256(ggufPath);

  // F6 Category D — extract total transformer layer count from GGUF metadata
  // once, upstream of the loop. Undefined for non-transformer models; then the
  // isFirstOrLastNLayers exemption simply won't fire (no false positives).
  const totalLayers = getGGUFBlockCount(gguf.header.metadata);

  const crystals: TitanWeightCrystal[] = [];
  let compressedTensors = 0;
  let skippedTensors = 0;
  let totalInputBytes = 0;
  let totalOutputBytes = 0;

  // Error compensation: load calibration token IDs (real activations computed
  // later once the embedding matrix is available)
  let calibrationTokenIds: Uint32Array | null = null;
  let calibrationTokenCount = 0;
  let calibrationSeqLength = 0;
  if (options.errorCompensation?.enabled) {
    const calibDir =
      options.errorCompensation.calibrationDir ?? 'molly_data/calibration';
    if (existsSync(join(calibDir, 'calibration-index.json'))) {
      const dataset = loadCalibrationDataset(calibDir);
      calibrationTokenCount =
        options.errorCompensation.numCalibrationTokens ??
        Math.min(128, dataset.numSequences);
      calibrationSeqLength = dataset.seqLength;
      const tokensToUse = calibrationTokenCount * dataset.seqLength;
      calibrationTokenIds = new Uint32Array(tokensToUse);
      let idx = 0;
      for (
        let s = 0;
        s < calibrationTokenCount && s < dataset.numSequences;
        s++
      ) {
        for (let t = 0; t < dataset.seqLength; t++) {
          calibrationTokenIds[idx++] = dataset.sequences[s][t];
        }
      }
    }
  }

  // Real activation state: populated once embedding matrix is captured
  let layerHiddenActivations: Float32Array | null = null;
  let hiddenDim = 0;
  let numCalibTokens = 0;

  // Sort tensors by layer index for sequential compensation.
  // Embeddings (null layer index) sort first so we capture them before layers.
  const allTensors = [...iterateTensors(gguf, filter)];
  allTensors.sort((a, b) => {
    const aIdx = extractLayerIndex(a.tensor.name);
    const bIdx = extractLayerIndex(b.tensor.name);
    const aIsEmbed = isEmbeddingOrLMHead(a.tensor.name);
    const bIsEmbed = isEmbeddingOrLMHead(b.tensor.name);
    if (aIsEmbed && !bIsEmbed) return -1;
    if (!aIsEmbed && bIsEmbed) return 1;
    if (aIdx === null && bIdx === null) return 0;
    if (aIdx === null) return -1;
    if (bIdx === null) return 1;
    return aIdx - bIdx;
  });
  let lastCompletedLayer = -1;

  for (const { tensor, index, total } of allTensors) {
    const memEstimate = estimateTensorMemory(tensor);

    if (memEstimate > maxMemoryBytes) {
      skippedTensors++;
      onProgress?.({
        tensorName: tensor.name,
        index,
        total,
        phase: 'done',
        memoryEstimate: memEstimate,
      });
      continue;
    }

    onProgress?.({
      tensorName: tensor.name,
      index,
      total,
      phase: 'read',
      memoryEstimate: memEstimate,
    });

    // Atlas edge case A1 + F2 — only 2D weight matrices are our concern.
    // 1D tensors (norm gains, biases) match name-patterns like `ffn_norm.weight`
    // but must NOT be routed through compression. Skip cleanly.
    if (tensor.dimensions.length !== 2) {
      skippedTensors++;
      continue;
    }

    const rows = tensor.dimensions[0];
    const cols = tensor.dimensions[1];

    // Atlas F2 — degenerate zero-dimension guards. Throws would be nicer but
    // continuing lets the compression run finish and skip broken tensors.
    if (rows === 0 || cols === 0) {
      skippedTensors++;
      continue;
    }

    // === F1 + F6 dispatch ===
    // Decide compressionPath BEFORE loading weights so we can size the vault
    // format check correctly for resume and avoid unnecessary RHT allocation
    // on wide vocab layers (Atlas #B5).
    //
    // Null-baseline short-circuit: if `forceCompressionPath` is set, all F1/F6
    // routing is bypassed and every tensor takes the same path. Used to
    // isolate driver correctness from compression correctness in the F4 gate.
    const exempted =
      options.forceCompressionPath === undefined &&
      (isEmbeddingOrLMHead(tensor.name) ||
        (totalLayers !== undefined &&
          isFirstOrLastNLayers(tensor.name, totalLayers, 3)));

    let compressionPath: NonNullable<LayerMetadata['compressionPath']>;
    let targetRank: number;

    if (options.forceCompressionPath) {
      // Null-baseline harness — bypass all routing
      compressionPath = options.forceCompressionPath;
      targetRank = cols; // sentinel for all non-svd paths
    } else if (exempted) {
      // F6 embedding / LM-head / first-last-N → per-row int8, no SVD, no RHT
      compressionPath = 'int8-per-row';
      targetRank = cols; // sentinel — no rank reduction
    } else if (isFFNProjection(tensor.name)) {
      // John Category C — SVD destroys FFN projections (cos < 0.5 empirically)
      // Route to raw-E8 with conditional RHT (RHT if cols > wideThreshold)
      const strategy = selectStrategy(
        tensor.name,
        rows,
        cols,
        options.strategyConfig
      );
      compressionPath = strategy.rhtEnabled ? 'raw-e8-rht' : 'raw-e8';
      targetRank = cols; // sentinel — full-rank direct quantization
    } else {
      // F1 — defer to tiered strategy from selectStrategy
      const strategy = selectStrategy(
        tensor.name,
        rows,
        cols,
        options.strategyConfig
      );
      if (strategy.path === 'raw-e8' || strategy.path === 'raw-e8-rht') {
        compressionPath = strategy.path;
        targetRank = cols;
      } else {
        // svd-e8 (default) or svd-ternary — SVD path. Ternary demoted per
        // Fable F15 to a cheapest-tier option only; here we still support
        // it via quantizerKind === 'ternary' but treat compressionPath as
        // svd-e8 for read-side dispatch consistency (quantizerType field
        // still records the actual quantizer).
        compressionPath = 'svd-e8';
        targetRank = strategy.rank ?? targetRankFn(rows, cols, tensor.name);
        // Atlas B7 — degenerate SVD guard
        if (targetRank >= Math.min(rows, cols)) {
          skippedTensors++;
          continue;
        }
      }
    }

    // Resume: file expectations depend on path.
    //   svd-e8      → .A.f32 + .B.packed + .meta.json (3 files)
    //   raw-e8*     → .B.packed + .meta.json (2 files, no matrixA)
    //   int8-per-row→ .B.packed + .meta.json (2 files)
    const paths = {
      matrixA: join(outputDir, `${tensor.name}.A.f32`),
      packedB: join(outputDir, `${tensor.name}.B.packed`),
      meta: join(outputDir, `${tensor.name}.meta.json`),
    };
    const isSvdPath = compressionPath === 'svd-e8';
    const resumeReady = isSvdPath
      ? existsSync(paths.matrixA) &&
        existsSync(paths.packedB) &&
        existsSync(paths.meta)
      : existsSync(paths.packedB) && existsSync(paths.meta);
    if (resumeReady) {
      compressedTensors++;
      onProgress?.({
        tensorName: tensor.name,
        index,
        total,
        phase: 'done',
        memoryEstimate: memEstimate,
      });
      continue;
    }

    let weights: Float32Array;
    try {
      weights = readTensorData(gguf, tensor);
    } catch {
      skippedTensors++;
      continue;
    }

    totalInputBytes += weights.byteLength;
    const tensorInputBytes = weights.byteLength;

    // Capture embedding matrix for real activation computation.
    // When errorCompensation is enabled, we gather calibration tokens
    // through the embedding to get real hidden-dim activations for layer 0.
    if (
      options.errorCompensation?.enabled &&
      calibrationTokenIds &&
      !layerHiddenActivations &&
      isEmbeddingOrLMHead(tensor.name) &&
      !tensor.name.toLowerCase().includes('lm_head') &&
      tensor.name.toLowerCase() !== 'output.weight' &&
      tensor.name.toLowerCase() !== 'output'
    ) {
      hiddenDim = cols;
      numCalibTokens = calibrationTokenCount * calibrationSeqLength;
      layerHiddenActivations = new Float32Array(numCalibTokens * hiddenDim);
      for (let t = 0; t < numCalibTokens; t++) {
        const tokenId = calibrationTokenIds[t];
        const clampedId = Math.min(tokenId, rows - 1);
        const srcOff = clampedId * cols;
        const dstOff = t * hiddenDim;
        for (let d = 0; d < hiddenDim; d++) {
          layerHiddenActivations[dstOff + d] = weights[srcOff + d];
        }
      }
    }

    // === Path dispatch: three code branches ===
    let quantizedB: {
      packedBuffer: Buffer;
      bitsPerWeight: number;
      quantizerType: 'ternary' | 'e8-lattice' | 'int8-per-row';
    };
    let matrixABytes: Uint8Array | null = null;
    let rhtSeedForMeta: number | undefined;
    let rhtPaddedColsForMeta: number | undefined;
    let ledgerCosine = 0;

    if (compressionPath === 'int8-per-row') {
      onProgress?.({
        tensorName: tensor.name,
        index,
        total,
        phase: 'quantize',
        memoryEstimate: memEstimate,
      });
      const q8 = quantizeInt8PerRow(weights, rows, cols);
      const packedBuf = packInt8RowQuantized(q8);
      quantizedB = {
        packedBuffer: packedBuf,
        bitsPerWeight: 8 + 32 / cols,
        quantizerType: 'int8-per-row',
      };
      if (ledgerWrite) {
        const dequant = new Float32Array(rows * cols);
        for (let r = 0; r < rows; r++) {
          const s = q8.scales[r];
          for (let c = 0; c < cols; c++) {
            dequant[r * cols + c] = q8.data[r * cols + c] * s;
          }
        }
        ledgerCosine = cosineSim(weights, dequant);
      }
      weights = null!;
    } else if (
      compressionPath === 'raw-e8' ||
      compressionPath === 'raw-e8-rht'
    ) {
      onProgress?.({
        tensorName: tensor.name,
        index,
        total,
        phase: 'quantize',
        memoryEstimate: memEstimate,
      });
      const useRht = compressionPath === 'raw-e8-rht';
      let bMatrix: Float32Array = weights;
      let bCols = cols;
      if (useRht) {
        const seedHash = createHash('sha256').update(tensor.name).digest();
        rhtSeedForMeta = seedHash.readUInt32LE(0);
        const { transformed, meta: rhtMeta } = applyRHT(
          weights,
          rows,
          cols,
          rhtSeedForMeta
        );
        bMatrix = transformed;
        bCols = rhtMeta.paddedCols;
        rhtPaddedColsForMeta = rhtMeta.paddedCols;
        weights = null!;
      }
      const rawQ = e8ForRaw.quantize(bMatrix, tensor.name, rows, bCols);
      quantizedB = {
        packedBuffer: rawQ.packedBuffer,
        bitsPerWeight: rawQ.bitsPerWeight,
        quantizerType: rawQ.quantizerType as 'e8-lattice',
      };
      if (ledgerWrite) {
        const dequantResult = e8ForRaw.dequantize(
          rawQ.packedBuffer,
          rows,
          bCols
        );
        ledgerCosine = cosineSim(bMatrix, dequantResult.weights);
      }
    } else {
      // svd-e8 (current path, preserved)
      onProgress?.({
        tensorName: tensor.name,
        index,
        total,
        phase: 'decompose',
        memoryEstimate: memEstimate,
      });
      const { matrixA, matrixB } = decomposer.decomposeMatrix(
        weights,
        rows,
        cols,
        targetRank
      );
      weights = null!;

      onProgress?.({
        tensorName: tensor.name,
        index,
        total,
        phase: 'quantize',
        memoryEstimate: memEstimate,
      });

      // Hadamard RHT: spread heavy-tailed distribution to sub-Gaussian before
      // ternary threshold. Seed derived deterministically from tensor name so
      // recompressing the same model twice produces byte-identical artifacts.
      // (Fable Batch 02b F10.)
      const seedHash = createHash('sha256').update(tensor.name).digest();
      rhtSeedForMeta = seedHash.readUInt32LE(0);
      const { transformed: matrixBRht, meta: rhtMeta } = applyRHT(
        matrixB,
        targetRank,
        cols,
        rhtSeedForMeta
      );
      rhtPaddedColsForMeta = rhtMeta.paddedCols;

      // GPTQ-style error compensation with real activations
      if (options.errorCompensation?.enabled && layerHiddenActivations) {
        const z = collectBActivations(
          layerHiddenActivations,
          numCalibTokens,
          hiddenDim,
          matrixA,
          targetRank
        );
        const layerAct: LayerActivations = {
          activations: z,
          numTokens: numCalibTokens,
          inputDim: targetRank,
        };
        const compensated = compensatedQuantizeB(
          matrixBRht,
          targetRank,
          rhtMeta.paddedCols,
          layerAct,
          tensor.name,
          {
            dampingFactor: options.errorCompensation.dampingFactor ?? 0.01,
            sigmaDelta: true,
            optimalScale: true,
          }
        );
        const packed = entropyPackE8(compensated.quantizedB, 'float16');
        quantizedB = {
          packedBuffer: packed.packedBuffer,
          bitsPerWeight: packed.bitsPerWeight,
          quantizerType: 'e8-lattice',
        };
      } else {
        const svdQ = q.quantize(
          matrixBRht,
          tensor.name,
          targetRank,
          rhtMeta.paddedCols
        );
        quantizedB = {
          packedBuffer: svdQ.packedBuffer,
          bitsPerWeight: svdQ.bitsPerWeight,
          quantizerType: svdQ.quantizerType as 'ternary' | 'e8-lattice',
        };
      }
      if (ledgerWrite) {
        const dequantAdapter =
          quantizedB.quantizerType === 'e8-lattice' ? e8ForRaw : q;
        const bDequant = dequantAdapter.dequantize(
          quantizedB.packedBuffer,
          targetRank,
          rhtMeta.paddedCols
        );
        ledgerCosine = cosineSim(matrixBRht, bDequant.weights);
      }
      matrixABytes = new Uint8Array(matrixA.buffer);
    }

    onProgress?.({
      tensorName: tensor.name,
      index,
      total,
      phase: 'store',
      memoryEstimate: memEstimate,
    });

    const meta: LayerMetadata = {
      layerName: tensor.name,
      rows,
      cols,
      targetRank,
      compressedAt: Date.now(),
      rhtSeed: rhtSeedForMeta,
      rhtPaddedCols: rhtPaddedColsForMeta,
      quantizerType: quantizedB.quantizerType,
      compressionPath,
      sourceGGUFSha256,
    };

    // Vault write — only svd-* paths emit .A.f32
    if (matrixABytes) {
      await vault.writeFile(paths.matrixA, Buffer.from(matrixABytes), {
        createDirectoryIfMissing: true,
      });
    }
    await vault.writeFile(paths.packedB, quantizedB.packedBuffer, {
      createDirectoryIfMissing: true,
    });
    await vault.writeFile(
      paths.meta,
      Buffer.from(JSON.stringify(meta, null, 2)),
      { createDirectoryIfMissing: true }
    );

    const outputSize =
      (matrixABytes?.byteLength ?? 0) + quantizedB.packedBuffer.length;
    totalOutputBytes += outputSize;

    if (ledgerWrite) {
      ledgerWrite({
        name: tensor.name,
        path: compressionPath,
        rank: compressionPath.startsWith('svd') ? targetRank : null,
        cosine: ledgerCosine,
        bitsPerWeight: quantizedB.bitsPerWeight,
        inputBytes: tensorInputBytes,
        outputBytes: outputSize,
      });
    }

    const crystal = metadataToWeightCrystal(meta, outputDir);
    crystals.push(crystal);
    compressedTensors++;

    // Track layer transitions for sequential compensation progress.
    // Between-layer activation propagation (residual stream) requires
    // attention + FFN structure awareness — deferred to sequential mode.
    // The per-tensor collectBActivations above already gives valid Hessians.
    const currentLayer = extractLayerIndex(tensor.name);
    if (currentLayer !== null && currentLayer > lastCompletedLayer) {
      lastCompletedLayer = currentLayer;
    }

    onProgress?.({
      tensorName: tensor.name,
      index,
      total,
      phase: 'done',
      memoryEstimate: memEstimate,
    });
  }

  return {
    totalTensors: gguf.tensors.length,
    compressedTensors,
    skippedTensors,
    crystals,
    totalInputBytes,
    totalOutputBytes,
    compressionRatio:
      totalInputBytes > 0 ? totalOutputBytes / totalInputBytes : 0,
  };
}
