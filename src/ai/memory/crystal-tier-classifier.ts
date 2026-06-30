/**
 * Crystal Tier Classifier
 *
 * Classifies memory crystals into three tiers based on effectiveScore
 * (significance × recency decay). These tiers control how and when a
 * crystal enters Molly's active context window:
 *
 *   Tier A — Static KV bake (effectiveScore >= 0.80)
 *     Baked into the llama-server KV cache once. Loaded in 2-3s on every
 *     boot. Always present. The persona + highest-significance memories.
 *     Max 60 crystals (~200MB KV state on 3B model, Q4_K_M).
 *     Gate: canPromote(manifest) === true before any bake.
 *
 *   Tier B — Session injection (0.50 <= effectiveScore < 0.80)
 *     Injected as JSON at session start. Not baked. Rebuilt on
 *     re-crystallization without requiring a KV re-bake.
 *     Max 40 crystals, target load time <500ms.
 *
 *   Tier C — Dynamic eviction (effectiveScore < 0.50)
 *     Never auto-loaded. Retrieved on-demand by the routing layer
 *     (selectHotCrystals) when query similarity exceeds threshold.
 *     Capacity is bounded only by disk.
 *
 * effectiveScore = significance * (0.8 + 0.2 * recencyScore)
 * where recencyScore comes from computeRecencyScore() in crystallize-memories.ts
 */

import type { VersionManifest } from './crystal-version-manifest';
import { canPromote } from './crystal-version-manifest';

// ─── Thresholds ──────────────────────────────────────────────────────────────

/** effectiveScore at or above this → Tier A (static KV bake) */
export const TIER_A_THRESHOLD = 0.8;
/** effectiveScore at or above this → Tier B (session injection) */
export const TIER_B_THRESHOLD = 0.5;
/** Hard cap on Tier A crystals (KV memory budget) */
export const TIER_A_MAX_CRYSTALS = 60;
/** Hard cap on Tier B crystals (session injection budget) */
export const TIER_B_MAX_CRYSTALS = 40;

// ─── Types ───────────────────────────────────────────────────────────────────

export type Tier = 'A' | 'B' | 'C';

export interface TierInput {
  id: string;
  /** Raw significance from the crystal scorer (0-1) */
  significance: number;
  /** Recency decay factor (0-1) from computeRecencyScore() */
  recencyScore?: number;
  /** Pre-computed effectiveScore. If provided, skips the significance * recency
 computation. */
  effectiveScore?: number;
  /** ISO timestamp — used to break ties within a tier (newer wins) */
  crystallizedAt?: string;
}

export interface TierClassification {
  id: string;
  tier: Tier;
  effectiveScore: number;
}

export interface ClassifyResult {
  tierA: TierClassification[];
  tierB: TierClassification[];
  tierC: TierClassification[];
  /** Summary for logging */
  summary: {
    total: number;
    tierA: number;
    tierB: number;
    tierC: number;
    /** True if Tier A hit the cap and crystals were demoted to B */
    tierACapped: boolean;
    /** True if Tier B hit the cap and crystals were demoted to C */
    tierBCapped: boolean;
  };
}

// ─── Core API ────────────────────────────────────────────────────────────────

/**
 * Classify crystals into tiers. Sorting is significance-first so that when
 * a tier hits its cap, the lowest-scoring members of that tier are demoted
 * to the next tier rather than being dropped.
 *
 * @param crystals  Array of crystals with at least id + significance
 * @param manifest  Optional version manifest. If provided and canPromote()
 *                  is false, ALL crystals are classified Tier C (bake blocked).
 */
export function classifyCrystals(
  crystals: TierInput[],
  manifest?: VersionManifest | null
): ClassifyResult {
  // If a manifest is provided and blocked, demote everything to Tier C.
  // A blocked manifest means the coherence or contradiction gate failed —
  // we must not bake until it's clean.
  if (manifest !== undefined && manifest !== null && !canPromote(manifest)) {
    const tierC = crystals.map((c) => ({
      id: c.id,
      tier: 'C' as Tier,
      effectiveScore: computeEffective(c),
    }));
    return {
      tierA: [],
      tierB: [],
      tierC,
      summary: {
        total: crystals.length,
        tierA: 0,
        tierB: 0,
        tierC: crystals.length,
        tierACapped: false,
        tierBCapped: false,
      },
    };
  }

  // Score and sort descending by effectiveScore, then by crystallizedAt desc
  const scored = crystals
    .map((c) => ({ ...c, effectiveScore: computeEffective(c) }))
    .sort((a, b) => {
      const scoreDiff = b.effectiveScore - a.effectiveScore;
      if (Math.abs(scoreDiff) > 1e-6) return scoreDiff;
      // Tie-break: newer crystal wins
      const tsA = a.crystallizedAt ? new Date(a.crystallizedAt).getTime() : 0;
      const tsB = b.crystallizedAt ? new Date(b.crystallizedAt).getTime() : 0;
      return tsB - tsA;
    });

  const tierA: TierClassification[] = [];
  const tierB: TierClassification[] = [];
  const tierC: TierClassification[] = [];
  let tierACapped = false;
  let tierBCapped = false;

  for (const c of scored) {
    const entry: TierClassification = {
      id: c.id,
      tier: 'C',
      effectiveScore: c.effectiveScore,
    };

    if (c.effectiveScore >= TIER_A_THRESHOLD) {
      if (tierA.length < TIER_A_MAX_CRYSTALS) {
        entry.tier = 'A';
        tierA.push(entry);
      } else {
        // Cap reached — demote to B (still high significance, just overflow)
        tierACapped = true;
        if (tierB.length < TIER_B_MAX_CRYSTALS) {
          entry.tier = 'B';
          tierB.push(entry);
        } else {
          tierBCapped = true;
          entry.tier = 'C';
          tierC.push(entry);
        }
      }
    } else if (c.effectiveScore >= TIER_B_THRESHOLD) {
      if (tierB.length < TIER_B_MAX_CRYSTALS) {
        entry.tier = 'B';
        tierB.push(entry);
      } else {
        tierBCapped = true;
        entry.tier = 'C';
        tierC.push(entry);
      }
    } else {
      entry.tier = 'C';
      tierC.push(entry);
    }
  }

  return {
    tierA,
    tierB,
    tierC,
    summary: {
      total: crystals.length,
      tierA: tierA.length,
      tierB: tierB.length,
      tierC: tierC.length,
      tierACapped,
      tierBCapped,
    },
  };
}

/**
 * Filter a pre-classified result to a specific tier.
 * Convenience for callers that only need one tier at a time.
 */
export function getTier(
  result: ClassifyResult,
  tier: Tier
): TierClassification[] {
  return result[`tier${tier}` as keyof ClassifyResult] as TierClassification[];
}

/**
 * Returns true if any crystal has been demoted due to a tier cap.
 * Useful for logging a warning when the crystal set is outgrowing the budget.
 */
export function hasDemotion(result: ClassifyResult): boolean {
  return result.summary.tierACapped || result.summary.tierBCapped;
}

// ─── Internal ────────────────────────────────────────────────────────────────

function computeEffective(c: TierInput): number {
  if (c.effectiveScore !== undefined)
    return Math.min(1, Math.max(0, c.effectiveScore));
  const recency = c.recencyScore ?? 1.0;
  return Math.min(1, Math.max(0, c.significance * (0.8 + 0.2 * recency)));
}
