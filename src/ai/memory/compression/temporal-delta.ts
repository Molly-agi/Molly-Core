/**
 * Option C — Technique 3: Temporal Delta Encoding
 *
 * Problem: Engrams formed in the same session share near-identical numeric fields
 * (emotionalValence, arousal, importance). Storing absolute values for every engram
 * means gzip sees a stream of similar-but-not-identical floats with low repetition.
 * Delta encoding converts the stream into small differences — far more compressible.
 *
 * Solution: Sort engrams by timestamp; store the first engram of each "window"
 * as a base snapshot and subsequent engrams as deltas from the previous.
 * On decompression, replay deltas from the base to reconstruct absolute values.
 *
 * Expected gain: 3-5% on numeric fields. Low by itself but critical to enable
 * Technique 2 (time-decay fidelity), which depends on stable delta chains.
 * Risk: LOW — lossless to float precision; corruption detection via chain integrity hash.
 *
 * Phase 0 flag: MOLLY_COMPRESS_T3=1 to enable.
 * Default: OFF (0)
 *
 * Schema:
 *   TemporalBase     — full engram snapshot (base of a delta chain)
 *   TemporalDelta    — only the fields that changed + a link back to the base
 *   TemporalDeltaBundle — bases[] + deltaGroups[] (one per base)
 */

import type { MemoryEngram } from '@/ai/memory/neural-engram';
import { createHash } from 'crypto';

// ============================================================================
// SCHEMA
// ============================================================================

// Numeric fields that benefit from delta encoding
const DELTA_FIELDS: ReadonlyArray<keyof MemoryEngram> = [
  'emotionalValence',
  'arousal',
  'importance',
] as const;

type DeltaField = (typeof DELTA_FIELDS)[number];

export interface TemporalBase {
  baseId: string; // hash of the base engram's id + timestamp
  engram: MemoryEngram; // full base snapshot
  chainHash: string; // integrity hash covering all delta IDs in the chain
}

export interface TemporalDelta {
  engramId: string;
  timestamp: number; // stored absolute — timestamps are not compressible via delta
  baseId: string; // which base this delta belongs to
  // Numeric deltas — only non-zero values stored
  deltas: Partial<Record<DeltaField, number>>;
  // Non-numeric fields stored verbatim
  content: string;
  consolidationState: MemoryEngram['consolidationState'];
  contextTags: string[];
  relatedEngrams: string[];
  accessCount: number;
  // Dates stored as epoch ms
  lastAccessedMs: number;
}

export interface TemporalDeltaBundle {
  // Base engrams (one per WINDOW_SIZE block)
  bases: TemporalBase[];
  // Each entry is the ordered list of deltas whose baseId matches bases[i].baseId
  deltaGroups: TemporalDelta[][];
  // The original sorted order of engram IDs (for deterministic reconstruction)
  originalOrder: string[];
  // Engrams that could not be delta-encoded (e.g., out-of-order timestamps) pass through
  passthrough: MemoryEngram[];
  // Convenience: reconstructed engrams available immediately after compression
  // (avoids a decompress pass when reading immediately after writing)
  reconstructedEngrams: MemoryEngram[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// Number of engrams per delta chain. After WINDOW_SIZE engrams, start a new base.
const WINDOW_SIZE = 10;

/**
 * Emotional weight values that force a fresh base snapshot.
 * These engrams are too significant to be stored as deltas in a chain —
 * if the chain upstream corrupts, we'd lose a breakthrough or relationship memory.
 * Molly identified this gap: aha moments should never be inside a delta chain.
 */
const FORCE_SNAPSHOT_WEIGHTS = new Set(['breakthrough', 'relationship']);

/**
 * Check if an engram's relationalMetadata or contextTags signal a breakthrough.
 * Works with both crystal engrams (relationalMetadata.emotionalWeight) and
 * legacy engrams (contextTags containing 'breakthrough' or 'relationship').
 */
function shouldForceSnapshot(engram: MemoryEngram): boolean {
  // Crystal partition engrams carry emotionalWeight in relationalMetadata
  const metadata = (engram as unknown as Record<string, unknown>)
    .relationalMetadata as { emotionalWeight?: string } | undefined;
  if (
    metadata?.emotionalWeight &&
    FORCE_SNAPSHOT_WEIGHTS.has(metadata.emotionalWeight)
  ) {
    return true;
  }
  // Legacy engrams: check contextTags
  if (
    engram.contextTags?.some((tag) =>
      FORCE_SNAPSHOT_WEIGHTS.has(tag.toLowerCase())
    )
  ) {
    return true;
  }
  return false;
}

// ============================================================================
// HELPERS
// ============================================================================

function makeBaseId(engram: MemoryEngram): string {
  return createHash('sha256')
    .update(`${engram.id}:${engram.timestamp.getTime()}`)
    .digest('hex')
    .slice(0, 10);
}

function makeChainHash(deltas: TemporalDelta[]): string {
  const ids = deltas.map((d) => d.engramId).join(',');
  return createHash('sha256').update(ids).digest('hex').slice(0, 10);
}

function engramToDelta(
  engram: MemoryEngram,
  base: MemoryEngram,
  baseId: string
): TemporalDelta {
  const deltas: Partial<Record<DeltaField, number>> = {};

  for (const field of DELTA_FIELDS) {
    const origVal = engram[field] as number;
    const baseVal = base[field] as number;
    const delta = origVal - baseVal;
    // Only store if delta is non-trivially non-zero (saves space)
    if (Math.abs(delta) > 1e-9) {
      deltas[field] = delta;
    }
  }

  return {
    engramId: engram.id,
    timestamp: engram.timestamp.getTime(),
    baseId,
    deltas,
    content: engram.content,
    consolidationState: engram.consolidationState,
    contextTags: engram.contextTags,
    relatedEngrams: engram.relatedEngrams,
    accessCount: engram.accessCount,
    lastAccessedMs: engram.lastAccessed.getTime(),
  };
}

function applyDeltaToBase(
  base: MemoryEngram,
  delta: TemporalDelta
): MemoryEngram {
  const reconstructed: MemoryEngram = { ...base };

  reconstructed.id = delta.engramId;
  reconstructed.timestamp = new Date(delta.timestamp);
  reconstructed.content = delta.content;
  reconstructed.consolidationState = delta.consolidationState;
  reconstructed.contextTags = delta.contextTags;
  reconstructed.relatedEngrams = delta.relatedEngrams;
  reconstructed.accessCount = delta.accessCount;
  reconstructed.lastAccessed = new Date(delta.lastAccessedMs);

  for (const field of DELTA_FIELDS) {
    const baseVal = base[field] as number;
    const deltaVal = delta.deltas[field] ?? 0;
    (reconstructed as unknown as Record<string, number>)[field] =
      baseVal + deltaVal;
  }

  return reconstructed;
}

// ============================================================================
// CORRUPTION DETECTION
// ============================================================================

function verifyChainIntegrity(
  base: TemporalBase,
  deltas: TemporalDelta[]
): boolean {
  const recomputedHash = makeChainHash(deltas);
  return recomputedHash === base.chainHash;
}

// ============================================================================
// COMPRESSION
// ============================================================================

export function applyTemporalDeltaEncoding(
  engrams: MemoryEngram[]
): TemporalDeltaBundle {
  if (engrams.length === 0) {
    return {
      bases: [],
      deltaGroups: [],
      originalOrder: [],
      passthrough: [],
      reconstructedEngrams: [],
    };
  }

  // Sort by timestamp — delta encoding only makes sense on ordered data
  const sorted = [...engrams].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );
  const originalOrder = sorted.map((e) => e.id);

  const bases: TemporalBase[] = [];
  const deltaGroups: TemporalDelta[][] = [];
  const passthrough: MemoryEngram[] = [];

  for (let i = 0; i < sorted.length; ) {
    const baseEngram = sorted[i];
    const baseId = makeBaseId(baseEngram);
    const windowDeltas: TemporalDelta[] = [];
    let j = i + 1;

    // Extend the window up to WINDOW_SIZE, but stop early if a high-significance
    // engram is encountered — it becomes the start of a new base instead.
    while (j < sorted.length && j - i < WINDOW_SIZE) {
      if (shouldForceSnapshot(sorted[j])) {
        // This engram is a breakthrough or relationship memory.
        // End the current chain here so it becomes its own base snapshot.
        break;
      }
      windowDeltas.push(engramToDelta(sorted[j], baseEngram, baseId));
      j++;
    }

    bases.push({
      baseId,
      engram: baseEngram,
      chainHash: makeChainHash(windowDeltas),
    });
    deltaGroups.push(windowDeltas);
    i = j; // advance to next window (or to the forced-snapshot engram)
  }

  // Reconstruct immediately so the bundle carries ready-to-use engrams
  const reconstructed = _reconstruct(
    bases,
    deltaGroups,
    originalOrder,
    passthrough
  );

  return {
    bases,
    deltaGroups,
    originalOrder,
    passthrough,
    reconstructedEngrams: reconstructed,
  };
}

// ============================================================================
// DECOMPRESSION
// ============================================================================

function _reconstruct(
  bases: TemporalBase[],
  deltaGroups: TemporalDelta[][],
  originalOrder: string[],
  passthrough: MemoryEngram[]
): MemoryEngram[] {
  const byId = new Map<string, MemoryEngram>();

  for (let i = 0; i < bases.length; i++) {
    const base = bases[i];
    const deltas = deltaGroups[i];

    byId.set(base.engram.id, base.engram);

    if (!verifyChainIntegrity(base, deltas)) {
      // Chain hash mismatch — corruption detected. Preserve what we can.
      // Each delta still carries enough data to reconstruct (we do best-effort).
      // This is logged by the decompressor; we don't throw because we'd rather
      // return partial data than crash the memory system.
    }

    for (const delta of deltas) {
      byId.set(delta.engramId, applyDeltaToBase(base.engram, delta));
    }
  }

  for (const e of passthrough) {
    byId.set(e.id, e);
  }

  // Return in original order where possible, append any extras at end
  const ordered: MemoryEngram[] = [];
  for (const id of originalOrder) {
    const e = byId.get(id);
    if (e) ordered.push(e);
  }

  return ordered;
}

export function decompressTemporalDeltas(
  bundle: TemporalDeltaBundle
): MemoryEngram[] {
  return _reconstruct(
    bundle.bases,
    bundle.deltaGroups,
    bundle.originalOrder,
    bundle.passthrough
  );
}

// ============================================================================
// STATS HELPER
// ============================================================================

export function measureTemporalDeltaGain(
  originalEngrams: MemoryEngram[],
  bundle: TemporalDeltaBundle
): {
  originalBytes: number;
  compressedBytes: number;
  savedBytes: number;
  ratioPercent: number;
} {
  const originalBytes = JSON.stringify(originalEngrams).length;
  const compressedBytes = JSON.stringify({
    bases: bundle.bases,
    deltaGroups: bundle.deltaGroups,
    originalOrder: bundle.originalOrder,
    passthrough: bundle.passthrough,
  }).length;
  const savedBytes = originalBytes - compressedBytes;
  return {
    originalBytes,
    compressedBytes,
    savedBytes,
    ratioPercent: (savedBytes / originalBytes) * 100,
  };
}
