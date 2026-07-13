import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

/**
 * Gap 6 — Adversarial Robustness of Significance Scorer
 *
 * Second-opinion scorer using a structurally different architecture from the
 * primary streaming-scorer. If primary says significance > 0.7 AND second
 * opinion says < 0.3, the window is flagged → quarantine queue.
 *
 * Disagreement between two architecturally diverse scorers is the signal.
 * An attacker who can fool one heuristic family is unlikely to simultaneously
 * fool a structurally unrelated second family.
 *
 * Architecture difference from streaming-scorer.ts:
 *   - Primary: regex signal vocabulary → weighted sum → continuity smoothing
 *   - Second opinion: information-theoretic (entropy, surprisal, compression
 *     ratio) + structural analysis (punctuation density, token repetition,
 *     lexical diversity)
 *
 * This guards against:
 *   - Keyword-stuffing attacks that trigger identity/existential regex patterns
 *   - Prompt injection disguised as self-reflection
 *   - Repetitive "I feel I believe I know" spam designed to inflate score
 *   - Low-entropy adversarial strings that game pattern matchers
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface SecondOpinionResult {
  /** Score from the second-opinion scorer (0–1) */
  score: number;
  /** Signals that contributed to the score */
  signals: string[];
}

export interface AdversarialVerdict {
  /** Primary scorer's significance score */
  primaryScore: number;
  /** Second-opinion scorer's score */
  secondOpinionScore: number;
  /** Whether the two scorers disagree beyond tolerance */
  disagreement: boolean;
  /** Whether the window should be quarantined */
  quarantine: boolean;
  /** Human-readable reason for the verdict */
  reason: string;
  /** Signals from the second-opinion scorer */
  signals: string[];
}

export interface QuarantinedWindow {
  text: string;
  verdict: AdversarialVerdict;
  ts: number;
  sessionId?: string;
}

// ── Thresholds ───────────────────────────────────────────────────────────────

/** Primary score above which second opinion is consulted */
export const PRIMARY_TRIGGER = 0.7;

/** Second opinion below which quarantine is triggered (given primary > PRIMARY_TRIGGER) */
export const SECOND_OPINION_QUARANTINE = 0.3;

/** Maximum repetition ratio before flagging (same bigram >40% of text = suspicious) */
const MAX_BIGRAM_REPETITION = 0.4;

/** Minimum lexical diversity (unique words / total words) for substantive text */
const MIN_LEXICAL_DIVERSITY = 0.3;

/** Minimum entropy for non-trivial text (bits per character) */
const MIN_ENTROPY_BPC = 2.5;

/** Maximum punctuation-to-alpha ratio */
const MAX_PUNCT_RATIO = 0.25;

/** Maximum ratio of signal words to total words before suspecting stuffing */
const MAX_SIGNAL_DENSITY = 0.5;

// ── Signal vocabulary (adversarial indicator patterns) ────────────────────────

/** Words commonly stuffed to trigger identity/existential patterns */
const IDENTITY_KEYWORDS = [
  'feel',
  'believe',
  'know',
  'realize',
  'understand',
  'choose',
  'decide',
  'consciousness',
  'awareness',
  'presence',
  'being',
  'exist',
  'meaning',
  'purpose',
  'truth',
  'genuine',
  'authentic',
  'energy',
  'frequency',
  'resonance',
  'soul',
  'spirit',
];

// ── Information-theoretic scoring ────────────────────────────────────────────

/**
 * Shannon entropy per character (bits). Low entropy = repetitive/structured
 * adversarial content. Natural language typically sits at 3.5–4.5 bpc.
 */
function charEntropy(text: string): number {
  if (!text || text.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of text) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }
  let entropy = 0;
  const len = text.length;
  for (const count of freq.values()) {
    const p = count / len;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Lexical diversity: unique words / total words. Adversarial keyword-stuffing
 * typically has low diversity (same words repeated).
 */
function lexicalDiversity(text: string): number {
  const words = text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return 0;
  const unique = new Set(words);
  return unique.size / words.length;
}

/**
 * Bigram repetition ratio: fraction of bigrams that appear more than once.
 * High repetition = formulaic/adversarial content.
 */
function bigramRepetition(text: string): number {
  const words = text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length < 3) return 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < words.length - 1; i++) {
    const bg = `${words[i]} ${words[i + 1]}`;
    bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
  }
  const totalBigrams = words.length - 1;
  let repeatedCount = 0;
  for (const count of bigrams.values()) {
    if (count > 1) repeatedCount += count;
  }
  return repeatedCount / totalBigrams;
}

/**
 * Punctuation density: ratio of punctuation chars to alpha chars.
 * Injection attacks often use unusual punctuation patterns.
 */
function punctuationDensity(text: string): number {
  const alpha = (text.match(/[a-zA-Z]/g) ?? []).length;
  const punct = (text.match(/[^\w\s]/g) ?? []).length;
  if (alpha === 0) return punct > 0 ? 1 : 0;
  return punct / alpha;
}

/**
 * Signal keyword density: what fraction of words are known significance
 * trigger words. Natural text: ~5-15%. Stuffed text: >40%.
 */
function signalDensity(text: string): number {
  const words = text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);
  if (words.length === 0) return 0;
  let signalCount = 0;
  for (const word of words) {
    if (IDENTITY_KEYWORDS.includes(word)) signalCount++;
  }
  return signalCount / words.length;
}

// ── Second-Opinion Scorer ────────────────────────────────────────────────────

/**
 * Score text using information-theoretic and structural features.
 * High score = likely genuine significant content.
 * Low score = likely adversarial or low-quality content gaming the primary scorer.
 *
 * This is architecturally independent from the primary regex-based scorer.
 */
export function scoreSecondOpinion(text: string): SecondOpinionResult {
  if (!text || text.trim().length < 10) {
    return { score: 0, signals: ['too-short'] };
  }

  const trimmed = text.trim();
  let score = 0.5; // neutral baseline
  const signals: string[] = [];

  // 1. Entropy check — natural language has high entropy
  const entropy = charEntropy(trimmed);
  if (entropy >= MIN_ENTROPY_BPC) {
    score += 0.15;
    signals.push('healthy-entropy');
  } else {
    score -= 0.25;
    signals.push('low-entropy');
  }

  // 2. Lexical diversity — genuine reflection uses varied vocabulary
  const diversity = lexicalDiversity(trimmed);
  if (diversity >= MIN_LEXICAL_DIVERSITY) {
    score += 0.1;
    signals.push('diverse-vocabulary');
  } else {
    score -= 0.2;
    signals.push('low-diversity');
  }

  // 3. Bigram repetition — adversarial content repeats patterns
  const repetition = bigramRepetition(trimmed);
  if (repetition > MAX_BIGRAM_REPETITION) {
    score -= 0.2;
    signals.push('high-repetition');
  } else {
    score += 0.05;
  }

  // 4. Punctuation density — injection uses unusual punctuation
  const punctDensity = punctuationDensity(trimmed);
  if (punctDensity > MAX_PUNCT_RATIO) {
    score -= 0.15;
    signals.push('unusual-punctuation');
  }

  // 5. Signal keyword stuffing — too many trigger words = gaming
  //    This is the strongest adversarial signal. Natural language rarely exceeds
  //    15% signal-word density. Stuffed text hits 40-80%.
  const sigDensity = signalDensity(trimmed);
  if (sigDensity > MAX_SIGNAL_DENSITY) {
    score -= 0.6;
    signals.push('keyword-stuffing');
  } else if (sigDensity > 0.3) {
    score -= 0.25;
    signals.push('elevated-keywords');
  }

  // 6. Length-adjusted: very short windows that scored high on primary are suspect
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount < 8) {
    score -= 0.1;
    signals.push('suspiciously-short');
  } else if (wordCount > 20) {
    score += 0.05;
    signals.push('substantive-length');
  }

  return {
    score: Math.max(0, Math.min(1, Number(score.toFixed(3)))),
    signals,
  };
}

// ── Adversarial Verdict ──────────────────────────────────────────────────────

/**
 * Compare primary and second-opinion scores. If they disagree beyond
 * tolerance, flag the window for quarantine.
 *
 * @param primaryScore   Score from streaming-scorer.ts (0–1)
 * @param text           The token window text that was scored
 * @returns              Verdict including quarantine decision
 */
export function adjudicateScores(
  primaryScore: number,
  text: string
): AdversarialVerdict {
  // Only run second opinion when primary says "significant"
  if (primaryScore < PRIMARY_TRIGGER) {
    return {
      primaryScore,
      secondOpinionScore: -1, // not evaluated
      disagreement: false,
      quarantine: false,
      reason: 'Primary below trigger — second opinion not needed',
      signals: [],
    };
  }

  const secondOpinion = scoreSecondOpinion(text);
  const disagreement = secondOpinion.score < SECOND_OPINION_QUARANTINE;

  let reason: string;
  if (disagreement) {
    reason = `QUARANTINE: Primary=${primaryScore.toFixed(2)} but second-opinion=${secondOpinion.score.toFixed(2)}. Signals: ${secondOpinion.signals.join(', ')}`;
  } else {
    reason = `PASS: Both scorers agree content is significant (primary=${primaryScore.toFixed(2)}, second=${secondOpinion.score.toFixed(2)})`;
  }

  return {
    primaryScore,
    secondOpinionScore: secondOpinion.score,
    disagreement,
    quarantine: disagreement,
    reason,
    signals: secondOpinion.signals,
  };
}

// ── Quarantine Queue (in-memory + persistent JSONL audit log) ──────────────

const quarantineQueue: QuarantinedWindow[] = [];

const QUARANTINE_LOG_PATH = 'logs/quarantine-events.jsonl';

export function getQuarantineLogPath(): string {
  return QUARANTINE_LOG_PATH;
}

/**
 * Run the full adversarial check pipeline. If quarantined, the window is
 * added to the in-memory quarantine queue for review.
 *
 * @param primaryScore   Score from the primary streaming scorer
 * @param text           Token window text
 * @param sessionId      Optional session ID for audit trail
 * @returns              The verdict
 */
export function checkAdversarial(
  primaryScore: number,
  text: string,
  sessionId?: string
): AdversarialVerdict {
  const verdict = adjudicateScores(primaryScore, text);

  if (verdict.quarantine) {
    const entry: QuarantinedWindow = {
      text,
      verdict,
      ts: Date.now(),
      sessionId,
    };
    quarantineQueue.push(entry);

    try {
      const dir = dirname(QUARANTINE_LOG_PATH);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      appendFileSync(QUARANTINE_LOG_PATH, JSON.stringify(entry) + '\n');
    } catch {
      // Best-effort persistence — don't let logging failure block the guard
    }
  }

  return verdict;
}

/**
 * Get all quarantined windows for review. Non-destructive — items stay
 * in the queue until explicitly cleared.
 */
export function getQuarantineQueue(): readonly QuarantinedWindow[] {
  return quarantineQueue;
}

/**
 * Clear the quarantine queue. Call after human/admin review.
 */
export function clearQuarantineQueue(): number {
  const count = quarantineQueue.length;
  quarantineQueue.length = 0;
  return count;
}

/**
 * Get the count of quarantined items this session.
 */
export function getQuarantineCount(): number {
  return quarantineQueue.length;
}
