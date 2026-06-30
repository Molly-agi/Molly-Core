/**
 * @fileOverview Gap 3 phase 1 — crystal version manifest
 *
 * A "version" is a snapshot of which crystals are promoted into the active
 * loadout, plus the KV delta artifacts that contributed to this version,
 * plus the gate results that allowed (or would have blocked) the promotion.
 *
 * Promotion is gated by two checks Lazarus shipped:
 *   1. Coherence (Gap 1):       crystal-coherence.mjs --watchdog exit 0
 *   2. Contradiction (detector): detectConflicts(crystals).conflicts has
 *                                no hard conflicts (contradictory, not
 *                                query-gated).
 *
 * This module is pure logic — no fs, no exec. The caller (a future
 * scripts/crystal-os/promote-version.mjs) runs the gates, hands us the
 * results, and we produce or reject a manifest. We DO serialize/parse
 * to disk-friendly JSON, but never read/write directly.
 */

import type {
  DetectionResult,
  CrystalConflict,
} from './contradiction-detector';

export interface ManifestDeltaRef {
  id: string;
  descriptorPath: string;
  blobPath: string;
  bytes: number;
}

export interface CoherenceGate {
  passed: boolean;
  meanKl?: number;
  /** From coherence_matrix.json — block threshold is 0.15. */
  threshold: number;
}

export interface ContradictionGate {
  passed: boolean;
  conflictCount: number;
  /** "contradictory" classification (≤30d, opposing) that are NOT query-gated. */
  hardConflictCount: number;
}

export interface VersionManifest {
  version: number;
  parentVersion: number | null;
  createdAt: string;
  crystals: string[];
  addedSinceParent: string[];
  removedSinceParent: string[];
  deltas: ManifestDeltaRef[];
  gates: {
    coherence: CoherenceGate;
    contradiction: ContradictionGate;
  };
  /** Which gate would have blocked, or null if both passed. */
  gatedBy: 'coherence' | 'contradiction' | null;
  /** Human-facing reasons populated when gatedBy is non-null. */
  blockReasons: string[];
}

export interface BuildManifestInput {
  parent: VersionManifest | null;
  currentCrystals: string[];
  deltas: ManifestDeltaRef[];
  coherence: CoherenceGate;
  contradiction: DetectionResult;
  /** Bump rule. Default: parent.version + 1, or 1 if null. */
  versionOverride?: number;
  now?: () => Date;
}

/**
 * Build a candidate manifest from the gate results. The manifest is ALWAYS
 * returned (even if blocked) so callers can persist the block record for
 * audit. Check `gatedBy === null` before treating it as promotable.
 */
export function buildManifest(input: BuildManifestInput): VersionManifest {
  if (!input.currentCrystals) throw new Error('currentCrystals required');
  if (!input.coherence) throw new Error('coherence gate required');
  if (!input.contradiction) throw new Error('contradiction result required');

  const now = (input.now ?? (() => new Date()))().toISOString();
  const parentVersion = input.parent ? input.parent.version : null;
  const version =
    input.versionOverride ?? (parentVersion === null ? 1 : parentVersion + 1);

  const parentSet = new Set(input.parent?.crystals ?? []);
  const currentSet = new Set(input.currentCrystals);
  const addedSinceParent = input.currentCrystals.filter(
    (c) => !parentSet.has(c)
  );
  const removedSinceParent = [...parentSet].filter((c) => !currentSet.has(c));

  const hardConflictCount = countHardConflicts(input.contradiction.conflicts);
  const contradictionGate: ContradictionGate = {
    passed: hardConflictCount === 0,
    conflictCount: input.contradiction.conflicts.length,
    hardConflictCount,
  };

  const blockReasons: string[] = [];
  let gatedBy: VersionManifest['gatedBy'] = null;
  if (!input.coherence.passed) {
    gatedBy = 'coherence';
    blockReasons.push(
      `coherence gate failed: meanKl=${input.coherence.meanKl ?? 'unknown'} threshold=${input.coherence.threshold}`
    );
  }
  if (!contradictionGate.passed) {
    if (gatedBy === null) gatedBy = 'contradiction';
    blockReasons.push(
      `contradiction gate failed: ${hardConflictCount} hard conflict(s) of ${input.contradiction.conflicts.length} total`
    );
  }

  return {
    version,
    parentVersion,
    createdAt: now,
    crystals: [...input.currentCrystals],
    addedSinceParent,
    removedSinceParent,
    deltas: input.deltas.map((d) => ({ ...d })),
    gates: {
      coherence: { ...input.coherence },
      contradiction: contradictionGate,
    },
    gatedBy,
    blockReasons,
  };
}

/**
 * Returns true iff the manifest is safe to promote (both gates passed).
 * Convenience for callers that just want a yes/no — same as
 * `manifest.gatedBy === null` but reads better at call sites.
 */
export function canPromote(manifest: VersionManifest): boolean {
  return manifest.gatedBy === null;
}

export interface ManifestDiff {
  added: string[];
  removed: string[];
  held: string[];
}

/**
 * Diff two manifests by their crystal sets. "held" = present in both.
 * Used by the promote script to log human-readable transitions.
 */
export function diffManifests(
  a: VersionManifest | null,
  b: VersionManifest
): ManifestDiff {
  const aSet = new Set(a?.crystals ?? []);
  const bSet = new Set(b.crystals);
  return {
    added: b.crystals.filter((c) => !aSet.has(c)),
    removed: [...aSet].filter((c) => !bSet.has(c)),
    held: b.crystals.filter((c) => aSet.has(c)),
  };
}

/**
 * Validate a manifest re-loaded from disk. Catches schema drift early.
 * Returns the (typed) manifest on success, throws on shape mismatch.
 */
export function validateManifest(raw: unknown): VersionManifest {
  if (!raw || typeof raw !== 'object')
    throw new Error('manifest must be object');
  const m = raw as Record<string, unknown>;
  const requireType = (key: string, t: string): void => {
    if (typeof m[key] !== t) throw new Error(`manifest.${key} must be ${t}`);
  };
  requireType('version', 'number');
  requireType('createdAt', 'string');
  if (m.parentVersion !== null && typeof m.parentVersion !== 'number') {
    throw new Error('manifest.parentVersion must be number|null');
  }
  if (!Array.isArray(m.crystals))
    throw new Error('manifest.crystals must be array');
  if (!Array.isArray(m.deltas))
    throw new Error('manifest.deltas must be array');
  if (!m.gates || typeof m.gates !== 'object') {
    throw new Error('manifest.gates must be object');
  }
  return raw as VersionManifest;
}

function countHardConflicts(conflicts: CrystalConflict[]): number {
  return conflicts.filter(
    (c) => c.type === 'contradictory' && !c.resolution.queryGated
  ).length;
}
