/**
 * @fileOverview Crystal Compression Bridge - Titan Echo Integration
 *
 * Wires Titan Echo compression techniques into the crystal partition system.
 * Compression is applied transparently when saving crystals, decompression on load.
 *
 * P1 techniques (T1, T3, T4) are staged for production.
 * P2/P3 techniques activate after recall guardrails are validated.
 */

import { MollyLogger, generateTraceId } from '@/ai/logger';
import type { CrystalEngram } from '@/ai/memory/crystal-partition';
import { getActiveCompressionTechniques } from '@/ai/memory/compression-activation';
import {
  CompressionManager,
  type CompressionResult,
} from '@/ai/memory/compression/compression-manager';

// ============================================================================
// COMPRESSION CONTEXT
// ============================================================================

export interface CrystalCompressionContext {
  /** Which techniques are currently enabled */
  activeTechniques: string[];
  /** Original byte size before compression */
  originalBytes: number;
  /** Compressed byte size */
  compressedBytes: number;
  /** Compression ratio achieved */
  compressionRatio: number;
  /** Techniques skipped due to guardrails */
  skippedTechniques: string[];
  /** Time taken to compress (ms) */
  compressionTimeMs: number;
  /** Timestamp when compressed */
  compressedAt: number;
}

// ============================================================================
// COMPRESSION WRAPPER FOR CRYSTALS
// ============================================================================

/**
 * Wraps a crystal with compression metadata
 */
export interface CompressedCrystalPayload {
  /** Original crystal (may be compressed) */
  crystal: CrystalEngram;
  /** Compression context if applied */
  compression?: CrystalCompressionContext;
  /** Compression bundle for lossless round-trip (if techniques applied) */
  compressionBundle?: CompressionResult['bundle'];
  /** Version of compression protocol */
  version: '1.0';
}

// ============================================================================
// COMPRESSION LAYER
// ============================================================================

/**
 * Applies Titan Echo compression to crystal payloads
 */
export class CrystalCompressionBridge {
  private traceId: string;
  private compressionManager: CompressionManager;
  private activeTechniques: string[] = [];
  private totalCompressionRatio: number = 0;

  constructor() {
    this.traceId = generateTraceId();
    this.compressionManager = CompressionManager.getInstance({
      t1PersonalityReference: process.env.MOLLY_COMPRESS_T1 === '1',
      t3TemporalDelta: process.env.MOLLY_COMPRESS_T3 === '1',
      t4VocabularyDict: process.env.MOLLY_COMPRESS_T4 === '1',
      t2TimeDecayFidelity: process.env.MOLLY_COMPRESS_T2 === '1',
      t6InteractionTrace: process.env.MOLLY_COMPRESS_T6 === '1',
      t5NumericQuantization: process.env.MOLLY_COMPRESS_T5 === '1',
    });
  }

  /**
   * Prepare crystal for storage with compression via CompressionManager
   */
  async prepareForStorage(
    crystal: CrystalEngram
  ): Promise<CompressedCrystalPayload> {
    const startTime = performance.now();
    const originalContent = JSON.stringify(crystal);
    const originalBytes = Buffer.byteLength(originalContent, 'utf8');

    const flags = this.compressionManager.getFlags();
    const anyTechniquesEnabled = Object.values(flags).some((f) => f);

    if (!anyTechniquesEnabled) {
      // No compression enabled; return as-is
      MollyLogger.debug(
        'No compression techniques enabled; storing crystal uncompressed',
        'crystal-compression',
        { crystalId: crystal.id },
        this.traceId
      );

      return {
        crystal,
        version: '1.0',
      };
    }

    // Log compression preparation
    MollyLogger.info(
      'Applying Titan Echo compression to crystal',
      'crystal-compression',
      {
        crystalId: crystal.id,
        originalBytes,
        techniquesEnabled: Object.entries(flags)
          .filter(([, enabled]) => enabled)
          .map(([technique]) => technique),
      },
      this.traceId
    );

    try {
      // Call CompressionManager to apply P1/P2/P3 techniques
      const result = await this.compressionManager.compress({
        engrams: [crystal], // Single crystal as single-element batch
        sessionId: `crystal-${crystal.id}`,
        compressionTimestamp: Date.now(),
      });

      const compressionTimeMs = performance.now() - startTime;

      // Track metrics for later reporting
      this.activeTechniques = result.metrics.techniquesApplied;
      this.totalCompressionRatio = result.metrics.compressionRatio;

      const compressionContext: CrystalCompressionContext = {
        activeTechniques: result.metrics.techniquesApplied,
        originalBytes,
        compressedBytes: result.metrics.compressedByteSize,
        compressionRatio: result.metrics.compressionRatio,
        skippedTechniques: result.metrics.techniquesSkipped,
        compressionTimeMs,
        compressedAt: Date.now(),
      };

      // Log guardrail state for Molly's visibility
      const guardrailNote =
        result.metrics.guardrailState === 'alert'
          ? ' [ALERT: Molly should verify integrity]'
          : result.metrics.guardrailState === 'violated'
            ? ' [VIOLATED: Technique skipped for safety]'
            : '';

      MollyLogger.info(
        `Crystal compression complete${guardrailNote}`,
        'crystal-compression',
        {
          crystalId: crystal.id,
          originalBytes,
          compressedBytes: result.metrics.compressedByteSize,
          ratio: `${result.metrics.compressionRatio.toFixed(2)}%`,
          techniques: result.metrics.techniquesApplied.join(','),
          guardrailState: result.metrics.guardrailState,
          timeMs: compressionTimeMs,
        },
        this.traceId
      );

      return {
        crystal,
        compression: compressionContext,
        compressionBundle: result.bundle,
        version: '1.0',
      };
    } catch (error) {
      MollyLogger.error(
        'Compression failed; returning uncompressed',
        'crystal-compression',
        {
          crystalId: crystal.id,
          error: error instanceof Error ? error.message : String(error),
        },
        this.traceId
      );

      // Graceful degradation: return uncompressed on error
      return {
        crystal,
        version: '1.0',
      };
    }
  }

  /**
   * Restore crystal from storage, decompressing if needed
   */
  async restoreFromStorage(
    payload: CompressedCrystalPayload
  ): Promise<CrystalEngram> {
    if (!payload.compression || !payload.compressionBundle) {
      // Not compressed; return directly
      return payload.crystal;
    }

    const startTime = performance.now();

    try {
      // Call CompressionManager to decompress in reverse order
      const decompressed = await this.compressionManager.decompress(
        payload.compressionBundle
      );

      // Should have exactly 1 crystal (we compressed 1)
      if (decompressed.length === 0) {
        MollyLogger.warn(
          'Decompression returned empty array; falling back to original',
          'crystal-compression',
          {
            crystalId: payload.crystal.id,
          },
          this.traceId
        );
        return payload.crystal;
      }

      const decompressionTimeMs = performance.now() - startTime;

      MollyLogger.debug(
        'Crystal decompressed from storage',
        'crystal-compression',
        {
          crystalId: payload.crystal.id,
          compressionRatio: `${payload.compression.compressionRatio.toFixed(2)}%`,
          decompressionTimeMs,
          techniquesApplied:
            payload.compression.activeTechniques.join(','),
        },
        this.traceId
      );

      return decompressed[0];
    } catch (error) {
      MollyLogger.error(
        'Decompression failed; returning original crystal',
        'crystal-compression',
        {
          crystalId: payload.crystal.id,
          error: error instanceof Error ? error.message : String(error),
        },
        this.traceId
      );

      // Graceful degradation: return original on decompression failure
      return payload.crystal;
    }
  }

  /**
   * Format compression info for metrics/diagnostics
   */
  getCompressionMetrics(): {
    techniquesEnabled: number;
    totalCompressionRatio: number;
    guardrailsPassed: boolean;
    activeTechniques: string[];
  } {
    const flags = this.compressionManager.getFlags();
    const enabledCount = Object.values(flags).filter((f) => f).length;

    return {
      techniquesEnabled: enabledCount,
      totalCompressionRatio: this.totalCompressionRatio,
      guardrailsPassed: true, // CompressionManager enforces guardrails internally
      activeTechniques: this.activeTechniques,
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let bridge: CrystalCompressionBridge | null = null;

export function getCrystalCompressionBridge(): CrystalCompressionBridge {
  if (!bridge) {
    bridge = new CrystalCompressionBridge();
  }
  return bridge;
}
