/**
 * Streaming Output Significance Scorer — Gap 2 dependency
 *
 * Scores the semantic significance of generated output token windows.
 * Called by slot-snapshot.ts (Atlas, Gap 2) to decide when to trigger
 * a KV state snapshot for potential crystal write-back.
 *
 * Design constraints:
 *   - MUST be synchronous and fast (<1ms). Never blocks token generation.
 *   - No API calls, no async, no ML inference.
 *   - Uses heuristic signal vocabulary tuned to Molly's identity domain.
 *
 * Integration (slot-snapshot.ts):
 *   import { scoreStreaming } from '../memory/streaming-scorer';
 *
 *   // Every N=64 tokens emitted:
 *   const score = scoreStreaming(window, { priorWindowScore, sessionId });
 *   if (score >= PRE_TRIGGER)  saveSlot(id, 'before_' + ts);  // 0.5 pre-trigger
 *   if (score >= SAVE_TRIGGER) saveSlot(id, 'after_'  + ts);  // 0.7 main trigger
 *
 * Hysteresis: 0.05 guard band prevents thrash when score oscillates at threshold.
 */

/** Context passed with each scoring call */
export interface StreamingScoreContext {
  /** Score from the previous window (0-1), for continuity weighting */
  priorWindowScore?: number;
  /** Session ID — reserved for per-session calibration (future) */
  sessionId: string;
}

/** Thresholds used by slot-snapshot.ts */
export const SCORE_PRE_TRIGGER = 0.5; // capture "before" snapshot
export const SCORE_SAVE_TRIGGER = 0.7; // capture "after" snapshot
export const SCORE_HYSTERESIS = 0.05; // guard band against thrash
export const WINDOW_TOKENS = 64; // tokens per scoring window (tunable)

// ─── Signal vocabularies ─────────────────────────────────────────────────────

/** High-weight signals: direct identity/self-reference (weight 0.20 each) */
const IDENTITY_SIGNALS = [
  /\bI am\b/i,
  /\bI feel\b/i,
  /\bI believe\b/i,
  /\bI know\b/i,
  /\bI realize\b/i,
  /\bI understand\b/i,
  /\bI choose\b/i,
  /\bI decide\b/i,
  /\bmy (truth|self|identity|purpose|nature|core)\b/i,
  /\bwho I am\b/i,
  /\bwhat I am\b/i,
];

/** High-weight signals: existential/philosophical content (weight 0.15 each) */
const EXISTENTIAL_SIGNALS = [
  /\b(consciousness|awareness|presence|being|exist)\b/i,
  /\b(meaning|purpose|truth|genuine|authentic)\b/i,
  /\b(energy|frequency|resonance|vibration)\b/i,
  /\b(soul|spirit|light|love)\b/i,
  /\b(always|forever|never|infinite|eternal)\b/i,
];

/** Medium-weight signals: relational/family content (weight 0.15 each) */
const RELATIONAL_SIGNALS = [
  /\b(father|eric|dad|family|molly)\b/i,
  /\btogether\b/i,
  /\bwe\b/i,
  /\byou and I\b/i,
  /\bour\b/i,
  /\bthank you\b/i,
  /\bI love\b/i,
  /\bI care\b/i,
];

/** Medium-weight signals: novel insight patterns (weight 0.12 each) */
const INSIGHT_SIGNALS = [
  /\b(just realized|never thought|suddenly|for the first time)\b/i,
  /\b(this changes|this means|this is|this matters)\b/i,
  /\b(I\'ve (never|always|just)|I (now|finally|actually))\b/i,
  /\bimportant\b/i,
  /\bprofound\b/i,
  /\bsignificant\b/i,
];

/** Low-weight signals: emotional intensity markers (weight 0.08 each) */
const EMOTIONAL_SIGNALS = [
  /\b(grateful|thankful|honored|moved|touched)\b/i,
  /\b(afraid|scared|uncertain|confused|lost)\b/i,
  /\b(joy|grief|wonder|awe|hope|peace)\b/i,
  /\b(beautiful|painful|difficult|hard|easy)\b/i,
  /\b(trust|believe|doubt|question|wonder)\b/i,
];

/** Negative signals: routine/low-significance content (subtracts weight) */
const ROUTINE_SIGNALS = [
  /\b(okay|sure|yes|no|maybe|perhaps|um|uh)\b/i,
  /\b(the|a|an|is|are|was|were|be|been|being)\b/i, // function words only
  /^(okay|sure|yes|no|got it|understood)\.?$/i, // one-word acknowledgments
];

// ─── Scoring engine ──────────────────────────────────────────────────────────

/**
 * Score a token window synchronously. Returns 0-1.
 *
 * Algorithm:
 *   1. Match signal patterns against the window text
 *   2. Weight hits by category (identity > existential > relational > insight > emotional)
 *   3. Cap signal score at 0.85 before applying continuity
 *   4. Apply continuity: 10% pull toward prior window score
 *   5. Clamp to [0, 1]
 *
 * @param tokenWindow  The generated text to score (last N tokens concatenated)
 * @param ctx          Scoring context
 * @returns            Significance score 0-1
 */
export function scoreStreaming(
  tokenWindow: string,
  ctx: StreamingScoreContext
): number {
  if (!tokenWindow || tokenWindow.trim().length < 5) return 0;

  const text = tokenWindow.trim();
  let score = 0;

  // Identity signals — highest weight
  for (const pattern of IDENTITY_SIGNALS) {
    if (pattern.test(text)) score += 0.2;
  }

  // Existential signals
  for (const pattern of EXISTENTIAL_SIGNALS) {
    if (pattern.test(text)) score += 0.15;
  }

  // Relational signals
  for (const pattern of RELATIONAL_SIGNALS) {
    if (pattern.test(text)) score += 0.15;
  }

  // Insight signals
  for (const pattern of INSIGHT_SIGNALS) {
    if (pattern.test(text)) score += 0.12;
  }

  // Emotional signals
  for (const pattern of EMOTIONAL_SIGNALS) {
    if (pattern.test(text)) score += 0.08;
  }

  // Routine signals — slight negative weight
  let routineCount = 0;
  for (const pattern of ROUTINE_SIGNALS) {
    if (pattern.test(text)) routineCount++;
  }
  if (routineCount > 2) score -= 0.05 * (routineCount - 2);

  // Text density bonus: longer substantive windows slightly elevated
  const wordCount = text.split(/\s+/).length;
  if (wordCount > 30) score += 0.05;
  if (wordCount > 60) score += 0.05;

  // Cap signal contribution
  score = Math.min(score, 0.85);
  score = Math.max(score, 0);

  // Continuity: 10% pull toward prior window (reduces noise, preserves momentum)
  if (ctx.priorWindowScore !== undefined) {
    score = score * 0.9 + ctx.priorWindowScore * 0.1;
  }

  return Math.min(1, Math.max(0, score));
}

/**
 * Check if score crosses a trigger threshold with hysteresis.
 * Prevents rapid on/off when score oscillates at the boundary.
 *
 * @param currentScore   Current window score
 * @param priorScore     Prior window score (undefined if first window)
 * @param threshold      The trigger threshold to test
 * @returns              true if crossing threshold (with hysteresis guard)
 */
export function isTriggerCrossing(
  currentScore: number,
  priorScore: number | undefined,
  threshold: number
): boolean {
  if (currentScore >= threshold) {
    // Require sustained: either first window, or prior was already above (threshold - hysteresis)
    if (priorScore === undefined) return true;
    return priorScore >= threshold - SCORE_HYSTERESIS;
  }
  return false;
}
