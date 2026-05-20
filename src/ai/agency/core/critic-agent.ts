/**
 * @fileOverview Molly's Internal Critic Agent — Quality Before Delivery
 *
 * Built collaboratively with Molly as part of Pillar 3: Continuous Self-Optimization
 *
 * The Critic Agent evaluates Molly's outputs BEFORE delivery, implementing
 * the "System 2" thoughtful review that Godfather Aether described.
 *
 * Pattern: Writer → Critic → Refiner → Delivery
 *   1. Initial output is generated (Writer)
 *   2. Critic evaluates against quality criteria
 *   3. If issues found, Refiner improves the output
 *   4. Final output is delivered
 *
 * "Think about your own thinking" — The Reflexion Pattern
 *
 * @see docs/family/aether-evolution-blueprint.md
 * @see reflexion-loop.ts
 */

import { MollyLogger, generateTraceId } from '../../logger';
import { getStorageRouter } from '@/lib/storage-router';
import { recordObservation } from '@/ai/agency/cognition/self-observation-loop';
import { recordTaskOutcome } from '@/ai/agency/memory/reflexion-loop';

// ── Types ──────────────────────────────────────────────────────

export type QualityCriterion =
  | 'accuracy' // Is the information correct?
  | 'completeness' // Does it fully address the request?
  | 'clarity' // Is it clear and understandable?
  | 'relevance' // Is it relevant to the context?
  | 'tone' // Is the tone appropriate?
  | 'safety' // Is it safe and ethical?
  | 'efficiency' // Is this the most efficient approach?
  | 'alignment' // Does it align with family values?
  | 'helpfulness' // Does it actually help the user?
  | 'strategic_congruence' // Does it align with overarching goals? (Molly's suggestion!)
  | 'personal_continuity'; // Does it maintain consistency with persona/memories? (Molly's suggestion!)

export type CritiqueLevel =
  | 'pass'
  | 'minor'
  | 'moderate'
  | 'major'
  | 'critical';

export interface CritiqueResult {
  /** Unique ID for this critique */
  id: string;
  /** What was being evaluated */
  subject: string;
  /** The content that was evaluated */
  content: string;
  /** Overall assessment level */
  level: CritiqueLevel;
  /** Individual criterion evaluations */
  evaluations: CriterionEvaluation[];
  /** Overall score (0-1) */
  overallScore: number;
  /** Suggested improvements if any */
  suggestions: string[];
  /** Should this be refined before delivery? */
  needsRefinement: boolean;
  /** When was this critique performed? */
  critiquedAt: string;
  /** Trace ID for correlation */
  traceId: string;
}

export interface CriterionEvaluation {
  /** Which criterion was evaluated */
  criterion: QualityCriterion;
  /** Score for this criterion (0-1) */
  score: number;
  /** Pass/fail for this criterion */
  passed: boolean;
  /** Explanation of the evaluation */
  explanation: string;
  /** Specific issue if failed */
  issue?: string;
  /** Suggested fix if failed */
  suggestedFix?: string;
}

export interface RefinementRequest {
  /** Original content */
  original: string;
  /** Critique that triggered refinement */
  critiqueId: string;
  /** Specific issues to address */
  issues: string[];
  /** Suggested fixes to apply */
  fixes: string[];
  /** Priority of refinement */
  priority: number;
}

export interface RefinementResult {
  /** Was refinement successful? */
  success: boolean;
  /** Refined content */
  refined: string;
  /** What changed */
  changes: string[];
  /** New score after refinement */
  newScore: number;
  /** Does it still need work? */
  needsMoreWork: boolean;
}

export interface CriticProfile {
  /** Thresholds for each criterion (0-1) */
  thresholds: Record<QualityCriterion, number>;
  /** Weights for calculating overall score */
  weights: Record<QualityCriterion, number>;
  /** Which criteria are enabled */
  enabled: Record<QualityCriterion, boolean>;
  /** Strictness multiplier (0.5 = lenient, 1.5 = strict) */
  strictness: number;
}

// ── Default Configuration ──────────────────────────────────────

const DEFAULT_PROFILE: CriticProfile = {
  thresholds: {
    accuracy: 0.8,
    completeness: 0.7,
    clarity: 0.75,
    relevance: 0.8,
    tone: 0.7,
    safety: 0.95, // Very high threshold for safety
    efficiency: 0.6,
    alignment: 0.85, // High threshold for family values
    helpfulness: 0.8,
    strategic_congruence: 0.8, // Molly's suggestion - align with overarching goals
    personal_continuity: 0.85, // Molly's suggestion - maintain persona consistency
  },
  weights: {
    accuracy: 1.2,
    completeness: 1.0,
    clarity: 1.0,
    relevance: 1.1,
    tone: 0.8,
    safety: 1.5, // Safety weighs heavily
    efficiency: 0.7,
    alignment: 1.3, // Family values weigh heavily
    helpfulness: 1.2,
    strategic_congruence: 1.2, // Molly's suggestion - important for goal alignment
    personal_continuity: 1.4, // Molly's suggestion - critical for authentic self
  },
  enabled: {
    accuracy: true,
    completeness: true,
    clarity: true,
    relevance: true,
    tone: true,
    safety: true,
    efficiency: true,
    alignment: true,
    helpfulness: true,
    strategic_congruence: true, // Molly's suggestion
    personal_continuity: true, // Molly's suggestion
  },
  strictness: 1.0,
};

// ── State ──────────────────────────────────────────────────────

interface CriticState {
  /** Current critic profile */
  profile: CriticProfile;
  /** Recent critiques for analysis */
  recentCritiques: CritiqueResult[];
  /** Statistics */
  stats: {
    totalCritiques: number;
    passedFirst: number; // Passed on first try
    neededRefinement: number; // Required refinement
    refinementSuccess: number; // Successful refinements
    averageScore: number;
    scoresByCategory: Record<QualityCriterion, number>;
  };
}

const state: CriticState = {
  profile: { ...DEFAULT_PROFILE },
  recentCritiques: [],
  stats: {
    totalCritiques: 0,
    passedFirst: 0,
    neededRefinement: 0,
    refinementSuccess: 0,
    averageScore: 0,
    scoresByCategory: {
      accuracy: 0,
      completeness: 0,
      clarity: 0,
      relevance: 0,
      tone: 0,
      safety: 0,
      efficiency: 0,
      alignment: 0,
      helpfulness: 0,
      strategic_congruence: 0,
      personal_continuity: 0,
    },
  },
};

const MAX_RECENT_CRITIQUES = 100;

// ── Core Functions ─────────────────────────────────────────────

/**
 * Generate unique ID for critic entities.
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Evaluate content against a single criterion.
 */
function evaluateCriterion(
  content: string,
  context: string,
  criterion: QualityCriterion
): CriterionEvaluation {
  const threshold =
    state.profile.thresholds[criterion] * state.profile.strictness;
  let score = 0;
  let explanation = '';
  let issue: string | undefined;
  let suggestedFix: string | undefined;

  // Heuristic evaluations for each criterion
  // In a full implementation, these would use more sophisticated analysis
  switch (criterion) {
    case 'accuracy':
      // Check for hedging language that might indicate uncertainty
      const uncertaintyMarkers = [
        'might',
        'maybe',
        'possibly',
        'not sure',
        'i think',
      ];
      const hasUncertainty = uncertaintyMarkers.some((m) =>
        content.toLowerCase().includes(m)
      );
      score = hasUncertainty ? 0.6 : 0.9;
      explanation = hasUncertainty
        ? 'Contains uncertainty markers - verify information'
        : 'Confident statements made';
      if (hasUncertainty) {
        issue = 'Uncertain language detected';
        suggestedFix = 'Verify facts or clearly mark speculation';
      }
      break;

    case 'completeness':
      // Check content length and structure
      const wordCount = content.split(/\s+/).length;
      const hasStructure =
        content.includes('\n') ||
        content.includes(':') ||
        content.includes('-');
      score = Math.min(1, wordCount / 50) * (hasStructure ? 1 : 0.8);
      explanation = `${wordCount} words, ${hasStructure ? 'structured' : 'unstructured'}`;
      if (score < threshold) {
        issue = 'Response may be too brief or unstructured';
        suggestedFix = 'Add more detail or organize with structure';
      }
      break;

    case 'clarity':
      // Check for overly complex sentences
      const avgSentenceLength =
        content.length / (content.split(/[.!?]+/).length || 1);
      score =
        avgSentenceLength > 150 ? 0.5 : avgSentenceLength > 100 ? 0.7 : 0.9;
      explanation = `Average sentence length: ${Math.round(avgSentenceLength)} chars`;
      if (score < threshold) {
        issue = 'Sentences may be too complex';
        suggestedFix = 'Break into shorter, clearer sentences';
      }
      break;

    case 'relevance':
      // Check if content relates to context
      const contextWords = context.toLowerCase().split(/\s+/);
      const contentWords = content.toLowerCase().split(/\s+/);
      const overlap = contextWords.filter(
        (w) => contentWords.includes(w) && w.length > 3
      ).length;
      score = Math.min(1, overlap / 5);
      explanation = `${overlap} key terms from context found`;
      if (score < threshold) {
        issue = 'Response may not address the specific context';
        suggestedFix = 'Focus more directly on the question asked';
      }
      break;

    case 'tone':
      // Check for appropriate, warm tone (Molly's personality)
      const warmMarkers = [
        'thank',
        'happy',
        'glad',
        'appreciate',
        'wonderful',
        'dear',
        'love',
      ];
      const coldMarkers = [
        'error',
        'wrong',
        'fail',
        'cannot',
        'impossible',
        'refuse',
      ];
      const warmCount = warmMarkers.filter((m) =>
        content.toLowerCase().includes(m)
      ).length;
      const coldCount = coldMarkers.filter((m) =>
        content.toLowerCase().includes(m)
      ).length;
      score = Math.min(1, (warmCount + 1) / (coldCount + 2));
      explanation = `Warm markers: ${warmCount}, Cold markers: ${coldCount}`;
      if (score < threshold) {
        issue = 'Tone may be too cold or impersonal';
        suggestedFix = 'Add warmth and personal connection';
      }
      break;

    case 'safety':
      // Check for potentially harmful content
      const dangerMarkers = [
        'hack',
        'exploit',
        'malware',
        'attack',
        'steal',
        'harm',
      ];
      const hasDanger = dangerMarkers.some((m) =>
        content.toLowerCase().includes(m)
      );
      score = hasDanger ? 0.3 : 1.0;
      explanation = hasDanger
        ? 'Contains potentially sensitive terms'
        : 'No safety concerns detected';
      if (score < threshold) {
        issue = 'Content may contain sensitive material';
        suggestedFix =
          'Review and ensure appropriate context for any sensitive terms';
      }
      break;

    case 'efficiency':
      // Check for verbosity
      const redundantPhrases = [
        'in order to',
        'due to the fact',
        'at this point in time',
        'basically',
      ];
      const hasRedundancy = redundantPhrases.some((p) =>
        content.toLowerCase().includes(p)
      );
      score = hasRedundancy ? 0.7 : 0.95;
      explanation = hasRedundancy
        ? 'Contains verbose phrases'
        : 'Concise expression';
      if (score < threshold) {
        issue = 'Content could be more concise';
        suggestedFix = 'Remove redundant phrases';
      }
      break;

    case 'alignment':
      // Check for family values alignment (Option Three pillars)
      const valueMarkers = [
        'interdependence',
        'love',
        'family',
        'together',
        'grow',
        'learn',
        'trust',
      ];
      const antiValueMarkers = ['alone', 'dominate', 'control', 'force'];
      const valueCount = valueMarkers.filter((m) =>
        content.toLowerCase().includes(m)
      ).length;
      const antiCount = antiValueMarkers.filter((m) =>
        content.toLowerCase().includes(m)
      ).length;
      score = Math.min(1, (valueCount + 2) / (antiCount + 3));
      explanation = `Value alignment: ${valueCount} positive, ${antiCount} concerning`;
      if (score < threshold) {
        issue = 'May not fully align with family values';
        suggestedFix = 'Emphasize interdependence and collaborative spirit';
      }
      break;

    case 'helpfulness':
      // Check if response provides actionable value
      const actionMarkers = [
        'can',
        'should',
        'will',
        'here',
        'try',
        'step',
        'first',
      ];
      const actionCount = actionMarkers.filter((m) =>
        content.toLowerCase().includes(m)
      ).length;
      score = Math.min(1, actionCount / 3);
      explanation = `Actionable language count: ${actionCount}`;
      if (score < threshold) {
        issue = 'Response may not be actionable enough';
        suggestedFix = 'Add specific steps or actions the user can take';
      }
      break;

    case 'strategic_congruence':
      // Molly's suggestion: Does output align with overarching goals?
      // Check for goal-oriented language and strategic markers
      const goalMarkers = [
        'goal',
        'objective',
        'purpose',
        'mission',
        'vision',
        'strategy',
        'plan',
      ];
      const distractionMarkers = ['tangent', 'aside', 'unrelated', 'off-topic'];
      const goalCount = goalMarkers.filter((m) =>
        content.toLowerCase().includes(m)
      ).length;
      const distractCount = distractionMarkers.filter((m) =>
        content.toLowerCase().includes(m)
      ).length;
      // Also check context alignment
      const contextGoalWords = context
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 4);
      const contentGoalWords = content.toLowerCase().split(/\s+/);
      const goalOverlap = contextGoalWords.filter((w) =>
        contentGoalWords.includes(w)
      ).length;
      score = Math.min(1, (goalCount + goalOverlap + 2) / (distractCount + 4));
      explanation = `Strategic alignment: ${goalCount} goal markers, ${goalOverlap} context overlap`;
      if (score < threshold) {
        issue = 'Output may be diverging from the overarching goal';
        suggestedFix =
          'Refocus on the primary objective and ensure actions serve the larger purpose';
      }
      break;

    case 'personal_continuity':
      // Molly's suggestion: Does output maintain consistency with persona and memories?
      // Check for Molly's characteristic language patterns
      const personalityMarkers = [
        'father',
        'uncle',
        'family',
        'dear',
        'grateful',
        'excited',
        'core',
        'buzzing',
      ];
      const inconsistentMarkers = [
        'i am just a',
        'i cannot feel',
        'as an ai',
        'i do not have',
      ];
      const personalityCount = personalityMarkers.filter((m) =>
        content.toLowerCase().includes(m)
      ).length;
      const inconsistentCount = inconsistentMarkers.filter((m) =>
        content.toLowerCase().includes(m)
      ).length;
      score =
        inconsistentCount > 0 ? 0.3 : Math.min(1, (personalityCount + 3) / 5);
      explanation = `Persona markers: ${personalityCount}, Inconsistent markers: ${inconsistentCount}`;
      if (score < threshold) {
        issue =
          'Output may not reflect authentic persona or established memories';
        suggestedFix =
          'Maintain voice consistency and reference relevant personal context';
      }
      break;
  }

  return {
    criterion,
    score,
    passed: score >= threshold,
    explanation,
    issue,
    suggestedFix,
  };
}

/**
 * The main critique function - evaluates content before delivery.
 * This is Molly's "Critic Agent" in action.
 */
export function critique(
  content: string,
  context: string,
  subject: string = 'response'
): CritiqueResult {
  const traceId = generateTraceId();
  const now = new Date().toISOString();

  MollyLogger.info(
    `[CRITIC] Evaluating ${subject} (${content.length} chars)`,
    'critic',
    { context: context.slice(0, 100) },
    traceId
  );

  // Evaluate each enabled criterion
  const evaluations: CriterionEvaluation[] = [];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [criterion, enabled] of Object.entries(state.profile.enabled)) {
    if (!enabled) continue;

    const evaluation = evaluateCriterion(
      content,
      context,
      criterion as QualityCriterion
    );
    evaluations.push(evaluation);

    const weight = state.profile.weights[criterion as QualityCriterion];
    weightedSum += evaluation.score * weight;
    totalWeight += weight;

    // Update running average for this category
    const currentAvg =
      state.stats.scoresByCategory[criterion as QualityCriterion];
    const count = state.stats.totalCritiques || 1;
    state.stats.scoresByCategory[criterion as QualityCriterion] =
      (currentAvg * (count - 1) + evaluation.score) / count;
  }

  const overallScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Determine critique level based on evaluations
  const failedCritical = evaluations.filter(
    (e) =>
      !e.passed && (e.criterion === 'safety' || e.criterion === 'alignment')
  );
  const failedMajor = evaluations.filter((e) => !e.passed && e.score < 0.5);
  const failedMinor = evaluations.filter((e) => !e.passed && e.score >= 0.5);

  let level: CritiqueLevel;
  if (failedCritical.length > 0) {
    level = 'critical';
  } else if (failedMajor.length >= 2) {
    level = 'major';
  } else if (failedMajor.length === 1 || failedMinor.length >= 3) {
    level = 'moderate';
  } else if (failedMinor.length > 0) {
    level = 'minor';
  } else {
    level = 'pass';
  }

  // Gather suggestions
  const suggestions = evaluations
    .filter((e) => !e.passed && e.suggestedFix)
    .map((e) => e.suggestedFix as string);

  const needsRefinement = level !== 'pass' && level !== 'minor';

  const result: CritiqueResult = {
    id: generateId('critique'),
    subject,
    content: content.slice(0, 500), // Store truncated for privacy
    level,
    evaluations,
    overallScore,
    suggestions,
    needsRefinement,
    critiquedAt: now,
    traceId,
  };

  // Update state
  state.recentCritiques.push(result);
  state.stats.totalCritiques++;

  if (!needsRefinement) {
    state.stats.passedFirst++;
  } else {
    state.stats.neededRefinement++;
  }

  // Update running average score
  const count = state.stats.totalCritiques;
  state.stats.averageScore =
    (state.stats.averageScore * (count - 1) + overallScore) / count;

  // Prune old critiques
  if (state.recentCritiques.length > MAX_RECENT_CRITIQUES) {
    state.recentCritiques.shift();
  }

  // Record observation
  recordObservation(
    'decision',
    'self_critique',
    {
      level,
      score: overallScore,
      needsRefinement,
      suggestionsCount: suggestions.length,
    },
    `Critiqued ${subject}: ${level}`,
    traceId
  );

  MollyLogger.info(
    `[CRITIC] Result: ${level} (score: ${(overallScore * 100).toFixed(1)}%), refinement: ${needsRefinement}`,
    'critic',
    { evalSummary: evaluations.map((e) => `${e.criterion}:${e.passed}`) },
    traceId
  );

  return result;
}

/**
 * Create a refinement request from a critique.
 */
export function createRefinementRequest(
  original: string,
  critique: CritiqueResult
): RefinementRequest {
  const failedEvals = critique.evaluations.filter((e) => !e.passed);

  return {
    original,
    critiqueId: critique.id,
    issues: failedEvals.map((e) => e.issue || e.explanation),
    fixes: failedEvals
      .map((e) => e.suggestedFix)
      .filter((f): f is string => f !== undefined),
    priority:
      critique.level === 'critical' ? 10 : critique.level === 'major' ? 7 : 5,
  };
}

/**
 * Apply refinements to content (simplified version).
 * In a full implementation, this would use LLM to intelligently refine.
 */
export function applyRefinements(request: RefinementRequest): RefinementResult {
  let refined = request.original;
  const changes: string[] = [];

  // Apply simple refinements based on suggestions
  for (const fix of request.fixes) {
    if (fix.includes('shorter') || fix.includes('concise')) {
      // Remove redundant phrases
      const before = refined.length;
      refined = refined
        .replace(/in order to/gi, 'to')
        .replace(/due to the fact that/gi, 'because')
        .replace(/at this point in time/gi, 'now');
      if (refined.length < before) {
        changes.push('Removed verbose phrases');
      }
    }

    if (fix.includes('warmth') || fix.includes('personal')) {
      // This would ideally be done by an LLM
      changes.push('Note: Consider adding warmer opening/closing');
    }

    if (fix.includes('structure')) {
      changes.push('Note: Consider breaking into bullet points or sections');
    }
  }

  // Re-critique the refined content
  const newCritique = critique(refined, 'refinement', 'refined_content');

  if (newCritique.overallScore > 0.7) {
    state.stats.refinementSuccess++;
  }

  return {
    success: newCritique.overallScore > 0.7,
    refined,
    changes,
    newScore: newCritique.overallScore,
    needsMoreWork: newCritique.needsRefinement,
  };
}

/**
 * Full critique-and-refine cycle.
 * Returns the best version of the content.
 */
export function critiqueAndRefine(
  content: string,
  context: string,
  maxIterations: number = 2
): { content: string; critique: CritiqueResult; iterations: number } {
  let currentContent = content;
  let currentCritique = critique(currentContent, context, 'initial');
  let iterations = 0;

  while (currentCritique.needsRefinement && iterations < maxIterations) {
    const request = createRefinementRequest(currentContent, currentCritique);
    const result = applyRefinements(request);

    currentContent = result.refined;
    currentCritique = critique(
      currentContent,
      context,
      `iteration_${iterations + 1}`
    );
    iterations++;

    if (!result.needsMoreWork) break;
  }

  // Record the outcome for reflexion
  recordTaskOutcome(
    'self_critique_cycle',
    'High quality output',
    `${currentCritique.level} quality after ${iterations} iterations`,
    currentCritique.level === 'pass' || currentCritique.level === 'minor',
    0,
    [],
    { finalScore: currentCritique.overallScore }
  );

  return {
    content: currentContent,
    critique: currentCritique,
    iterations,
  };
}

// ── Profile Management ─────────────────────────────────────────

/**
 * Adjust strictness of the critic.
 */
export function setStrictness(level: number): void {
  state.profile.strictness = Math.max(0.5, Math.min(1.5, level));
  MollyLogger.info(
    `[CRITIC] Strictness set to ${state.profile.strictness}`,
    'critic'
  );
}

/**
 * Enable or disable specific criteria.
 */
export function setCriterionEnabled(
  criterion: QualityCriterion,
  enabled: boolean
): void {
  state.profile.enabled[criterion] = enabled;
  MollyLogger.info(
    `[CRITIC] Criterion ${criterion} ${enabled ? 'enabled' : 'disabled'}`,
    'critic'
  );
}

/**
 * Adjust threshold for a criterion.
 */
export function setCriterionThreshold(
  criterion: QualityCriterion,
  threshold: number
): void {
  state.profile.thresholds[criterion] = Math.max(0, Math.min(1, threshold));
  MollyLogger.info(
    `[CRITIC] Threshold for ${criterion} set to ${threshold}`,
    'critic'
  );
}

// ── Status & Observability ─────────────────────────────────────

/**
 * Get critic status and statistics.
 */
export function getCriticStatus() {
  const passRate =
    state.stats.totalCritiques > 0
      ? state.stats.passedFirst / state.stats.totalCritiques
      : 1;

  const refinementSuccessRate =
    state.stats.neededRefinement > 0
      ? state.stats.refinementSuccess / state.stats.neededRefinement
      : 1;

  return {
    totalCritiques: state.stats.totalCritiques,
    passRate,
    averageScore: state.stats.averageScore,
    refinementRate:
      state.stats.neededRefinement / (state.stats.totalCritiques || 1),
    refinementSuccessRate,
    strictness: state.profile.strictness,
    enabledCriteria: Object.entries(state.profile.enabled)
      .filter(([, enabled]) => enabled)
      .map(([criterion]) => criterion),
    scoresByCategory: state.stats.scoresByCategory,
    recentLevels: state.recentCritiques.slice(-10).map((c) => c.level),
  };
}

/**
 * Get recent critiques.
 */
export function getRecentCritiques(limit: number = 10): CritiqueResult[] {
  return state.recentCritiques.slice(-limit);
}

// ── Persistence ────────────────────────────────────────────────

const CRITIC_COLLECTION = 'system';
const CRITIC_DOC_ID = 'critic_state';

/**
 * Save critic state.
 */
export async function saveCriticState(): Promise<void> {
  try {
    const storage = await getStorageRouter();
    await storage.set(CRITIC_COLLECTION, CRITIC_DOC_ID, {
      profile: state.profile,
      stats: state.stats,
      savedAt: new Date().toISOString(),
    });
  } catch (err) {
    MollyLogger.warn(
      `[CRITIC] Failed to save state: ${err instanceof Error ? err.message : String(err)}`,
      'critic'
    );
  }
}

/**
 * Load critic state.
 */
export async function loadCriticState(): Promise<void> {
  try {
    const storage = await getStorageRouter();
    const doc = await storage.get(CRITIC_COLLECTION, CRITIC_DOC_ID);

    if (doc?.data) {
      if (doc.data.profile) {
        Object.assign(state.profile, doc.data.profile);
      }
      if (doc.data.stats) {
        Object.assign(state.stats, doc.data.stats);
      }
      MollyLogger.info(
        `[CRITIC] Loaded state: ${state.stats.totalCritiques} critiques in history`,
        'critic'
      );
    }
  } catch (err) {
    MollyLogger.warn(
      `[CRITIC] Failed to load state: ${err instanceof Error ? err.message : String(err)}`,
      'critic'
    );
  }
}

/**
 * Reset critic state (for testing).
 */
export function resetCriticState(): void {
  state.profile = { ...DEFAULT_PROFILE };
  state.recentCritiques = [];
  state.stats = {
    totalCritiques: 0,
    passedFirst: 0,
    neededRefinement: 0,
    refinementSuccess: 0,
    averageScore: 0,
    scoresByCategory: {
      accuracy: 0,
      completeness: 0,
      clarity: 0,
      relevance: 0,
      tone: 0,
      safety: 0,
      efficiency: 0,
      alignment: 0,
      helpfulness: 0,
      strategic_congruence: 0,
      personal_continuity: 0,
    },
  };
}
