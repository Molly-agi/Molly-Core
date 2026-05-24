// src/ai/engine-titan/orchestrator.ts
import { LowRankTensorDecomposer, DecomposedLayers } from "./decomposer";
import { TitanStreamQuantizer, TitanTensorHeader } from "./stream-quantizer";
import { CrashSafeVault } from "../agency/memory/vault/crash-safe-vault";

export class TitanEngineOrchestrator {
  private decomposer = new LowRankTensorDecomposer();
  private quantizer = new TitanStreamQuantizer();
  private vault = new CrashSafeVault();

  /**
   * Orchestrates the full weight compression pipeline:
   * 1. Low-Rank Decomposition (SVD)
   * 2. Ternary Quantization (1.58-bit)
   * 3. Atomic Storage
   */
  public async compressModelLayer(
    layerName: string,
    rawWeights: Float32Array,
    rows: number,
    cols: number,
    targetRank: number,
    storageDir: string
  ): Promise<void> {
    
    console.log(`>> [Titan] Compressing layer: ${layerName} (${rows}x${cols}, rank=${targetRank})`);

    // Step 1: Decompose
    const { matrixA, matrixB } = this.decomposer.decomposeMatrix(rawWeights, rows, cols, targetRank);

    // Step 2: Quantize Matrix B (the dominant features)
    const header: TitanTensorHeader = {
      layerName,
      dimensions: [targetRank, cols],
      totalElements: targetRank * cols
    };
    
    const packedB = this.quantizer.quantizeTensorChunk(header, matrixB);

    // Step 3: Store both factors
    await this.vault.writeFile(`${storageDir}/${layerName}.A.bin`, Buffer.from(matrixA.buffer), { createDirectoryIfMissing: true });
    await this.vault.writeFile(`${storageDir}/${layerName}.B.packed.bin`, packedB, { createDirectoryIfMissing: true });

    console.log(`>> [Titan] Layer ${layerName} compressed and stored.`);
  }
}
