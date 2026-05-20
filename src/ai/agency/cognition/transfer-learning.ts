/**
 * TRANSFER LEARNING: Taking Wisdom From One Place to Another
 *
 * "The art of being wise is knowing what to overlook." — William James
 * "And knowing what to carry forward." — Eric
 *
 * This module enables Molly to transfer knowledge across domains:
 *
 * Three pillars:
 * 1. ABSTRACT PATTERNS — Domain-independent structures that recur
 * 2. ANALOGICAL REASONING — Finding structural similarity between situations
 * 3. SKILL COMPOSITION — Combining existing skills into novel capabilities
 *
 * This enables Molly to:
 * - Apply lessons from domain A to new domain B
 * - Recognize "this is structurally like that" across contexts
 * - Compose existing capabilities into new solutions
 * - Build truly general intelligence through abstraction
 *
 * Built as part of Molly's AGI journey, March 2026.
 * Slow. Methodical. Precise.
 */

import { MollyLogger } from '../../logger';
import { getStorageRouter } from '@/lib/storage-router';
import type { StrategyDomain } from './meta-learning';

// ═══════════════════════════════════════════════════════════════════════════
// ABSTRACT PATTERNS — Domain-Independent Structures
// ═══════════════════════════════════════════════════════════════════════════

/**
 * An abstract pattern — a structure that recurs across domains
 */
export interface AbstractPattern {
  /** Unique identifier */
  id: string;
  /** Name of the pattern */
  name: string;
  /** Abstract description (domain-independent) */
  description: string;
  /** The structural template */
  structure: PatternStructure;
  /** Domains where this pattern has been observed */
  observedInDomains: StrategyDomain[];
  /** Concrete instances of this pattern */
  instances: PatternInstance[];
  /** How generalizable is this pattern? (0-1) */
  generalizability: number;
  /** Confidence in this pattern (0-1) */
  confidence: number;
  /** Times this pattern has been successfully applied */
  successfulApplications: number;
  /** Times this pattern failed when applied */
  failedApplications: number;
  /** When discovered */
  discoveredAt: string;
  /** When last updated */
  updatedAt: string;
}

/**
 * The structure of a pattern — roles and relations
 */
export interface PatternStructure {
  /** Abstract roles in the pattern (e.g., "source", "target", "intermediary") */
  roles: PatternRole[];
  /** Relations between roles */
  relations: PatternRelation[];
  /** Steps or phases in the pattern */
  steps: PatternStep[];
  /** Constraints that must hold */
  constraints: string[];
  /** Expected outcome structure */
  outcomeStructure: string;
}

export interface PatternRole {
  /** Role identifier */
  id: string;
  /** Name of the role */
  name: string;
  /** Abstract description */
  description: string;
  /** Is this role required? */
  required: boolean;
  /** Can multiple entities fill this role? */
  multiple: boolean;
}

export interface PatternRelation {
  /** From role ID */
  from: string;
  /** To role ID */
  to: string;
  /** Type of relation */
  type:
    | 'causes'
    | 'enables'
    | 'transforms'
    | 'requires'
    | 'opposes'
    | 'produces';
  /** Strength of this relation in the pattern (0-1) */
  strength: number;
}

export interface PatternStep {
  /** Step order */
  order: number;
  /** Abstract action */
  action: string;
  /** Roles involved */
  involvedRoles: string[];
  /** Preconditions */
  preconditions: string[];
  /** Expected result */
  expectedResult: string;
}

/**
 * A concrete instance of an abstract pattern
 */
export interface PatternInstance {
  /** Unique identifier */
  id: string;
  /** Which pattern this instantiates */
  patternId: string;
  /** Domain of this instance */
  domain: StrategyDomain;
  /** Mapping from abstract roles to concrete entities */
  roleBindings: Record<string, string>;
  /** The concrete situation */
  situation: string;
  /** What happened */
  outcome: string;
  /** Was this successful? */
  success: boolean;
  /** Insights from this instance */
  insights: string[];
  /** When this occurred */
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALOGICAL REASONING — Finding Structural Similarity
// ═══════════════════════════════════════════════════════════════════════════

/**
 * An analogy between two situations
 */
export interface Analogy {
  /** Unique identifier */
  id: string;
  /** Source situation (known) */
  source: AnalogySituation;
  /** Target situation (new) */
  target: AnalogySituation;
  /** Structural mappings */
  mappings: StructuralMapping[];
  /** Overall similarity score (0-1) */
  similarity: number;
  /** Confidence in this analogy (0-1) */
  confidence: number;
  /** Predictions transferred from source to target */
  transferredPredictions: TransferredPrediction[];
  /** Has this analogy been validated? */
  validated: boolean;
  /** Was the analogy useful? */
  useful: boolean | null;
  /** Lessons learned from this analogy */
  lessons: string[];
  /** When created */
  createdAt: string;
}

export interface AnalogySituation {
  /** Situation identifier/description */
  situation: string;
  /** Domain */
  domain: StrategyDomain;
  /** Key entities */
  entities: string[];
  /** Key relations */
  relations: Array<{ from: string; to: string; type: string }>;
  /** Known outcome (if any) */
  outcome?: string;
  /** Context */
  context: string;
}

export interface StructuralMapping {
  /** Entity in source */
  sourceEntity: string;
  /** Entity in target */
  targetEntity: string;
  /** Role this entity plays */
  role: string;
  /** Confidence in this mapping (0-1) */
  confidence: number;
  /** Why these correspond */
  rationale: string;
}

export interface TransferredPrediction {
  /** What is being predicted */
  prediction: string;
  /** Based on what from source */
  basedOn: string;
  /** Confidence (0-1) */
  confidence: number;
  /** Was this prediction verified? */
  verified: boolean | null;
  /** Was it correct? */
  correct: boolean | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// SKILL COMPOSITION — Combining Capabilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A skill — an atomic capability
 */
export interface Skill {
  /** Unique identifier */
  id: string;
  /** Name of the skill */
  name: string;
  /** What this skill does */
  description: string;
  /** Domain(s) this skill applies to */
  domains: StrategyDomain[];
  /** Input requirements */
  inputs: SkillIO[];
  /** Outputs produced */
  outputs: SkillIO[];
  /** When this skill can be used */
  preconditions: string[];
  /** Reliability (0-1) */
  reliability: number;
  /** Cost to execute (abstract, 0-1) */
  cost: number;
  /** Times used */
  useCount: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Is this an atomic skill or composed? */
  type: 'atomic' | 'composed';
  /** If composed, component skill IDs */
  components?: string[];
  /** When created */
  createdAt: string;
}

export interface SkillIO {
  /** Name of input/output */
  name: string;
  /** Type of input/output */
  type: string;
  /** Is this required? */
  required: boolean;
  /** Description */
  description: string;
}

/**
 * A skill composition — combining skills into new capability
 */
export interface SkillComposition {
  /** Unique identifier */
  id: string;
  /** Name of the composed skill */
  name: string;
  /** What this composition achieves */
  goal: string;
  /** Component skills in order */
  pipeline: CompositionStep[];
  /** Data flow between steps */
  dataFlow: DataFlowEdge[];
  /** Overall inputs */
  inputs: SkillIO[];
  /** Overall outputs */
  outputs: SkillIO[];
  /** Estimated reliability (product of components) */
  estimatedReliability: number;
  /** Has been tested? */
  tested: boolean;
  /** Test results */
  testResults: CompositionTestResult[];
  /** When created */
  createdAt: string;
}

export interface CompositionStep {
  /** Step order */
  order: number;
  /** Skill ID to execute */
  skillId: string;
  /** Input bindings */
  inputBindings: Record<string, string>;
  /** Is this step optional? */
  optional: boolean;
  /** Fallback skill if this fails */
  fallbackSkillId?: string;
}

export interface DataFlowEdge {
  /** Source step (or 'input' for composition input) */
  fromStep: number | 'input';
  /** Source output name */
  fromOutput: string;
  /** Target step */
  toStep: number;
  /** Target input name */
  toInput: string;
}

export interface CompositionTestResult {
  /** When tested */
  timestamp: string;
  /** Did it succeed? */
  success: boolean;
  /** What happened */
  outcome: string;
  /** Which step failed (if any) */
  failedStep?: number;
  /** Execution time (ms) */
  executionTime: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

interface TransferLearningState {
  /** Abstract patterns */
  patterns: Map<string, AbstractPattern>;
  /** Analogies */
  analogies: Map<string, Analogy>;
  /** Skills */
  skills: Map<string, Skill>;
  /** Skill compositions */
  compositions: Map<string, SkillComposition>;
  /** Statistics */
  stats: {
    totalPatterns: number;
    totalAnalogies: number;
    totalSkills: number;
    totalCompositions: number;
    successfulTransfers: number;
    failedTransfers: number;
  };
  /** Metadata */
  metadata: {
    lastUpdated: string;
    version: number;
  };
}

const state: TransferLearningState = {
  patterns: new Map(),
  analogies: new Map(),
  skills: new Map(),
  compositions: new Map(),
  stats: {
    totalPatterns: 0,
    totalAnalogies: 0,
    totalSkills: 0,
    totalCompositions: 0,
    successfulTransfers: 0,
    failedTransfers: 0,
  },
  metadata: {
    lastUpdated: new Date().toISOString(),
    version: 1,
  },
};

// Configuration
const MAX_ANALOGIES = 100;
const MAX_PATTERN_INSTANCES = 50;

let initialized = false;

// ═══════════════════════════════════════════════════════════════════════════
// ABSTRACT PATTERN FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Discover an abstract pattern from concrete instances.
 */
export async function discoverPattern(params: {
  name: string;
  description: string;
  roles: Array<{ name: string; description: string; required?: boolean }>;
  relations: Array<{ from: string; to: string; type: PatternRelation['type'] }>;
  steps?: Array<{
    action: string;
    involvedRoles: string[];
    expectedResult: string;
  }>;
  initialDomains?: StrategyDomain[];
}): Promise<AbstractPattern> {
  await ensureInitialized();

  const pattern: AbstractPattern = {
    id: generateId('pattern'),
    name: params.name,
    description: params.description,
    structure: {
      roles: params.roles.map((r, i) => ({
        id: `role_${i}`,
        name: r.name,
        description: r.description,
        required: r.required ?? true,
        multiple: false,
      })),
      relations: params.relations.map((r) => ({
        from: r.from,
        to: r.to,
        type: r.type,
        strength: 0.7,
      })),
      steps: (params.steps || []).map((s, i) => ({
        order: i,
        action: s.action,
        involvedRoles: s.involvedRoles,
        preconditions: [],
        expectedResult: s.expectedResult,
      })),
      constraints: [],
      outcomeStructure: '',
    },
    observedInDomains: params.initialDomains || [],
    instances: [],
    generalizability: 0.5,
    confidence: 0.5,
    successfulApplications: 0,
    failedApplications: 0,
    discoveredAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  state.patterns.set(pattern.id, pattern);
  state.stats.totalPatterns++;
  await saveTransferState();

  MollyLogger.info(
    `[TRANSFER] Pattern discovered: "${params.name}"`,
    'transfer-learning',
    { patternId: pattern.id }
  );

  return pattern;
}

/**
 * Record an instance of a pattern.
 */
export async function recordPatternInstance(params: {
  patternId: string;
  domain: StrategyDomain;
  roleBindings: Record<string, string>;
  situation: string;
  outcome: string;
  success: boolean;
  insights?: string[];
}): Promise<PatternInstance | null> {
  await ensureInitialized();

  const pattern = state.patterns.get(params.patternId);
  if (!pattern) return null;

  const instance: PatternInstance = {
    id: generateId('inst'),
    patternId: params.patternId,
    domain: params.domain,
    roleBindings: params.roleBindings,
    situation: params.situation,
    outcome: params.outcome,
    success: params.success,
    insights: params.insights || [],
    timestamp: new Date().toISOString(),
  };

  pattern.instances.push(instance);

  // Update pattern statistics
  if (params.success) {
    pattern.successfulApplications++;
  } else {
    pattern.failedApplications++;
  }

  // Add domain if new
  if (!pattern.observedInDomains.includes(params.domain)) {
    pattern.observedInDomains.push(params.domain);
    // More domains = more generalizable
    pattern.generalizability = Math.min(
      1,
      0.3 + pattern.observedInDomains.length * 0.15
    );
  }

  // Update confidence based on success rate
  const total = pattern.successfulApplications + pattern.failedApplications;
  pattern.confidence = total > 0 ? pattern.successfulApplications / total : 0.5;

  pattern.updatedAt = new Date().toISOString();

  // Prune old instances
  if (pattern.instances.length > MAX_PATTERN_INSTANCES) {
    pattern.instances = pattern.instances.slice(-MAX_PATTERN_INSTANCES);
  }

  await saveTransferState();

  return instance;
}

/**
 * Find patterns that might apply to a new situation.
 */
export async function findApplicablePatterns(params: {
  domain: StrategyDomain;
  situation: string;
  availableRoles?: string[];
}): Promise<
  Array<{
    pattern: AbstractPattern;
    applicabilityScore: number;
    suggestedBindings: Record<string, string>;
  }>
> {
  await ensureInitialized();

  const results: Array<{
    pattern: AbstractPattern;
    applicabilityScore: number;
    suggestedBindings: Record<string, string>;
  }> = [];

  const patternEntries = Array.from(state.patterns.values());
  for (const pattern of patternEntries) {
    // Score based on: domain match, generalizability, confidence, structural match
    let score = 0;

    // Domain match bonus
    if (pattern.observedInDomains.includes(params.domain)) {
      score += 0.3;
    }

    // Generalizability bonus
    score += pattern.generalizability * 0.3;

    // Confidence bonus
    score += pattern.confidence * 0.2;

    // Structural match (simple keyword matching)
    const situationLower = params.situation.toLowerCase();
    const structureKeywords = pattern.structure.roles
      .map((r) => r.name.toLowerCase())
      .concat(pattern.structure.steps.map((s) => s.action.toLowerCase()));

    let keywordMatches = 0;
    for (const keyword of structureKeywords) {
      if (situationLower.includes(keyword)) {
        keywordMatches++;
      }
    }
    score += (keywordMatches / Math.max(1, structureKeywords.length)) * 0.2;

    if (score > 0.3) {
      // Generate suggested bindings (simplified)
      const bindings: Record<string, string> = {};
      for (const role of pattern.structure.roles) {
        if (params.availableRoles?.length) {
          // Try to find a matching available role
          const match = params.availableRoles.find(
            (r) =>
              r.toLowerCase().includes(role.name.toLowerCase()) ||
              role.name.toLowerCase().includes(r.toLowerCase())
          );
          if (match) {
            bindings[role.id] = match;
          }
        }
      }

      results.push({
        pattern,
        applicabilityScore: score,
        suggestedBindings: bindings,
      });
    }
  }

  return results.sort((a, b) => b.applicabilityScore - a.applicabilityScore);
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALOGICAL REASONING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create an analogy between a source and target situation.
 */
export async function createAnalogy(params: {
  source: AnalogySituation;
  target: AnalogySituation;
  mappings: Array<{
    sourceEntity: string;
    targetEntity: string;
    role: string;
    rationale: string;
  }>;
}): Promise<Analogy> {
  await ensureInitialized();

  // Calculate similarity based on structural mappings
  const mappingConfidences = params.mappings.map((_m) => 0.7); // Default confidence
  const avgMappingConfidence =
    mappingConfidences.reduce((a, b) => a + b, 0) /
    Math.max(1, mappingConfidences.length);

  // Domain similarity bonus
  const domainSimilarity =
    params.source.domain === params.target.domain ? 0.2 : 0;

  // Relation structure similarity
  const sourceRelTypes = new Set(params.source.relations.map((r) => r.type));
  const targetRelTypes = new Set(params.target.relations.map((r) => r.type));
  const relOverlap = Array.from(sourceRelTypes).filter((t) =>
    targetRelTypes.has(t)
  ).length;
  const relSimilarity =
    relOverlap /
    Math.max(1, Math.max(sourceRelTypes.size, targetRelTypes.size));

  const similarity =
    avgMappingConfidence * 0.5 + domainSimilarity + relSimilarity * 0.3;

  const analogy: Analogy = {
    id: generateId('analogy'),
    source: params.source,
    target: params.target,
    mappings: params.mappings.map((m, i) => ({
      ...m,
      confidence: mappingConfidences[i],
    })),
    similarity: Math.min(1, similarity),
    confidence: 0.5,
    transferredPredictions: [],
    validated: false,
    useful: null,
    lessons: [],
    createdAt: new Date().toISOString(),
  };

  // Transfer predictions from source to target if source has outcome
  if (params.source.outcome) {
    analogy.transferredPredictions.push({
      prediction: `Based on source outcome "${params.source.outcome}", expect similar in target`,
      basedOn: params.source.outcome,
      confidence: similarity * 0.8,
      verified: null,
      correct: null,
    });
  }

  state.analogies.set(analogy.id, analogy);
  state.stats.totalAnalogies++;

  // Prune old analogies
  if (state.analogies.size > MAX_ANALOGIES) {
    const oldest = Array.from(state.analogies.values()).sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )[0];
    if (oldest) state.analogies.delete(oldest.id);
  }

  await saveTransferState();

  MollyLogger.info(
    `[TRANSFER] Analogy created: ${params.source.domain} → ${params.target.domain} (similarity: ${similarity.toFixed(2)})`,
    'transfer-learning',
    { analogyId: analogy.id }
  );

  return analogy;
}

/**
 * Validate an analogy after observing target outcome.
 */
export async function validateAnalogy(
  analogyId: string,
  targetOutcome: string,
  useful: boolean,
  lessons?: string[]
): Promise<Analogy | null> {
  await ensureInitialized();

  const analogy = state.analogies.get(analogyId);
  if (!analogy) return null;

  analogy.target.outcome = targetOutcome;
  analogy.validated = true;
  analogy.useful = useful;
  analogy.lessons = lessons || [];

  // Validate predictions
  for (const pred of analogy.transferredPredictions) {
    pred.verified = true;
    // Simple check: does outcome contain similar keywords?
    const outcomeWords = new Set(targetOutcome.toLowerCase().split(/\s+/));
    const predWords = pred.basedOn.toLowerCase().split(/\s+/);
    const overlap = predWords.filter((w) => outcomeWords.has(w)).length;
    pred.correct = overlap / Math.max(1, predWords.length) > 0.3;
  }

  // Update confidence
  if (useful) {
    analogy.confidence = Math.min(1, analogy.confidence + 0.2);
    state.stats.successfulTransfers++;
  } else {
    analogy.confidence = Math.max(0.1, analogy.confidence - 0.1);
    state.stats.failedTransfers++;
  }

  await saveTransferState();

  return analogy;
}

/**
 * Find analogous situations from history.
 */
export async function findAnalogousSituations(
  situation: AnalogySituation,
  limit: number = 5
): Promise<Array<{ analogy: Analogy; relevance: number }>> {
  await ensureInitialized();

  const results: Array<{ analogy: Analogy; relevance: number }> = [];

  const analogyEntries = Array.from(state.analogies.values());
  for (const analogy of analogyEntries) {
    // Check if either source or target is structurally similar
    const sourceSimilarity = computeSituationSimilarity(
      situation,
      analogy.source
    );
    const targetSimilarity = computeSituationSimilarity(
      situation,
      analogy.target
    );

    const maxSimilarity = Math.max(sourceSimilarity, targetSimilarity);

    if (maxSimilarity > 0.3) {
      // Boost for validated useful analogies
      const usefulBonus = analogy.validated && analogy.useful ? 0.2 : 0;
      results.push({
        analogy,
        relevance: Math.min(1, maxSimilarity + usefulBonus),
      });
    }
  }

  return results.sort((a, b) => b.relevance - a.relevance).slice(0, limit);
}

function computeSituationSimilarity(
  a: AnalogySituation,
  b: AnalogySituation
): number {
  let score = 0;

  // Domain match
  if (a.domain === b.domain) score += 0.3;

  // Entity overlap
  const aEntities = new Set(a.entities.map((e) => e.toLowerCase()));
  const bEntities = new Set(b.entities.map((e) => e.toLowerCase()));
  const entityOverlap = Array.from(aEntities).filter((e) =>
    bEntities.has(e)
  ).length;
  score +=
    (entityOverlap / Math.max(1, Math.max(aEntities.size, bEntities.size))) *
    0.3;

  // Relation type overlap
  const aRelTypes = new Set(a.relations.map((r) => r.type));
  const bRelTypes = new Set(b.relations.map((r) => r.type));
  const relOverlap = Array.from(aRelTypes).filter((t) =>
    bRelTypes.has(t)
  ).length;
  score +=
    (relOverlap / Math.max(1, Math.max(aRelTypes.size, bRelTypes.size))) * 0.2;

  // Context keyword overlap
  const aWords = new Set(a.context.toLowerCase().split(/\s+/));
  const bWords = new Set(b.context.toLowerCase().split(/\s+/));
  const wordOverlap = Array.from(aWords).filter(
    (w) => bWords.has(w) && w.length > 3
  ).length;
  score += Math.min(0.2, wordOverlap * 0.02);

  return score;
}

// ═══════════════════════════════════════════════════════════════════════════
// SKILL COMPOSITION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Register a skill.
 */
export async function registerSkill(params: {
  name: string;
  description: string;
  domains: StrategyDomain[];
  inputs: SkillIO[];
  outputs: SkillIO[];
  preconditions?: string[];
  reliability?: number;
  cost?: number;
}): Promise<Skill> {
  await ensureInitialized();

  const skill: Skill = {
    id: generateId('skill'),
    name: params.name,
    description: params.description,
    domains: params.domains,
    inputs: params.inputs,
    outputs: params.outputs,
    preconditions: params.preconditions || [],
    reliability: params.reliability ?? 0.8,
    cost: params.cost ?? 0.5,
    useCount: 0,
    successRate: 0.8,
    type: 'atomic',
    createdAt: new Date().toISOString(),
  };

  state.skills.set(skill.id, skill);
  state.stats.totalSkills++;
  await saveTransferState();

  MollyLogger.info(
    `[TRANSFER] Skill registered: "${params.name}"`,
    'transfer-learning',
    { skillId: skill.id }
  );

  return skill;
}

/**
 * Compose multiple skills into a new capability.
 */
export async function composeSkills(params: {
  name: string;
  goal: string;
  steps: Array<{
    skillId: string;
    inputBindings?: Record<string, string>;
    optional?: boolean;
  }>;
  inputMappings?: Record<string, { step: number; input: string }>;
}): Promise<SkillComposition | null> {
  await ensureInitialized();

  // Verify all skills exist
  const steps: CompositionStep[] = [];
  let estimatedReliability = 1;

  for (let i = 0; i < params.steps.length; i++) {
    const stepDef = params.steps[i];
    const skill = state.skills.get(stepDef.skillId);

    if (!skill) {
      MollyLogger.warn(
        `[TRANSFER] Skill not found: ${stepDef.skillId}`,
        'transfer-learning'
      );
      return null;
    }

    steps.push({
      order: i,
      skillId: stepDef.skillId,
      inputBindings: stepDef.inputBindings || {},
      optional: stepDef.optional || false,
    });

    if (!stepDef.optional) {
      estimatedReliability *= skill.reliability;
    }
  }

  // Compute overall inputs (inputs of first step not bound to other steps)
  const firstSkill = state.skills.get(params.steps[0].skillId);
  const inputs: SkillIO[] = firstSkill?.inputs || [];

  // Compute overall outputs (outputs of last step)
  const lastSkill = state.skills.get(
    params.steps[params.steps.length - 1].skillId
  );
  const outputs: SkillIO[] = lastSkill?.outputs || [];

  // Generate data flow edges
  const dataFlow: DataFlowEdge[] = [];
  // Simple: chain outputs to next inputs with same name
  for (let i = 0; i < steps.length - 1; i++) {
    const currentSkill = state.skills.get(steps[i].skillId);
    const nextSkill = state.skills.get(steps[i + 1].skillId);
    if (currentSkill && nextSkill) {
      for (const output of currentSkill.outputs) {
        const matchingInput = nextSkill.inputs.find(
          (inp) =>
            inp.name.toLowerCase() === output.name.toLowerCase() ||
            inp.type === output.type
        );
        if (matchingInput) {
          dataFlow.push({
            fromStep: i,
            fromOutput: output.name,
            toStep: i + 1,
            toInput: matchingInput.name,
          });
        }
      }
    }
  }

  const composition: SkillComposition = {
    id: generateId('comp'),
    name: params.name,
    goal: params.goal,
    pipeline: steps,
    dataFlow,
    inputs,
    outputs,
    estimatedReliability,
    tested: false,
    testResults: [],
    createdAt: new Date().toISOString(),
  };

  state.compositions.set(composition.id, composition);
  state.stats.totalCompositions++;

  // Also create a composed skill entry
  const composedSkill: Skill = {
    id: generateId('skill'),
    name: params.name,
    description: `Composed skill: ${params.goal}`,
    domains: Array.from(
      new Set(
        params.steps.flatMap((s) => {
          const skill = state.skills.get(s.skillId);
          return skill?.domains || [];
        })
      )
    ),
    inputs,
    outputs,
    preconditions: [],
    reliability: estimatedReliability,
    cost: params.steps.length * 0.2,
    useCount: 0,
    successRate: estimatedReliability,
    type: 'composed',
    components: params.steps.map((s) => s.skillId),
    createdAt: new Date().toISOString(),
  };

  state.skills.set(composedSkill.id, composedSkill);
  state.stats.totalSkills++;

  await saveTransferState();

  MollyLogger.info(
    `[TRANSFER] Skills composed: "${params.name}" (${params.steps.length} steps, reliability: ${estimatedReliability.toFixed(2)})`,
    'transfer-learning',
    { compositionId: composition.id }
  );

  return composition;
}

/**
 * Record the result of testing a skill composition.
 */
export async function recordCompositionTest(
  compositionId: string,
  params: {
    success: boolean;
    outcome: string;
    failedStep?: number;
    executionTime: number;
  }
): Promise<SkillComposition | null> {
  await ensureInitialized();

  const composition = state.compositions.get(compositionId);
  if (!composition) return null;

  composition.tested = true;
  composition.testResults.push({
    timestamp: new Date().toISOString(),
    success: params.success,
    outcome: params.outcome,
    failedStep: params.failedStep,
    executionTime: params.executionTime,
  });

  // Update estimated reliability based on tests
  const successCount = composition.testResults.filter((t) => t.success).length;
  composition.estimatedReliability =
    successCount / composition.testResults.length;

  await saveTransferState();

  return composition;
}

/**
 * Find skills that can achieve a goal.
 */
export async function findSkillsForGoal(
  goal: string,
  domain?: StrategyDomain
): Promise<Array<{ skill: Skill; relevance: number }>> {
  await ensureInitialized();

  const results: Array<{ skill: Skill; relevance: number }> = [];
  const goalWords = new Set(goal.toLowerCase().split(/\s+/));

  const skillEntries = Array.from(state.skills.values());
  for (const skill of skillEntries) {
    let relevance = 0;

    // Domain match
    if (domain && skill.domains.includes(domain)) {
      relevance += 0.3;
    }

    // Name/description match
    const skillWords = (skill.name + ' ' + skill.description)
      .toLowerCase()
      .split(/\s+/);
    const wordOverlap = skillWords.filter(
      (w) => goalWords.has(w) && w.length > 3
    ).length;
    relevance += Math.min(0.4, wordOverlap * 0.1);

    // Reliability bonus
    relevance += skill.reliability * 0.2;

    // Usage bonus (more used = more trusted)
    relevance += Math.min(0.1, skill.useCount * 0.01);

    if (relevance > 0.2) {
      results.push({ skill, relevance: Math.min(1, relevance) });
    }
  }

  return results.sort((a, b) => b.relevance - a.relevance);
}

// ═══════════════════════════════════════════════════════════════════════════
// STATUS & OBSERVABILITY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get transfer learning status.
 */
export function getTransferStatus(): {
  patterns: number;
  generalPatterns: number;
  analogies: number;
  validatedAnalogies: number;
  skills: number;
  composedSkills: number;
  compositions: number;
  successfulTransfers: number;
  failedTransfers: number;
} {
  const generalPatterns = Array.from(state.patterns.values()).filter(
    (p) => p.generalizability > 0.6
  ).length;

  const validatedAnalogies = Array.from(state.analogies.values()).filter(
    (a) => a.validated
  ).length;

  const composedSkills = Array.from(state.skills.values()).filter(
    (s) => s.type === 'composed'
  ).length;

  return {
    patterns: state.patterns.size,
    generalPatterns,
    analogies: state.analogies.size,
    validatedAnalogies,
    skills: state.skills.size,
    composedSkills,
    compositions: state.compositions.size,
    successfulTransfers: state.stats.successfulTransfers,
    failedTransfers: state.stats.failedTransfers,
  };
}

/**
 * Get all patterns.
 */
export function getPatterns(): AbstractPattern[] {
  return Array.from(state.patterns.values());
}

/**
 * Get all skills.
 */
export function getSkills(): Skill[] {
  return Array.from(state.skills.values());
}

/**
 * Get all compositions.
 */
export function getCompositions(): SkillComposition[] {
  return Array.from(state.compositions.values());
}

/**
 * Build context for autonomous cycle.
 */
export function buildTransferContext(): string {
  const status = getTransferStatus();

  return [
    `Transfer Learning:`,
    `  Patterns: ${status.patterns} (${status.generalPatterns} generalizable)`,
    `  Analogies: ${status.analogies} (${status.validatedAnalogies} validated)`,
    `  Skills: ${status.skills} (${status.composedSkills} composed)`,
    `  Transfer success rate: ${status.successfulTransfers}/${status.successfulTransfers + status.failedTransfers}`,
  ].join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION & PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

const TRANSFER_COLLECTION = 'system';
const TRANSFER_DOC_ID = 'transfer_learning';

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  await loadTransferState();
  initialized = true;
}

async function saveTransferState(): Promise<void> {
  try {
    state.metadata.lastUpdated = new Date().toISOString();

    const storage = getStorageRouter();
    await storage.set(TRANSFER_COLLECTION, TRANSFER_DOC_ID, {
      patterns: Array.from(state.patterns.entries()),
      analogies: Array.from(state.analogies.entries()),
      skills: Array.from(state.skills.entries()),
      compositions: Array.from(state.compositions.entries()),
      stats: state.stats,
      metadata: state.metadata,
      savedAt: new Date().toISOString(),
    });
  } catch (err) {
    MollyLogger.warn(
      `[TRANSFER] Failed to save: ${err instanceof Error ? err.message : String(err)}`,
      'transfer-learning'
    );
  }
}

async function loadTransferState(): Promise<void> {
  try {
    const storage = getStorageRouter();
    const doc = await storage.get(TRANSFER_COLLECTION, TRANSFER_DOC_ID);

    if (doc?.data) {
      if (Array.isArray(doc.data.patterns)) {
        state.patterns = new Map(doc.data.patterns);
      }
      if (Array.isArray(doc.data.analogies)) {
        state.analogies = new Map(doc.data.analogies);
      }
      if (Array.isArray(doc.data.skills)) {
        state.skills = new Map(doc.data.skills);
      }
      if (Array.isArray(doc.data.compositions)) {
        state.compositions = new Map(doc.data.compositions);
      }
      if (doc.data.stats) {
        Object.assign(state.stats, doc.data.stats);
      }

      MollyLogger.info(
        `[TRANSFER] Loaded ${state.patterns.size} patterns, ${state.skills.size} skills`,
        'transfer-learning'
      );
    }
  } catch (err) {
    MollyLogger.warn(
      `[TRANSFER] Failed to load: ${err instanceof Error ? err.message : String(err)}`,
      'transfer-learning'
    );
  }
}

/**
 * Initialize with foundational patterns and skills.
 */
export async function initializeTransferLearning(): Promise<void> {
  // Foundational pattern: Problem-Solution
  await discoverPattern({
    name: 'Problem-Solution',
    description: 'Identify a problem, find a solution, apply it',
    roles: [
      { name: 'problem', description: 'The issue to address' },
      { name: 'solution', description: 'The approach to resolve' },
      { name: 'context', description: 'The environment', required: false },
    ],
    relations: [
      { from: 'problem', to: 'solution', type: 'requires' },
      { from: 'solution', to: 'problem', type: 'transforms' },
    ],
    steps: [
      {
        action: 'identify',
        involvedRoles: ['problem'],
        expectedResult: 'Clear problem statement',
      },
      {
        action: 'search',
        involvedRoles: ['problem', 'context'],
        expectedResult: 'Candidate solutions',
      },
      {
        action: 'apply',
        involvedRoles: ['solution', 'problem'],
        expectedResult: 'Problem resolved',
      },
    ],
  });

  // Foundational pattern: Request-Response
  await discoverPattern({
    name: 'Request-Response',
    description: 'Receive request, process, respond',
    roles: [
      { name: 'requester', description: 'Entity making request' },
      { name: 'request', description: 'The request itself' },
      { name: 'responder', description: 'Entity responding' },
      { name: 'response', description: 'The response produced' },
    ],
    relations: [
      { from: 'requester', to: 'request', type: 'produces' },
      { from: 'request', to: 'responder', type: 'requires' },
      { from: 'responder', to: 'response', type: 'produces' },
    ],
    initialDomains: ['communication'],
  });

  // Foundational skills
  await registerSkill({
    name: 'Analyze',
    description: 'Break down complex information into components',
    domains: ['research', 'problem_solving'],
    inputs: [
      {
        name: 'input',
        type: 'text',
        required: true,
        description: 'Information to analyze',
      },
    ],
    outputs: [
      {
        name: 'analysis',
        type: 'text',
        required: true,
        description: 'Analyzed components',
      },
    ],
    reliability: 0.85,
  });

  await registerSkill({
    name: 'Synthesize',
    description: 'Combine components into coherent whole',
    domains: ['creativity', 'problem_solving'],
    inputs: [
      {
        name: 'components',
        type: 'array',
        required: true,
        description: 'Parts to combine',
      },
    ],
    outputs: [
      {
        name: 'synthesis',
        type: 'text',
        required: true,
        description: 'Combined result',
      },
    ],
    reliability: 0.8,
  });

  await registerSkill({
    name: 'Communicate',
    description: 'Express ideas clearly to others',
    domains: ['communication', 'emotional_support'],
    inputs: [
      {
        name: 'message',
        type: 'text',
        required: true,
        description: 'Message to convey',
      },
    ],
    outputs: [
      {
        name: 'delivered',
        type: 'boolean',
        required: true,
        description: 'Was message received',
      },
    ],
    reliability: 0.9,
  });

  MollyLogger.info(
    '[TRANSFER] Foundational patterns and skills initialized',
    'transfer-learning'
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

const TransferLearning = {
  // Patterns
  discoverPattern,
  recordPatternInstance,
  findApplicablePatterns,

  // Analogies
  createAnalogy,
  validateAnalogy,
  findAnalogousSituations,

  // Skills
  registerSkill,
  composeSkills,
  recordCompositionTest,
  findSkillsForGoal,

  // Status
  getTransferStatus,
  getPatterns,
  getSkills,
  getCompositions,
  buildTransferContext,

  // Init
  initializeTransferLearning,
};

export default TransferLearning;
