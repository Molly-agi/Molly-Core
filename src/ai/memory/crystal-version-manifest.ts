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
  /**
   * Aggregate coherence signal, [0,1] cosine-like or [0,∞) KL depending on
   * producer. The gate previously trusted mean alone — but one layer at
   * KL=4.0 among 79 healthy averages to ~0.06 and passed silently. Fable
   * Batch 03 F13: extend with per-layer / max / p95 so localized drift is
   * catchable. All three optional so legacy text-coherence producers still
   * work; the max/p95 checks fire only when populated.
   */
  meanKl?: number;
  /** Highest per-layer divergence (or worst pair, direction depends on producer). */
  maxKl?: number;
  /** 95th-percentile divergence — resistant to one outlier, catches "small cluster of bad layers". */
  p95Kl?: number;
  /** Full per-layer vector for audit. When present, drives max/p95 auto-check. */
  perLayerKl?: number[];
  /** From coherence_matrix.json — block threshold is 0.15. */
  threshold: number;
  /** Optional max-KL threshold. If set + perLayerKl present, any layer above blocks. */
  maxThreshold?: number;
  /** Optional p95-KL threshold. If set + perLayerKl present, p95 above blocks. */
  p95Threshold?: number;
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

  // Derive max/p95 from perLayerKl if provided but not explicitly set.
  // Guards against Fable F13: mean alone hides one catastrophic layer.
  const coherenceExpanded: CoherenceGate = { ...input.coherence };
  if (coherenceExpanded.perLayerKl && coherenceExpanded.perLayerKl.length > 0) {
    const sorted = [...coherenceExpanded.perLayerKl].sort((a, b) => a - b);
    if (coherenceExpanded.maxKl === undefined) {
      coherenceExpanded.maxKl = sorted[sorted.length - 1];
    }
    if (coherenceExpanded.p95Kl === undefined) {
      const p95Idx = Math.min(
        sorted.length - 1,
        Math.floor(sorted.length * 0.95)
      );
      coherenceExpanded.p95Kl = sorted[p95Idx];
    }
  }

  // Additional gates on max/p95 when thresholds provided. These OVERRIDE
  // an upstream passed=true if any per-layer stat exceeds its cap.
  let coherenceOverride = coherenceExpanded.passed;
  const extraBlockReasons: string[] = [];
  if (
    coherenceExpanded.maxThreshold !== undefined &&
    coherenceExpanded.maxKl !== undefined &&
    coherenceExpanded.maxKl > coherenceExpanded.maxThreshold
  ) {
    coherenceOverride = false;
    extraBlockReasons.push(
      `coherence gate failed: maxKl=${coherenceExpanded.maxKl.toFixed(4)} exceeds maxThreshold=${coherenceExpanded.maxThreshold}`
    );
  }
  if (
    coherenceExpanded.p95Threshold !== undefined &&
    coherenceExpanded.p95Kl !== undefined &&
    coherenceExpanded.p95Kl > coherenceExpanded.p95Threshold
  ) {
    coherenceOverride = false;
    extraBlockReasons.push(
      `coherence gate failed: p95Kl=${coherenceExpanded.p95Kl.toFixed(4)} exceeds p95Threshold=${coherenceExpanded.p95Threshold}`
    );
  }
  coherenceExpanded.passed = coherenceOverride;

  const blockReasons: string[] = [];
  let gatedBy: VersionManifest['gatedBy'] = null;
  if (!coherenceExpanded.passed) {
    gatedBy = 'coherence';
    if (input.coherence.passed && extraBlockReasons.length > 0) {
      // Upstream passed but max/p95 override tripped — surface those.
      blockReasons.push(...extraBlockReasons);
    } else {
      blockReasons.push(
        `coherence gate failed: meanKl=${coherenceExpanded.meanKl ?? 'unknown'} threshold=${coherenceExpanded.threshold}`
      );
      blockReasons.push(...extraBlockReasons);
    }
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
      coherence: coherenceExpanded,
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
