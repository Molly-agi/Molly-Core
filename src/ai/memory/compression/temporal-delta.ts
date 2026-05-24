import type { MemoryEngram } from '../neural-engram';
import { MollyLogger } from '../../logger';

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
  deltaGroups: Array<{
    baseId: string;
    deltas: Array<{
      id: string;
      timestamp: Date;
      diff: Record<string, any>;
    }>;
  }>;
  reconstructedEngrams: MemoryEngram[]; // For validation loop
}

/**
 * Encodes a series of engrams into a base-and-delta chain.
 */
export function applyTemporalDeltaEncoding(
  engrams: MemoryEngram[],
  checkpointInterval = 10
): TemporalDeltaResult {
  const sorted = [...engrams].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const bases: MemoryEngram[] = [];
  const deltaGroups: TemporalDeltaResult['deltaGroups'] = [];
  const reconstructed: MemoryEngram[] = [];

  let lastEngram: MemoryEngram | null = null;
  let currentGroup: (typeof deltaGroups)[0] | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const engram = sorted[i];

    // Create a new base every checkpointInterval
    if (i % checkpointInterval === 0) {
      bases.push(engram);
      reconstructed.push(engram);
      lastEngram = engram;
      
      currentGroup = {
        baseId: engram.id,
        deltas: []
      };
      deltaGroups.push(currentGroup);
      continue;
    }

    // Calculate diff from the last engram in the chain
    if (lastEngram && currentGroup) {
      const diff = calculateEngramDiff(lastEngram, engram);
      
      currentGroup.deltas.push({
        id: engram.id,
        timestamp: engram.timestamp,
        diff
      });

      // For validation, reconstruct immediately from the diff
      const restored = applyEngramDiff(lastEngram, diff, engram.id, engram.timestamp);
      reconstructed.push(restored);
      
      lastEngram = restored;
    }
  }

  return {
    bases,
    deltaGroups,
    reconstructedEngrams: reconstructed
  };
}

/**
 * Reconstitutes engrams from their delta-encoded state.
 */
export function decompressTemporalDeltas(
  result: TemporalDeltaResult
): MemoryEngram[] {
  const engrams: MemoryEngram[] = [];

  for (const group of result.deltaGroups) {
    const base = result.bases.find(b => b.id === group.baseId);
    if (!base) continue;

    engrams.push(base);
    let lastEngram = base;

    for (const delta of group.deltas) {
      const restored = applyEngramDiff(lastEngram, delta.diff, delta.id, delta.timestamp);
      engrams.push(restored);
      lastEngram = restored;
    }
  }

  return engrams.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

/**
 * Calculates a field-level diff between two engrams.
 * Includes all metadata fields to ensure bit-perfect matching.
 */
function calculateEngramDiff(oldE: any, newE: any): Record<string, any> {
  const diff: Record<string, any> = {};

  // List of fields to track for perfect recall
  const fields = [
    'content', 'importance', 'emotionalValence', 'arousal', 
    'accessCount', 'lastAccessed', 'userId', 'engramVersion', 
    'consolidationState', 'contextTags', 'relatedEngrams', 
    'personalityContext', 'data'
  ];
  
  for (const field of fields) {
    const oldVal = JSON.stringify(oldE[field]);
    const newVal = JSON.stringify(newE[field]);
    
    if (oldVal !== newVal) {
      diff[field] = newE[field];
    }
  }

  return diff;
}

/**
 * Applies a diff to a previous engram to restore the next one.
 */
function applyEngramDiff(
  prev: MemoryEngram, 
  diff: Record<string, any>, 
  id: string, 
  timestamp: Date
): MemoryEngram {
  // Start with the exact values of the previous engram in the chain
  const restored: any = { 
    ...prev,
    id,
    timestamp
  };

  // Overlay only the fields that changed
  for (const key in diff) {
    restored[key] = diff[key];
  }

  // Handle Date objects specifically if they were stored as strings in diff (though unlikely here)
  if (restored.lastAccessed && typeof restored.lastAccessed === 'string') {
    restored.lastAccessed = new Date(restored.lastAccessed);
  }

  return restored as MemoryEngram;
}
