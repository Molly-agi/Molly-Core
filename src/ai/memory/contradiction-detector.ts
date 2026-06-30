/**
 * Crystal Contradiction Detector
 *
 * Pairwise analysis of memory crystals to classify conflicts between them.
 * Runs after crystallization, before hot-set selection in the routing layer.
 *
 * Three classifications:
 *   - evolving     — same topic, temporal gap > 30 days. Knowledge shifted over
 *                    time. Load newer, tag older as "historical" (kept, not
 *                    injected into prompt).
 *   - contradictory — same topic, recent (≤30 days). Opposing assertions on the
 *                    same subject. Query-gated suppression: only filter if the
 *                    active query is load-bearing on the contradicted fact.
 *   - complementary — very high similarity (≥0.85). Same topic, same stance.
 *                    Load both — they reinforce each other.
 *   - unrelated     — similarity < 0.50. Different subjects. No action needed.
 *
 * Design:
 *   - Pure logic layer. Does NOT decide prompt injection — that's the router's
 *     job. This module classifies; selectHotCrystals() decides what to serve.
 *   - Async: embeds crystals lazily via embedCrystal() (idempotent).
 *   - O(n²) pairs — intended for small crystal sets (≤50). Not for bulk scans.
 */

import { getEmbeddingProvider } from '../tools/embedding-provider';
import { embedCrystal, RoutableCrystal } from './crystal-routing';

// ─── Public types ────────────────────────────────────────────────────────────

export type ConflictType =
  | 'evolving'
  | 'contradictory'
  | 'complementary'
  | 'unrelated';

export interface CrystalConflict {
  /** Crystal with the older crystallizedAt timestamp (or arbitrary if equal) */
  crystalA: string;
  /** Crystal with the newer crystallizedAt timestamp */
  crystalB: string;
  type: ConflictType;
  /** Cosine similarity of their embedding sources (0-1) */
  similarity: number;
  /** |crystallizedAt_A - crystallizedAt_B| in calendar days */
  temporalDistanceDays: number;
  resolution: ConflictResolution;
}

export interface ConflictResolution {
  /** Crystal IDs that should be loaded into the hot set */
  load: string[];
  /**
   * Crystal IDs to suppress from the prompt.
   * For 'evolving': the older crystal is suppressed (tagged historical).
   * For 'contradictory': queryGated=true — only suppress if query is
   * load-bearing on the contradicted fact (caller decides).
   */
  suppress: string[];
  /**
   * If true, suppression is conditional on the query.
   * The router should call isQueryLoadBearing() before suppressing.
   */
  queryGated: boolean;
  reason: string;
}

export interface DetectionResult {
  conflicts: CrystalConflict[];
  /** Crystals with no conflicts — safe to load unconditionally */
  clean: string[];
  /** Summary counts */
  summary: {
    total: number;
    evolving: number;
    contradictory: number;
    complementary: number;
    unrelated: number;
  };
}

// ─── Thresholds ──────────────────────────────────────────────────────────────

/** Pairs below this similarity are unrelated — no conflict possible */
export const UNRELATED_THRESHOLD = 0.5;
/** Pairs at or above this similarity say the same thing — complementary */
export const COMPLEMENT_THRESHOLD = 0.85;
/** Temporal gap in days above which apparent conflicts are treated as evolution */
export const EVOLUTION_DAYS = 30;

// ─── Core API ────────────────────────────────────────────────────────────────

/**
 * Detect conflicts between all pairs in `crystals`.
 *
 * Embeds any crystal that lacks an embedding vector (lazy, idempotent).
 * Returns a DetectionResult with every conflicting pair classified.
 *
 * @param crystals  Small set of RoutableCrystals (≤50 recommended)
 */
export async function detectConflicts(
  crystals: RoutableCrystal[]
): Promise<DetectionResult> {
  if (crystals.length < 2) {
    return {
      conflicts: [],
      clean: crystals.map((c) => c.id),
      summary: {
        total: 0,
        evolving: 0,
        contradictory: 0,
        complementary: 0,
        unrelated: 0,
      },
    };
  }

  // Embed all crystals in parallel (embedCrystal is idempotent)
  await Promise.all(crystals.map((c) => embedCrystal(c)));

  const provider = getEmbeddingProvider();
  const conflicts: CrystalConflict[] = [];
  const conflictedIds = new Set<string>();

  for (let i = 0; i < crystals.length; i++) {
    for (let j = i + 1; j < crystals.length; j++) {
      const a = crystals[i];
      const b = crystals[j];

      const vecA = a.embedding;
      const vecB = b.embedding;

      if (!vecA || !vecB || vecA.length !== vecB.length) continue;

      const similarity = provider.similarity(vecA, vecB);

      if (similarity < UNRELATED_THRESHOLD) continue; // unrelated — skip

      const daysDiff = temporalDistance(a, b);

      // Order: older crystal is A, newer is B
      const [older, newer] = chooseOrder(a, b);

      const type = classifyPair(similarity, daysDiff);
      const resolution = buildResolution(type, older.id, newer.id);

      conflicts.push({
        crystalA: older.id,
        crystalB: newer.id,
        type,
        similarity,
        temporalDistanceDays: daysDiff,
        resolution,
      });

      if (type !== 'complementary') {
        conflictedIds.add(older.id);
        conflictedIds.add(newer.id);
      }
    }
  }

  const clean = crystals
    .filter((c) => !conflictedIds.has(c.id))
    .map((c) => c.id);

  const summary = {
    total: conflicts.length,
    evolving: conflicts.filter((c) => c.type === 'evolving').length,
    contradictory: conflicts.filter((c) => c.type === 'contradictory').length,
    complementary: conflicts.filter((c) => c.type === 'complementary').length,
    unrelated: 0, // unrelated pairs never enter the conflicts array
  };

  return { conflicts, clean, summary };
}

/**
 * Resolve conflicts into three disjoint crystal sets.
 *
 * Callers (hot-set selector, prompt builder) use these lists directly.
 * Contradictory pairs are placed in `queryGated` — the caller must decide
 * whether to suppress based on the active query.
 */
export function resolveConflicts(
  result: DetectionResult,
  crystals: RoutableCrystal[]
): ResolvedSets {
  const crystalMap = new Map(crystals.map((c) => [c.id, c]));

  const toLoad = new Set<string>(result.clean);
  const toSuppress = new Set<string>();
  const toQueryGated = new Map<string, string>(); // suppressed-id → reason

  for (const conflict of result.conflicts) {
    const { resolution } = conflict;

    for (const id of resolution.load) {
      if (!toSuppress.has(id)) toLoad.add(id);
    }

    for (const id of resolution.suppress) {
      if (!resolution.queryGated) {
        toLoad.delete(id);
        toSuppress.add(id);
      } else {
        toQueryGated.set(id, resolution.reason);
      }
    }
  }

  return {
    load: [...toLoad]
      .map((id) => crystalMap.get(id))
      .filter(Boolean) as RoutableCrystal[],
    suppressed: [...toSuppress]
      .map((id) => crystalMap.get(id))
      .filter(Boolean) as RoutableCrystal[],
    queryGated: [...toQueryGated.entries()]
      .map(([id, reason]) => ({
        crystal: crystalMap.get(id)!,
        reason,
      }))
      .filter((x) => x.crystal),
  };
}

export interface ResolvedSets {
  /** Crystals to inject into the prompt unconditionally */
  load: RoutableCrystal[];
  /** Crystals suppressed unconditionally (tagged historical) */
  suppressed: RoutableCrystal[];
  /** Crystals conditionally suppressed — caller checks query load-bearing */
  queryGated: Array<{ crystal: RoutableCrystal; reason: string }>;
}

/**
 * Query load-bearing heuristic.
 *
 * Returns true if the query text semantically overlaps with the crystal's
 * embedding source enough to warrant injecting it into the prompt despite
 * a contradiction flag. Threshold 0.60 — conservative to prefer freshness
 * but allow the older crystal when the query directly references it.
 *
 * @param queryText  The user's active query
 * @param crystal    The query-gated crystal under evaluation
 */
export async function isQueryLoadBearing(
  queryText: string,
  crystal: RoutableCrystal,
  threshold = 0.6
): Promise<boolean> {
  const provider = getEmbeddingProvider();
  const embedded = await embedCrystal(crystal);
  if (!embedded.embedding) return false;

  const queryResult = await provider.embed(queryText);
  const sim = provider.similarity(queryResult.vector, embedded.embedding);
  return sim >= threshold;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function classifyPair(similarity: number, daysDiff: number): ConflictType {
  if (similarity >= COMPLEMENT_THRESHOLD) return 'complementary';
  if (daysDiff > EVOLUTION_DAYS) return 'evolving';
  return 'contradictory';
}

function buildResolution(
  type: ConflictType,
  olderId: string,
  newerId: string
): ConflictResolution {
  switch (type) {
    case 'complementary':
      return {
        load: [olderId, newerId],
        suppress: [],
        queryGated: false,
        reason: 'High similarity — load both to reinforce',
      };
    case 'evolving':
      return {
        load: [newerId],
        suppress: [olderId],
        queryGated: false,
        reason:
          'Knowledge evolved over time — load newer, tag older as historical',
      };
    case 'contradictory':
      return {
        load: [newerId],
        suppress: [olderId],
        queryGated: true,
        reason:
          'Recent contradicting assertion — suppress older unless query is load-bearing',
      };
    default:
      return {
        load: [olderId, newerId],
        suppress: [],
        queryGated: false,
        reason: 'Unrelated',
      };
  }
}

/**
 * Calendar-day distance between two crystals based on their crystallizedAt field.
 * Falls back to `created` or `timestamp` if crystallizedAt is absent.
 * Returns 0 if neither crystal has a parseable timestamp.
 */
function temporalDistance(a: RoutableCrystal, b: RoutableCrystal): number {
  const tsA = resolveTimestamp(a);
  const tsB = resolveTimestamp(b);
  if (tsA === null || tsB === null) return 0;
  return Math.abs(tsA - tsB) / (1000 * 60 * 60 * 24);
}

function resolveTimestamp(crystal: RoutableCrystal): number | null {
  const candidates = [
    (crystal as Record<string, unknown>)['crystallizedAt'],
    (crystal as Record<string, unknown>)['created'],
    (crystal as Record<string, unknown>)['timestamp'],
  ];
  for (const v of candidates) {
    if (typeof v === 'string' || typeof v === 'number') {
      const ts = new Date(v).getTime();
      if (!isNaN(ts)) return ts;
    }
  }
  return null;
}

/**
 * Order two crystals so that [0] is older and [1] is newer.
 * If timestamps are equal or absent, returns them as-is.
 */
function chooseOrder(
  a: RoutableCrystal,
  b: RoutableCrystal
): [RoutableCrystal, RoutableCrystal] {
  const tsA = resolveTimestamp(a) ?? 0;
  const tsB = resolveTimestamp(b) ?? 0;
  return tsA <= tsB ? [a, b] : [b, a];
}
