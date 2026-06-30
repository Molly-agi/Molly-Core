/**
 * Crystal Library Eviction — Gap 11 of Crystal OS
 *
 * Two-tier runtime library manager:
 *   Hot  — crystals resident in RAM, injected into context. Capped by maxHot.
 *   Warm — crystals on disk, loaded on demand by the routing layer.
 *
 * Retention score determines which crystal is evicted when the hot tier is full:
 *   score = α·recency + β·significance + γ·loadCount   (all terms in [0,1])
 *
 * Lowest retention score is evicted first. Cornerstones are exempt from eviction
 * (they are always hot as long as they fit within maxHot at startup).
 *
 * Cold tier (Titan Echo-compressed archive) — deferred, not built here.
 */

import { logLoad, logEviction, logUnload } from './crystal-health-logger';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Recency half-life: score decays to 0.37 after this many ms. */
const RECENCY_HALF_LIFE_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Load-count ceiling for normalization. Counts above this saturate at 1.0. */
const LOAD_COUNT_NORM_CAP = 20;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RetentionWeights {
  /** α — recency of last access */
  recency: number;
  /** β — intrinsic crystal significance */
  significance: number;
  /** γ — access frequency */
  loadCount: number;
}

export const DEFAULT_WEIGHTS: RetentionWeights = {
  recency: 0.4,
  significance: 0.4,
  loadCount: 0.2,
};

export interface CrystalLoadStats {
  loadCount: number;
  lastLoadedAt: number; // Unix ms
}

/** Minimum shape a crystal must have to be managed by this library. */
export interface EvictableCrystal {
  id: string;
  significance: number;
  isCornerstone?: boolean;
}

export interface HotEntry<C extends EvictableCrystal> {
  crystal: C;
  stats: CrystalLoadStats;
}

export interface EvictionEvent {
  evictedId: string;
  retentionScore: number;
  demotedToWarm: boolean;
}

// ─── Pure scoring function (exported for tests / CLI tooling) ─────────────────

/**
 * Compute the retention score for a crystal.
 *
 * @param stats       Load stats for this crystal.
 * @param significance Crystal's intrinsic significance (0-1).
 * @param weights     α/β/γ weights (must sum to > 0 but need not sum to 1).
 * @param now         Current time in ms. Defaults to Date.now().
 */
export function computeRetentionScore(
  stats: CrystalLoadStats,
  significance: number,
  weights: RetentionWeights = DEFAULT_WEIGHTS,
  now: number = Date.now()
): number {
  const deltaMs = Math.max(0, now - stats.lastLoadedAt);
  const recencyScore = Math.exp(-deltaMs / RECENCY_HALF_LIFE_MS);
  const normalizedLoadCount = Math.min(
    stats.loadCount / LOAD_COUNT_NORM_CAP,
    1.0
  );
  const sig = Math.min(1, Math.max(0, significance));

  const { recency: α, significance: β, loadCount: γ } = weights;
  const total = α + β + γ;
  if (total === 0) return 0;

  return (α * recencyScore + β * sig + γ * normalizedLoadCount) / total;
}

// ─── Library Manager ─────────────────────────────────────────────────────────

export class CrystalLibraryManager<C extends EvictableCrystal> {
  private readonly hot: Map<string, HotEntry<C>> = new Map();
  private readonly warm: Set<string> = new Set();
  private readonly maxHot: number;
  private readonly weights: RetentionWeights;
  private readonly logOpts: { logPath?: string; sessionId?: string };

  constructor(
    maxHot: number = 4,
    weights: RetentionWeights = DEFAULT_WEIGHTS,
    logOpts: { logPath?: string; sessionId?: string } = {}
  ) {
    if (maxHot < 1) throw new RangeError('maxHot must be >= 1');
    this.maxHot = maxHot;
    this.weights = weights;
    this.logOpts = logOpts;
  }

  /**
   * Load a crystal into the hot tier.
   *
   * - If already hot: touches it (increments count + refreshes timestamp).
   * - If hot tier has room: adds it.
   * - If hot tier is full: evicts the crystal with the lowest retention score
   *   (cornerstones are never evicted), then adds the new crystal.
   *
   * Returns an EvictionEvent if a crystal was demoted, null otherwise.
   */
  loadToHot(crystal: C, now: number = Date.now()): EvictionEvent | null {
    if (this.hot.has(crystal.id)) {
      this._touch(crystal.id, now);
      return null;
    }

    this.warm.delete(crystal.id);

    if (this.hot.size < this.maxHot) {
      this.hot.set(crystal.id, {
        crystal,
        stats: { loadCount: 1, lastLoadedAt: now },
      });
      logLoad(
        { crystalIds: [crystal.id], tier: 'unknown', source: 'on-demand' },
        this.logOpts
      );
      return null;
    }

    // Hot tier full — evict the lowest-retention non-cornerstone crystal.
    const eviction = this._evictOne(now);
    this.hot.set(crystal.id, {
      crystal,
      stats: { loadCount: 1, lastLoadedAt: now },
    });
    logLoad(
      { crystalIds: [crystal.id], tier: 'unknown', source: 'on-demand' },
      this.logOpts
    );
    return eviction;
  }

  /**
   * Explicitly move a crystal from hot to warm (e.g. on session end).
   * Returns false if the crystal was not in the hot tier.
   */
  demoteToWarm(crystalId: string): boolean {
    if (!this.hot.has(crystalId)) return false;
    this.hot.delete(crystalId);
    this.warm.add(crystalId);
    logUnload({ crystalIds: [crystalId], reason: 'manual' }, this.logOpts);
    return true;
  }

  /**
   * Record an access touch for a hot crystal (e.g. it was queried and used).
   * No-op if the crystal is not currently hot.
   */
  touch(crystalId: string, now: number = Date.now()): void {
    this._touch(crystalId, now);
  }

  getHotCrystals(): C[] {
    return Array.from(this.hot.values()).map((e) => e.crystal);
  }

  getWarmIds(): string[] {
    return Array.from(this.warm);
  }

  isHot(crystalId: string): boolean {
    return this.hot.has(crystalId);
  }

  isWarm(crystalId: string): boolean {
    return this.warm.has(crystalId);
  }

  getStats(crystalId: string): CrystalLoadStats | null {
    return this.hot.get(crystalId)?.stats ?? null;
  }

  get hotSize(): number {
    return this.hot.size;
  }

  get warmSize(): number {
    return this.warm.size;
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private _touch(crystalId: string, now: number): void {
    const entry = this.hot.get(crystalId);
    if (!entry) return;
    entry.stats.loadCount += 1;
    entry.stats.lastLoadedAt = now;
  }

  private _evictOne(now: number): EvictionEvent | null {
    let lowestId: string | null = null;
    let lowestScore = Infinity;

    for (const [id, entry] of this.hot) {
      if (entry.crystal.isCornerstone) continue; // cornerstones are eviction-exempt
      const score = computeRetentionScore(
        entry.stats,
        entry.crystal.significance,
        this.weights,
        now
      );
      if (score < lowestScore) {
        lowestScore = score;
        lowestId = id;
      }
    }

    if (lowestId === null) {
      // All hot crystals are cornerstones — evict newest non-cornerstone if any,
      // or give up (caller added more cornerstones than maxHot allows).
      return null;
    }

    this.hot.delete(lowestId);
    this.warm.add(lowestId);
    logEviction(
      {
        crystalId: lowestId,
        evictionScore: lowestScore,
        cacheType: 'hot',
        reason: 'lru',
      },
      this.logOpts
    );
    logUnload({ crystalIds: [lowestId], reason: 'eviction' }, this.logOpts);
    return {
      evictedId: lowestId,
      retentionScore: lowestScore,
      demotedToWarm: true,
    };
  }
}
