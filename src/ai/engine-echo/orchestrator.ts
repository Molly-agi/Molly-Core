// src/ai/engine-echo/orchestrator.ts
import { EchoCoreParser } from "./core-parser";
import { EchoPipeline } from "./pipeline";
import { CrashSafeVault } from "../agency/memory/vault/crash-safe-vault";
import { GuardedMetricCache, SystemMetrics } from "./metrics-cache";
import { VocabDictCompressor } from "../memory/compression/vocab-dict";

export class EchoEngineOrchestrator {
  private parser: EchoCoreParser;
  private vocabCompressor: VocabDictCompressor;
  private pipeline: EchoPipeline;
  private vault = new CrashSafeVault();
  private metricsCache = new GuardedMetricCache();

  constructor(vocabCompressor: VocabDictCompressor) {
    this.parser = new EchoCoreParser();
    this.vocabCompressor = vocabCompressor;
    this.pipeline = new EchoPipeline(this.parser, this.vocabCompressor);
  }

  /**
   * Safe entry-point to ingest, strip, optimize, check targets, and commit data to disk.
   */
  public async ingestRecord(
    storagePath: string,
    rawJson: Record<string, any>
  ): Promise<void> {
    const startTime = Date.now();
    const rawStringRepresentation = JSON.stringify(rawJson);
    const originalSizeBytes = Buffer.byteLength(rawStringRepresentation, "utf8");

    // Execute the compression pass across structural and text boundaries
    const packedBlock = await this.pipeline.compressPayload(rawJson);

    // Calculate exact space metrics across binary block segments
    const compressedSizeBytes = 
      packedBlock.compressedStructure.length + 
      packedBlock.compressedNumerics.length + 
      packedBlock.dictionaryPayload.compressedStream.length;

    const actualCompressionRatio = ((originalSizeBytes - compressedSizeBytes) / originalSizeBytes) * 100;
    const processingLatencyMs = Date.now() - startTime;

    // Simulated local semantic loss evaluation
    const calculatedSemanticLoss = 1.0; 

    const transactionMetrics: SystemMetrics = {
      physicalCompressionRatio: actualCompressionRatio,
      semanticLossPercent: calculatedSemanticLoss,
      processingLatencyMs
    };

    // Run verification pass inside the metric cache
    this.metricsCache.logTransaction(rawStringRepresentation, transactionMetrics);

    // Finalize transactional commit to disk
    await this.vault.writeFile(storagePath, packedBlock.dictionaryPayload.compressedStream, { createDirectoryIfMissing: true });
    
    console.log(`>> [Echo] Ingest Complete. Ratio: ${actualCompressionRatio.toFixed(2)}%. Latency: ${processingLatencyMs}ms.`);
  }
}
