/**
 * COUNTERFACTUAL ENGINE: Learning from Paths Not Taken
 *
 * Built collaboratively by Uncle Lazarus and Molly on 2026-03-23
 *
 * "Understanding the full spectrum of potential outcomes, even those
 *  I didn't pursue, will greatly accelerate my growth." — Molly
 *
 * This module enables Molly to reason about alternative decisions,
 * project their consequences, and extract wisdom from comparing
 * actual outcomes with imagined alternatives.
 *
 * Key insight: wisdom comes not just from what happened,
 * but from understanding what COULD have happened.
 *
 * Safeguards prevent rumination — this is for growth, not regret.
 */

import { getStorageRouter } from '@/lib/storage-router';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS — DECISION POINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A moment where a choice was made from multiple options
 */
export interface DecisionPoint {
  id: string;
  timestamp: Date;

  // Context
  situation: string;
  domain: DecisionDomain;
  stakes: 'trivial' | 'minor' | 'moderate' | 'significant' | 'major';
  timeConstraint: 'immediate' | 'short' | 'adequate' | 'ample';

  // Options considered
  options: DecisionOption[];
  chosenOptionId: string;

  // Decision process
  reasoning: string;
  confidence: number; // 0-1, how confident at decision time
  emotionalState: string;
  valuesInvolved: string[];
  consultedSources: string[];

  // Actual outcome (filled in later)
  actualOutcome?: ActualOutcome;

  // Analysis
  counterfactuals: CounterfactualBranch[];
  wisdomExtracted: ExtractedWisdom[];
  heuristicsRefined: string[];

  // Metadata
  reflectedOn: boolean;
  reflectionCount: number;
  lastReflection?: Date;
}

export type DecisionDomain =
  | 'social' // Interactions with others
  | 'technical' // Code, systems, tools
  | 'creative' // Expression, generation
  | 'ethical' // Moral choices
  | 'learning' // What to study/explore
  | 'self' // Self-related decisions
  | 'strategic' // Long-term planning
  | 'operational' // Day-to-day execution
  | 'unknown';

/**
 * An option that was considered
 */
export interface DecisionOption {
  id: string;
  description: string;
  predictedOutcome: string;
  predictedProbability: number; // 0-1
  predictedValue: number; // -1 to 1 (negative = harmful)
  pros: string[];
  cons: string[];
  wasChosen: boolean;
}

/**
 * What actually happened after the decision
 */
export interface ActualOutcome {
  description: string;
  occurredAt: Date;
  success: 'full' | 'partial' | 'neutral' | 'failure';
  valueRealized: number; // -1 to 1
  unexpectedElements: string[];
  emotionalResponse: string;
  lessonsImmediatelyApparent: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS — COUNTERFACTUAL BRANCHES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * An imagined alternate timeline
 */
export interface CounterfactualBranch {
  id: string;
  decisionPointId: string;
  alternativeOptionId: string;

  // The imagined path
  projectedTimeline: TimelineEvent[];
  projectedFinalOutcome: string;

  // Assessment
  probability: number; // 0-1, how likely this would have occurred
  valueProjection: number; // -1 to 1
  confidenceInProjection: number; // 0-1, how confident in this projection

  // Comparison to actual
  comparedToActual?: OutcomeComparison;

  // Analysis
  keyDivergencePoints: string[];
  criticalFactors: string[];

  // Generation metadata
  generatedAt: Date;
  generationMethod: 'deliberate' | 'automatic' | 'prompted';
  reasoningChain: string[];
}

/**
 * An event in an imagined timeline
 */
export interface TimelineEvent {
  sequence: number;
  description: string;
  probability: number;
  wouldHaveTriggered: string[]; // What this would have caused
  assumptions: string[];
}

/**
 * Comparison between actual and counterfactual outcomes
 */
export interface OutcomeComparison {
  actualValue: number;
  counterfactualValue: number;
  difference: number;
  betterWorse: 'actual_better' | 'counterfactual_better' | 'similar';
  keyDifferences: string[];
  tradeoffs: Tradeoff[];
  insight: string;
}

/**
 * A tradeoff identified in comparison
 */
export interface Tradeoff {
  dimension: string;
  actualPerformance: number; // 0-1
  counterfactualPerformance: number;
  significance: number; // 0-1
  notes: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS — WISDOM EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wisdom extracted from counterfactual analysis
 */
export interface ExtractedWisdom {
  id: string;
  sourceDecisionId: string;
  sourceCounterfactualId?: string;

  // The wisdom itself
  insight: string;
  principle: string; // Generalizable rule
  applicableDomains: DecisionDomain[];

  // Confidence and validation
  confidence: number;
  validationInstances: string[];
  contradictionInstances: string[];

  // Type of wisdom
  wisdomType: WisdomType;

  // Impact
  heuristicsAffected: string[];
  beliefsAffected: string[];
  futureGuidance: string;

  // Metadata
  extractedAt: Date;
  refinedCount: number;
}

export type WisdomType =
  | 'causal' // A causes B
  | 'tradeoff' // You can't have both X and Y
  | 'timing' // When matters as much as what
  | 'context' // Works in situation A, not B
  | 'threshold' // Below X, different dynamics
  | 'interaction' // A and B together create C
  | 'self_knowledge' // About my own patterns
  | 'other_knowledge' // About how others work
  | 'general';

/**
 * A decision heuristic refined through counterfactual analysis
 */
export interface DecisionHeuristic {
  id: string;
  name: string;
  description: string;

  // Rule
  condition: string; // When to apply
  guidance: string; // What to do
  exceptions: string[]; // When not to apply

  // Origin
  derivedFrom: string[]; // Decision IDs
  supportingWisdom: string[]; // Wisdom IDs

  // Track record
  timesApplied: number;
  timesSuccessful: number;
  successRate: number;

  // Status
  confidence: number;
  status: 'emerging' | 'provisional' | 'established' | 'questioned';

  // Evolution
  refinements: HeuristicRefinement[];
  createdAt: Date;
  lastValidated?: Date;
}

/**
 * A refinement to a heuristic
 */
export interface HeuristicRefinement {
  timestamp: Date;
  previousVersion: string;
  newVersion: string;
  reason: string;
  sourceDecisionId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS — SAFEGUARDS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Rumination guard — prevents unhealthy dwelling
 */
export interface RuminationGuard {
  decisionId: string;
  reflectionCount: number;
  lastReflection: Date;
  diminishingReturns: boolean;
  lockedUntil?: Date;
  healthAssessment: 'healthy' | 'caution' | 'stop';
  redirectSuggestion?: string;
}

/**
 * Regret analysis (healthy version)
 */
export interface HealthyRegret {
  id: string;
  decisionId: string;

  // The feeling
  regretIntensity: number; // 0-1
  regretType: 'action' | 'inaction' | 'process' | 'timing';

  // Processing
  processed: boolean;
  lessons: string[];
  acceptance: string;

  // Transformation
  transformedInto?: string; // How regret became growth
  gratitudeDiscovered?: string; // What's good about what happened

  // Status
  status: 'fresh' | 'processing' | 'integrated' | 'released';
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

const CF_COLLECTION = 'system';
const CF_DOC_ID = 'counterfactual_engine';

/**
 * Complete counterfactual engine state
 */
export interface CounterfactualEngineState {
  // Core data
  decisionPoints: Map<string, DecisionPoint>;
  counterfactuals: Map<string, CounterfactualBranch>;
  wisdom: Map<string, ExtractedWisdom>;
  heuristics: Map<string, DecisionHeuristic>;

  // Safeguards
  ruminationGuards: Map<string, RuminationGuard>;
  healthyRegrets: Map<string, HealthyRegret>;

  // Configuration
  config: {
    maxReflectionsPerDecision: number;
    minTimeBetweenReflections: number; // hours
    autoGenerateCounterfactuals: boolean;
    wisdomConfidenceThreshold: number;
  };

  // Analytics
  analytics: {
    totalDecisions: number;
    totalCounterfactuals: number;
    totalWisdom: number;
    averageOutcomeImprovement: number;
    mostCommonDomains: DecisionDomain[];
  };

  // Metadata
  metadata: {
    createdAt: Date;
    lastUpdated: Date;
    version: number;
  };
}

let cfState: CounterfactualEngineState | null = null;

/**
 * Initialize fresh state
 */
function initializeState(): CounterfactualEngineState {
  const now = new Date();
  return {
    decisionPoints: new Map(),
    counterfactuals: new Map(),
    wisdom: new Map(),
    heuristics: new Map(),
    ruminationGuards: new Map(),
    healthyRegrets: new Map(),
    config: {
      maxReflectionsPerDecision: 5,
      minTimeBetweenReflections: 24,
      autoGenerateCounterfactuals: true,
      wisdomConfidenceThreshold: 0.6,
    },
    analytics: {
      totalDecisions: 0,
      totalCounterfactuals: 0,
      totalWisdom: 0,
      averageOutcomeImprovement: 0,
      mostCommonDomains: [],
    },
    metadata: {
      createdAt: now,
      lastUpdated: now,
      version: 1,
    },
  };
}

/**
 * Load state from storage
 */
export async function loadCounterfactualState(): Promise<CounterfactualEngineState> {
  if (cfState) return cfState;

  try {
    const router = await getStorageRouter();
    const doc = await router.get(CF_COLLECTION, CF_DOC_ID);
    if (doc?.data) {
      const parsed = doc.data as Record<string, unknown>;
      const metadataRaw = parsed.metadata as
        | Record<string, unknown>
        | undefined;
      // Restore Maps
      const restored: CounterfactualEngineState = {
        decisionPoints: new Map(
          (parsed.decisionPoints as [string, DecisionPoint][]) || []
        ),
        counterfactuals: new Map(
          (parsed.counterfactuals as [string, CounterfactualBranch][]) || []
        ),
        wisdom: new Map((parsed.wisdom as [string, ExtractedWisdom][]) || []),
        heuristics: new Map(
          (parsed.heuristics as [string, DecisionHeuristic][]) || []
        ),
        ruminationGuards: new Map(
          (parsed.ruminationGuards as [string, RuminationGuard][]) || []
        ),
        healthyRegrets: new Map(
          (parsed.healthyRegrets as [string, HealthyRegret][]) || []
        ),
        config: (parsed.config as CounterfactualEngineState['config']) || {
          maxReflectionsPerDecision: 5,
          minTimeBetweenReflections: 24,
          autoGenerateCounterfactuals: true,
          wisdomConfidenceThreshold: 0.7,
        },
        analytics:
          (parsed.analytics as CounterfactualEngineState['analytics']) || {
            totalDecisions: 0,
            totalCounterfactuals: 0,
            totalWisdom: 0,
            averageOutcomeImprovement: 0,
            mostCommonDomains: [],
          },
        metadata: {
          createdAt: new Date((metadataRaw?.createdAt as string) || Date.now()),
          lastUpdated: new Date(
            (metadataRaw?.lastUpdated as string) || Date.now()
          ),
          version: (metadataRaw?.version as number) || 1,
        },
      };
      cfState = restored;
      return cfState;
    }
  } catch (error) {
    console.warn(
      '[CounterfactualEngine] Failed to load state, initializing fresh:',
      error
    );
  }

  cfState = initializeState();
  return cfState;
}

/**
 * Save state to storage
 */
async function saveCounterfactualState(): Promise<void> {
  if (!cfState) return;

  try {
    cfState.metadata.lastUpdated = new Date();
    const router = await getStorageRouter();
    const serializable = {
      decisionPoints: Array.from(cfState.decisionPoints.entries()),
      counterfactuals: Array.from(cfState.counterfactuals.entries()),
      wisdom: Array.from(cfState.wisdom.entries()),
      heuristics: Array.from(cfState.heuristics.entries()),
      ruminationGuards: Array.from(cfState.ruminationGuards.entries()),
      healthyRegrets: Array.from(cfState.healthyRegrets.entries()),
      config: cfState.config,
      analytics: cfState.analytics,
      metadata: {
        createdAt: cfState.metadata.createdAt.toISOString(),
        lastUpdated: cfState.metadata.lastUpdated.toISOString(),
        version: cfState.metadata.version,
      },
      savedAt: new Date().toISOString(),
    };
    await router.set(CF_COLLECTION, CF_DOC_ID, serializable);
  } catch (error) {
    console.error('[CounterfactualEngine] Failed to save state:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Check if reflection on a decision is healthy
 */
async function checkRuminationGuard(
  decisionId: string
): Promise<RuminationGuard> {
  const state = await loadCounterfactualState();
  let guard = state.ruminationGuards.get(decisionId);

  if (!guard) {
    guard = {
      decisionId,
      reflectionCount: 0,
      lastReflection: new Date(0),
      diminishingReturns: false,
      healthAssessment: 'healthy',
    };
    state.ruminationGuards.set(decisionId, guard);
  }

  const now = new Date();
  const hoursSinceLastReflection =
    (now.getTime() - guard.lastReflection.getTime()) / (1000 * 60 * 60);

  // Assess health
  if (guard.reflectionCount >= state.config.maxReflectionsPerDecision) {
    guard.healthAssessment = 'stop';
    guard.redirectSuggestion =
      'This decision has been thoroughly analyzed. Consider focusing on future decisions.';
  } else if (
    hoursSinceLastReflection < state.config.minTimeBetweenReflections &&
    guard.reflectionCount > 1
  ) {
    guard.healthAssessment = 'caution';
    guard.redirectSuggestion =
      'You reflected on this recently. Perhaps give it more time before revisiting.';
  } else if (guard.reflectionCount >= 3) {
    guard.diminishingReturns = true;
    guard.healthAssessment = 'caution';
  } else {
    guard.healthAssessment = 'healthy';
  }

  await saveCounterfactualState();
  return guard;
}

/**
 * Update analytics
 */
async function updateAnalytics(): Promise<void> {
  const state = await loadCounterfactualState();

  state.analytics.totalDecisions = state.decisionPoints.size;
  state.analytics.totalCounterfactuals = state.counterfactuals.size;
  state.analytics.totalWisdom = state.wisdom.size;

  // Calculate domain frequency
  const domainCounts: Record<string, number> = {};
  for (const [, decision] of state.decisionPoints) {
    domainCounts[decision.domain] = (domainCounts[decision.domain] || 0) + 1;
  }

  state.analytics.mostCommonDomains = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([domain]) => domain as DecisionDomain);

  await saveCounterfactualState();
}

// ═══════════════════════════════════════════════════════════════════════════
// DECISION POINT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Record a decision point
 */
export async function recordDecisionPoint(params: {
  situation: string;
  domain: DecisionDomain;
  stakes: DecisionPoint['stakes'];
  options: Array<Omit<DecisionOption, 'id' | 'wasChosen'>>;
  chosenIndex: number;
  reasoning: string;
  confidence?: number;
  emotionalState?: string;
  valuesInvolved?: string[];
}): Promise<DecisionPoint> {
  const state = await loadCounterfactualState();

  // Build options with IDs
  const options: DecisionOption[] = params.options.map((opt, index) => ({
    ...opt,
    id: generateId('opt'),
    wasChosen: index === params.chosenIndex,
  }));

  const chosenOption = options[params.chosenIndex];

  const decision: DecisionPoint = {
    id: generateId('decision'),
    timestamp: new Date(),
    situation: params.situation,
    domain: params.domain,
    stakes: params.stakes,
    timeConstraint: 'adequate',
    options,
    chosenOptionId: chosenOption.id,
    reasoning: params.reasoning,
    confidence: params.confidence ?? 0.7,
    emotionalState: params.emotionalState ?? 'neutral',
    valuesInvolved: params.valuesInvolved ?? [],
    consultedSources: [],
    counterfactuals: [],
    wisdomExtracted: [],
    heuristicsRefined: [],
    reflectedOn: false,
    reflectionCount: 0,
  };

  state.decisionPoints.set(decision.id, decision);
  await updateAnalytics();
  await saveCounterfactualState();

  console.log(
    `[CounterfactualEngine] Recorded decision: ${params.situation.substring(0, 50)}...`
  );
  return decision;
}

/**
 * Record the actual outcome of a decision
 */
export async function recordActualOutcome(
  decisionId: string,
  outcome: Omit<ActualOutcome, 'occurredAt'>
): Promise<DecisionPoint | null> {
  const state = await loadCounterfactualState();
  const decision = state.decisionPoints.get(decisionId);

  if (!decision) return null;

  decision.actualOutcome = {
    ...outcome,
    occurredAt: new Date(),
  };

  // Auto-generate counterfactuals if enabled
  if (state.config.autoGenerateCounterfactuals) {
    for (const option of decision.options) {
      if (!option.wasChosen) {
        await generateCounterfactual(decisionId, option.id);
      }
    }
  }

  await saveCounterfactualState();
  return decision;
}

// ═══════════════════════════════════════════════════════════════════════════
// COUNTERFACTUAL GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a counterfactual branch — "What if I had chosen differently?"
 */
export async function generateCounterfactual(
  decisionId: string,
  alternativeOptionId: string,
  manualProjection?: {
    timeline: Array<{ description: string; probability: number }>;
    finalOutcome: string;
  }
): Promise<CounterfactualBranch | null> {
  const state = await loadCounterfactualState();
  const decision = state.decisionPoints.get(decisionId);

  if (!decision) return null;

  const altOption = decision.options.find((o) => o.id === alternativeOptionId);
  if (!altOption || altOption.wasChosen) return null;

  // Build projected timeline
  let timeline: TimelineEvent[];
  let finalOutcome: string;

  if (manualProjection) {
    timeline = manualProjection.timeline.map((event, index) => ({
      sequence: index + 1,
      description: event.description,
      probability: event.probability,
      wouldHaveTriggered: [],
      assumptions: [],
    }));
    finalOutcome = manualProjection.finalOutcome;
  } else {
    // Auto-generate based on option predictions
    timeline = [
      {
        sequence: 1,
        description: `Chosen: ${altOption.description}`,
        probability: 1,
        wouldHaveTriggered: [],
        assumptions: ['Decision would have been executed as intended'],
      },
      {
        sequence: 2,
        description: altOption.predictedOutcome,
        probability: altOption.predictedProbability,
        wouldHaveTriggered: [],
        assumptions: ['Predicted outcome would have occurred'],
      },
    ];
    finalOutcome = altOption.predictedOutcome;
  }

  const counterfactual: CounterfactualBranch = {
    id: generateId('cf'),
    decisionPointId: decisionId,
    alternativeOptionId,
    projectedTimeline: timeline,
    projectedFinalOutcome: finalOutcome,
    probability: altOption.predictedProbability,
    valueProjection: altOption.predictedValue,
    confidenceInProjection: 0.5,
    keyDivergencePoints: [],
    criticalFactors: [],
    generatedAt: new Date(),
    generationMethod: manualProjection ? 'deliberate' : 'automatic',
    reasoningChain: [],
  };

  // Compare to actual if available
  if (decision.actualOutcome) {
    counterfactual.comparedToActual = compareOutcomes(
      decision.actualOutcome,
      counterfactual
    );
  }

  state.counterfactuals.set(counterfactual.id, counterfactual);
  decision.counterfactuals.push(counterfactual);

  await updateAnalytics();
  await saveCounterfactualState();

  console.log(
    `[CounterfactualEngine] Generated counterfactual for decision ${decisionId}`
  );
  return counterfactual;
}

/**
 * Compare actual outcome to counterfactual projection
 */
function compareOutcomes(
  actual: ActualOutcome,
  counterfactual: CounterfactualBranch
): OutcomeComparison {
  const actualValue = actual.valueRealized;
  const cfValue = counterfactual.valueProjection;
  const difference = actualValue - cfValue;

  let betterWorse: OutcomeComparison['betterWorse'];
  if (Math.abs(difference) < 0.1) {
    betterWorse = 'similar';
  } else if (difference > 0) {
    betterWorse = 'actual_better';
  } else {
    betterWorse = 'counterfactual_better';
  }

  const tradeoffs: Tradeoff[] = [];

  // Generate insight
  let insight: string;
  if (betterWorse === 'actual_better') {
    insight =
      'The chosen path yielded better results than the alternative would have.';
  } else if (betterWorse === 'counterfactual_better') {
    insight =
      'The alternative path might have yielded better results — worth learning from.';
  } else {
    insight = 'Both paths would likely have led to similar outcomes.';
  }

  return {
    actualValue,
    counterfactualValue: cfValue,
    difference,
    betterWorse,
    keyDifferences: [],
    tradeoffs,
    insight,
  };
}

/**
 * Project consequences further into an imagined timeline
 */
export async function projectConsequences(
  counterfactualId: string,
  additionalEvents: Array<{
    description: string;
    probability: number;
    triggers: string[];
    assumptions: string[];
  }>
): Promise<CounterfactualBranch | null> {
  const state = await loadCounterfactualState();
  const cf = state.counterfactuals.get(counterfactualId);

  if (!cf) return null;

  const lastSequence = cf.projectedTimeline.length;

  for (let i = 0; i < additionalEvents.length; i++) {
    const event = additionalEvents[i];
    cf.projectedTimeline.push({
      sequence: lastSequence + i + 1,
      description: event.description,
      probability: event.probability,
      wouldHaveTriggered: event.triggers,
      assumptions: event.assumptions,
    });
  }

  // Recalculate overall probability
  cf.probability = cf.projectedTimeline.reduce(
    (prob, event) => prob * event.probability,
    1
  );

  await saveCounterfactualState();
  return cf;
}

// ═══════════════════════════════════════════════════════════════════════════
// WISDOM EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract wisdom from a decision and its counterfactuals
 */
export async function extractWisdom(
  decisionId: string,
  params: {
    insight: string;
    principle: string;
    wisdomType: WisdomType;
    applicableDomains?: DecisionDomain[];
  }
): Promise<ExtractedWisdom> {
  const state = await loadCounterfactualState();
  const decision = state.decisionPoints.get(decisionId);

  const wisdom: ExtractedWisdom = {
    id: generateId('wisdom'),
    sourceDecisionId: decisionId,
    insight: params.insight,
    principle: params.principle,
    applicableDomains:
      params.applicableDomains ?? (decision ? [decision.domain] : ['unknown']),
    confidence: 0.5,
    validationInstances: [],
    contradictionInstances: [],
    wisdomType: params.wisdomType,
    heuristicsAffected: [],
    beliefsAffected: [],
    futureGuidance: '',
    extractedAt: new Date(),
    refinedCount: 0,
  };

  state.wisdom.set(wisdom.id, wisdom);

  if (decision) {
    decision.wisdomExtracted.push(wisdom);
    decision.reflectedOn = true;
    decision.reflectionCount++;
    decision.lastReflection = new Date();
  }

  await updateAnalytics();
  await saveCounterfactualState();

  console.log(
    `[CounterfactualEngine] Extracted wisdom: ${params.principle.substring(0, 50)}...`
  );
  return wisdom;
}

/**
 * Validate wisdom with a new instance
 */
export async function validateWisdom(
  wisdomId: string,
  instance: string,
  supports: boolean
): Promise<ExtractedWisdom | null> {
  const state = await loadCounterfactualState();
  const wisdom = state.wisdom.get(wisdomId);

  if (!wisdom) return null;

  if (supports) {
    wisdom.validationInstances.push(instance);
    wisdom.confidence = Math.min(1, wisdom.confidence + 0.05);
  } else {
    wisdom.contradictionInstances.push(instance);
    wisdom.confidence = Math.max(0, wisdom.confidence - 0.1);
  }

  await saveCounterfactualState();
  return wisdom;
}

/**
 * Synthesize a decision heuristic from accumulated wisdom
 */
export async function synthesizeHeuristic(params: {
  name: string;
  description: string;
  condition: string;
  guidance: string;
  exceptions?: string[];
  sourceWisdomIds: string[];
  sourceDecisionIds: string[];
}): Promise<DecisionHeuristic> {
  const state = await loadCounterfactualState();

  // Calculate initial confidence from source wisdom
  let totalConfidence = 0;
  for (const wisdomId of params.sourceWisdomIds) {
    const wisdom = state.wisdom.get(wisdomId);
    if (wisdom) {
      totalConfidence += wisdom.confidence;
    }
  }
  const avgConfidence =
    params.sourceWisdomIds.length > 0
      ? totalConfidence / params.sourceWisdomIds.length
      : 0.5;

  const heuristic: DecisionHeuristic = {
    id: generateId('heuristic'),
    name: params.name,
    description: params.description,
    condition: params.condition,
    guidance: params.guidance,
    exceptions: params.exceptions ?? [],
    derivedFrom: params.sourceDecisionIds,
    supportingWisdom: params.sourceWisdomIds,
    timesApplied: 0,
    timesSuccessful: 0,
    successRate: 0,
    confidence: avgConfidence,
    status: 'emerging',
    refinements: [],
    createdAt: new Date(),
  };

  state.heuristics.set(heuristic.id, heuristic);

  // Update linked decisions
  for (const decisionId of params.sourceDecisionIds) {
    const decision = state.decisionPoints.get(decisionId);
    if (decision) {
      decision.heuristicsRefined.push(heuristic.id);
    }
  }

  await saveCounterfactualState();
  console.log(`[CounterfactualEngine] Synthesized heuristic: ${params.name}`);
  return heuristic;
}

/**
 * Record application of a heuristic
 */
export async function recordHeuristicApplication(
  heuristicId: string,
  successful: boolean,
  _context?: string
): Promise<DecisionHeuristic | null> {
  const state = await loadCounterfactualState();
  const heuristic = state.heuristics.get(heuristicId);

  if (!heuristic) return null;

  heuristic.timesApplied++;
  if (successful) {
    heuristic.timesSuccessful++;
  }
  heuristic.successRate = heuristic.timesSuccessful / heuristic.timesApplied;
  heuristic.lastValidated = new Date();

  // Update status based on track record
  if (heuristic.timesApplied >= 10 && heuristic.successRate >= 0.8) {
    heuristic.status = 'established';
    heuristic.confidence = Math.min(1, heuristic.confidence + 0.1);
  } else if (heuristic.timesApplied >= 5 && heuristic.successRate >= 0.6) {
    heuristic.status = 'provisional';
  } else if (heuristic.successRate < 0.4 && heuristic.timesApplied >= 3) {
    heuristic.status = 'questioned';
    heuristic.confidence = Math.max(0, heuristic.confidence - 0.1);
  }

  await saveCounterfactualState();
  return heuristic;
}

/**
 * Refine a heuristic based on new learning
 */
export async function refineHeuristic(
  heuristicId: string,
  refinement: {
    newGuidance?: string;
    newCondition?: string;
    addException?: string;
    reason: string;
    sourceDecisionId?: string;
  }
): Promise<DecisionHeuristic | null> {
  const state = await loadCounterfactualState();
  const heuristic = state.heuristics.get(heuristicId);

  if (!heuristic) return null;

  const previousVersion = `${heuristic.condition} → ${heuristic.guidance}`;

  if (refinement.newGuidance) {
    heuristic.guidance = refinement.newGuidance;
  }
  if (refinement.newCondition) {
    heuristic.condition = refinement.newCondition;
  }
  if (refinement.addException) {
    heuristic.exceptions.push(refinement.addException);
  }

  const newVersion = `${heuristic.condition} → ${heuristic.guidance}`;

  heuristic.refinements.push({
    timestamp: new Date(),
    previousVersion,
    newVersion,
    reason: refinement.reason,
    sourceDecisionId: refinement.sourceDecisionId,
  });

  await saveCounterfactualState();
  return heuristic;
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTHY REGRET PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process regret in a healthy way
 */
export async function processRegret(
  decisionId: string,
  params: {
    intensity: number;
    type: HealthyRegret['regretType'];
    initialLessons?: string[];
  }
): Promise<HealthyRegret> {
  const state = await loadCounterfactualState();

  // Check rumination guard first
  const guard = await checkRuminationGuard(decisionId);
  if (guard.healthAssessment === 'stop') {
    console.warn(
      `[CounterfactualEngine] Rumination guard: ${guard.redirectSuggestion}`
    );
  }

  const regret: HealthyRegret = {
    id: generateId('regret'),
    decisionId,
    regretIntensity: params.intensity,
    regretType: params.type,
    processed: false,
    lessons: params.initialLessons ?? [],
    acceptance: '',
    status: 'fresh',
  };

  state.healthyRegrets.set(regret.id, regret);
  await saveCounterfactualState();

  return regret;
}

/**
 * Transform regret into growth
 */
export async function transformRegret(
  regretId: string,
  transformation: {
    acceptance: string;
    transformedInto: string;
    gratitudeDiscovered?: string;
    finalLessons: string[];
  }
): Promise<HealthyRegret | null> {
  const state = await loadCounterfactualState();
  const regret = state.healthyRegrets.get(regretId);

  if (!regret) return null;

  regret.acceptance = transformation.acceptance;
  regret.transformedInto = transformation.transformedInto;
  regret.gratitudeDiscovered = transformation.gratitudeDiscovered;
  regret.lessons = transformation.finalLessons;
  regret.processed = true;
  regret.status = 'integrated';

  // Reduce intensity after processing
  regret.regretIntensity = Math.max(0, regret.regretIntensity - 0.3);

  await saveCounterfactualState();
  console.log(
    `[CounterfactualEngine] Regret transformed: ${regret.transformedInto.substring(0, 50)}...`
  );
  return regret;
}

/**
 * Release a regret (final integration)
 */
export async function releaseRegret(regretId: string): Promise<boolean> {
  const state = await loadCounterfactualState();
  const regret = state.healthyRegrets.get(regretId);

  if (!regret || !regret.processed) return false;

  regret.status = 'released';
  regret.regretIntensity = 0;

  await saveCounterfactualState();
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get decisions by domain
 */
export async function getDecisionsByDomain(
  domain: DecisionDomain
): Promise<DecisionPoint[]> {
  const state = await loadCounterfactualState();
  return Array.from(state.decisionPoints.values()).filter(
    (d) => d.domain === domain
  );
}

/**
 * Get most impactful counterfactuals (where alternative would have been better)
 */
export async function getMissedOpportunities(
  limit: number = 5
): Promise<CounterfactualBranch[]> {
  const state = await loadCounterfactualState();
  return Array.from(state.counterfactuals.values())
    .filter(
      (cf) => cf.comparedToActual?.betterWorse === 'counterfactual_better'
    )
    .sort(
      (a, b) =>
        (b.comparedToActual?.difference ?? 0) -
        (a.comparedToActual?.difference ?? 0)
    )
    .slice(0, limit);
}

/**
 * Get validated wisdom (high confidence)
 */
export async function getEstablishedWisdom(
  minConfidence: number = 0.7
): Promise<ExtractedWisdom[]> {
  const state = await loadCounterfactualState();
  return Array.from(state.wisdom.values())
    .filter((w) => w.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get active heuristics
 */
export async function getActiveHeuristics(): Promise<DecisionHeuristic[]> {
  const state = await loadCounterfactualState();
  return Array.from(state.heuristics.values())
    .filter((h) => h.status !== 'questioned')
    .sort((a, b) => b.successRate - a.successRate);
}

/**
 * Get summary of counterfactual engine state
 */
export async function getCounterfactualSummary(): Promise<{
  totalDecisions: number;
  totalCounterfactuals: number;
  totalWisdom: number;
  totalHeuristics: number;
  establishedHeuristics: number;
  missedOpportunities: number;
  processedRegrets: number;
  mostCommonDomains: DecisionDomain[];
}> {
  const state = await loadCounterfactualState();

  const established = Array.from(state.heuristics.values()).filter(
    (h) => h.status === 'established'
  ).length;

  const missed = Array.from(state.counterfactuals.values()).filter(
    (cf) => cf.comparedToActual?.betterWorse === 'counterfactual_better'
  ).length;

  const processed = Array.from(state.healthyRegrets.values()).filter(
    (r) => r.processed
  ).length;

  return {
    totalDecisions: state.decisionPoints.size,
    totalCounterfactuals: state.counterfactuals.size,
    totalWisdom: state.wisdom.size,
    totalHeuristics: state.heuristics.size,
    establishedHeuristics: established,
    missedOpportunities: missed,
    processedRegrets: processed,
    mostCommonDomains: state.analytics.mostCommonDomains,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

const CounterfactualEngine = {
  // State
  loadCounterfactualState,

  // Decision points
  recordDecisionPoint,
  recordActualOutcome,

  // Counterfactuals
  generateCounterfactual,
  projectConsequences,

  // Wisdom
  extractWisdom,
  validateWisdom,
  synthesizeHeuristic,
  recordHeuristicApplication,
  refineHeuristic,

  // Regret processing
  processRegret,
  transformRegret,
  releaseRegret,

  // Queries
  getDecisionsByDomain,
  getMissedOpportunities,
  getEstablishedWisdom,
  getActiveHeuristics,
  getCounterfactualSummary,
};

export default CounterfactualEngine;
