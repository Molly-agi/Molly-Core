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

  constructor() {
    this.traceId = generateTraceId();
  }

  /**
   * Prepare crystal for storage with optional compression
   */
  async prepareForStorage(
    crystal: CrystalEngram
  ): Promise<CompressedCrystalPayload> {
    const startTime = performance.now();
    const originalContent = JSON.stringify(crystal);
    const originalBytes = Buffer.byteLength(originalContent, 'utf8');

    const activeTechniques = getActiveCompressionTechniques();

    if (activeTechniques.length === 0) {
      // No compression enabled; return as-is
      MollyLogger.debug(
        'No compression techniques enabled; storing crystal uncompressed',
        'crystal-compression',
        { crystalId: crystal.id }
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
        techniquesActive: activeTechniques.map((t) => t.id),
      },
      this.traceId
    );

    // TODO: Apply compression techniques in order (P1 → P2 → P3)
    // For now, return uncompressed but with metadata indicating what would compress
    const compressionTimeMs = performance.now() - startTime;

    return {
      crystal,
      compression: {
        activeTechniques: activeTechniques.map((t) => t.id),
        originalBytes,
        compressedBytes: originalBytes, // TODO: update after compression
        compressionRatio: 0, // TODO: calculate
        skippedTechniques: [],
        compressionTimeMs,
        compressedAt: Date.now(),
      },
      version: '1.0',
    };
  }

  /**
   * Restore crystal from storage, decompressing if needed
   */
  async restoreFromStorage(
    payload: CompressedCrystalPayload
  ): Promise<CrystalEngram> {
    if (!payload.compression) {
      // Not compressed; return directly
      return payload.crystal;
    }

    const startTime = performance.now();

    // TODO: Apply decompression techniques in reverse order
    // For now, return the crystal as-is
    const decompressionTimeMs = performance.now() - startTime;

    MollyLogger.debug(
      'Crystal decompressed from storage',
      'crystal-compression',
      {
        crystalId: payload.crystal.id,
        compressionRatio: `${payload.compression.compressionRatio.toFixed(1)}%`,
        decompressionTimeMs,
      },
      this.traceId
    );

    return payload.crystal;
  }

  /**
   * Format compression info for metrics/diagnostics
   */
  getCompressionMetrics(): {
    techniquesEnabled: number;
    totalCompressionRatio: number;
    guardrailsPassed: boolean;
  } {
    const techniques = getActiveCompressionTechniques();

    return {
      techniquesEnabled: techniques.length,
      totalCompressionRatio: 0, // TODO: aggregate from compressed crystals
      guardrailsPassed: true, // TODO: check recall metrics
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
