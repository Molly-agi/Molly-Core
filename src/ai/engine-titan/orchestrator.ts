// Copyright (c) 2026 Molly Labs Inc. Licensed under AGPL-3.0.
// src/ai/engine-titan/orchestrator.ts
import { LowRankTensorDecomposer } from './decomposer';
import {
  TitanStreamQuantizer,
  TitanTensorHeader,
  TitanQuantizedLayer,
} from './stream-quantizer';
import {
  TitanDecompressionEngine,
  ReconstructionResult,
} from './reconstruction';
import { CrashSafeVault } from '../agency/memory/vault/crash-safe-vault';

export interface CompressionResult {
  layerName: string;
  rows: number;
  cols: number;
  targetRank: number;
  scaleB: number;
  storedPaths: { matrixA: string; packedB: string; meta: string };
}

export interface LayerMetadata {
  layerName: string;
  rows: number;
  cols: number;
  targetRank: number;
  scaleB?: number;
  compressedAt: number;
  // Hadamard RHT fields — present when matrixB was preprocessed before quantization
  rhtSeed?: number;
  rhtPaddedCols?: number;
  // Which quantizer produced packedB — determines dequantization path
  quantizerType?: 'ternary' | 'e8-lattice' | 'int8-per-row';
  // F1+F6: which compression path produced this crystal. Absent → 'svd-e8'
  // (legacy default). Read path (crystal-inference-layer) dispatches on this
  // to know whether matrixA is expected (svd-*) or not (raw-* / int8-per-row).
  //   svd-e8 / svd-ternary  → A [rows×rank] + B [rank×cols] (or paddedCols)
  //   raw-e8 / raw-e8-rht   → NO A; B [rows×cols] (or paddedCols) is the whole
  //                           weight matrix, quantized directly. matmul is X@B.
  //   int8-per-row          → NO A; B is int8[rows×cols] preceded by per-row
  //                           fp32 scales. matmul is X@(scales·B). For
  //                           embedding/LM head only (F6 exemption).
  compressionPath?:
    | 'svd-e8'
    | 'svd-ternary'
    | 'raw-e8'
    | 'raw-e8-rht'
    | 'int8-per-row';
  /**
   * SHA-256 hex of the source GGUF file this crystal was compressed from.
   * Fable v3 requirement: the loader must verify the source GGUF at inference
   * time matches what was compressed. 1D tensors (norms, biases) come from
   * GGUF at inference time — if the source GGUF drifts between compress and
   * load, those 1D tensors won't match the compressed crystals and the model
   * silently produces garbage. Absent for legacy crystals (back-compat).
   */
  sourceGGUFSha256?: string;
}

export class TitanEngineOrchestrator {
  private decomposer = new LowRankTensorDecomposer();
  private quantizer = new TitanStreamQuantizer();
  private reconstructor = new TitanDecompressionEngine();
  private vault = new CrashSafeVault();

  /**
   * Orchestrates the full weight compression pipeline:
   * 1. Low-Rank Decomposition (SVD via power iteration)
   * 2. Ternary Quantization (1.58-bit) of matrix B
   * 3. Atomic Storage via CrashSafeVault
   */
  public async compressModelLayer(
    layerName: string,
    rawWeights: Float32Array,
    rows: number,
    cols: number,
    targetRank: number,
    storageDir: string
  ): Promise<CompressionResult> {
    // Step 1: Decompose into A (rows×rank) and B (rank×cols)
    const { matrixA, matrixB } = this.decomposer.decomposeMatrix(
      rawWeights,
      rows,
      cols,
      targetRank
    );

    // Step 2: Quantize Matrix B (the dominant features)
    const header: TitanTensorHeader = {
      layerName,
      dimensions: [targetRank, cols],
      totalElements: targetRank * cols,
    };

    const quantizedB: TitanQuantizedLayer = this.quantizer.quantizeTensorChunk(
      header,
      matrixB
    );

    // Step 3: Store both factors atomically
    const paths = {
      matrixA: `${storageDir}/${layerName}.A.f32`,
      packedB: `${storageDir}/${layerName}.B.packed`,
      meta: `${storageDir}/${layerName}.meta.json`,
    };

    const meta: LayerMetadata = {
      layerName,
      rows,
      cols,
      targetRank,
      scaleB: quantizedB.scale,
      compressedAt: Date.now(),
    };

    await this.vault.writeFile(paths.matrixA, Buffer.from(matrixA.buffer), {
      createDirectoryIfMissing: true,
    });
    await this.vault.writeFile(paths.packedB, quantizedB.packedBuffer, {
      createDirectoryIfMissing: true,
    });
    await this.vault.writeFile(
      paths.meta,
      Buffer.from(JSON.stringify(meta, null, 2)),
      { createDirectoryIfMissing: true }
    );

    return {
      layerName,
      rows,
      cols,
      targetRank,
      scaleB: quantizedB.scale,
      storedPaths: paths,
    };
  }

  /**
   * Reconstructs a weight matrix from stored compressed layers.
   * Reads matrixA (raw f32) and packedB (ternary + scale) from disk.
   */
  public async reconstructLayer(
    layerName: string,
    storageDir: string
  ): Promise<ReconstructionResult> {
    const metaPath = `${storageDir}/${layerName}.meta.json`;
    const metaRaw = await import('fs').then((fs) =>
      fs.readFileSync(metaPath, 'utf-8')
    );
    const meta: LayerMetadata = JSON.parse(metaRaw);

    const matrixAPath = `${storageDir}/${layerName}.A.f32`;
    const packedBPath = `${storageDir}/${layerName}.B.packed`;

    const { readFileSync } = await import('fs');
    const matrixABuf = readFileSync(matrixAPath);
    // Node's small-file Buffer pool doesn't guarantee 4-byte alignment; copy into
    // a fresh ArrayBuffer so Float32Array construction is always safe.
    const elementCount = meta.rows * meta.targetRank;
    const alignedBuffer = new ArrayBuffer(elementCount * 4);
    Buffer.from(alignedBuffer).set(matrixABuf.subarray(0, elementCount * 4));
    const matrixA = new Float32Array(alignedBuffer);
    const packedB = readFileSync(packedBPath);

    return this.reconstructor.reconstructMatrix({
      matrixA,
      packedB,
      rows: meta.rows,
      cols: meta.cols,
      targetRank: meta.targetRank,
      rht:
        meta.rhtSeed !== undefined && meta.rhtPaddedCols !== undefined
          ? {
              seed: meta.rhtSeed,
              originalCols: meta.cols,
              paddedCols: meta.rhtPaddedCols,
            }
          : undefined,
    });
  }
}
