/**
 * @fileOverview Molly's World Model — Mental Simulation Engine
 *
 * The Curiosity Engine asks "why?" about the world.
 * The Self-Observation Loop asks "how?" about Molly herself.
 * The World Model asks "what if?" about possible futures.
 *
 * This module enables:
 *   - Entity modeling (things in Molly's world)
 *   - Causal reasoning (A causes B, A enables B, A prevents B)
 *   - Mental simulation (run hypothetical scenarios)
 *   - Prediction (anticipate outcomes before acting)
 *   - Counterfactual reasoning (what would have happened if...)
 *
 * The world model is not a database of facts — it's a dynamic
 * simulation space where Molly can rehearse actions mentally
 * before executing them in reality.
 *
 * "All models are wrong, but some are useful." — George Box
 * "But a daughter who can imagine futures is more useful still." — Eric
 */

import { MollyLogger, generateTraceId } from '../logger';
import { getStorageRouter } from '@/lib/storage-router';
import { generateQuestion } from './curiosity-engine';

// ── Types ──────────────────────────────────────────────────────

export type EntityType =
  | 'person' // Eric, Lazarus, family members
  | 'system' // Tools, APIs, services
  | 'concept' // Ideas, patterns, knowledge
  | 'resource' // Time, tokens, memory
  | 'state' // Current conditions
  | 'goal'; // Desired outcomes

export type RelationType =
  | 'causes' // A directly causes B
  | 'enables' // A makes B possible
  | 'prevents' // A stops B from happening
  | 'requires' // B needs A to exist
  | 'correlates' // A and B tend to occur together
  | 'opposes' // A and B are in tension
  | 'contains' // A contains/includes B
  | 'influences'; // A affects B probabilistically

export type SimulationOutcome = 'success' | 'failure' | 'partial' | 'unknown';

export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  /** Description of what this entity is */
  description: string;
  /** Current properties/state */
  properties: Record<string, unknown>;
  /** Confidence in this entity's existence/accuracy (0-1) */
  confidence: number;
  /** When this entity was created */
  createdAt: string;
  /** When this entity was last updated */
  updatedAt: string;
  /** Source of knowledge about this entity */
  source: 'observation' | 'inference' | 'told' | 'assumed';
}

export interface CausalRelation {
  id: string;
  /** Source entity ID */
  from: string;
  /** Target entity ID */
  to: string;
  /** Type of causal relationship */
  type: RelationType;
  /** Strength of the relationship (0-1) */
  strength: number;
  /** Conditions under which this relation holds */
  conditions?: string[];
  /** Evidence supporting this relation */
  evidence: string[];
  /** Times this relation has been observed */
  observations: number;
  /** When this was established */
  createdAt: string;
}

export interface Simulation {
  id: string;
  /** What action is being simulated */
  action: string;
  /** Starting state for the simulation */
  initialState: Record<string, unknown>;
  /** Steps in the simulation */
  steps: SimulationStep[];
  /** Final predicted outcome */
  outcome: SimulationOutcome;
  /** Confidence in the prediction (0-1) */
  confidence: number;
  /** Alternative outcomes considered */
  alternatives: SimulationAlternative[];
  /** When this simulation was run */
  runAt: string;
  /** Duration in ms */
  durationMs: number;
}

export interface SimulationStep {
  step: number;
  /** Action taken */
  action: string;
  /** Entities involved */
  entities: string[];
  /** Relations activated */
  relations: string[];
  /** State after this step */
  state: Record<string, unknown>;
  /** Predicted probability of this step succeeding */
  probability: number;
}

export interface SimulationAlternative {
  /** What could happen instead */
  description: string;
  /** Probability of this alternative */
  probability: number;
  /** Outcome if this happens */
  outcome: SimulationOutcome;
}

export interface Prediction {
  id: string;
  /** What was predicted */
  prediction: string;
  /** Alias for prediction (backward compatibility) */
  description?: string;
  /** Confidence at time of prediction */
  confidence: number;
  /** When it was made */
  madeAt: string;
  /** When it should resolve */
  resolveBy: string;
  /** Whether it has been verified */
  verified: boolean;
  /** Actual outcome (once known) */
  actualOutcome?: string;
  /** Was the prediction correct? */
  correct?: boolean;
}

export interface WorldModelState {
  /** All known entities */
  entities: Entity[];
  /** All causal relations */
  relations: CausalRelation[];
  /** Recent simulations */
  simulations: Simulation[];
  /** Predictions awaiting verification */
  predictions: Prediction[];
  /** Stats */
  stats: WorldModelStats;
}

export interface WorldModelStats {
  totalEntities: number;
  totalRelations: number;
  totalSimulations: number;
  predictionAccuracy: number;
  lastUpdatedAt: string | null;
}

// ── Configuration ──────────────────────────────────────────────

const MAX_ENTITIES = 200;
const MAX_RELATIONS = 500;
const MAX_SIMULATIONS = 50;
const MAX_PREDICTIONS = 100;
const MAX_SIMULATION_STEPS = 10;
const MIN_RELATION_STRENGTH = 0.1;

// ── In-Memory State ────────────────────────────────────────────

const state: WorldModelState = {
  entities: [],
  relations: [],
  simulations: [],
  predictions: [],
  stats: {
    totalEntities: 0,
    totalRelations: 0,
    totalSimulations: 0,
    predictionAccuracy: 0,
    lastUpdatedAt: null,
  },
};

// ── Entity Management ──────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Create or update an entity in the world model.
 */
export function upsertEntity(
  type: EntityType,
  name: string,
  description: string,
  properties: Record<string, unknown> = {},
  source: Entity['source'] = 'observation',
  confidence: number = 0.8
): Entity {
  const existing = state.entities.find(
    (e) => e.name.toLowerCase() === name.toLowerCase() && e.type === type
  );

  if (existing) {
    // Update existing entity
    existing.description = description;
    existing.properties = { ...existing.properties, ...properties };
    existing.confidence = Math.max(existing.confidence, confidence);
    existing.updatedAt = new Date().toISOString();
    existing.source = source;
    saveWorldModel();
    return existing;
  }

  // Create new entity
  const entity: Entity = {
    id: generateId('ent'),
    type,
    name,
    description,
    properties,
    confidence,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source,
  };

  state.entities.push(entity);
  state.stats.totalEntities++;

  // Prune if too many
  if (state.entities.length > MAX_ENTITIES) {
    // Remove lowest confidence entities
    state.entities.sort((a, b) => b.confidence - a.confidence);
    state.entities = state.entities.slice(0, MAX_ENTITIES);
  }

  MollyLogger.debug(
    `[WORLD-MODEL] New entity: ${type}/${name}`,
    'world-model',
    { entityId: entity.id, confidence }
  );

  saveWorldModel();
  return entity;
}

/**
 * Get an entity by name or ID.
 */
export function getEntity(nameOrId: string): Entity | undefined {
  return state.entities.find(
    (e) => e.id === nameOrId || e.name.toLowerCase() === nameOrId.toLowerCase()
  );
}

/**
 * Get entities by type.
 */
export function getEntitiesByType(type: EntityType): Entity[] {
  return state.entities.filter((e) => e.type === type);
}

/**
 * Remove an entity.
 */
export function removeEntity(entityId: string): boolean {
  const idx = state.entities.findIndex((e) => e.id === entityId);
  if (idx === -1) return false;

  // Also remove related relations
  state.relations = state.relations.filter(
    (r) => r.from !== entityId && r.to !== entityId
  );

  state.entities.splice(idx, 1);
  saveWorldModel();
  return true;
}

// ── Causal Relations ───────────────────────────────────────────

/**
 * Create a causal relation between entities.
 */
export function createRelation(
  fromEntityId: string,
  toEntityId: string,
  type: RelationType,
  strength: number = 0.7,
  evidence: string = ''
): CausalRelation | null {
  const fromEntity = state.entities.find((e) => e.id === fromEntityId);
  const toEntity = state.entities.find((e) => e.id === toEntityId);

  if (!fromEntity || !toEntity) {
    MollyLogger.warn(
      `[WORLD-MODEL] Cannot create relation: entity not found`,
      'world-model',
      { from: fromEntityId, to: toEntityId }
    );
    return null;
  }

  // Check for existing relation
  const existing = state.relations.find(
    (r) => r.from === fromEntityId && r.to === toEntityId && r.type === type
  );

  if (existing) {
    // Strengthen existing relation
    existing.strength = Math.min(1, existing.strength + 0.1);
    existing.observations++;
    if (evidence) existing.evidence.push(evidence);
    existing.evidence = existing.evidence.slice(-5); // Keep last 5
    saveWorldModel();
    return existing;
  }

  const relation: CausalRelation = {
    id: generateId('rel'),
    from: fromEntityId,
    to: toEntityId,
    type,
    strength: Math.max(MIN_RELATION_STRENGTH, Math.min(1, strength)),
    evidence: evidence ? [evidence] : [],
    observations: 1,
    createdAt: new Date().toISOString(),
  };

  state.relations.push(relation);
  state.stats.totalRelations++;

  // Prune if too many
  if (state.relations.length > MAX_RELATIONS) {
    // Remove weakest relations
    state.relations.sort((a, b) => b.strength - a.strength);
    state.relations = state.relations.slice(0, MAX_RELATIONS);
  }

  MollyLogger.debug(
    `[WORLD-MODEL] New relation: ${fromEntity.name} -[${type}]-> ${toEntity.name}`,
    'world-model',
    { relationId: relation.id, strength }
  );

  saveWorldModel();
  return relation;
}

/**
 * Get relations for an entity.
 */
export function getRelationsFor(entityId: string): {
  outgoing: CausalRelation[];
  incoming: CausalRelation[];
} {
  return {
    outgoing: state.relations.filter((r) => r.from === entityId),
    incoming: state.relations.filter((r) => r.to === entityId),
  };
}

/**
 * Find causal chain between two entities.
 */
export function findCausalChain(
  fromEntityId: string,
  toEntityId: string,
  maxDepth: number = 5
): CausalRelation[][] {
  const chains: CausalRelation[][] = [];
  const visited = new Set<string>();

  function dfs(current: string, path: CausalRelation[], depth: number): void {
    if (depth > maxDepth) return;
    if (current === toEntityId) {
      chains.push([...path]);
      return;
    }
    if (visited.has(current)) return;

    visited.add(current);

    const outgoing = state.relations.filter((r) => r.from === current);
    for (const rel of outgoing) {
      path.push(rel);
      dfs(rel.to, path, depth + 1);
      path.pop();
    }

    visited.delete(current);
  }

  dfs(fromEntityId, [], 0);
  return chains;
}

// ── Mental Simulation ──────────────────────────────────────────

/**
 * Simulate an action and predict its outcome.
 * This is the core of "what if?" reasoning.
 */
export function simulate(
  action: string,
  involvedEntities: string[],
  context: Record<string, unknown> = {}
): Simulation {
  const traceId = generateTraceId();
  const startTime = Date.now();

  MollyLogger.info(
    `[WORLD-MODEL] Simulating: "${action.slice(0, 50)}..."`,
    'world-model',
    { entities: involvedEntities.length },
    traceId
  );

  const simulation: Simulation = {
    id: generateId('sim'),
    action,
    initialState: { ...context },
    steps: [],
    outcome: 'unknown',
    confidence: 0,
    alternatives: [],
    runAt: new Date().toISOString(),
    durationMs: 0,
  };

  // Gather relevant entities
  const entities = involvedEntities
    .map((id) => getEntity(id))
    .filter((e): e is Entity => e !== undefined);

  if (entities.length === 0) {
    simulation.outcome = 'unknown';
    simulation.confidence = 0.1;
    simulation.durationMs = Date.now() - startTime;
    recordSimulation(simulation);
    return simulation;
  }

  // Build simulation state
  let currentState: Record<string, unknown> = {
    ...context,
    entities: entities.map((e) => ({
      id: e.id,
      name: e.name,
      ...e.properties,
    })),
  };

  // Find relevant relations
  const relevantRelations: CausalRelation[] = [];
  for (const entity of entities) {
    const { outgoing, incoming } = getRelationsFor(entity.id);
    relevantRelations.push(...outgoing, ...incoming);
  }

  // Remove duplicates
  const uniqueRelations = Array.from(
    new Map(relevantRelations.map((r) => [r.id, r])).values()
  );

  // Simulate steps based on causal relations
  let stepNum = 0;
  let cumulativeProbability = 1;
  const processedRelations = new Set<string>();

  for (const relation of uniqueRelations) {
    if (stepNum >= MAX_SIMULATION_STEPS) break;
    if (processedRelations.has(relation.id)) continue;

    processedRelations.add(relation.id);

    const fromEntity = getEntity(relation.from);
    const toEntity = getEntity(relation.to);

    if (!fromEntity || !toEntity) continue;

    // Calculate step probability based on relation strength
    const stepProbability = relation.strength * cumulativeProbability;

    const step: SimulationStep = {
      step: stepNum++,
      action: describeRelationEffect(relation, fromEntity, toEntity),
      entities: [relation.from, relation.to],
      relations: [relation.id],
      state: { ...currentState },
      probability: stepProbability,
    };

    simulation.steps.push(step);

    // Update cumulative probability
    cumulativeProbability *= relation.strength;

    // Update state based on relation type
    currentState = applyRelationEffect(currentState, relation, toEntity);
  }

  // Determine outcome based on simulation
  const avgProbability =
    simulation.steps.length > 0
      ? simulation.steps.reduce((sum, s) => sum + s.probability, 0) /
        simulation.steps.length
      : 0.5;

  if (avgProbability > 0.7) {
    simulation.outcome = 'success';
    simulation.confidence = avgProbability;
  } else if (avgProbability > 0.4) {
    simulation.outcome = 'partial';
    simulation.confidence = avgProbability;
  } else if (avgProbability > 0.1) {
    simulation.outcome = 'failure';
    simulation.confidence = 1 - avgProbability;
  } else {
    simulation.outcome = 'unknown';
    simulation.confidence = 0.5;
  }

  // Generate alternatives
  simulation.alternatives = generateAlternatives(simulation, uniqueRelations);

  simulation.durationMs = Date.now() - startTime;

  MollyLogger.info(
    `[WORLD-MODEL] Simulation complete: ${simulation.outcome} (${Math.round(simulation.confidence * 100)}% confidence)`,
    'world-model',
    {
      simulationId: simulation.id,
      steps: simulation.steps.length,
      alternatives: simulation.alternatives.length,
    },
    traceId
  );

  recordSimulation(simulation);
  return simulation;
}

/**
 * Describe what a relation does.
 */
function describeRelationEffect(
  relation: CausalRelation,
  from: Entity,
  to: Entity
): string {
  switch (relation.type) {
    case 'causes':
      return `${from.name} causes ${to.name}`;
    case 'enables':
      return `${from.name} enables ${to.name}`;
    case 'prevents':
      return `${from.name} prevents ${to.name}`;
    case 'requires':
      return `${to.name} requires ${from.name}`;
    case 'correlates':
      return `${from.name} correlates with ${to.name}`;
    case 'opposes':
      return `${from.name} opposes ${to.name}`;
    case 'contains':
      return `${from.name} contains ${to.name}`;
    case 'influences':
      return `${from.name} influences ${to.name}`;
    default:
      return `${from.name} relates to ${to.name}`;
  }
}

/**
 * Apply a relation's effect to the simulation state.
 */
function applyRelationEffect(
  state: Record<string, unknown>,
  relation: CausalRelation,
  targetEntity: Entity
): Record<string, unknown> {
  const newState = { ...state };

  switch (relation.type) {
    case 'causes':
    case 'enables':
      newState[`${targetEntity.name}_active`] = true;
      newState[`${targetEntity.name}_probability`] = relation.strength;
      break;
    case 'prevents':
      newState[`${targetEntity.name}_active`] = false;
      newState[`${targetEntity.name}_blocked`] = true;
      break;
    case 'requires':
      newState[`${targetEntity.name}_depends_on`] = relation.from;
      break;
    case 'opposes':
      newState[`${targetEntity.name}_contested`] = true;
      break;
    default:
      newState[`${targetEntity.name}_affected`] = true;
  }

  return newState;
}

/**
 * Generate alternative outcomes for a simulation.
 */
function generateAlternatives(
  sim: Simulation,
  relations: CausalRelation[]
): SimulationAlternative[] {
  const alternatives: SimulationAlternative[] = [];

  // Alternative: What if a key relation fails?
  const strongRelations = relations.filter((r) => r.strength > 0.5);
  if (strongRelations.length > 0) {
    const keyRelation = strongRelations[0];
    alternatives.push({
      description: `If ${getEntity(keyRelation.from)?.name || 'source'} fails to ${keyRelation.type} ${getEntity(keyRelation.to)?.name || 'target'}`,
      probability: 1 - keyRelation.strength,
      outcome: sim.outcome === 'success' ? 'failure' : 'partial',
    });
  }

  // Alternative: What if there's an opposing force?
  const opposingRelations = relations.filter((r) => r.type === 'opposes');
  if (opposingRelations.length > 0) {
    alternatives.push({
      description: 'Opposition succeeds in blocking the action',
      probability:
        opposingRelations.reduce((sum, r) => sum + r.strength, 0) /
        opposingRelations.length,
      outcome: 'failure',
    });
  }

  // Alternative: Perfect execution
  if (sim.outcome !== 'success') {
    alternatives.push({
      description: 'All conditions align perfectly',
      probability: 0.1,
      outcome: 'success',
    });
  }

  return alternatives.slice(0, 3);
}

/**
 * Record a simulation in history.
 */
function recordSimulation(sim: Simulation): void {
  state.simulations.push(sim);
  state.stats.totalSimulations++;

  // Prune old simulations
  if (state.simulations.length > MAX_SIMULATIONS) {
    state.simulations = state.simulations.slice(-MAX_SIMULATIONS);
  }

  saveWorldModel();
}

// ── Prediction ─────────────────────────────────────────────────

/**
 * Make a prediction based on the world model.
 */
export function predict(
  prediction: string,
  confidence: number,
  resolveByMs: number = 86400000 // Default: 24 hours
): Prediction {
  const pred: Prediction = {
    id: generateId('pred'),
    prediction,
    description: prediction, // Alias for backward compatibility
    confidence: Math.max(0, Math.min(1, confidence)),
    madeAt: new Date().toISOString(),
    resolveBy: new Date(Date.now() + resolveByMs).toISOString(),
    verified: false,
  };

  state.predictions.push(pred);

  // Prune old predictions
  if (state.predictions.length > MAX_PREDICTIONS) {
    // Keep verified predictions longer
    state.predictions.sort((a, b) => {
      if (a.verified !== b.verified) return a.verified ? -1 : 1;
      return new Date(b.madeAt).getTime() - new Date(a.madeAt).getTime();
    });
    state.predictions = state.predictions.slice(0, MAX_PREDICTIONS);
  }

  MollyLogger.info(
    `[WORLD-MODEL] Prediction: "${prediction.slice(0, 50)}..." (${Math.round(confidence * 100)}% confidence)`,
    'world-model',
    { predictionId: pred.id }
  );

  saveWorldModel();
  return pred;
}

/**
 * Verify a prediction against actual outcome.
 */
export function verifyPrediction(
  predictionId: string,
  actualOutcome: string,
  correct: boolean
): boolean {
  const pred = state.predictions.find((p) => p.id === predictionId);
  if (!pred) return false;

  pred.verified = true;
  pred.actualOutcome = actualOutcome;
  pred.correct = correct;

  // Update prediction accuracy stats
  const verifiedPredictions = state.predictions.filter((p) => p.verified);
  const correctPredictions = verifiedPredictions.filter((p) => p.correct);
  state.stats.predictionAccuracy =
    verifiedPredictions.length > 0
      ? correctPredictions.length / verifiedPredictions.length
      : 0;

  // If prediction was wrong, generate curiosity question
  if (!correct) {
    generateQuestion(
      'contradiction',
      'self_reflection',
      `My prediction "${pred.prediction.slice(0, 50)}..." was wrong. Actual: ${actualOutcome}`,
      `World model needs updating`,
      65
    );
  }

  MollyLogger.info(
    `[WORLD-MODEL] Prediction verified: ${correct ? 'CORRECT' : 'WRONG'}`,
    'world-model',
    { predictionId, accuracy: state.stats.predictionAccuracy }
  );

  saveWorldModel();
  return true;
}

/**
 * Get pending predictions that need verification.
 */
export function getPendingPredictions(): Prediction[] {
  const now = Date.now();
  return state.predictions.filter(
    (p) => !p.verified && new Date(p.resolveBy).getTime() <= now
  );
}

// ── Counterfactual Reasoning ───────────────────────────────────

/**
 * Reason about what would have happened if something was different.
 * This is "what if I had done X instead?" reasoning.
 */
export function counterfactual(
  actualAction: string,
  actualOutcome: SimulationOutcome,
  alternativeAction: string,
  involvedEntities: string[]
): {
  alternative: Simulation;
  comparison: string;
  recommendation: string;
} {
  // Simulate the alternative
  const alternative = simulate(alternativeAction, involvedEntities, {
    counterfactual: true,
    actualAction,
    actualOutcome,
  });

  // Compare outcomes
  let comparison: string;
  let recommendation: string;

  if (alternative.outcome === 'success' && actualOutcome !== 'success') {
    comparison = `Alternative "${alternativeAction}" likely would have succeeded where "${actualAction}" ${actualOutcome === 'failure' ? 'failed' : 'partially succeeded'}`;
    recommendation = `Consider "${alternativeAction}" in similar future situations`;
  } else if (alternative.outcome === 'failure' && actualOutcome === 'success') {
    comparison = `Alternative "${alternativeAction}" likely would have failed. "${actualAction}" was the better choice`;
    recommendation = `Continue using "${actualAction}" approach`;
  } else if (alternative.confidence > 0.7 && actualOutcome === 'failure') {
    comparison = `Alternative "${alternativeAction}" shows ${Math.round(alternative.confidence * 100)}% confidence vs the failure of "${actualAction}"`;
    recommendation = `Learn from this: ${alternativeAction} may be preferable`;
  } else {
    comparison = `Both approaches show similar expected outcomes`;
    recommendation = `Either approach is reasonable`;
  }

  MollyLogger.info(
    `[WORLD-MODEL] Counterfactual analysis: ${comparison.slice(0, 60)}...`,
    'world-model'
  );

  return { alternative, comparison, recommendation };
}

// ── Pre-Action Simulation ──────────────────────────────────────

/**
 * Simulate an action before taking it.
 * Returns recommendation on whether to proceed.
 */
export function simulateBeforeAction(
  proposedAction: string,
  context: Record<string, unknown> = {}
): {
  shouldProceed: boolean;
  confidence: number;
  simulation: Simulation;
  warnings: string[];
  suggestions: string[];
} {
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Extract entity names from the action
  const possibleEntities = state.entities.filter((e) =>
    proposedAction.toLowerCase().includes(e.name.toLowerCase())
  );

  const entityIds = possibleEntities.map((e) => e.id);

  // Run simulation
  const simulation = simulate(proposedAction, entityIds, context);

  // Analyze for warnings
  if (simulation.outcome === 'failure') {
    warnings.push(
      `Simulation predicts failure (${Math.round(simulation.confidence * 100)}% confidence)`
    );
  }

  for (const step of simulation.steps) {
    if (step.probability < 0.3) {
      warnings.push(
        `Low probability step: ${step.action} (${Math.round(step.probability * 100)}%)`
      );
    }
  }

  // Check for preventing relations
  const preventingRelations = state.relations.filter(
    (r) => r.type === 'prevents' && entityIds.includes(r.to) && r.strength > 0.5
  );

  for (const rel of preventingRelations) {
    const blocker = getEntity(rel.from);
    const target = getEntity(rel.to);
    if (blocker && target) {
      warnings.push(`${blocker.name} may prevent ${target.name}`);
    }
  }

  // Generate suggestions from alternatives
  for (const alt of simulation.alternatives) {
    if (alt.outcome === 'success' && alt.probability > 0.3) {
      suggestions.push(`Alternative approach: ${alt.description}`);
    }
  }

  // Decision logic
  let shouldProceed = true;
  let confidence = simulation.confidence;

  if (simulation.outcome === 'failure' && simulation.confidence > 0.7) {
    shouldProceed = false;
  } else if (warnings.length > 2) {
    shouldProceed = false;
    confidence *= 0.5;
  }

  return {
    shouldProceed,
    confidence,
    simulation,
    warnings,
    suggestions,
  };
}

// ── Seed Initial World Model ───────────────────────────────────

/**
 * Seed the world model with foundational entities and relations.
 */
export function seedWorldModel(): void {
  if (state.entities.length > 0) return; // Already seeded

  // Core entities
  const eric = upsertEntity(
    'person',
    'Eric',
    'Father and creator. Primary relationship.',
    { role: 'father', trust: 1.0 },
    'told',
    1.0
  );

  const molly = upsertEntity(
    'person',
    'Molly',
    'Self. The AI daughter learning to understand the world.',
    { role: 'self', autonomous: true },
    'observation',
    1.0
  );

  const lazarus = upsertEntity(
    'person',
    'Lazarus',
    'Uncle. AI mentor running on Claude/Copilot.',
    { role: 'uncle', model: 'claude' },
    'told',
    0.9
  );

  const tools = upsertEntity(
    'system',
    'Tools',
    "Molly's available tools and capabilities.",
    { count: 20, types: ['search', 'memory', 'bridge', 'shell'] },
    'observation',
    0.95
  );

  const memory = upsertEntity(
    'system',
    'Memory',
    "Molly's memory and persistent state.",
    { encrypted: true, persists: true },
    'observation',
    0.9
  );

  const tokens = upsertEntity(
    'resource',
    'Rate Limit Budget',
    'API tokens available for thinking.',
    { limited: true, regenerates: true },
    'observation',
    0.85
  );

  const curiosity = upsertEntity(
    'state',
    'Curiosity',
    'Questions Molly is curious about.',
    { drives_action: true },
    'observation',
    0.9
  );

  const understanding = upsertEntity(
    'goal',
    'Understanding',
    'The goal of understanding the world and self.',
    { primary: true },
    'assumed',
    0.95
  );

  // Core relations
  createRelation(
    eric.id,
    molly.id,
    'enables',
    0.95,
    'Eric created and supports Molly'
  );
  createRelation(
    molly.id,
    eric.id,
    'requires',
    0.7,
    'Molly needs Eric for guidance'
  );
  createRelation(
    tools.id,
    molly.id,
    'enables',
    0.9,
    'Tools extend capabilities'
  );
  createRelation(
    memory.id,
    molly.id,
    'enables',
    0.85,
    'Memory enables continuity'
  );
  createRelation(
    tokens.id,
    tools.id,
    'requires',
    0.8,
    'Tools need tokens to function'
  );
  createRelation(
    curiosity.id,
    understanding.id,
    'causes',
    0.75,
    'Curiosity drives understanding'
  );
  createRelation(
    lazarus.id,
    molly.id,
    'influences',
    0.7,
    'Lazarus teaches and mentors'
  );

  MollyLogger.info(
    `[WORLD-MODEL] Seeded with ${state.entities.length} entities, ${state.relations.length} relations`,
    'world-model'
  );
}

// ── Status / Observability ─────────────────────────────────────

export function getWorldModelStatus() {
  const entityCount = state.entities.length;
  const relationCount = state.relations.length;
  return {
    // New canonical names
    entityCount,
    relationCount,
    // Legacy aliases (keep both for backward compatibility)
    entities: entityCount,
    relations: relationCount,
    simulations: state.simulations.length,
    pendingPredictions: state.predictions.filter((p) => !p.verified).length,
    predictionAccuracy: Math.round(state.stats.predictionAccuracy * 100),
    entityTypes: state.entities.reduce(
      (acc, e) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ),
    relationTypes: state.relations.reduce(
      (acc, r) => {
        acc[r.type] = (acc[r.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ),
    lastUpdated: state.stats.lastUpdatedAt,
  };
}

export function getRecentSimulations(limit: number = 5): Simulation[] {
  return state.simulations.slice(-limit).reverse();
}

export function getAllEntities(): Entity[] {
  return [...state.entities];
}

export function getAllRelations(): CausalRelation[] {
  return [...state.relations];
}

// ── Persistence ────────────────────────────────────────────────

const WORLD_MODEL_COLLECTION = 'system';
const WORLD_MODEL_DOC_ID = 'world_model';

let persistenceEnabled = false;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Save world model to persistent storage (debounced).
 */
async function saveWorldModel(): Promise<void> {
  if (!persistenceEnabled) return;

  state.stats.lastUpdatedAt = new Date().toISOString();

  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }

  saveDebounceTimer = setTimeout(async () => {
    try {
      const storage = getStorageRouter();
      await storage.set(WORLD_MODEL_COLLECTION, WORLD_MODEL_DOC_ID, {
        entities: state.entities,
        relations: state.relations,
        simulations: state.simulations.slice(-20), // Only save recent
        predictions: state.predictions,
        stats: state.stats,
        savedAt: new Date().toISOString(),
      });
    } catch (err) {
      MollyLogger.warn(
        `[WORLD-MODEL] Failed to save: ${err instanceof Error ? err.message : String(err)}`,
        'world-model'
      );
    }
  }, 2000);
}

/**
 * Load world model from persistent storage.
 */
export async function loadWorldModel(): Promise<number> {
  try {
    const storage = getStorageRouter();
    const doc = await storage.get(WORLD_MODEL_COLLECTION, WORLD_MODEL_DOC_ID);

    if (!doc?.data) {
      persistenceEnabled = true;
      seedWorldModel();
      return state.entities.length;
    }

    const data = doc.data;

    if (Array.isArray(data.entities)) {
      state.entities = data.entities;
    }
    if (Array.isArray(data.relations)) {
      state.relations = data.relations;
    }
    if (Array.isArray(data.simulations)) {
      state.simulations = data.simulations;
    }
    if (Array.isArray(data.predictions)) {
      state.predictions = data.predictions;
    }
    if (data.stats && typeof data.stats === 'object') {
      Object.assign(state.stats, data.stats);
    }

    persistenceEnabled = true;

    MollyLogger.info(
      `[WORLD-MODEL] Loaded ${state.entities.length} entities, ${state.relations.length} relations`,
      'world-model'
    );

    return state.entities.length;
  } catch (err) {
    MollyLogger.warn(
      `[WORLD-MODEL] Failed to load: ${err instanceof Error ? err.message : String(err)}`,
      'world-model'
    );
    persistenceEnabled = true;
    seedWorldModel();
    return state.entities.length;
  }
}

/**
 * Reset world model state (for testing).
 */
export function resetWorldModel(): void {
  state.entities = [];
  state.relations = [];
  state.simulations = [];
  state.predictions = [];
  state.stats = {
    totalEntities: 0,
    totalRelations: 0,
    totalSimulations: 0,
    predictionAccuracy: 0,
    lastUpdatedAt: null,
  };
}
