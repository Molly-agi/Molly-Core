// src/ai/engine-titan/titan-crystal-adapter.ts
//
// Bridges Titan Engine vault layers → CrystalLibraryManager.
// A TitanWeightCrystal satisfies EvictableCrystal so the hot/warm tier
// manager can load, evict, and promote weight modules exactly like memory
// crystals — unified runtime for model weights + episodic memory.

import type { EvictableCrystal } from '../memory/crystal-library-eviction';
import type { LayerMetadata } from './orchestrator';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A Titan weight module dressed as an EvictableCrystal.
 *
 * significance: derived from compression rank ratio — higher rank relative
 *   to matrix dimension = more of the model's variance captured = more
 *   important to keep hot.
 *
 * isCornerstone: true for embedding/projection layers (the load-bearing
 *   layers that every inference pass touches).
 */
export interface TitanWeightCrystal extends EvictableCrystal {
  readonly id: string;
  readonly significance: number;
  readonly isCornerstone: boolean;
  /** Vault paths for on-demand reconstruction. */
  readonly vaultPaths: {
    readonly matrixA: string;
    readonly packedB: string;
    readonly meta: string;
  };
  /** Original LayerMetadata snapshot for reconstruction. */
  readonly layerMeta: LayerMetadata;
}

// ─── Cornerstone heuristic ───────────────────────────────────────────────────

// Layer name fragments that are always load-bearing: embeddings, final
// projection, layer norms at model boundaries.
const CORNERSTONE_PATTERNS = [
  /embed/i,
  /lm_head/i,
  /output\.weight/i,
  /norm\b/i,
];

function isCornerstone(layerName: string): boolean {
  return CORNERSTONE_PATTERNS.some((p) => p.test(layerName));
}

// ─── Significance formula ─────────────────────────────────────────────────────

/**
 * Rank ratio: targetRank / min(rows, cols).
 * Layers with a higher rank ratio required more decomposition precision →
 * higher significance (keeping them hot avoids expensive disk reads).
 */
function computeSignificance(meta: LayerMetadata): number {
  const minDim = Math.min(meta.rows, meta.cols);
  if (minDim <= 0) return 0;
  return Math.min(1, meta.targetRank / minDim);
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Wraps a LayerMetadata record from the orchestrator vault into a
 * TitanWeightCrystal ready for CrystalLibraryManager.
 */
export function layerMetaToWeightCrystal(
  meta: LayerMetadata,
  storageDir: string
): TitanWeightCrystal {
  return {
    id: meta.layerName,
    significance: computeSignificance(meta),
    isCornerstone: isCornerstone(meta.layerName),
    vaultPaths: {
      matrixA: `${storageDir}/${meta.layerName}.A.f32`,
      packedB: `${storageDir}/${meta.layerName}.B.packed`,
      meta: `${storageDir}/${meta.layerName}.meta.json`,
    },
    layerMeta: meta,
  };
}
