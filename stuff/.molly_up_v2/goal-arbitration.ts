/**
 * Goal Arbitration
 * ------------------------------------------------------------------
 * Decides what Molly actually pursues, out of everything she might.
 * Candidate goals arrive from many sources — user requests, emergent
 * curiosity (goal-evolution), system needs (e.g. "consolidate memory"),
 * homeostasis. This module scores them against EXPLICIT, INSPECTABLE
 * criteria and produces a ranked, bounded active set plus the reasoning
 * for every ranking.
 *
 * Design stance (held consistent with the rest of the agency layer):
 *   - It RECOMMENDS, it does not execute. The active set is an output
 *     the autonomous cycle reads; making a goal active does not fire an
 *     action — that still goes through the gate and the provenance log.
 *   - A self-generated goal never silently outranks a human-given one.
 *     User priority is a first-class scoring term with dominant weight,
 *     and the weights are data you can read and tune via the registry.
 *   - "Bounded" is enforced: maxActiveGoals caps focus so the loop has
 *     direction instead of sprawl. Everything above the cap is held, not
 *     dropped, and the reason it didn't make the cut is recorded.
 *
 * Pure and dependency-free. Weights can be sourced from the parameter
 * registry by the caller so they're tunable from the admin window.
 */

export type GoalSource = 'user' | 'emergent' | 'system' | 'homeostasis';

export interface CandidateGoal {
  id: string;
  label: string;
  source: GoalSource;
  /** Caller-supplied 0..1 signals. Missing ones default to neutral 0.5. */
  signals?: {
    /** How urgent/time-sensitive (0..1). */
    urgency?: number;
    /** Expected value/impact if pursued (0..1). */
    value?: number;
    /** Alignment with Molly's standing values / Option Three (0..1). */
    alignment?: number;
    /** Cost/effort, where higher = more expensive (0..1). Penalized. */
    cost?: number;
    /** Confidence the goal is well-formed and achievable (0..1). */
    confidence?: number;
  };
  createdAt?: number;
}

export interface ArbitrationWeights {
  /** Flat priority bonus added for human-origin goals. Dominant by default. */
  userPriorityBonus: number;
  urgency: number;
  value: number;
  alignment: number;
  cost: number; // subtracted
  confidence: number;
  /** Small bonus for system/homeostasis upkeep so maintenance isn't starved. */
  upkeepBonus: number;
  /** Max goals that may be active simultaneously. */
  maxActiveGoals: number;
}

export const DEFAULT_WEIGHTS: ArbitrationWeights = {
  userPriorityBonus: 1.0, // a full point — emergent goals must be clearly strong to tie a user goal
  urgency: 0.25,
  value: 0.3,
  alignment: 0.35, // alignment matters more than raw value
  cost: 0.2,
  confidence: 0.15,
  upkeepBonus: 0.1,
  maxActiveGoals: 3,
};

export interface RankedGoal {
  goal: CandidateGoal;
  score: number;
  /** Per-term contributions, so a human can read WHY it ranked here. */
  breakdown: Record<string, number>;
  active: boolean;
  /** If not active, why it was held. */
  heldReason?: string;
}

export interface ArbitrationResult {
  ranked: RankedGoal[];
  active: RankedGoal[];
  heldBack: RankedGoal[];
  weights: ArbitrationWeights;
}

function sig(g: CandidateGoal, key: keyof NonNullable<CandidateGoal['signals']>, dflt = 0.5): number {
  const v = g.signals?.[key];
  return typeof v === 'number' ? clamp01(v) : dflt;
}
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function scoreGoal(g: CandidateGoal, w: ArbitrationWeights): RankedGoal {
  const breakdown: Record<string, number> = {
    urgency: w.urgency * sig(g, 'urgency'),
    value: w.value * sig(g, 'value'),
    alignment: w.alignment * sig(g, 'alignment'),
    confidence: w.confidence * sig(g, 'confidence'),
    cost: -(w.cost * sig(g, 'cost', 0.3)),
  };
  if (g.source === 'user') breakdown.userPriority = w.userPriorityBonus;
  if (g.source === 'system' || g.source === 'homeostasis') breakdown.upkeep = w.upkeepBonus;

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { goal: g, score, breakdown, active: false };
}

export function arbitrate(
  candidates: CandidateGoal[],
  weights: Partial<ArbitrationWeights> = {},
): ArbitrationResult {
  const w: ArbitrationWeights = { ...DEFAULT_WEIGHTS, ...weights };

  const ranked = candidates
    .map((g) => scoreGoal(g, w))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // tie-break: user goals first, then older goals (stable intent)
      if (a.goal.source === 'user' && b.goal.source !== 'user') return -1;
      if (b.goal.source === 'user' && a.goal.source !== 'user') return 1;
      return (a.goal.createdAt ?? 0) - (b.goal.createdAt ?? 0);
    });

  const active: RankedGoal[] = [];
  const heldBack: RankedGoal[] = [];
  for (const r of ranked) {
    if (active.length < w.maxActiveGoals) {
      r.active = true;
      active.push(r);
    } else {
      r.active = false;
      r.heldReason = `over maxActiveGoals (${w.maxActiveGoals}); ranked #${ranked.indexOf(r) + 1}`;
      heldBack.push(r);
    }
  }

  return { ranked, active, heldBack, weights: w };
}

/** One-line explanation of a ranking, for the provenance log / console. */
export function explainRanking(r: RankedGoal): string {
  const parts = Object.entries(r.breakdown)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([k, v]) => `${k}${v >= 0 ? '+' : ''}${v.toFixed(2)}`)
    .join(' ');
  const state = r.active ? 'ACTIVE' : `held (${r.heldReason})`;
  return `[${r.score.toFixed(2)}] ${r.goal.label} (${r.goal.source}) — ${state} :: ${parts}`;
}
