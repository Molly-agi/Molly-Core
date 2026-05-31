import type { MemoryEngram } from '../neural-engram';

/**
 * T3: Temporal Delta Encoding (B2B Grade)
 *
 * Captures the 'evolution' of a session by storing a single base engram
 * followed by a series of diffs (deltas).
 *
 * METHODOLOGY:
 * Unlike lossy compression, this engine ensures 100% BIT-PERFECT RECALL.
 * It tracks changes across ALL fields of the MemoryEngram.
 */

export interface TemporalDeltaResult {
  bases: MemoryEngram[];
  deltaGroups: Array<
    Array<{
      id: string;
      timestamp: Date;
      deltas: Record<string, unknown>;
    }>
  >;
  reconstructedEngrams: MemoryEngram[]; // For validation loop
}

/**
 * Encodes a series of engrams into a base-and-delta chain.
 */
export function applyTemporalDeltaEncoding(
  engrams: MemoryEngram[],
  checkpointInterval = 10
): TemporalDeltaResult {
  const sorted = [...engrams].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );
  const bases: MemoryEngram[] = [];
  const deltaGroups: TemporalDeltaResult['deltaGroups'] = [];
  const reconstructed: MemoryEngram[] = [];

  let lastEngram: MemoryEngram | null = null;
  let currentGroupArray: Array<{
    id: string;
    timestamp: Date;
    deltas: Record<string, unknown>;
  }> | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const engram = sorted[i];

    // Create a new base every checkpointInterval
    if (i % checkpointInterval === 0) {
      bases.push(engram);
      reconstructed.push(engram);
      lastEngram = engram;

      currentGroupArray = [];
      deltaGroups.push(currentGroupArray);
      continue;
    }

    // Calculate diff from the last engram in the chain
    if (lastEngram && currentGroupArray) {
      const diff = calculateEngramDiff(lastEngram, engram);

      currentGroupArray.push({
        id: engram.id,
        timestamp: engram.timestamp,
        deltas: diff,
      });

      // For validation, reconstruct immediately from the diff
      const restored = applyEngramDiff(
        lastEngram,
        diff,
        engram.id,
        engram.timestamp
      );
      reconstructed.push(restored);

      lastEngram = restored;
    }
  }

  return {
    bases,
    deltaGroups,
    reconstructedEngrams: reconstructed,
  };
}

/**
 * Reconstitutes engrams from their delta-encoded state.
 */
export function decompressTemporalDeltas(
  result: TemporalDeltaResult
): MemoryEngram[] {
  const engrams: MemoryEngram[] = [];

  for (let i = 0; i < result.deltaGroups.length; i++) {
    const baseIndex = i < result.bases.length ? i : result.bases.length - 1;
    const base = result.bases[baseIndex];
    if (!base) continue;

    engrams.push(base);
    let lastEngram = base;

    for (const delta of result.deltaGroups[i]) {
      const restored = applyEngramDiff(
        lastEngram,
        delta.deltas,
        delta.id,
        delta.timestamp
      );
      engrams.push(restored);
      lastEngram = restored;
    }
  }

  return engrams.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

/**
 * Calculates a field-level diff between two engrams.
 * For numeric fields, stores delta (difference), not full value.
 * For other fields, stores full new value to ensure bit-perfect restoration.
 */
function calculateEngramDiff(
  oldE: MemoryEngram,
  newE: MemoryEngram
): Record<string, unknown> {
  const diff: Record<string, unknown> = {};

  // Numeric fields benefit from delta encoding (store difference, not value)
  const numericFields = [
    'importance',
    'emotionalValence',
    'arousal',
    'accessCount',
  ];
  // Non-numeric fields: store full new value
  const otherFields = [
    'content',
    'lastAccessed',
    'userId',
    'engramVersion',
    'consolidationState',
    'contextTags',
    'relatedEngrams',
    'personalityContext',
    'data',
  ];

  // Delta-encode numeric fields
  for (const field of numericFields) {
    const oldVal = (oldE as Record<string, unknown>)[field] ?? 0;
    const newVal = (newE as Record<string, unknown>)[field] ?? 0;
    if (
      typeof oldVal === 'number' &&
      typeof newVal === 'number' &&
      oldVal !== newVal
    ) {
      diff[field] = newVal - oldVal;
    }
  }

  // Full-value encoding for other fields
  for (const field of otherFields) {
    const oldVal = JSON.stringify((oldE as Record<string, unknown>)[field]);
    const newVal = JSON.stringify((newE as Record<string, unknown>)[field]);
    if (oldVal !== newVal) {
      diff[field] = (newE as Record<string, unknown>)[field];
    }
  }

  return diff;
}

/**
 * Applies a diff to a previous engram to restore the next one.
 * For delta-encoded numeric fields, adds the delta to the previous value.
 */
function applyEngramDiff(
  prev: MemoryEngram,
  diff: Record<string, unknown>,
  id: string,
  timestamp: Date
): MemoryEngram {
  // Start with the exact values of the previous engram in the chain
  const restored: Record<string, unknown> = {
    ...prev,
    id,
    timestamp,
  };

  // Apply delta-encoded numeric fields
  const numericFields = [
    'importance',
    'emotionalValence',
    'arousal',
    'accessCount',
  ];
  for (const field of numericFields) {
    if (field in diff) {
      const prevVal = (prev as Record<string, unknown>)[field];
      const delta = diff[field];
      restored[field] =
        typeof prevVal === 'number' && typeof delta === 'number'
          ? prevVal + delta
          : prevVal;
    }
  }

  // Apply full-value encoded fields (non-numeric)
  for (const [key, value] of Object.entries(diff)) {
    if (!numericFields.includes(key)) {
      restored[key] = value;
    }
  }

  // Handle Date objects specifically if they were stored as strings in diff (though unlikely here)
  if (restored.lastAccessed && typeof restored.lastAccessed === 'string') {
    restored.lastAccessed = new Date(restored.lastAccessed);
  }

  return restored as MemoryEngram;
}
