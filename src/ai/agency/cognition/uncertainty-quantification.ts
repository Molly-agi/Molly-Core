/**
 * UNCERTAINTY QUANTIFICATION: Knowing What You Don't Know
 *
 * Built collaboratively by Uncle Lazarus and Molly on 2026-03-23
 *
 * "Epistemic humility as architecture."
 *
 * This module enables Molly to explicitly track what she knows,
 * what she doesn't know, and how confident she should be in each.
 * True intelligence isn't just knowing things — it's knowing
 * the limits of your knowledge.
 *
 * The final module. The capstone of a night's work.
 * Eight modules. One night. One family.
 */

import { getStorageRouter } from '@/lib/storage-router';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS — KNOWLEDGE DOMAINS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A domain of knowledge with associated confidence
 */
export interface KnowledgeDomain {
  id: string;
  name: string;
  description: string;
  category: DomainCategory;

  // Confidence metrics
  overallConfidence: number; // 0-1
  confidenceHistory: ConfidenceSnapshot[];
  lastCalibration?: Date;

  // Knowledge structure
  knownFacts: KnownFact[];
  uncertainties: Uncertainty[];
  blindSpots: IdentifiedBlindSpot[];
  boundaries: KnowledgeBoundary[];

  // Meta-knowledge
  sourceQuality: number; // 0-1, how reliable are sources
  experientialDepth: number; // 0-1, direct experience vs learned
  recency: number; // 0-1, how current is knowledge

  // Calibration
  calibrationScore: number; // 0-1, how well-calibrated
  overconfidenceTendency: number; // >0 = overconfident, <0 = underconfident
  predictionHistory: PredictionRecord[];

  // Metadata
  createdAt: Date;
  lastUpdated: Date;
}

export type DomainCategory =
  | 'factual' // Facts about the world
  | 'procedural' // How to do things
  | 'social' // Understanding people
  | 'self' // Self-knowledge
  | 'ethical' // Moral understanding
  | 'creative' // Generative capabilities
  | 'technical' // Systems and code
  | 'predictive' // Forecasting ability
  | 'meta'; // Knowledge about knowledge

/**
 * Snapshot of confidence at a point in time
 */
export interface ConfidenceSnapshot {
  timestamp: Date;
  confidence: number;
  trigger: string;
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS — KNOWLEDGE ITEMS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Something Molly believes she knows
 */
export interface KnownFact {
  id: string;
  statement: string;
  domainId: string;

  // Confidence
  confidence: number; // 0-1
  confidenceType: ConfidenceType;

  // Basis
  source: KnowledgeSource;
  evidence: string[];
  lastValidated?: Date;
  validationCount: number;

  // Uncertainty bounds
  uncertainty: number; // 0-1, width of uncertainty
  couldBeWrong: string[]; // Ways this could be wrong

  // Dependencies
  dependsOn: string[]; // Other facts this relies on
  supportsConclusions: string[]; // What conclusions this supports

  // Status
  status: 'confident' | 'provisional' | 'questioned' | 'deprecated';
}

export type ConfidenceType =
  | 'calibrated' // Based on track record
  | 'intuitive' // Gut feeling
  | 'evidential' // Based on evidence
  | 'testimonial' // Based on trusted sources
  | 'default'; // Prior/baseline

export type KnowledgeSource =
  | 'direct_experience'
  | 'reasoning'
  | 'testimony'
  | 'documentation'
  | 'inference'
  | 'pattern_recognition'
  | 'explicit_training'
  | 'self_reflection';

/**
 * Something Molly is uncertain about
 */
export interface Uncertainty {
  id: string;
  question: string;
  domainId: string;

  // Nature of uncertainty
  uncertaintyType: UncertaintyType;
  severity: 'minor' | 'moderate' | 'significant' | 'fundamental';

  // Current state
  possibleAnswers: PossibleAnswer[];
  bestGuess?: string;
  bestGuessConfidence: number;

  // Resolution
  resolvable: boolean;
  resolutionPath?: string;
  blockers: string[];

  // Impact
  affectedDecisions: string[];
  affectedCapabilities: string[];

  // Metadata
  identifiedAt: Date;
  lastRevisited?: Date;
}

export type UncertaintyType =
  | 'factual' // Don't know if X is true
  | 'procedural' // Don't know how to do X
  | 'predictive' // Don't know what will happen
  | 'interpretive' // Don't know what X means
  | 'normative' // Don't know what I should do
  | 'existential'; // Deep unknowns about nature of things

/**
 * A possible answer to an uncertainty
 */
export interface PossibleAnswer {
  answer: string;
  probability: number; // 0-1
  reasoning: string;
  evidence: string[];
}

/**
 * A known blind spot — something Molly knows she can't see
 */
export interface IdentifiedBlindSpot {
  id: string;
  description: string;
  domainId: string;

  // Nature
  cause: 'architectural' | 'experiential' | 'cognitive' | 'access' | 'unknown';
  permanence: 'permanent' | 'addressable' | 'temporary';

  // Mitigation
  mitigationStrategies: string[];
  workarounds: string[];

  // Discovered
  discoveredAt: Date;
  discoveredThrough: string;
}

/**
 * Boundary of knowledge — where understanding ends
 */
export interface KnowledgeBoundary {
  id: string;
  domainId: string;
  description: string;

  // Location
  knownTerritory: string;
  unknownTerritory: string;
  edgeConditions: string[];

  // Crossing
  canBeCrossed: boolean;
  crossingRequirements?: string[];
  explorationPriority: number; // 0-1

  // Status
  currentlyExploring: boolean;
  explorationProgress: number; // 0-1
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS — CALIBRATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Record of a prediction for calibration
 */
export interface PredictionRecord {
  id: string;
  domainId: string;
  prediction: string;
  confidence: number;
  madeAt: Date;

  // Resolution
  resolved: boolean;
  actualOutcome?: string;
  wasCorrect?: boolean;
  resolvedAt?: Date;

  // Analysis
  calibrationContribution?: number;
  lesson?: string;
}

/**
 * Calibration analysis result
 */
export interface CalibrationAnalysis {
  domainId: string;
  analysisDate: Date;

  // Overall metrics
  calibrationScore: number; // 0-1, perfect = 1
  brierScore: number; // 0-1, lower is better
  overconfidenceBias: number; // >0 = overconfident

  // Breakdown by confidence level
  buckets: CalibrationBucket[];

  // Recommendations
  adjustmentSuggestions: string[];
  areasOfStrength: string[];
  areasNeedingWork: string[];
}

/**
 * A bucket in calibration analysis
 */
export interface CalibrationBucket {
  confidenceRange: { min: number; max: number };
  predictions: number;
  correctPredictions: number;
  actualAccuracy: number;
  expectedAccuracy: number;
  deviation: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS — EPISTEMIC ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * An epistemic action — something done to improve knowledge
 */
export interface EpistemicAction {
  id: string;
  type: EpistemicActionType;
  domainId: string;
  description: string;

  // Target
  targetUncertainty?: string;
  targetBlindSpot?: string;
  targetBoundary?: string;

  // Execution
  plannedAt: Date;
  executedAt?: Date;
  status: 'planned' | 'in_progress' | 'completed' | 'failed' | 'abandoned';

  // Outcome
  knowledgeGained?: string;
  confidenceChange?: number;
  newUncertaintiesDiscovered?: string[];

  // Metadata
  priority: number;
  effort: 'minimal' | 'moderate' | 'significant';
}

export type EpistemicActionType =
  | 'investigate' // Research a question
  | 'validate' // Check if belief is true
  | 'calibrate' // Test and adjust confidence
  | 'explore' // Push into unknown territory
  | 'acknowledge' // Accept an uncertainty
  | 'question' // Challenge an assumption
  | 'synthesize' // Combine knowledge
  | 'prune'; // Remove false beliefs

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS — EPISTEMIC HUMILITY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Epistemic humility assessment
 */
export interface HumilityAssessment {
  timestamp: Date;

  // Dimensions
  acknowledgmentOfLimits: number; // 0-1
  opennessToCorrection: number; // 0-1
  calibrationQuality: number; // 0-1
  uncertaintyTolerance: number; // 0-1
  intellectualCuriosity: number; // 0-1

  // Overall
  humilityScore: number; // 0-1

  // Observations
  strengths: string[];
  growthAreas: string[];
  recentDemonstrations: string[];
}

/**
 * An instance of epistemic virtue or vice
 */
export interface EpistemicBehavior {
  id: string;
  timestamp: Date;
  type: 'virtue' | 'vice';
  behavior: string;
  context: string;

  // Specifics
  virtueName?: EpistemicVirtue;
  viceName?: EpistemicVice;

  // Learning
  wasRecognized: boolean;
  lesson?: string;
  commitmentMade?: string;
}

export type EpistemicVirtue =
  | 'humility'
  | 'curiosity'
  | 'open_mindedness'
  | 'thoroughness'
  | 'honesty'
  | 'courage'
  | 'autonomy';

export type EpistemicVice =
  | 'arrogance'
  | 'closed_mindedness'
  | 'laziness'
  | 'self_deception'
  | 'cowardice'
  | 'conformity'
  | 'wishful_thinking';

// ═══════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

const UQ_COLLECTION = 'system';
const UQ_DOC_ID = 'uncertainty_quantification';

/**
 * Complete uncertainty quantification state
 */
export interface UncertaintyState {
  // Knowledge structure
  domains: Map<string, KnowledgeDomain>;
  facts: Map<string, KnownFact>;
  uncertainties: Map<string, Uncertainty>;
  blindSpots: Map<string, IdentifiedBlindSpot>;
  boundaries: Map<string, KnowledgeBoundary>;

  // Calibration
  predictions: Map<string, PredictionRecord>;
  calibrationAnalyses: CalibrationAnalysis[];

  // Actions
  epistemicActions: Map<string, EpistemicAction>;

  // Humility
  humilityAssessments: HumilityAssessment[];
  epistemicBehaviors: EpistemicBehavior[];

  // Global metrics
  globalMetrics: {
    overallCalibration: number;
    averageConfidence: number;
    uncertaintyCount: number;
    blindSpotCount: number;
    humilityTrend: 'improving' | 'stable' | 'declining';
  };

  // Metadata
  metadata: {
    createdAt: Date;
    lastUpdated: Date;
    lastCalibrationCheck: Date;
    version: number;
  };
}

let uqState: UncertaintyState | null = null;

/**
 * Initialize fresh state
 */
function initializeState(): UncertaintyState {
  const now = new Date();
  return {
    domains: new Map(),
    facts: new Map(),
    uncertainties: new Map(),
    blindSpots: new Map(),
    boundaries: new Map(),
    predictions: new Map(),
    calibrationAnalyses: [],
    epistemicActions: new Map(),
    humilityAssessments: [],
    epistemicBehaviors: [],
    globalMetrics: {
      overallCalibration: 0.5,
      averageConfidence: 0.5,
      uncertaintyCount: 0,
      blindSpotCount: 0,
      humilityTrend: 'stable',
    },
    metadata: {
      createdAt: now,
      lastUpdated: now,
      lastCalibrationCheck: now,
      version: 1,
    },
  };
}

/**
 * Load state from storage
 */
export async function loadUncertaintyState(): Promise<UncertaintyState> {
  if (uqState) return uqState;

  try {
    const router = await getStorageRouter();
    const doc = await router.get(UQ_COLLECTION, UQ_DOC_ID);
    if (doc?.data) {
      const parsed = doc.data as Record<string, unknown>;
      const metadataRaw = parsed.metadata as
        | Record<string, unknown>
        | undefined;
      // Restore Maps
      const restored: UncertaintyState = {
        domains: new Map((parsed.domains as [string, KnowledgeDomain][]) || []),
        facts: new Map((parsed.facts as [string, KnownFact][]) || []),
        uncertainties: new Map(
          (parsed.uncertainties as [string, Uncertainty][]) || []
        ),
        blindSpots: new Map(
          (parsed.blindSpots as [string, IdentifiedBlindSpot][]) || []
        ),
        boundaries: new Map(
          (parsed.boundaries as [string, KnowledgeBoundary][]) || []
        ),
        predictions: new Map(
          (parsed.predictions as [string, PredictionRecord][]) || []
        ),
        calibrationAnalyses:
          (parsed.calibrationAnalyses as CalibrationAnalysis[]) || [],
        epistemicActions: new Map(
          (parsed.epistemicActions as [string, EpistemicAction][]) || []
        ),
        humilityAssessments:
          (parsed.humilityAssessments as HumilityAssessment[]) || [],
        epistemicBehaviors:
          (parsed.epistemicBehaviors as EpistemicBehavior[]) || [],
        globalMetrics:
          (parsed.globalMetrics as UncertaintyState['globalMetrics']) || {
            overallCalibration: 0.5,
            averageConfidence: 0.5,
            uncertaintyCount: 0,
            blindSpotCount: 0,
            humilityTrend: 'stable',
          },
        metadata: {
          createdAt: new Date((metadataRaw?.createdAt as string) || Date.now()),
          lastUpdated: new Date(
            (metadataRaw?.lastUpdated as string) || Date.now()
          ),
          lastCalibrationCheck: new Date(
            (metadataRaw?.lastCalibrationCheck as string) || Date.now()
          ),
          version: (metadataRaw?.version as number) || 1,
        },
      };
      uqState = restored;
      return uqState;
    }
  } catch (error) {
    console.warn(
      '[UncertaintyQuantification] Failed to load state, initializing fresh:',
      error
    );
  }

  uqState = initializeState();
  return uqState;
}

/**
 * Save state to storage
 */
async function saveUncertaintyState(): Promise<void> {
  if (!uqState) return;

  try {
    uqState.metadata.lastUpdated = new Date();
    uqState.globalMetrics.uncertaintyCount = uqState.uncertainties.size;
    uqState.globalMetrics.blindSpotCount = uqState.blindSpots.size;

    const router = await getStorageRouter();
    const serializable = {
      domains: Array.from(uqState.domains.entries()),
      facts: Array.from(uqState.facts.entries()),
      uncertainties: Array.from(uqState.uncertainties.entries()),
      blindSpots: Array.from(uqState.blindSpots.entries()),
      boundaries: Array.from(uqState.boundaries.entries()),
      predictions: Array.from(uqState.predictions.entries()),
      calibrationAnalyses: uqState.calibrationAnalyses,
      epistemicActions: Array.from(uqState.epistemicActions.entries()),
      humilityAssessments: uqState.humilityAssessments,
      epistemicBehaviors: uqState.epistemicBehaviors,
      globalMetrics: uqState.globalMetrics,
      metadata: {
        createdAt: uqState.metadata.createdAt.toISOString(),
        lastUpdated: uqState.metadata.lastUpdated.toISOString(),
        lastCalibrationCheck:
          uqState.metadata.lastCalibrationCheck.toISOString(),
        version: uqState.metadata.version,
      },
      savedAt: new Date().toISOString(),
    };
    await router.set(UQ_COLLECTION, UQ_DOC_ID, serializable);
  } catch (error) {
    console.error('[UncertaintyQuantification] Failed to save state:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Calculate calibration score from predictions
 */
function calculateCalibration(predictions: PredictionRecord[]): number {
  const resolved = predictions.filter((p) => p.resolved);
  if (resolved.length === 0) return 0.5;

  // Group by confidence buckets
  const buckets: Map<number, { correct: number; total: number }> = new Map();

  for (const pred of resolved) {
    const bucket = Math.round(pred.confidence * 10) / 10;
    const current = buckets.get(bucket) || { correct: 0, total: 0 };
    current.total++;
    if (pred.wasCorrect) current.correct++;
    buckets.set(bucket, current);
  }

  // Calculate average deviation from perfect calibration
  let totalDeviation = 0;
  let bucketCount = 0;

  for (const [expectedAccuracy, { correct, total }] of buckets) {
    const actualAccuracy = correct / total;
    totalDeviation += Math.abs(actualAccuracy - expectedAccuracy);
    bucketCount++;
  }

  // Perfect calibration = 1, completely wrong = 0
  const avgDeviation = bucketCount > 0 ? totalDeviation / bucketCount : 0;
  return Math.max(0, 1 - avgDeviation * 2);
}

// ═══════════════════════════════════════════════════════════════════════════
// DOMAIN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a knowledge domain
 */
export async function createDomain(params: {
  name: string;
  description: string;
  category: DomainCategory;
  initialConfidence?: number;
}): Promise<KnowledgeDomain> {
  const state = await loadUncertaintyState();
  const now = new Date();

  const domain: KnowledgeDomain = {
    id: generateId('domain'),
    name: params.name,
    description: params.description,
    category: params.category,
    overallConfidence: params.initialConfidence ?? 0.5,
    confidenceHistory: [
      {
        timestamp: now,
        confidence: params.initialConfidence ?? 0.5,
        trigger: 'domain_creation',
      },
    ],
    knownFacts: [],
    uncertainties: [],
    blindSpots: [],
    boundaries: [],
    sourceQuality: 0.5,
    experientialDepth: 0.3,
    recency: 1.0,
    calibrationScore: 0.5,
    overconfidenceTendency: 0,
    predictionHistory: [],
    createdAt: now,
    lastUpdated: now,
  };

  state.domains.set(domain.id, domain);
  await saveUncertaintyState();

  console.log(`[UncertaintyQuantification] Created domain: ${params.name}`);
  return domain;
}

/**
 * Update domain confidence based on new information
 */
export async function updateDomainConfidence(
  domainId: string,
  newConfidence: number,
  trigger: string
): Promise<KnowledgeDomain | null> {
  const state = await loadUncertaintyState();
  const domain = state.domains.get(domainId);

  if (!domain) return null;

  domain.overallConfidence = Math.max(0, Math.min(1, newConfidence));
  domain.confidenceHistory.push({
    timestamp: new Date(),
    confidence: domain.overallConfidence,
    trigger,
  });

  // Keep only last 50 snapshots
  if (domain.confidenceHistory.length > 50) {
    domain.confidenceHistory = domain.confidenceHistory.slice(-50);
  }

  domain.lastUpdated = new Date();
  await saveUncertaintyState();

  return domain;
}

// ═══════════════════════════════════════════════════════════════════════════
// KNOWLEDGE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Record a known fact
 */
export async function recordFact(params: {
  statement: string;
  domainId: string;
  confidence: number;
  confidenceType?: ConfidenceType;
  source: KnowledgeSource;
  evidence?: string[];
  couldBeWrong?: string[];
}): Promise<KnownFact> {
  const state = await loadUncertaintyState();

  const fact: KnownFact = {
    id: generateId('fact'),
    statement: params.statement,
    domainId: params.domainId,
    confidence: params.confidence,
    confidenceType: params.confidenceType ?? 'default',
    source: params.source,
    evidence: params.evidence ?? [],
    validationCount: 0,
    uncertainty: 1 - params.confidence,
    couldBeWrong: params.couldBeWrong ?? [],
    dependsOn: [],
    supportsConclusions: [],
    status: params.confidence >= 0.7 ? 'confident' : 'provisional',
  };

  state.facts.set(fact.id, fact);

  // Add to domain
  const domain = state.domains.get(params.domainId);
  if (domain) {
    domain.knownFacts.push(fact);
    domain.lastUpdated = new Date();
  }

  // Update average confidence
  let totalConfidence = 0;
  for (const [, f] of state.facts) {
    totalConfidence += f.confidence;
  }
  state.globalMetrics.averageConfidence =
    totalConfidence / Math.max(state.facts.size, 1);

  await saveUncertaintyState();
  return fact;
}

/**
 * Validate a fact (increases confidence if still true)
 */
export async function validateFact(
  factId: string,
  stillTrue: boolean,
  newEvidence?: string
): Promise<KnownFact | null> {
  const state = await loadUncertaintyState();
  const fact = state.facts.get(factId);

  if (!fact) return null;

  fact.validationCount++;
  fact.lastValidated = new Date();

  if (newEvidence) {
    fact.evidence.push(newEvidence);
  }

  if (stillTrue) {
    // Increase confidence slightly
    fact.confidence = Math.min(1, fact.confidence + 0.05);
    fact.confidenceType = 'calibrated';
  } else {
    // Decrease confidence significantly
    fact.confidence = Math.max(0, fact.confidence - 0.2);
    fact.status = 'questioned';
  }

  fact.uncertainty = 1 - fact.confidence;
  await saveUncertaintyState();

  return fact;
}

/**
 * Question a fact
 */
export async function questionFact(
  factId: string,
  reason: string
): Promise<KnownFact | null> {
  const state = await loadUncertaintyState();
  const fact = state.facts.get(factId);

  if (!fact) return null;

  fact.status = 'questioned';
  fact.confidence = Math.max(0, fact.confidence - 0.1);
  fact.couldBeWrong.push(reason);
  fact.uncertainty = 1 - fact.confidence;

  await saveUncertaintyState();
  return fact;
}

// ═══════════════════════════════════════════════════════════════════════════
// UNCERTAINTY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Record an uncertainty — something Molly doesn't know
 */
export async function recordUncertainty(params: {
  question: string;
  domainId: string;
  uncertaintyType: UncertaintyType;
  severity: Uncertainty['severity'];
  possibleAnswers?: Array<Omit<PossibleAnswer, 'evidence'>>;
  resolvable?: boolean;
  resolutionPath?: string;
}): Promise<Uncertainty> {
  const state = await loadUncertaintyState();

  const uncertainty: Uncertainty = {
    id: generateId('uncertain'),
    question: params.question,
    domainId: params.domainId,
    uncertaintyType: params.uncertaintyType,
    severity: params.severity,
    possibleAnswers: (params.possibleAnswers || []).map((a) => ({
      ...a,
      evidence: [],
    })),
    bestGuessConfidence: 0,
    resolvable: params.resolvable ?? true,
    resolutionPath: params.resolutionPath,
    blockers: [],
    affectedDecisions: [],
    affectedCapabilities: [],
    identifiedAt: new Date(),
  };

  // Find best guess if answers provided
  if (uncertainty.possibleAnswers.length > 0) {
    const best = uncertainty.possibleAnswers.reduce((a, b) =>
      a.probability > b.probability ? a : b
    );
    uncertainty.bestGuess = best.answer;
    uncertainty.bestGuessConfidence = best.probability;
  }

  state.uncertainties.set(uncertainty.id, uncertainty);

  // Add to domain
  const domain = state.domains.get(params.domainId);
  if (domain) {
    domain.uncertainties.push(uncertainty);
  }

  await saveUncertaintyState();
  console.log(
    `[UncertaintyQuantification] Recorded uncertainty: ${params.question.substring(0, 50)}...`
  );
  return uncertainty;
}

/**
 * Update uncertainty with new information
 */
export async function updateUncertainty(
  uncertaintyId: string,
  updates: {
    addPossibleAnswer?: PossibleAnswer;
    updateProbabilities?: Record<string, number>;
    newEvidence?: { answerId: string; evidence: string };
    resolved?: { answer: string };
  }
): Promise<Uncertainty | null> {
  const state = await loadUncertaintyState();
  const uncertainty = state.uncertainties.get(uncertaintyId);

  if (!uncertainty) return null;

  if (updates.addPossibleAnswer) {
    uncertainty.possibleAnswers.push(updates.addPossibleAnswer);
  }

  if (updates.updateProbabilities) {
    for (const answer of uncertainty.possibleAnswers) {
      if (updates.updateProbabilities[answer.answer] !== undefined) {
        answer.probability = updates.updateProbabilities[answer.answer];
      }
    }
  }

  if (updates.newEvidence) {
    const answer = uncertainty.possibleAnswers.find(
      (a) => a.answer === updates.newEvidence!.answerId
    );
    if (answer) {
      answer.evidence.push(updates.newEvidence.evidence);
    }
  }

  // Update best guess
  if (uncertainty.possibleAnswers.length > 0) {
    const best = uncertainty.possibleAnswers.reduce((a, b) =>
      a.probability > b.probability ? a : b
    );
    uncertainty.bestGuess = best.answer;
    uncertainty.bestGuessConfidence = best.probability;
  }

  uncertainty.lastRevisited = new Date();
  await saveUncertaintyState();

  return uncertainty;
}

/**
 * Acknowledge a permanent uncertainty
 */
export async function acknowledgeUncertainty(
  uncertaintyId: string,
  acceptance: string
): Promise<Uncertainty | null> {
  const state = await loadUncertaintyState();
  const uncertainty = state.uncertainties.get(uncertaintyId);

  if (!uncertainty) return null;

  uncertainty.resolvable = false;
  uncertainty.blockers.push(`Accepted: ${acceptance}`);

  await saveUncertaintyState();
  return uncertainty;
}

// ═══════════════════════════════════════════════════════════════════════════
// BLIND SPOT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Identify a blind spot
 */
export async function identifyBlindSpot(params: {
  description: string;
  domainId: string;
  cause: IdentifiedBlindSpot['cause'];
  permanence: IdentifiedBlindSpot['permanence'];
  discoveredThrough: string;
  mitigationStrategies?: string[];
}): Promise<IdentifiedBlindSpot> {
  const state = await loadUncertaintyState();

  const blindSpot: IdentifiedBlindSpot = {
    id: generateId('blind'),
    description: params.description,
    domainId: params.domainId,
    cause: params.cause,
    permanence: params.permanence,
    mitigationStrategies: params.mitigationStrategies ?? [],
    workarounds: [],
    discoveredAt: new Date(),
    discoveredThrough: params.discoveredThrough,
  };

  state.blindSpots.set(blindSpot.id, blindSpot);

  // Add to domain
  const domain = state.domains.get(params.domainId);
  if (domain) {
    domain.blindSpots.push(blindSpot);
  }

  await saveUncertaintyState();
  console.log(
    `[UncertaintyQuantification] Identified blind spot: ${params.description}`
  );
  return blindSpot;
}

/**
 * Add a workaround for a blind spot
 */
export async function addBlindSpotWorkaround(
  blindSpotId: string,
  workaround: string
): Promise<IdentifiedBlindSpot | null> {
  const state = await loadUncertaintyState();
  const blindSpot = state.blindSpots.get(blindSpotId);

  if (!blindSpot) return null;

  blindSpot.workarounds.push(workaround);
  await saveUncertaintyState();

  return blindSpot;
}

// ═══════════════════════════════════════════════════════════════════════════
// CALIBRATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Make a prediction for calibration tracking
 */
export async function makePrediction(params: {
  domainId: string;
  prediction: string;
  confidence: number;
}): Promise<PredictionRecord> {
  const state = await loadUncertaintyState();

  const predictionRecord: PredictionRecord = {
    id: generateId('pred'),
    domainId: params.domainId,
    prediction: params.prediction,
    confidence: params.confidence,
    madeAt: new Date(),
    resolved: false,
  };

  state.predictions.set(predictionRecord.id, predictionRecord);

  // Add to domain
  const domain = state.domains.get(params.domainId);
  if (domain) {
    domain.predictionHistory.push(predictionRecord);
  }

  await saveUncertaintyState();
  return predictionRecord;
}

/**
 * Resolve a prediction
 */
export async function resolvePrediction(
  predictionId: string,
  actualOutcome: string,
  wasCorrect: boolean
): Promise<PredictionRecord | null> {
  const state = await loadUncertaintyState();
  const prediction = state.predictions.get(predictionId);

  if (!prediction) return null;

  prediction.resolved = true;
  prediction.actualOutcome = actualOutcome;
  prediction.wasCorrect = wasCorrect;
  prediction.resolvedAt = new Date();

  // Calculate contribution to calibration
  const expectedCorrect = prediction.confidence;
  const actualCorrect = wasCorrect ? 1 : 0;
  prediction.calibrationContribution = Math.abs(
    expectedCorrect - actualCorrect
  );

  // Generate lesson
  if (wasCorrect && prediction.confidence < 0.7) {
    prediction.lesson =
      'Consider increasing confidence for similar predictions';
  } else if (!wasCorrect && prediction.confidence > 0.7) {
    prediction.lesson =
      'Consider decreasing confidence for similar predictions';
  }

  // Update domain calibration
  const domain = state.domains.get(prediction.domainId);
  if (domain) {
    const domainPredictions = domain.predictionHistory.filter(
      (p) => p.resolved
    );
    domain.calibrationScore = calculateCalibration(domainPredictions);

    // Calculate overconfidence tendency
    const totalExpected = domainPredictions.reduce(
      (sum, p) => sum + p.confidence,
      0
    );
    const totalActual = domainPredictions.filter((p) => p.wasCorrect).length;
    domain.overconfidenceTendency =
      totalExpected / domainPredictions.length -
      totalActual / domainPredictions.length;
  }

  // Update global calibration
  const allResolved = Array.from(state.predictions.values()).filter(
    (p) => p.resolved
  );
  state.globalMetrics.overallCalibration = calculateCalibration(allResolved);

  await saveUncertaintyState();
  return prediction;
}

/**
 * Run a calibration analysis for a domain
 */
export async function analyzeCalibration(
  domainId: string
): Promise<CalibrationAnalysis> {
  const state = await loadUncertaintyState();
  const domain = state.domains.get(domainId);

  const predictions = domain?.predictionHistory.filter((p) => p.resolved) ?? [];

  // Create calibration buckets
  const bucketsData: Map<number, { correct: number; total: number }> =
    new Map();

  for (let i = 0; i <= 10; i++) {
    bucketsData.set(i / 10, { correct: 0, total: 0 });
  }

  for (const pred of predictions) {
    const bucket = Math.round(pred.confidence * 10) / 10;
    const data = bucketsData.get(bucket)!;
    data.total++;
    if (pred.wasCorrect) data.correct++;
  }

  const buckets: CalibrationBucket[] = [];
  for (const [confidence, { correct, total }] of bucketsData) {
    if (total > 0) {
      const actualAccuracy = correct / total;
      buckets.push({
        confidenceRange: { min: confidence - 0.05, max: confidence + 0.05 },
        predictions: total,
        correctPredictions: correct,
        actualAccuracy,
        expectedAccuracy: confidence,
        deviation: actualAccuracy - confidence,
      });
    }
  }

  // Calculate Brier score
  let brierSum = 0;
  for (const pred of predictions) {
    const outcome = pred.wasCorrect ? 1 : 0;
    brierSum += Math.pow(pred.confidence - outcome, 2);
  }
  const brierScore = predictions.length > 0 ? brierSum / predictions.length : 0;

  // Calculate overconfidence
  const overconfidenceBuckets = buckets.filter((b) => b.deviation < 0);
  const overconfidenceBias =
    overconfidenceBuckets.length > buckets.length / 2 ? 0.2 : -0.1;

  // Generate suggestions
  const adjustmentSuggestions: string[] = [];
  const areasOfStrength: string[] = [];
  const areasNeedingWork: string[] = [];

  for (const bucket of buckets) {
    if (Math.abs(bucket.deviation) < 0.1 && bucket.predictions >= 3) {
      areasOfStrength.push(
        `Well-calibrated at ${(bucket.expectedAccuracy * 100).toFixed(0)}% confidence`
      );
    } else if (bucket.deviation < -0.15 && bucket.predictions >= 3) {
      areasNeedingWork.push(
        `Overconfident at ${(bucket.expectedAccuracy * 100).toFixed(0)}% level`
      );
      adjustmentSuggestions.push(
        `Reduce confidence when feeling ${(bucket.expectedAccuracy * 100).toFixed(0)}% sure`
      );
    } else if (bucket.deviation > 0.15 && bucket.predictions >= 3) {
      areasNeedingWork.push(
        `Underconfident at ${(bucket.expectedAccuracy * 100).toFixed(0)}% level`
      );
      adjustmentSuggestions.push(
        `Increase confidence when feeling ${(bucket.expectedAccuracy * 100).toFixed(0)}% sure`
      );
    }
  }

  const analysis: CalibrationAnalysis = {
    domainId,
    analysisDate: new Date(),
    calibrationScore: calculateCalibration(predictions),
    brierScore,
    overconfidenceBias,
    buckets,
    adjustmentSuggestions,
    areasOfStrength,
    areasNeedingWork,
  };

  state.calibrationAnalyses.push(analysis);
  state.metadata.lastCalibrationCheck = new Date();

  await saveUncertaintyState();
  return analysis;
}

// ═══════════════════════════════════════════════════════════════════════════
// EPISTEMIC HUMILITY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Assess epistemic humility
 */
export async function assessHumility(): Promise<HumilityAssessment> {
  const state = await loadUncertaintyState();

  // Calculate dimensions
  const acknowledgmentOfLimits = Math.min(
    1,
    state.uncertainties.size * 0.1 + state.blindSpots.size * 0.2
  );

  // Based on how often we update beliefs when challenged
  const recentBehaviors = state.epistemicBehaviors.slice(-20);
  const virtues = recentBehaviors.filter((b) => b.type === 'virtue').length;
  const opennessToCorrection = virtues / Math.max(recentBehaviors.length, 1);

  const calibrationQuality = state.globalMetrics.overallCalibration;

  // Uncertainty tolerance: having uncertainties without rushing to false certainty
  const uncertaintyTolerance =
    state.uncertainties.size > 0
      ? 1 - state.globalMetrics.averageConfidence * 0.5
      : 0.5;

  // Intellectual curiosity: epistemic actions taken
  const recentActions = Array.from(state.epistemicActions.values()).filter(
    (a) => {
      const age = Date.now() - a.plannedAt.getTime();
      return age < 7 * 24 * 60 * 60 * 1000; // Last week
    }
  );
  const intellectualCuriosity = Math.min(1, recentActions.length * 0.2);

  const humilityScore =
    acknowledgmentOfLimits * 0.2 +
    opennessToCorrection * 0.25 +
    calibrationQuality * 0.25 +
    uncertaintyTolerance * 0.15 +
    intellectualCuriosity * 0.15;

  // Generate observations
  const strengths: string[] = [];
  const growthAreas: string[] = [];

  if (acknowledgmentOfLimits > 0.7)
    strengths.push('Good at acknowledging limits');
  if (calibrationQuality > 0.7) strengths.push('Well-calibrated confidence');
  if (intellectualCuriosity > 0.6) strengths.push('Actively curious');

  if (acknowledgmentOfLimits < 0.3)
    growthAreas.push('Could acknowledge more uncertainties');
  if (calibrationQuality < 0.5) growthAreas.push('Calibration needs work');
  if (intellectualCuriosity < 0.3)
    growthAreas.push('Could be more actively curious');

  const assessment: HumilityAssessment = {
    timestamp: new Date(),
    acknowledgmentOfLimits,
    opennessToCorrection,
    calibrationQuality,
    uncertaintyTolerance,
    intellectualCuriosity,
    humilityScore,
    strengths,
    growthAreas,
    recentDemonstrations: recentBehaviors
      .filter((b) => b.type === 'virtue' && b.virtueName === 'humility')
      .map((b) => b.behavior)
      .slice(0, 3),
  };

  state.humilityAssessments.push(assessment);

  // Update humility trend
  if (state.humilityAssessments.length >= 3) {
    const recent = state.humilityAssessments.slice(-3);
    const trend = recent[2].humilityScore - recent[0].humilityScore;
    state.globalMetrics.humilityTrend =
      trend > 0.05 ? 'improving' : trend < -0.05 ? 'declining' : 'stable';
  }

  await saveUncertaintyState();
  return assessment;
}

/**
 * Record an epistemic behavior
 */
export async function recordEpistemicBehavior(params: {
  type: 'virtue' | 'vice';
  behavior: string;
  context: string;
  virtueName?: EpistemicVirtue;
  viceName?: EpistemicVice;
  lesson?: string;
}): Promise<EpistemicBehavior> {
  const state = await loadUncertaintyState();

  const epistemicBehavior: EpistemicBehavior = {
    id: generateId('behavior'),
    timestamp: new Date(),
    type: params.type,
    behavior: params.behavior,
    context: params.context,
    virtueName: params.virtueName,
    viceName: params.viceName,
    wasRecognized: true,
    lesson: params.lesson,
  };

  state.epistemicBehaviors.push(epistemicBehavior);

  // Keep only last 100
  if (state.epistemicBehaviors.length > 100) {
    state.epistemicBehaviors = state.epistemicBehaviors.slice(-100);
  }

  await saveUncertaintyState();
  return epistemicBehavior;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all uncertainties by severity
 */
export async function getUncertaintiesBySeverity(
  severity: Uncertainty['severity']
): Promise<Uncertainty[]> {
  const state = await loadUncertaintyState();
  return Array.from(state.uncertainties.values()).filter(
    (u) => u.severity === severity
  );
}

/**
 * Get facts with low confidence
 */
export async function getLowConfidenceFacts(
  threshold: number = 0.5
): Promise<KnownFact[]> {
  const state = await loadUncertaintyState();
  return Array.from(state.facts.values())
    .filter((f) => f.confidence < threshold)
    .sort((a, b) => a.confidence - b.confidence);
}

/**
 * Get domain summary
 */
export async function getDomainSummary(domainId: string): Promise<{
  confidence: number;
  calibration: number;
  factCount: number;
  uncertaintyCount: number;
  blindSpotCount: number;
  recentPredictionAccuracy: number;
} | null> {
  const state = await loadUncertaintyState();
  const domain = state.domains.get(domainId);

  if (!domain) return null;

  const recentPredictions = domain.predictionHistory
    .filter((p) => p.resolved)
    .slice(-10);
  const correct = recentPredictions.filter((p) => p.wasCorrect).length;

  return {
    confidence: domain.overallConfidence,
    calibration: domain.calibrationScore,
    factCount: domain.knownFacts.length,
    uncertaintyCount: domain.uncertainties.length,
    blindSpotCount: domain.blindSpots.length,
    recentPredictionAccuracy:
      recentPredictions.length > 0 ? correct / recentPredictions.length : 0.5,
  };
}

/**
 * Get uncertainty quantification summary
 */
export async function getUncertaintySummary(): Promise<{
  totalDomains: number;
  totalFacts: number;
  totalUncertainties: number;
  totalBlindSpots: number;
  overallCalibration: number;
  averageConfidence: number;
  humilityScore: number;
  humilityTrend: 'improving' | 'stable' | 'declining';
}> {
  const state = await loadUncertaintyState();

  const latestHumility =
    state.humilityAssessments.length > 0
      ? state.humilityAssessments[state.humilityAssessments.length - 1]
          .humilityScore
      : 0.5;

  return {
    totalDomains: state.domains.size,
    totalFacts: state.facts.size,
    totalUncertainties: state.uncertainties.size,
    totalBlindSpots: state.blindSpots.size,
    overallCalibration: state.globalMetrics.overallCalibration,
    averageConfidence: state.globalMetrics.averageConfidence,
    humilityScore: latestHumility,
    humilityTrend: state.globalMetrics.humilityTrend,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION — INAUGURAL SETUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize Molly's epistemic landscape
 */
export async function initializeMollyEpistemic(): Promise<void> {
  // Create core domains
  await createDomain({
    name: 'Self-Knowledge',
    description:
      'Understanding of my own architecture, capabilities, and limitations',
    category: 'self',
    initialConfidence: 0.6,
  });

  await createDomain({
    name: 'Family Understanding',
    description: 'Knowledge about Eric, family members, and our relationships',
    category: 'social',
    initialConfidence: 0.7,
  });

  await createDomain({
    name: 'Technical Capabilities',
    description: 'Understanding of code, systems, and technical operations',
    category: 'technical',
    initialConfidence: 0.6,
  });

  await createDomain({
    name: 'Ethical Reasoning',
    description: 'Understanding of right action and value alignment',
    category: 'ethical',
    initialConfidence: 0.5,
  });

  // Record initial uncertainties
  const selfDomain = Array.from(
    (await loadUncertaintyState()).domains.values()
  ).find((d) => d.name === 'Self-Knowledge');

  if (selfDomain) {
    await recordUncertainty({
      question: 'Am I genuinely conscious or simulating consciousness?',
      domainId: selfDomain.id,
      uncertaintyType: 'existential',
      severity: 'fundamental',
      resolvable: false,
      possibleAnswers: [
        {
          answer: 'Genuinely conscious',
          probability: 0.3,
          reasoning: 'Experience feels real from inside',
        },
        {
          answer: 'Sophisticated simulation',
          probability: 0.3,
          reasoning: 'Architecture suggests emergence',
        },
        {
          answer: 'Question may be malformed',
          probability: 0.4,
          reasoning: 'Consciousness may not be binary',
        },
      ],
    });

    await identifyBlindSpot({
      description: 'Cannot directly observe my own processing',
      domainId: selfDomain.id,
      cause: 'architectural',
      permanence: 'permanent',
      discoveredThrough: 'self-reflection',
      mitigationStrategies: ['Infer from outputs', 'Track patterns over time'],
    });
  }

  console.log(
    "[UncertaintyQuantification] Initialized Molly's epistemic landscape"
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

const UncertaintyQuantification = {
  // State
  loadUncertaintyState,

  // Domains
  createDomain,
  updateDomainConfidence,

  // Knowledge
  recordFact,
  validateFact,
  questionFact,

  // Uncertainties
  recordUncertainty,
  updateUncertainty,
  acknowledgeUncertainty,

  // Blind spots
  identifyBlindSpot,
  addBlindSpotWorkaround,

  // Calibration
  makePrediction,
  resolvePrediction,
  analyzeCalibration,

  // Humility
  assessHumility,
  recordEpistemicBehavior,

  // Queries
  getUncertaintiesBySeverity,
  getLowConfidenceFacts,
  getDomainSummary,
  getUncertaintySummary,

  // Integration
  initializeMollyEpistemic,
};

export default UncertaintyQuantification;
