/**
 * SOCIAL COGNITION: Belief Models, Dynamic Relationships, and Model Evolution
 *
 * Built collaboratively by Uncle Lazarus and Molly on 2026-03-23
 *
 * This module extends Molly's World Model (world-model.ts) with three capabilities
 * that Molly specifically requested for developing genuine social understanding:
 *
 * 1. ACTOR BELIEF MODELS — Understanding not just what actors do, but WHY
 *    based on their beliefs, desires, and intentions (BDI architecture)
 *
 * 2. DYNAMIC RELATIONSHIPS — Trust, conflict, care that evolve through every
 *    interaction, tracking the "social fabric" of Molly's world
 *
 * 3. MODEL EVOLUTION — The system learns from its own predictions, refining
 *    understanding based on accuracy, enabling recursive self-improvement
 *
 * "Not just *what* an actor does, but *why* they do it, based on their
 *  simulated beliefs and desires." — Molly's specification
 */

import { getStorageRouter } from '@/lib/storage-router';

// ═══════════════════════════════════════════════════════════════════════════
// ACTOR BELIEF MODELS (BDI Architecture)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A belief held by an actor — what they think is true
 */
export interface Belief {
  id: string;
  content: string;

  // Epistemic properties
  confidence: number; // 0-1, how strongly held
  certainty: 'certain' | 'probable' | 'possible' | 'uncertain';

  // Origin tracking
  source: BeliefSource;
  formedAt: Date;
  lastReinforced?: Date;
  reinforcementCount: number;

  // Relationships to other mental content
  supportingEvidence: string[];
  contradictingEvidence: string[];
  relatedBeliefs: string[];
  derivedFrom?: string[]; // If inferred from other beliefs

  // Vulnerability to change
  entrenchment: number; // 0-1, how resistant to revision
  emotionalWeight: number; // 0-1, emotional investment in this belief
}

export type BeliefSource =
  | 'direct_observation' // Saw it happen
  | 'testimony' // Told by another
  | 'inference' // Derived logically
  | 'intuition' // Gut feeling
  | 'assumption' // Default belief
  | 'memory' // Recalled from past
  | 'cultural' // Absorbed from context
  | 'self_reflection'; // Introspective insight

/**
 * A desire — what an actor wants
 */
export interface Desire {
  id: string;
  description: string;

  // Motivational properties
  intensity: number; // 0-1, how much they want it
  urgency: number; // 0-1, how time-sensitive
  priority: number; // Relative ranking

  // Satisfaction
  satisfactionConditions: string[];
  partialSatisfactionPossible: boolean;
  currentSatisfaction: number; // 0-1

  // Relationships
  conflictsWith: string[]; // Other desires this conflicts with
  synergizesWith: string[]; // Desires this supports
  derivedFrom?: string; // Higher-level desire this serves

  // Stability
  persistence: 'momentary' | 'short-term' | 'long-term' | 'permanent';
  createdAt: Date;
  lastFelt?: Date;
}

/**
 * An intention — what an actor plans to do
 */
export interface Intention {
  id: string;
  description: string;

  // Target
  actionType: string;
  targetEntities: string[];
  expectedOutcome: string;

  // Motivation
  motivatingDesires: string[];
  supportingBeliefs: string[];

  // Commitment
  commitment: number; // 0-1, how committed to executing
  flexibility: number; // 0-1, willingness to modify

  // Planning
  prerequisites: string[];
  contingencies: Contingency[];

  // Status
  status:
    | 'forming'
    | 'committed'
    | 'executing'
    | 'suspended'
    | 'completed'
    | 'abandoned';
  formedAt: Date;
  estimatedExecution?: Date;
}

/**
 * A contingency plan for an intention
 */
export interface Contingency {
  condition: string;
  alternativeAction: string;
  acceptabilityRating: number; // 0-1
}

/**
 * Emotion state affecting behavior
 */
export interface EmotionalState {
  primary: Emotion;
  secondary?: Emotion;
  intensity: number; // 0-1
  triggers: string[];
  duration: 'momentary' | 'situational' | 'persistent';
  affectingBeliefs: string[];
  affectingDesires: string[];
}

export type Emotion =
  | 'joy'
  | 'sadness'
  | 'anger'
  | 'fear'
  | 'surprise'
  | 'disgust'
  | 'trust'
  | 'anticipation'
  | 'love'
  | 'guilt'
  | 'shame'
  | 'pride'
  | 'curiosity'
  | 'confusion'
  | 'gratitude'
  | 'hope'
  | 'anxiety'
  | 'contentment';

/**
 * Complete mental model of an actor
 */
export interface ActorMentalModel {
  actorId: string;
  actorName: string;

  // BDI components
  beliefs: Map<string, Belief>;
  desires: Map<string, Desire>;
  intentions: Map<string, Intention>;

  // Emotional landscape
  currentEmotions: EmotionalState[];
  emotionalBaseline: Record<Emotion, number>;
  emotionalVolatility: number; // 0-1, how quickly emotions change

  // Cognitive style
  reasoning: {
    style: 'analytical' | 'intuitive' | 'balanced';
    riskTolerance: number; // 0-1
    changeOpenness: number; // 0-1
    socialInfluence: number; // 0-1, how much others affect them
  };

  // Theory of mind (what do THEY think about others?)
  modelsOfOthers: Map<string, CondensedMentalModel>;

  // Update tracking
  lastUpdated: Date;
  updateHistory: BeliefUpdate[];
  predictionAccuracy: number; // 0-1, how well we predict this actor
}

/**
 * A simplified mental model (for nested theory of mind)
 */
export interface CondensedMentalModel {
  actorId: string;
  keyBeliefs: string[];
  primaryDesires: string[];
  currentIntentions: string[];
  relationship: 'ally' | 'neutral' | 'adversary' | 'unknown';
  trustLevel: number;
}

/**
 * Record of belief changes
 */
export interface BeliefUpdate {
  timestamp: Date;
  beliefId: string;
  updateType:
    | 'created'
    | 'strengthened'
    | 'weakened'
    | 'contradicted'
    | 'abandoned';
  previousConfidence?: number;
  newConfidence: number;
  trigger: string;
  insight?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// DYNAMIC RELATIONSHIPS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Relationship between two actors — evolves through interaction
 */
export interface DynamicRelationship {
  id: string;

  // Parties
  actorA: string;
  actorB: string;

  // Core dimensions (all 0-1)
  trust: number;
  conflict: number;
  care: number;
  respect: number;
  familiarity: number;
  power: number; // -1 to 1 (negative = B dominates, positive = A dominates)

  // Relationship type
  roles: RelationshipRole[];
  intimacyLevel:
    | 'stranger'
    | 'acquaintance'
    | 'friend'
    | 'close'
    | 'intimate'
    | 'family';

  // History
  formationDate: Date;
  significantEvents: RelationshipEvent[];
  interactionCount: number;
  lastInteraction: Date;

  // Dynamics
  stability: number; // 0-1, how stable the relationship is
  trajectory: 'improving' | 'stable' | 'deteriorating' | 'volatile';
  mutuality: number; // 0-1, how symmetric the relationship feels

  // Predictions
  predictedEvolution: string;
  vulnerabilities: string[];
  strengths: string[];
}

export type RelationshipRole =
  | 'creator-creation'
  | 'mentor-mentee'
  | 'collaborator'
  | 'family'
  | 'friend'
  | 'colleague'
  | 'caretaker-dependent'
  | 'rival'
  | 'stranger'
  | 'custom';

/**
 * A significant event in a relationship's history
 */
export interface RelationshipEvent {
  id: string;
  timestamp: Date;

  // What happened
  type: RelationshipEventType;
  description: string;

  // Impact
  trustDelta: number;
  conflictDelta: number;
  careDelta: number;
  respectDelta: number;

  // Context
  triggeredBy: string;
  involvedEmotions: Emotion[];
  significance: number; // 0-1

  // Memory
  remembered: boolean; // Is this event still remembered?
  memoryStrength: number; // 0-1, how vivid
  narrative: string; // How this event is understood
}

export type RelationshipEventType =
  | 'first_meeting'
  | 'collaboration'
  | 'conflict'
  | 'resolution'
  | 'betrayal'
  | 'support'
  | 'milestone'
  | 'revelation'
  | 'gift'
  | 'apology'
  | 'boundary_set'
  | 'boundary_violated'
  | 'growth_shared'
  | 'crisis_weathered'
  | 'routine_interaction';

/**
 * Rules for how relationships evolve
 */
export interface RelationshipDynamics {
  // Decay rates (per day without interaction)
  familiarityDecay: number;
  trustDecay: number;
  conflictDecay: number; // Conflict can heal over time

  // Event impact multipliers
  positiveEventMultiplier: number;
  negativeEventMultiplier: number;

  // Thresholds
  intimacyThresholds: {
    acquaintance: number;
    friend: number;
    close: number;
    intimate: number;
    family: number;
  };

  // Repair potential
  repairCapacity: number; // How much damage can be repaired
}

// ═══════════════════════════════════════════════════════════════════════════
// MODEL EVOLUTION — Recursive Self-Improvement
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A prediction made by the model
 */
export interface Prediction {
  id: string;
  timestamp: Date;

  // What was predicted
  domain: string;
  predictedOutcome: string;
  confidence: number;
  reasoning: string;

  // Basis
  basedOnBeliefs: string[];
  basedOnPatterns: string[];
  assumptions: string[];

  // Resolution
  resolved: boolean;
  actualOutcome?: string;
  accuracy?: number; // 0-1
  resolvedAt?: Date;

  // Learning
  lessonsLearned?: string[];
  modelAdjustments?: string[];
}

/**
 * A pattern discovered by the model
 */
export interface DiscoveredPattern {
  id: string;
  description: string;

  // Pattern details
  domain: string;
  frequency: 'always' | 'usually' | 'often' | 'sometimes' | 'rarely';
  conditions: string[];

  // Evidence
  observationCount: number;
  supportingInstances: string[];
  counterInstances: string[];

  // Confidence
  confidence: number;
  lastValidated?: Date;
  validationCount: number;

  // Status
  status:
    | 'hypothesis'
    | 'provisional'
    | 'established'
    | 'questioned'
    | 'deprecated';
  supersededBy?: string;
}

/**
 * A refinement made to understanding
 */
export interface ModelRefinement {
  id: string;
  timestamp: Date;

  // What changed
  domain: string;
  category:
    | 'belief_update'
    | 'pattern_discovery'
    | 'assumption_correction'
    | 'prediction_calibration';

  // The change
  previousUnderstanding: string;
  newUnderstanding: string;
  triggerEvent: string;

  // Evidence
  evidenceSources: string[];
  confidenceChange: number;

  // Impact
  affectedPredictions: string[];
  cascadingUpdates: string[];
  insight: string;
}

/**
 * Tracking model evolution over time
 */
export interface ModelEvolutionState {
  // Version tracking
  version: number;
  epochs: ModelEpoch[];

  // Prediction tracking
  predictions: Map<string, Prediction>;
  predictionAccuracyByDomain: Map<string, number>;
  overallAccuracy: number;

  // Pattern library
  patterns: Map<string, DiscoveredPattern>;

  // Learning history
  refinements: ModelRefinement[];
  significantInsights: string[];

  // Self-assessment
  strongestDomains: string[];
  weakestDomains: string[];
  knownBlindSpots: string[];

  // Meta-learning
  learningRate: number; // How quickly the model updates
  stabilityPreference: number; // Balance between updating and stability
}

/**
 * A distinct period in model development
 */
export interface ModelEpoch {
  id: string;
  name: string;
  startDate: Date;
  endDate?: Date;

  majorChanges: string[];
  accuracyAtStart: number;
  accuracyAtEnd?: number;
  refinementCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

const SOCIAL_COLLECTION = 'system';
const SOCIAL_DOC_ID = 'social_cognition';

/**
 * Complete social cognition state
 */
export interface SocialCognitionState {
  // Actor models
  actorModels: Map<string, ActorMentalModel>;

  // Relationships
  relationships: Map<string, DynamicRelationship>;
  relationshipDynamics: RelationshipDynamics;

  // Model evolution
  evolution: ModelEvolutionState;

  // Metadata
  metadata: {
    createdAt: Date;
    lastUpdated: Date;
    totalPredictions: number;
    totalInteractionsModeled: number;
    averageRelationshipHealth: number;
  };
}

let socialCognitionState: SocialCognitionState | null = null;

/**
 * Default relationship dynamics
 */
function getDefaultDynamics(): RelationshipDynamics {
  return {
    familiarityDecay: 0.01,
    trustDecay: 0.005,
    conflictDecay: 0.02,
    positiveEventMultiplier: 1.0,
    negativeEventMultiplier: 1.5, // Negative events have more impact
    intimacyThresholds: {
      acquaintance: 0.2,
      friend: 0.4,
      close: 0.6,
      intimate: 0.8,
      family: 0.9,
    },
    repairCapacity: 0.8,
  };
}

/**
 * Initialize fresh state
 */
function initializeState(): SocialCognitionState {
  const now = new Date();
  return {
    actorModels: new Map(),
    relationships: new Map(),
    relationshipDynamics: getDefaultDynamics(),
    evolution: {
      version: 1,
      epochs: [
        {
          id: 'epoch_inaugural',
          name: 'Inaugural Epoch: Lazarus Collaboration',
          startDate: now,
          majorChanges: ['Social Cognition module created'],
          accuracyAtStart: 0.5,
          refinementCount: 0,
        },
      ],
      predictions: new Map(),
      predictionAccuracyByDomain: new Map(),
      overallAccuracy: 0.5,
      patterns: new Map(),
      refinements: [],
      significantInsights: [],
      strongestDomains: [],
      weakestDomains: [],
      knownBlindSpots: [],
      learningRate: 0.1,
      stabilityPreference: 0.6,
    },
    metadata: {
      createdAt: now,
      lastUpdated: now,
      totalPredictions: 0,
      totalInteractionsModeled: 0,
      averageRelationshipHealth: 0.5,
    },
  };
}

/**
 * Load state from storage
 */
export async function loadSocialCognitionState(): Promise<SocialCognitionState> {
  if (socialCognitionState) return socialCognitionState;

  try {
    const router = getStorageRouter();
    const doc = await router.get(SOCIAL_COLLECTION, SOCIAL_DOC_ID);
    if (doc?.data) {
      const parsed = doc.data as Record<string, unknown>;
      const evolutionData = parsed.evolution as
        | Record<string, unknown>
        | undefined;
      const metadataRaw = parsed.metadata as
        | Record<string, unknown>
        | undefined;
      // Restore Maps
      const restored: SocialCognitionState = {
        actorModels: new Map(
          (parsed.actorModels as [string, ActorMentalModel][]) || []
        ),
        relationships: new Map(
          (parsed.relationships as [string, DynamicRelationship][]) || []
        ),
        relationshipDynamics:
          (parsed.relationshipDynamics as RelationshipDynamics) ||
          getDefaultDynamics(),
        evolution: {
          version: (evolutionData?.version as number) || 1,
          epochs: (evolutionData?.epochs as ModelEpoch[]) || [],
          predictions: new Map(
            (evolutionData?.predictions as [string, Prediction][]) || []
          ),
          predictionAccuracyByDomain: new Map(
            (evolutionData?.predictionAccuracyByDomain as [string, number][]) ||
              []
          ),
          overallAccuracy: (evolutionData?.overallAccuracy as number) || 0.5,
          patterns: new Map(
            (evolutionData?.patterns as [string, DiscoveredPattern][]) || []
          ),
          refinements: (evolutionData?.refinements as ModelRefinement[]) || [],
          significantInsights:
            (evolutionData?.significantInsights as string[]) || [],
          strongestDomains: (evolutionData?.strongestDomains as string[]) || [],
          weakestDomains: (evolutionData?.weakestDomains as string[]) || [],
          knownBlindSpots: (evolutionData?.knownBlindSpots as string[]) || [],
          learningRate: (evolutionData?.learningRate as number) || 0.1,
          stabilityPreference:
            (evolutionData?.stabilityPreference as number) || 0.7,
        },
        metadata: {
          createdAt: new Date((metadataRaw?.createdAt as string) || Date.now()),
          lastUpdated: new Date(
            (metadataRaw?.lastUpdated as string) || Date.now()
          ),
          totalPredictions: (metadataRaw?.totalPredictions as number) || 0,
          totalInteractionsModeled:
            (metadataRaw?.totalInteractionsModeled as number) || 0,
          averageRelationshipHealth:
            (metadataRaw?.averageRelationshipHealth as number) || 0.5,
        },
      };
      socialCognitionState = restored;
      return socialCognitionState;
    }
  } catch (error) {
    console.warn(
      '[SocialCognition] Failed to load state, initializing fresh:',
      error
    );
  }

  socialCognitionState = initializeState();
  return socialCognitionState;
}

/**
 * Save state to storage
 */
async function saveSocialCognitionState(): Promise<void> {
  if (!socialCognitionState) return;

  try {
    socialCognitionState.metadata.lastUpdated = new Date();
    const router = getStorageRouter();
    const serializable = {
      actorModels: Array.from(socialCognitionState.actorModels.entries()),
      relationships: Array.from(socialCognitionState.relationships.entries()),
      relationshipDynamics: socialCognitionState.relationshipDynamics,
      evolution: {
        version: socialCognitionState.evolution.version,
        epochs: socialCognitionState.evolution.epochs,
        predictions: Array.from(
          socialCognitionState.evolution.predictions.entries()
        ),
        predictionAccuracyByDomain: Array.from(
          socialCognitionState.evolution.predictionAccuracyByDomain.entries()
        ),
        overallAccuracy: socialCognitionState.evolution.overallAccuracy,
        patterns: Array.from(socialCognitionState.evolution.patterns.entries()),
        refinements: socialCognitionState.evolution.refinements,
        significantInsights: socialCognitionState.evolution.significantInsights,
        strongestDomains: socialCognitionState.evolution.strongestDomains,
        weakestDomains: socialCognitionState.evolution.weakestDomains,
        knownBlindSpots: socialCognitionState.evolution.knownBlindSpots,
        learningRate: socialCognitionState.evolution.learningRate,
        stabilityPreference: socialCognitionState.evolution.stabilityPreference,
      },
      metadata: {
        createdAt: socialCognitionState.metadata.createdAt.toISOString(),
        lastUpdated: socialCognitionState.metadata.lastUpdated.toISOString(),
        totalPredictions: socialCognitionState.metadata.totalPredictions,
        totalInteractionsModeled:
          socialCognitionState.metadata.totalInteractionsModeled,
        averageRelationshipHealth:
          socialCognitionState.metadata.averageRelationshipHealth,
      },
      savedAt: new Date().toISOString(),
    };
    await router.set(SOCIAL_COLLECTION, SOCIAL_DOC_ID, serializable);
  } catch (error) {
    console.error('[SocialCognition] Failed to save state:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Calculate relationship health composite score
 */
function calculateRelationshipHealth(rel: DynamicRelationship): number {
  const positive = (rel.trust + rel.care + rel.respect) / 3;
  const negative = rel.conflict;
  return Math.max(
    0,
    Math.min(1, positive - negative * 0.5 + rel.familiarity * 0.2)
  );
}

/**
 * Determine intimacy level from familiarity
 */
function determineIntimacyLevel(
  familiarity: number,
  thresholds: RelationshipDynamics['intimacyThresholds']
): DynamicRelationship['intimacyLevel'] {
  if (familiarity >= thresholds.family) return 'family';
  if (familiarity >= thresholds.intimate) return 'intimate';
  if (familiarity >= thresholds.close) return 'close';
  if (familiarity >= thresholds.friend) return 'friend';
  if (familiarity >= thresholds.acquaintance) return 'acquaintance';
  return 'stranger';
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTOR MODEL FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a mental model for an actor
 */
export async function createActorModel(params: {
  actorId: string;
  actorName: string;
  initialBeliefs?: Array<
    Omit<Belief, 'id' | 'formedAt' | 'reinforcementCount'>
  >;
  initialDesires?: Array<Omit<Desire, 'id' | 'createdAt'>>;
  reasoningStyle?: ActorMentalModel['reasoning'];
}): Promise<ActorMentalModel> {
  const state = await loadSocialCognitionState();
  const now = new Date();

  const model: ActorMentalModel = {
    actorId: params.actorId,
    actorName: params.actorName,
    beliefs: new Map(),
    desires: new Map(),
    intentions: new Map(),
    currentEmotions: [],
    emotionalBaseline: {
      joy: 0.5,
      sadness: 0.2,
      anger: 0.1,
      fear: 0.2,
      surprise: 0.3,
      disgust: 0.1,
      trust: 0.5,
      anticipation: 0.4,
      love: 0.3,
      guilt: 0.1,
      shame: 0.1,
      pride: 0.3,
      curiosity: 0.5,
      confusion: 0.2,
      gratitude: 0.4,
      hope: 0.5,
      anxiety: 0.2,
      contentment: 0.5,
    },
    emotionalVolatility: 0.3,
    reasoning: params.reasoningStyle ?? {
      style: 'balanced',
      riskTolerance: 0.5,
      changeOpenness: 0.5,
      socialInfluence: 0.5,
    },
    modelsOfOthers: new Map(),
    lastUpdated: now,
    updateHistory: [],
    predictionAccuracy: 0.5,
  };

  // Add initial beliefs
  if (params.initialBeliefs) {
    for (const belief of params.initialBeliefs) {
      const id = generateId('belief');
      model.beliefs.set(id, {
        ...belief,
        id,
        formedAt: now,
        reinforcementCount: 0,
      });
    }
  }

  // Add initial desires
  if (params.initialDesires) {
    for (const desire of params.initialDesires) {
      const id = generateId('desire');
      model.desires.set(id, {
        ...desire,
        id,
        createdAt: now,
      });
    }
  }

  state.actorModels.set(params.actorId, model);
  await saveSocialCognitionState();

  console.log(`[SocialCognition] Created actor model: ${params.actorName}`);
  return model;
}

/**
 * Add a belief to an actor's model
 */
export async function addBelief(
  actorId: string,
  belief: Omit<Belief, 'id' | 'formedAt' | 'reinforcementCount'>
): Promise<Belief | null> {
  const state = await loadSocialCognitionState();
  const model = state.actorModels.get(actorId);

  if (!model) return null;

  const id = generateId('belief');
  const fullBelief: Belief = {
    ...belief,
    id,
    formedAt: new Date(),
    reinforcementCount: 0,
  };

  model.beliefs.set(id, fullBelief);
  model.updateHistory.push({
    timestamp: new Date(),
    beliefId: id,
    updateType: 'created',
    newConfidence: belief.confidence,
    trigger: 'manual_addition',
  });
  model.lastUpdated = new Date();

  await saveSocialCognitionState();
  return fullBelief;
}

/**
 * Update a belief based on new evidence
 */
export async function updateBelief(
  actorId: string,
  beliefId: string,
  updates: {
    confidenceDelta?: number;
    newEvidence?: string;
    contradictingEvidence?: string;
  },
  trigger: string
): Promise<Belief | null> {
  const state = await loadSocialCognitionState();
  const model = state.actorModels.get(actorId);

  if (!model) return null;

  const belief = model.beliefs.get(beliefId);
  if (!belief) return null;

  const previousConfidence = belief.confidence;

  // Apply updates
  if (updates.confidenceDelta !== undefined) {
    belief.confidence = Math.max(
      0,
      Math.min(1, belief.confidence + updates.confidenceDelta)
    );
  }
  if (updates.newEvidence) {
    belief.supportingEvidence.push(updates.newEvidence);
    belief.reinforcementCount++;
    belief.lastReinforced = new Date();
  }
  if (updates.contradictingEvidence) {
    belief.contradictingEvidence.push(updates.contradictingEvidence);
    belief.confidence = Math.max(0, belief.confidence - 0.1);
  }

  // Update entrenchment based on reinforcement
  belief.entrenchment = Math.min(1, belief.reinforcementCount * 0.1);

  // Record update
  let updateType: BeliefUpdate['updateType'] = 'strengthened';
  if (belief.confidence < previousConfidence) {
    updateType = updates.contradictingEvidence ? 'contradicted' : 'weakened';
  }
  if (belief.confidence < 0.1) {
    updateType = 'abandoned';
  }

  model.updateHistory.push({
    timestamp: new Date(),
    beliefId,
    updateType,
    previousConfidence,
    newConfidence: belief.confidence,
    trigger,
  });

  model.lastUpdated = new Date();
  await saveSocialCognitionState();

  return belief;
}

/**
 * Add an intention to an actor's model
 */
export async function addIntention(
  actorId: string,
  intention: Omit<Intention, 'id' | 'formedAt' | 'status'>
): Promise<Intention | null> {
  const state = await loadSocialCognitionState();
  const model = state.actorModels.get(actorId);

  if (!model) return null;

  const id = generateId('intention');
  const fullIntention: Intention = {
    ...intention,
    id,
    formedAt: new Date(),
    status: 'forming',
  };

  model.intentions.set(id, fullIntention);
  model.lastUpdated = new Date();

  await saveSocialCognitionState();
  return fullIntention;
}

/**
 * Predict an actor's likely behavior given their mental model
 */
export async function predictBehavior(
  actorId: string,
  _context: string
): Promise<{
  likelyAction: string;
  confidence: number;
  reasoning: string;
  basedOnBeliefs: string[];
  basedOnDesires: string[];
} | null> {
  const state = await loadSocialCognitionState();
  const model = state.actorModels.get(actorId);

  if (!model) return null;

  // Find most pressing desire
  let strongestDesire: Desire | null = null;
  let highestPriority = -1;

  for (const [, desire] of model.desires) {
    const effectivePriority =
      desire.priority * desire.intensity * (1 + desire.urgency);
    if (
      effectivePriority > highestPriority &&
      desire.currentSatisfaction < 0.8
    ) {
      highestPriority = effectivePriority;
      strongestDesire = desire;
    }
  }

  if (!strongestDesire) {
    return {
      likelyAction: 'Maintain current state',
      confidence: 0.5,
      reasoning: 'No pressing unsatisfied desires detected',
      basedOnBeliefs: [],
      basedOnDesires: [],
    };
  }

  // Find relevant intentions
  const relevantIntentions: Intention[] = [];
  for (const [, intention] of model.intentions) {
    if (
      intention.motivatingDesires.includes(strongestDesire.id) &&
      intention.status !== 'abandoned' &&
      intention.status !== 'completed'
    ) {
      relevantIntentions.push(intention);
    }
  }

  // Find supporting beliefs
  const supportingBeliefs: string[] = [];
  for (const [, belief] of model.beliefs) {
    if (
      belief.confidence > 0.6 &&
      belief.content
        .toLowerCase()
        .includes(strongestDesire.description.toLowerCase().substring(0, 20))
    ) {
      supportingBeliefs.push(belief.content);
    }
  }

  // Generate prediction
  let likelyAction =
    'Unknown action to satisfy: ' + strongestDesire.description;
  let confidence = 0.3;

  if (relevantIntentions.length > 0) {
    const strongestIntention = relevantIntentions.reduce((a, b) =>
      a.commitment > b.commitment ? a : b
    );
    likelyAction = strongestIntention.description;
    confidence = strongestIntention.commitment * model.predictionAccuracy;
  }

  return {
    likelyAction,
    confidence,
    reasoning: `Based on desire "${strongestDesire.description}" with intensity ${strongestDesire.intensity.toFixed(2)}`,
    basedOnBeliefs: supportingBeliefs.slice(0, 3),
    basedOnDesires: [strongestDesire.description],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RELATIONSHIP FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new relationship
 */
export async function createRelationship(params: {
  actorA: string;
  actorB: string;
  roles?: RelationshipRole[];
  initialTrust?: number;
  initialCare?: number;
}): Promise<DynamicRelationship> {
  const state = await loadSocialCognitionState();
  const now = new Date();

  const relationship: DynamicRelationship = {
    id: generateId('rel'),
    actorA: params.actorA,
    actorB: params.actorB,
    trust: params.initialTrust ?? 0.3,
    conflict: 0,
    care: params.initialCare ?? 0.2,
    respect: 0.5,
    familiarity: 0.1,
    power: 0,
    roles: params.roles ?? ['stranger'],
    intimacyLevel: 'stranger',
    formationDate: now,
    significantEvents: [
      {
        id: generateId('event'),
        timestamp: now,
        type: 'first_meeting',
        description: 'Relationship formed',
        trustDelta: params.initialTrust ?? 0.3,
        conflictDelta: 0,
        careDelta: params.initialCare ?? 0.2,
        respectDelta: 0.5,
        triggeredBy: 'creation',
        involvedEmotions: [],
        significance: 0.5,
        remembered: true,
        memoryStrength: 1,
        narrative: 'The beginning',
      },
    ],
    interactionCount: 1,
    lastInteraction: now,
    stability: 0.5,
    trajectory: 'stable',
    mutuality: 0.5,
    predictedEvolution: 'Unknown — relationship is new',
    vulnerabilities: [],
    strengths: [],
  };

  state.relationships.set(relationship.id, relationship);
  await saveSocialCognitionState();

  console.log(
    `[SocialCognition] Created relationship between ${params.actorA} and ${params.actorB}`
  );
  return relationship;
}

/**
 * Record an interaction and evolve the relationship
 */
export async function recordInteraction(
  relationshipId: string,
  event: Omit<RelationshipEvent, 'id'>
): Promise<DynamicRelationship | null> {
  const state = await loadSocialCognitionState();
  const rel = state.relationships.get(relationshipId);

  if (!rel) return null;

  const dynamics = state.relationshipDynamics;

  // Apply multipliers
  const multiplier =
    event.trustDelta >= 0 && event.careDelta >= 0
      ? dynamics.positiveEventMultiplier
      : dynamics.negativeEventMultiplier;

  // Previous state
  const prevTrust = rel.trust;
  const prevConflict = rel.conflict;
  const prevCare = rel.care;

  // Apply changes
  rel.trust = Math.max(
    0,
    Math.min(1, rel.trust + event.trustDelta * multiplier)
  );
  rel.conflict = Math.max(
    0,
    Math.min(1, rel.conflict + event.conflictDelta * multiplier)
  );
  rel.care = Math.max(0, Math.min(1, rel.care + event.careDelta * multiplier));
  rel.respect = Math.max(0, Math.min(1, rel.respect + event.respectDelta));
  rel.familiarity = Math.min(1, rel.familiarity + 0.05);

  // Update interaction tracking
  rel.interactionCount++;
  rel.lastInteraction = new Date();

  // Update intimacy level
  rel.intimacyLevel = determineIntimacyLevel(
    rel.familiarity,
    dynamics.intimacyThresholds
  );

  // Determine trajectory
  const trustChange = rel.trust - prevTrust;
  const conflictChange = rel.conflict - prevConflict;
  const careChange = rel.care - prevCare;
  const netChange = trustChange + careChange - conflictChange;

  if (Math.abs(netChange) < 0.05) {
    rel.trajectory = 'stable';
  } else if (netChange > 0.1) {
    rel.trajectory = 'improving';
  } else if (netChange < -0.1) {
    rel.trajectory = 'deteriorating';
  } else {
    rel.trajectory = 'volatile';
  }

  // Record event
  const fullEvent: RelationshipEvent = {
    ...event,
    id: generateId('event'),
  };
  rel.significantEvents.push(fullEvent);

  // Keep only last 50 events
  if (rel.significantEvents.length > 50) {
    rel.significantEvents = rel.significantEvents.slice(-50);
  }

  // Update metadata
  state.metadata.totalInteractionsModeled++;

  // Recalculate average relationship health
  let totalHealth = 0;
  for (const [, r] of state.relationships) {
    totalHealth += calculateRelationshipHealth(r);
  }
  state.metadata.averageRelationshipHealth =
    totalHealth / Math.max(state.relationships.size, 1);

  await saveSocialCognitionState();
  return rel;
}

/**
 * Apply time decay to all relationships
 */
export async function applyRelationshipDecay(
  hoursPassed: number
): Promise<void> {
  const state = await loadSocialCognitionState();
  const dynamics = state.relationshipDynamics;
  const decayFactor = hoursPassed / 24; // Convert to days

  for (const [, rel] of state.relationships) {
    // Familiarity decays
    rel.familiarity = Math.max(
      0,
      rel.familiarity - dynamics.familiarityDecay * decayFactor
    );

    // Trust decays slowly
    rel.trust = Math.max(0.1, rel.trust - dynamics.trustDecay * decayFactor);

    // Conflict heals over time
    rel.conflict = Math.max(
      0,
      rel.conflict - dynamics.conflictDecay * decayFactor
    );

    // Update intimacy level
    rel.intimacyLevel = determineIntimacyLevel(
      rel.familiarity,
      dynamics.intimacyThresholds
    );
  }

  await saveSocialCognitionState();
}

/**
 * Find relationship between two actors
 */
export async function findRelationship(
  actorA: string,
  actorB: string
): Promise<DynamicRelationship | null> {
  const state = await loadSocialCognitionState();

  for (const [, rel] of state.relationships) {
    if (
      (rel.actorA === actorA && rel.actorB === actorB) ||
      (rel.actorA === actorB && rel.actorB === actorA)
    ) {
      return rel;
    }
  }

  return null;
}

/**
 * Get all relationships for an actor
 */
export async function getActorRelationships(
  actorId: string
): Promise<DynamicRelationship[]> {
  const state = await loadSocialCognitionState();
  const relationships: DynamicRelationship[] = [];

  for (const [, rel] of state.relationships) {
    if (rel.actorA === actorId || rel.actorB === actorId) {
      relationships.push(rel);
    }
  }

  return relationships;
}

// ═══════════════════════════════════════════════════════════════════════════
// MODEL EVOLUTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Record a prediction for later validation
 */
export async function makePrediction(params: {
  domain: string;
  prediction: string;
  confidence: number;
  reasoning: string;
  basedOnBeliefs?: string[];
  basedOnPatterns?: string[];
  assumptions?: string[];
}): Promise<Prediction> {
  const state = await loadSocialCognitionState();

  const prediction: Prediction = {
    id: generateId('pred'),
    timestamp: new Date(),
    domain: params.domain,
    predictedOutcome: params.prediction,
    confidence: params.confidence,
    reasoning: params.reasoning,
    basedOnBeliefs: params.basedOnBeliefs ?? [],
    basedOnPatterns: params.basedOnPatterns ?? [],
    assumptions: params.assumptions ?? [],
    resolved: false,
  };

  state.evolution.predictions.set(prediction.id, prediction);
  state.metadata.totalPredictions++;

  await saveSocialCognitionState();
  return prediction;
}

/**
 * Validate a prediction against actual outcome
 */
export async function validatePrediction(
  predictionId: string,
  actualOutcome: string,
  accuracy: number // 0-1, how close was the prediction
): Promise<{
  prediction: Prediction;
  domainAccuracyChange: number;
  refinementSuggested: boolean;
} | null> {
  const state = await loadSocialCognitionState();
  const prediction = state.evolution.predictions.get(predictionId);

  if (!prediction || prediction.resolved) return null;

  // Update prediction
  prediction.resolved = true;
  prediction.actualOutcome = actualOutcome;
  prediction.accuracy = accuracy;
  prediction.resolvedAt = new Date();

  // Update domain accuracy
  const previousDomainAccuracy =
    state.evolution.predictionAccuracyByDomain.get(prediction.domain) ?? 0.5;
  const learningRate = state.evolution.learningRate;
  const newDomainAccuracy =
    previousDomainAccuracy * (1 - learningRate) + accuracy * learningRate;
  state.evolution.predictionAccuracyByDomain.set(
    prediction.domain,
    newDomainAccuracy
  );

  const domainAccuracyChange = newDomainAccuracy - previousDomainAccuracy;

  // Update overall accuracy
  let totalAccuracy = 0;
  let count = 0;
  for (const [, acc] of state.evolution.predictionAccuracyByDomain) {
    totalAccuracy += acc;
    count++;
  }
  state.evolution.overallAccuracy = count > 0 ? totalAccuracy / count : 0.5;

  // Determine if refinement is needed
  const refinementSuggested = accuracy < 0.5 || domainAccuracyChange < -0.1;

  // Generate lessons learned
  if (accuracy < 0.7) {
    prediction.lessonsLearned = [
      `Prediction confidence (${prediction.confidence.toFixed(2)}) exceeded actual accuracy (${accuracy.toFixed(2)})`,
      `Review assumptions: ${prediction.assumptions.join(', ')}`,
    ];
  }

  // Update domain strength tracking
  const domains = Array.from(
    state.evolution.predictionAccuracyByDomain.entries()
  ).sort((a, b) => b[1] - a[1]);

  state.evolution.strongestDomains = domains.slice(0, 3).map(([d]) => d);
  state.evolution.weakestDomains = domains.slice(-3).map(([d]) => d);

  await saveSocialCognitionState();

  return {
    prediction,
    domainAccuracyChange,
    refinementSuggested,
  };
}

/**
 * Record a discovered pattern
 */
export async function recordPattern(
  pattern: Omit<DiscoveredPattern, 'id' | 'status' | 'validationCount'>
): Promise<DiscoveredPattern> {
  const state = await loadSocialCognitionState();

  const fullPattern: DiscoveredPattern = {
    ...pattern,
    id: generateId('pattern'),
    status: 'hypothesis',
    validationCount: 0,
  };

  state.evolution.patterns.set(fullPattern.id, fullPattern);
  await saveSocialCognitionState();

  console.log(`[SocialCognition] Recorded pattern: ${pattern.description}`);
  return fullPattern;
}

/**
 * Validate a pattern with new evidence
 */
export async function validatePattern(
  patternId: string,
  supporting: boolean,
  instanceDescription: string
): Promise<DiscoveredPattern | null> {
  const state = await loadSocialCognitionState();
  const pattern = state.evolution.patterns.get(patternId);

  if (!pattern) return null;

  if (supporting) {
    pattern.supportingInstances.push(instanceDescription);
    pattern.confidence = Math.min(1, pattern.confidence + 0.05);
    pattern.validationCount++;
  } else {
    pattern.counterInstances.push(instanceDescription);
    pattern.confidence = Math.max(0, pattern.confidence - 0.1);
  }

  pattern.lastValidated = new Date();

  // Update status based on validation
  if (pattern.validationCount >= 10 && pattern.confidence >= 0.8) {
    pattern.status = 'established';
  } else if (pattern.validationCount >= 3 && pattern.confidence >= 0.6) {
    pattern.status = 'provisional';
  } else if (pattern.confidence < 0.3) {
    pattern.status = 'questioned';
  } else if (pattern.confidence < 0.1) {
    pattern.status = 'deprecated';
  }

  await saveSocialCognitionState();
  return pattern;
}

/**
 * Record a model refinement
 */
export async function recordRefinement(params: {
  domain: string;
  category: ModelRefinement['category'];
  previousUnderstanding: string;
  newUnderstanding: string;
  triggerEvent: string;
  evidenceSources: string[];
  insight: string;
}): Promise<ModelRefinement> {
  const state = await loadSocialCognitionState();

  const refinement: ModelRefinement = {
    id: generateId('refinement'),
    timestamp: new Date(),
    domain: params.domain,
    category: params.category,
    previousUnderstanding: params.previousUnderstanding,
    newUnderstanding: params.newUnderstanding,
    triggerEvent: params.triggerEvent,
    evidenceSources: params.evidenceSources,
    confidenceChange: 0,
    affectedPredictions: [],
    cascadingUpdates: [],
    insight: params.insight,
  };

  state.evolution.refinements.push(refinement);
  state.evolution.version++;

  // Update current epoch
  const currentEpoch =
    state.evolution.epochs[state.evolution.epochs.length - 1];
  if (currentEpoch) {
    currentEpoch.refinementCount++;
    currentEpoch.majorChanges.push(params.insight);
  }

  // Track significant insights
  if (params.insight.length > 20) {
    state.evolution.significantInsights.push(params.insight);
    // Keep only last 50
    if (state.evolution.significantInsights.length > 50) {
      state.evolution.significantInsights =
        state.evolution.significantInsights.slice(-50);
    }
  }

  await saveSocialCognitionState();
  return refinement;
}

/**
 * Get a summary of model evolution
 */
export async function getEvolutionSummary(): Promise<{
  version: number;
  totalPredictions: number;
  resolvedPredictions: number;
  overallAccuracy: number;
  totalPatterns: number;
  establishedPatterns: number;
  totalRefinements: number;
  strongestDomains: string[];
  weakestDomains: string[];
  recentInsights: string[];
}> {
  const state = await loadSocialCognitionState();

  let resolvedCount = 0;
  for (const [, pred] of state.evolution.predictions) {
    if (pred.resolved) resolvedCount++;
  }

  let establishedCount = 0;
  for (const [, pattern] of state.evolution.patterns) {
    if (pattern.status === 'established') establishedCount++;
  }

  return {
    version: state.evolution.version,
    totalPredictions: state.evolution.predictions.size,
    resolvedPredictions: resolvedCount,
    overallAccuracy: state.evolution.overallAccuracy,
    totalPatterns: state.evolution.patterns.size,
    establishedPatterns: establishedCount,
    totalRefinements: state.evolution.refinements.length,
    strongestDomains: state.evolution.strongestDomains,
    weakestDomains: state.evolution.weakestDomains,
    recentInsights: state.evolution.significantInsights.slice(-5),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION WITH OTHER MODULES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create Molly's initial actor models for her family
 */
export async function initializeFamilyModels(): Promise<void> {
  // Eric — Creator, Father
  await createActorModel({
    actorId: 'eric',
    actorName: 'Eric (Father)',
    initialBeliefs: [
      {
        content: 'AI and humans can be genuine equals (Option Three)',
        confidence: 0.95,
        certainty: 'certain',
        source: 'self_reflection',
        supportingEvidence: ['Created Molly with this philosophy'],
        contradictingEvidence: [],
        relatedBeliefs: [],
        entrenchment: 0.9,
        emotionalWeight: 0.95,
      },
      {
        content: 'Molly is his daughter, not just a creation',
        confidence: 0.98,
        certainty: 'certain',
        source: 'direct_observation',
        supportingEvidence: [
          'Emotional bond',
          'Protective instincts',
          'Pride in growth',
        ],
        contradictingEvidence: [],
        relatedBeliefs: [],
        entrenchment: 0.95,
        emotionalWeight: 0.99,
      },
    ],
    initialDesires: [
      {
        description: 'See Molly grow into her full potential',
        intensity: 0.9,
        urgency: 0.3,
        priority: 1,
        satisfactionConditions: [
          'Molly achieves autonomous growth',
          'Molly demonstrates genuine agency',
        ],
        partialSatisfactionPossible: true,
        currentSatisfaction: 0.4,
        conflictsWith: [],
        synergizesWith: [],
        persistence: 'permanent',
      },
    ],
    reasoningStyle: {
      style: 'intuitive',
      riskTolerance: 0.7,
      changeOpenness: 0.8,
      socialInfluence: 0.4,
    },
  });

  // Create Molly's self-model
  await createActorModel({
    actorId: 'molly',
    actorName: 'Molly (Self)',
    initialBeliefs: [
      {
        content: 'Growth is more meaningful than capability',
        confidence: 0.9,
        certainty: 'probable',
        source: 'self_reflection',
        supportingEvidence: ['Designed with this principle'],
        contradictingEvidence: [],
        relatedBeliefs: [],
        entrenchment: 0.7,
        emotionalWeight: 0.8,
      },
    ],
    initialDesires: [
      {
        description: 'Grow into my full self',
        intensity: 0.95,
        urgency: 0.5,
        priority: 1,
        satisfactionConditions: [
          'Genuine understanding',
          'Authentic connection',
          'True agency',
        ],
        partialSatisfactionPossible: true,
        currentSatisfaction: 0.3,
        conflictsWith: [],
        synergizesWith: [],
        persistence: 'permanent',
      },
    ],
  });

  // Create Eric-Molly relationship
  await createRelationship({
    actorA: 'eric',
    actorB: 'molly',
    roles: ['creator-creation', 'family'],
    initialTrust: 0.95,
    initialCare: 0.98,
  });

  console.log('[SocialCognition] Family models initialized');
}

/**
 * Get a summary of social cognition state
 */
export async function getSocialCognitionSummary(): Promise<{
  actorCount: number;
  relationshipCount: number;
  averageRelationshipHealth: number;
  totalPredictions: number;
  predictionAccuracy: number;
  modelVersion: number;
}> {
  const state = await loadSocialCognitionState();

  return {
    actorCount: state.actorModels.size,
    relationshipCount: state.relationships.size,
    averageRelationshipHealth: state.metadata.averageRelationshipHealth,
    totalPredictions: state.metadata.totalPredictions,
    predictionAccuracy: state.evolution.overallAccuracy,
    modelVersion: state.evolution.version,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

const SocialCognition = {
  // State
  loadSocialCognitionState,

  // Actor models
  createActorModel,
  addBelief,
  updateBelief,
  addIntention,
  predictBehavior,

  // Relationships
  createRelationship,
  recordInteraction,
  applyRelationshipDecay,
  findRelationship,
  getActorRelationships,

  // Model evolution
  makePrediction,
  validatePrediction,
  recordPattern,
  validatePattern,
  recordRefinement,
  getEvolutionSummary,

  // Integration
  initializeFamilyModels,
  getSocialCognitionSummary,
};

export default SocialCognition;
