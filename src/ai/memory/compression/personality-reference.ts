/**
 * Option C — Technique 1: Personality Reference Compression
 *
 * Problem: Every MemoryEngram optionally stores a full PersonalityModulation snapshot
 * (~80 numeric fields × 8 bytes = ~640 bytes) at formation time. For 500 engrams
 * formed across a single session the personality changes slowly — consecutive engrams
 * share near-identical contexts. This is pure redundancy.
 *
 * Solution: Deduplicate personality snapshots into a reference table.
 * Each engram stores a pointer (refId) instead of the full blob.
 * Deduplication key: personality hash rounded to 2 decimal places per field.
 *
 * Expected gain: 8-10% compression on datasets with personalityContext populated.
 * Risk: LOW — lossless round-trip; all data is preserved in the reference table.
 *
 * Phase 0 flag: MOLLY_COMPRESS_T1=1 to enable.
 * Default: OFF (0)
 *
 * Schema:
 *   PersonalityRefTable  — { [refId: string]: PersonalityModulation }
 *   EngramWithRef        — MemoryEngram with personalityContext removed + personalityRefId added
 */

import type {
  MemoryEngram,
  PersonalityModulation,
} from '@/ai/memory/neural-engram';
import { createHash } from 'crypto';

// ============================================================================
// SCHEMA
// ============================================================================

export type EngramWithRef = Omit<MemoryEngram, 'personalityContext'> & {
  personalityRefId?: string;
};

export interface PersonalityReferenceBundle {
  // All unique personality snapshots, keyed by stable hash
  personalityRefs: Record<string, PersonalityModulation>;
  // Map of engramId → refId (only present when engram had personalityContext)
  personalityRefId: Record<string, string>;
  // Engrams with personalityContext stripped out (replaced by pointer)
  engrams: EngramWithRef[];
}

// ============================================================================
// HASH HELPER
// ============================================================================

function hashPersonality(p: PersonalityModulation): string {
  // Round each field to 2 decimal places before hashing.
  // Two personalities that differ by < 0.005 on every dimension are considered identical.
  const normalized: Record<string, number> = {};
  for (const [k, v] of Object.entries(p)) {
    normalized[k] = Math.round(v * 100) / 100;
  }
  return createHash('sha256')
    .update(JSON.stringify(normalized, Object.keys(normalized).sort()))
    .digest('hex')
    .slice(0, 12); // 12 hex chars = 48 bits, collision-free at our scale
}

// ============================================================================
// COMPRESSION
// ============================================================================

export function applyPersonalityReferenceCompression(
  engrams: MemoryEngram[]
): PersonalityReferenceBundle {
  const personalityRefs: Record<string, PersonalityModulation> = {};
  const personalityRefId: Record<string, string> = {};
  const compressedEngrams: EngramWithRef[] = [];

  for (const engram of engrams) {
    if (!engram.personalityContext) {
      // No personality context on this engram — pass through unchanged
      const { personalityContext: _dropped, ...rest } = engram;
      compressedEngrams.push(rest);
      continue;
    }

    const refId = hashPersonality(engram.personalityContext);

    if (!personalityRefs[refId]) {
      // First time we've seen this personality snapshot — add to table
      personalityRefs[refId] = engram.personalityContext;
    }

    personalityRefId[engram.id] = refId;
    const { personalityContext: _dropped, ...rest } = engram;
    compressedEngrams.push({ ...rest, personalityRefId: refId });
  }

  return {
    personalityRefs,
    personalityRefId,
    engrams: compressedEngrams,
  };
}

// ============================================================================
// DECOMPRESSION
// ============================================================================

export function decompressPersonalityReferences(
  bundle: PersonalityReferenceBundle
): MemoryEngram[] {
  return bundle.engrams.map((engram) => {
    const refId = engram.personalityRefId;
    if (!refId) {
      // No personality ref — return as-is (cast back to MemoryEngram)
      const { personalityRefId: _dropped, ...rest } = engram;
      return rest as MemoryEngram;
    }

    const personalityContext = bundle.personalityRefs[refId];
    if (!personalityContext) {
      // Ref not found — defensive pass-through without context
      const { personalityRefId: _dropped, ...rest } = engram;
      return rest as MemoryEngram;
    }

    const { personalityRefId: _dropped, ...rest } = engram;
    return { ...rest, personalityContext } as MemoryEngram;
  });
}

// ============================================================================
// STATS HELPER (used by tests and the compression-manager audit)
// ============================================================================

export function measurePersonalityCompressionGain(
  originalEngrams: MemoryEngram[],
  bundle: PersonalityReferenceBundle
): {
  originalBytes: number;
  compressedBytes: number;
  savedBytes: number;
  ratioPercent: number;
} {
  const originalBytes = JSON.stringify(originalEngrams).length;
  const compressedBytes = JSON.stringify({
    personalityRefs: bundle.personalityRefs,
    engrams: bundle.engrams,
  }).length;
  const savedBytes = originalBytes - compressedBytes;
  return {
    originalBytes,
    compressedBytes,
    savedBytes,
    ratioPercent: (savedBytes / originalBytes) * 100,
  };
}
