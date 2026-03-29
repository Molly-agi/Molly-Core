/**
 * CAUSAL REASONING: Understanding Why Things Happen
 *
 * "Correlation is not causation." — Every scientist
 * "But understanding causation is the key to wisdom." — Eric
 *
 * This module provides Molly with formal causal reasoning capabilities:
 *
 * Three pillars:
 * 1. CAUSAL GRAPHS — DAG representation of cause-effect relationships
 * 2. DO-CALCULUS — Pearl's intervention semantics (observing vs doing)
 * 3. TEMPORAL REASONING — Time-aware causation (delays, sequences, windows)
 *
 * This enables Molly to:
 * - Distinguish correlation from causation
 * - Reason about interventions ("What if I DO this?")
 * - Understand temporal dependencies
 * - Identify confounders and mediators
 * - Make better predictions and decisions
 *
 * Built as part of Molly's AGI journey, March 2026.
 * Slow. Methodical. Precise.
 */

import { MollyLogger } from '../../logger';
import { getStorageRouter } from '@/lib/storage-router';

// ═══════════════════════════════════════════════════════════════════════════
// CAUSAL GRAPHS — The Structure of Causation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A causal variable — a node in the causal graph
 */
export interface CausalVariable {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this variable represents */
  description: string;
  /** Type of variable */
  type: VariableType;
  /** Domain of values this variable can take */
  domain: VariableDomain;
  /** Is this variable observable? */
  observable: boolean;
  /** Is this variable manipulable (can we intervene on it)? */
  manipulable: boolean;
  /** Current observed/inferred value */
  currentValue?: unknown;
  /** Confidence in current value (0-1) */
  valueConfidence: number;
  /** When this was created */
  createdAt: string;
  /** When last updated */
  updatedAt: string;
}

export type VariableType =
  | 'binary' // True/false
  | 'categorical' // Discrete categories
  | 'ordinal' // Ordered categories
  | 'continuous' // Real numbers
  | 'count' // Non-negative integers
  | 'temporal' // Time-based
  | 'composite'; // Combination of others

export interface VariableDomain {
  type: VariableType;
  values?: unknown[]; // For categorical/ordinal
  min?: number; // For continuous/count
  max?: number;
  unit?: string; // e.g., "milliseconds", "tokens"
}

/**
 * A causal edge — directed relationship between variables
 */
export interface CausalEdge {
  /** Unique identifier */
  id: string;
  /** Source variable (cause) */
  from: string;
  /** Target variable (effect) */
  to: string;
  /** Type of causal relationship */
  mechanism: CausalMechanism;
  /** Strength of causal effect (0-1) */
  strength: number;
  /** Confidence in this edge existing (0-1) */
  confidence: number;
  /** Temporal properties */
  temporal: TemporalProperties;
  /** Conditions under which this edge is active */
  conditions: EdgeCondition[];
  /** Evidence supporting this edge */
  evidence: CausalEvidence[];
  /** When this was established */
  createdAt: string;
}

export type CausalMechanism =
  | 'deterministic' // X always causes Y
  | 'probabilistic' // X increases P(Y)
  | 'necessary' // Y requires X
  | 'sufficient' // X alone causes Y
  | 'contributory' // X contributes to Y with others
  | 'preventive' // X prevents Y
  | 'enabling' // X makes Y possible
  | 'modulating'; // X affects the strength of another relationship

export interface TemporalProperties {
  /** Minimum delay before effect manifests (ms) */
  minDelay: number;
  /** Maximum delay before effect manifests (ms) */
  maxDelay: number;
  /** Expected delay (ms) */
  expectedDelay: number;
  /** Does effect persist after cause ceases? */
  persistent: boolean;
  /** How long does effect persist? (ms, 0 = indefinite) */
  persistenceDuration: number;
  /** Time window in which effect occurs (ms) */
  effectWindow: number;
}

export interface EdgeCondition {
  /** Variable that must be in a certain state */
  variableId: string;
  /** Required state */
  requiredState: unknown;
  /** Type of condition */
  conditionType: 'present' | 'absent' | 'above' | 'below' | 'equals';
}

export interface CausalEvidence {
  /** Type of evidence */
  type: EvidenceType;
  /** Description of the evidence */
  description: string;
  /** Strength of this evidence (0-1) */
  strength: number;
  /** When this evidence was collected */
  timestamp: string;
}

export type EvidenceType =
  | 'observation' // Saw A then B
  | 'intervention' // Did A, observed B
  | 'counterfactual' // Removed A, B stopped
  | 'mechanism' // Understood how A causes B
  | 'expert' // Told by trusted source
  | 'correlation' // Statistical association
  | 'temporal'; // A precedes B consistently

/**
 * The full causal graph — a Directed Acyclic Graph (DAG)
 */
export interface CausalGraph {
  /** Graph identifier */
  id: string;
  /** Name of this causal model */
  name: string;
  /** Description of what this graph models */
  description: string;
  /** Domain this graph applies to */
  domain: string;
  /** All variables in the graph */
  variables: Map<string, CausalVariable>;
  /** All edges in the graph */
  edges: Map<string, CausalEdge>;
  /** Cached topological order */
  topologicalOrder: string[];
  /** Is this graph valid (no cycles)? */
  isValid: boolean;
  /** When this graph was created */
  createdAt: string;
  /** When this graph was last updated */
  updatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// DO-CALCULUS — Interventions vs Observations
// ═══════════════════════════════════════════════════════════════════════════

/**
 * An intervention — "doing" rather than "observing"
 * P(Y|do(X=x)) is different from P(Y|X=x)
 */
export interface Intervention {
  /** Unique identifier */
  id: string;
  /** Variable being intervened upon */
  variableId: string;
  /** Value set by intervention */
  setValue: unknown;
  /** Type of intervention */
  type: InterventionType;
  /** Was this actually performed or hypothetical? */
  performed: boolean;
  /** When this intervention was/would be performed */
  timestamp: string;
  /** Observed effects */
  observedEffects: ObservedEffect[];
}

export type InterventionType =
  | 'atomic' // Set single variable
  | 'compound' // Set multiple variables
  | 'surgical' // Cut incoming edges then set
  | 'soft'; // Shift distribution rather than fix value

export interface ObservedEffect {
  /** Variable affected */
  variableId: string;
  /** Value before intervention */
  valueBefore: unknown;
  /** Value after intervention */
  valueAfter: unknown;
  /** Delay before effect was observed (ms) */
  delay: number;
  /** Confidence this effect was due to intervention */
  confidence: number;
}

/**
 * Result of a causal query
 */
export interface CausalQueryResult {
  /** The query that was asked */
  query: string;
  /** Query type */
  type: 'observational' | 'interventional' | 'counterfactual';
  /** Target variable */
  targetVariable: string;
  /** Evidence/conditions */
  evidence: Record<string, unknown>;
  /** Intervention (if any) */
  intervention?: { variable: string; value: unknown };
  /** Estimated effect */
  effect: {
    direction: 'positive' | 'negative' | 'none' | 'unknown';
    magnitude: number; // 0-1
    confidence: number; // 0-1
  };
  /** Causal path used */
  causalPath: string[];
  /** Confounders identified */
  confounders: string[];
  /** Mediators identified */
  mediators: string[];
  /** Reasoning trace */
  reasoning: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPORAL REASONING — Time-Aware Causation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A temporal causal sequence — events in time
 */
export interface TemporalSequence {
  /** Unique identifier */
  id: string;
  /** Events in this sequence */
  events: TemporalEvent[];
  /** Causal interpretation */
  causalInterpretation: string;
  /** Confidence this sequence is causal, not coincidental */
  causalConfidence: number;
  /** Has this pattern been validated? */
  validated: boolean;
  /** Times this sequence has been observed */
  observationCount: number;
  /** When first observed */
  firstObserved: string;
  /** When last observed */
  lastObserved: string;
}

export interface TemporalEvent {
  /** Variable that changed */
  variableId: string;
  /** New value */
  value: unknown;
  /** When this event occurred (ms from sequence start) */
  timeOffset: number;
  /** Confidence this event occurred */
  confidence: number;
}

/**
 * A temporal pattern — recurring causal sequence
 */
export interface TemporalPattern {
  /** Unique identifier */
  id: string;
  /** Name of this pattern */
  name: string;
  /** Description */
  description: string;
  /** Trigger variable(s) */
  triggers: string[];
  /** Expected sequence of effects */
  expectedSequence: Array<{
    variableId: string;
    expectedValue: unknown;
    expectedDelay: number;
    toleranceMs: number;
  }>;
  /** Final outcome variable */
  outcomeVariable: string;
  /** How reliable is this pattern? (0-1) */
  reliability: number;
  /** Times this pattern has been observed */
  observationCount: number;
  /** Times pattern was violated */
  violationCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

interface CausalReasoningState {
  /** All causal graphs */
  graphs: Map<string, CausalGraph>;
  /** Active graph ID */
  activeGraphId: string | null;
  /** Intervention history */
  interventions: Intervention[];
  /** Observed temporal sequences */
  sequences: Map<string, TemporalSequence>;
  /** Learned temporal patterns */
  patterns: Map<string, TemporalPattern>;
  /** Query cache */
  queryCache: Map<string, CausalQueryResult>;
  /** Statistics */
  stats: {
    totalGraphs: number;
    totalVariables: number;
    totalEdges: number;
    totalInterventions: number;
    queryAccuracy: number;
  };
  /** Metadata */
  metadata: {
    lastUpdated: string;
    version: number;
  };
}

const state: CausalReasoningState = {
  graphs: new Map(),
  activeGraphId: null,
  interventions: [],
  sequences: new Map(),
  patterns: new Map(),
  queryCache: new Map(),
  stats: {
    totalGraphs: 0,
    totalVariables: 0,
    totalEdges: 0,
    totalInterventions: 0,
    queryAccuracy: 0.5,
  },
  metadata: {
    lastUpdated: new Date().toISOString(),
    version: 1,
  },
};

// Configuration
const MAX_INTERVENTIONS = 200;
const MAX_SEQUENCES = 100;
const MAX_QUERY_CACHE = 50;

let initialized = false;

// ═══════════════════════════════════════════════════════════════════════════
// GRAPH CONSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a new causal graph.
 */
export async function createGraph(params: {
  name: string;
  description: string;
  domain: string;
}): Promise<CausalGraph> {
  await ensureInitialized();

  const graph: CausalGraph = {
    id: generateId('graph'),
    name: params.name,
    description: params.description,
    domain: params.domain,
    variables: new Map(),
    edges: new Map(),
    topologicalOrder: [],
    isValid: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  state.graphs.set(graph.id, graph);
  state.stats.totalGraphs++;

  if (!state.activeGraphId) {
    state.activeGraphId = graph.id;
  }

  await saveCausalState();

  MollyLogger.info(
    `[CAUSAL] Created graph: "${params.name}"`,
    'causal-reasoning',
    { graphId: graph.id }
  );

  return graph;
}

/**
 * Add a variable to a causal graph.
 */
export async function addVariable(
  graphId: string,
  params: {
    name: string;
    description: string;
    type: VariableType;
    domain?: Partial<VariableDomain>;
    observable?: boolean;
    manipulable?: boolean;
  }
): Promise<CausalVariable | null> {
  await ensureInitialized();

  const graph = state.graphs.get(graphId);
  if (!graph) return null;

  const variable: CausalVariable = {
    id: generateId('var'),
    name: params.name,
    description: params.description,
    type: params.type,
    domain: {
      type: params.type,
      ...(params.domain || {}),
    },
    observable: params.observable ?? true,
    manipulable: params.manipulable ?? false,
    valueConfidence: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  graph.variables.set(variable.id, variable);
  graph.updatedAt = new Date().toISOString();
  state.stats.totalVariables++;

  await saveCausalState();

  return variable;
}

/**
 * Add a causal edge between variables.
 */
export async function addCausalEdge(
  graphId: string,
  params: {
    from: string;
    to: string;
    mechanism: CausalMechanism;
    strength?: number;
    confidence?: number;
    temporal?: Partial<TemporalProperties>;
    evidence?: string;
  }
): Promise<CausalEdge | null> {
  await ensureInitialized();

  const graph = state.graphs.get(graphId);
  if (!graph) return null;

  // Verify both variables exist
  if (!graph.variables.has(params.from) || !graph.variables.has(params.to)) {
    MollyLogger.warn(
      '[CAUSAL] Cannot add edge: variable not found',
      'causal-reasoning',
      { from: params.from, to: params.to }
    );
    return null;
  }

  // Check for cycles (would invalidate DAG)
  if (wouldCreateCycle(graph, params.from, params.to)) {
    MollyLogger.warn(
      '[CAUSAL] Cannot add edge: would create cycle',
      'causal-reasoning',
      { from: params.from, to: params.to }
    );
    return null;
  }

  const edge: CausalEdge = {
    id: generateId('edge'),
    from: params.from,
    to: params.to,
    mechanism: params.mechanism,
    strength: params.strength ?? 0.7,
    confidence: params.confidence ?? 0.6,
    temporal: {
      minDelay: params.temporal?.minDelay ?? 0,
      maxDelay: params.temporal?.maxDelay ?? 60000,
      expectedDelay: params.temporal?.expectedDelay ?? 1000,
      persistent: params.temporal?.persistent ?? true,
      persistenceDuration: params.temporal?.persistenceDuration ?? 0,
      effectWindow: params.temporal?.effectWindow ?? 300000,
    },
    conditions: [],
    evidence: params.evidence
      ? [
          {
            type: 'observation',
            description: params.evidence,
            strength: 0.5,
            timestamp: new Date().toISOString(),
          },
        ]
      : [],
    createdAt: new Date().toISOString(),
  };

  graph.edges.set(edge.id, edge);
  graph.updatedAt = new Date().toISOString();
  state.stats.totalEdges++;

  // Recompute topological order
  graph.topologicalOrder = computeTopologicalOrder(graph);
  graph.isValid = graph.topologicalOrder.length === graph.variables.size;

  await saveCausalState();

  const fromVar = graph.variables.get(params.from);
  const toVar = graph.variables.get(params.to);

  MollyLogger.debug(
    `[CAUSAL] Added edge: ${fromVar?.name} -[${params.mechanism}]-> ${toVar?.name}`,
    'causal-reasoning',
    { edgeId: edge.id, strength: edge.strength }
  );

  return edge;
}

/**
 * Check if adding an edge would create a cycle.
 */
function wouldCreateCycle(
  graph: CausalGraph,
  from: string,
  to: string
): boolean {
  // If 'to' can reach 'from', adding from->to would create a cycle
  const visited = new Set<string>();
  const stack = [to];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === from) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    // Find all variables reachable from current
    const edgeEntries = Array.from(graph.edges.entries());
    for (const [, edge] of edgeEntries) {
      if (edge.from === current) {
        stack.push(edge.to);
      }
    }
  }

  return false;
}

/**
 * Compute topological order of variables using Kahn's algorithm.
 */
function computeTopologicalOrder(graph: CausalGraph): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // Initialize
  const varEntries = Array.from(graph.variables.entries());
  for (const [varId] of varEntries) {
    inDegree.set(varId, 0);
    adjacency.set(varId, []);
  }

  // Build adjacency list and count in-degrees
  const edgeEntries = Array.from(graph.edges.entries());
  for (const [, edge] of edgeEntries) {
    adjacency.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
  }

  // Start with nodes that have no incoming edges
  const queue: string[] = [];
  const degreeEntries = Array.from(inDegree.entries());
  for (const [varId, degree] of degreeEntries) {
    if (degree === 0) {
      queue.push(varId);
    }
  }

  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);

    for (const neighbor of adjacency.get(current) || []) {
      const newDegree = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  return order;
}

// ═══════════════════════════════════════════════════════════════════════════
// DO-CALCULUS OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Answer a causal query: What is P(Y | do(X=x), Z=z)?
 * This is the core of causal reasoning.
 */
export async function queryCausal(
  graphId: string,
  params: {
    target: string; // Y
    intervention?: {
      // do(X=x)
      variable: string;
      value: unknown;
    };
    evidence?: Record<string, unknown>; // Z=z
  }
): Promise<CausalQueryResult> {
  await ensureInitialized();

  const graph = state.graphs.get(graphId);
  if (!graph) {
    return {
      query: `P(${params.target} | ...)`,
      type: params.intervention ? 'interventional' : 'observational',
      targetVariable: params.target,
      evidence: params.evidence || {},
      effect: { direction: 'unknown', magnitude: 0, confidence: 0 },
      causalPath: [],
      confounders: [],
      mediators: [],
      reasoning: ['Graph not found'],
    };
  }

  const reasoning: string[] = [];
  const queryType = params.intervention ? 'interventional' : 'observational';

  reasoning.push(`Query type: ${queryType}`);

  // Find causal paths
  const causalPath = params.intervention
    ? findCausalPath(graph, params.intervention.variable, params.target)
    : [];

  // Identify confounders (common causes)
  const confounders = params.intervention
    ? findConfounders(graph, params.intervention.variable, params.target)
    : [];

  // Identify mediators (variables on causal path)
  const mediators = causalPath.length > 2 ? causalPath.slice(1, -1) : [];

  // Compute effect
  let effect: {
    direction: 'positive' | 'negative' | 'none' | 'unknown';
    magnitude: number;
    confidence: number;
  } = { direction: 'unknown', magnitude: 0, confidence: 0 };

  if (params.intervention && causalPath.length > 0) {
    reasoning.push(
      `Found causal path: ${causalPath.map((v) => graph.variables.get(v)?.name || v).join(' → ')}`
    );

    // Compute effect by multiplying edge strengths along path
    let pathStrength = 1;
    let positiveEffect = true;

    for (let i = 0; i < causalPath.length - 1; i++) {
      const edge = findEdge(graph, causalPath[i], causalPath[i + 1]);
      if (edge) {
        pathStrength *= edge.strength;
        if (edge.mechanism === 'preventive') {
          positiveEffect = !positiveEffect;
        }
      }
    }

    // Account for confounders (reduce confidence)
    const confoundingPenalty = confounders.length * 0.1;

    effect = {
      direction: positiveEffect ? 'positive' : 'negative',
      magnitude: Math.max(0, pathStrength - confoundingPenalty),
      confidence: Math.max(0.1, 0.7 - confounders.length * 0.15),
    };

    if (confounders.length > 0) {
      reasoning.push(
        `Confounders identified: ${confounders.map((v) => graph.variables.get(v)?.name || v).join(', ')}`
      );
      reasoning.push('Effect estimate may be biased by confounding');
    }
  } else if (!params.intervention && params.evidence) {
    reasoning.push(
      'Observational query — cannot infer causation from correlation'
    );
    effect = {
      direction: 'unknown',
      magnitude: 0.5,
      confidence: 0.3,
    };
  }

  reasoning.push(
    `Estimated effect: ${effect.direction} (magnitude: ${effect.magnitude.toFixed(2)}, confidence: ${effect.confidence.toFixed(2)})`
  );

  const result: CausalQueryResult = {
    query: params.intervention
      ? `P(${params.target} | do(${params.intervention.variable}=${params.intervention.value}))`
      : `P(${params.target} | evidence)`,
    type: queryType,
    targetVariable: params.target,
    evidence: params.evidence || {},
    intervention: params.intervention,
    effect,
    causalPath: causalPath.map((v) => graph.variables.get(v)?.name || v),
    confounders: confounders.map((v) => graph.variables.get(v)?.name || v),
    mediators: mediators.map((v) => graph.variables.get(v)?.name || v),
    reasoning,
  };

  // Cache result
  const cacheKey = JSON.stringify({ graphId, params });
  state.queryCache.set(cacheKey, result);
  if (state.queryCache.size > MAX_QUERY_CACHE) {
    const firstKey = state.queryCache.keys().next().value;
    if (firstKey) state.queryCache.delete(firstKey);
  }

  return result;
}

/**
 * Find causal path from source to target using BFS.
 */
function findCausalPath(
  graph: CausalGraph,
  source: string,
  target: string
): string[] {
  const visited = new Set<string>();
  const queue: Array<{ node: string; path: string[] }> = [
    { node: source, path: [source] },
  ];

  while (queue.length > 0) {
    const { node, path } = queue.shift()!;

    if (node === target) {
      return path;
    }

    if (visited.has(node)) continue;
    visited.add(node);

    // Find outgoing edges
    const edgeEntries = Array.from(graph.edges.entries());
    for (const [, edge] of edgeEntries) {
      if (edge.from === node && !visited.has(edge.to)) {
        queue.push({ node: edge.to, path: [...path, edge.to] });
      }
    }
  }

  return [];
}

/**
 * Find confounders — common causes of both X and Y.
 */
function findConfounders(
  graph: CausalGraph,
  treatment: string,
  outcome: string
): string[] {
  const confounders: string[] = [];

  // A confounder is a variable that causes both treatment and outcome
  // (and is not on the causal path from treatment to outcome)
  const causalPath = new Set(findCausalPath(graph, treatment, outcome));

  const varEntries = Array.from(graph.variables.entries());
  for (const [varId] of varEntries) {
    if (varId === treatment || varId === outcome) continue;
    if (causalPath.has(varId)) continue; // Mediator, not confounder

    // Check if this variable causes both treatment and outcome
    const causeTreatment = hasPath(graph, varId, treatment);
    const causeOutcome = hasPath(graph, varId, outcome);

    if (causeTreatment && causeOutcome) {
      confounders.push(varId);
    }
  }

  return confounders;
}

/**
 * Check if there's a path from source to target.
 */
function hasPath(graph: CausalGraph, source: string, target: string): boolean {
  return findCausalPath(graph, source, target).length > 0;
}

/**
 * Find edge between two variables.
 */
function findEdge(
  graph: CausalGraph,
  from: string,
  to: string
): CausalEdge | undefined {
  const edgeEntries = Array.from(graph.edges.entries());
  for (const [, edge] of edgeEntries) {
    if (edge.from === from && edge.to === to) {
      return edge;
    }
  }
  return undefined;
}

/**
 * Perform an intervention on the graph.
 */
export async function doIntervention(
  graphId: string,
  params: {
    variableId: string;
    value: unknown;
    type?: InterventionType;
    observe?: string[]; // Variables to observe after intervention
  }
): Promise<Intervention> {
  await ensureInitialized();

  const graph = state.graphs.get(graphId);
  const variable = graph?.variables.get(params.variableId);

  const intervention: Intervention = {
    id: generateId('intv'),
    variableId: params.variableId,
    setValue: params.value,
    type: params.type || 'atomic',
    performed: true,
    timestamp: new Date().toISOString(),
    observedEffects: [],
  };

  if (variable) {
    // Record the before value
    const beforeValue = variable.currentValue;

    // Set the value (this is the "do" operation)
    variable.currentValue = params.value;
    variable.valueConfidence = 1.0;
    variable.updatedAt = new Date().toISOString();

    // In a real system, we would observe downstream effects here
    // For now, record the direct effect
    intervention.observedEffects.push({
      variableId: params.variableId,
      valueBefore: beforeValue,
      valueAfter: params.value,
      delay: 0,
      confidence: 1.0,
    });
  }

  state.interventions.push(intervention);
  state.stats.totalInterventions++;

  // Prune old interventions
  if (state.interventions.length > MAX_INTERVENTIONS) {
    state.interventions = state.interventions.slice(-MAX_INTERVENTIONS);
  }

  await saveCausalState();

  MollyLogger.info(
    `[CAUSAL] Intervention: do(${variable?.name || params.variableId} = ${params.value})`,
    'causal-reasoning',
    { interventionId: intervention.id }
  );

  return intervention;
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPORAL REASONING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Record a temporal sequence of events.
 */
export async function recordSequence(params: {
  events: Array<{
    variableId: string;
    value: unknown;
    timeOffset: number;
  }>;
  causalInterpretation?: string;
}): Promise<TemporalSequence> {
  await ensureInitialized();

  const sequence: TemporalSequence = {
    id: generateId('seq'),
    events: params.events.map((e) => ({
      ...e,
      confidence: 0.8,
    })),
    causalInterpretation: params.causalInterpretation || '',
    causalConfidence: 0.5,
    validated: false,
    observationCount: 1,
    firstObserved: new Date().toISOString(),
    lastObserved: new Date().toISOString(),
  };

  state.sequences.set(sequence.id, sequence);

  // Check if this matches an existing pattern
  await matchPatterns(sequence);

  // Prune old sequences
  if (state.sequences.size > MAX_SEQUENCES) {
    const oldest = Array.from(state.sequences.values()).sort(
      (a, b) =>
        new Date(a.lastObserved).getTime() - new Date(b.lastObserved).getTime()
    )[0];
    if (oldest) state.sequences.delete(oldest.id);
  }

  await saveCausalState();

  return sequence;
}

/**
 * Match a sequence against known patterns.
 */
async function matchPatterns(sequence: TemporalSequence): Promise<void> {
  const patternEntries = Array.from(state.patterns.entries());
  for (const [, pattern] of patternEntries) {
    // Check if sequence starts with pattern triggers
    const firstEvent = sequence.events[0];
    if (!firstEvent) continue;

    if (pattern.triggers.includes(firstEvent.variableId)) {
      // Check if subsequent events match expected sequence
      let matches = true;
      for (
        let i = 0;
        i < pattern.expectedSequence.length && i < sequence.events.length - 1;
        i++
      ) {
        const expected = pattern.expectedSequence[i];
        const actual = sequence.events[i + 1];

        if (!actual || actual.variableId !== expected.variableId) {
          matches = false;
          break;
        }

        // Check timing within tolerance
        const timingDiff = Math.abs(actual.timeOffset - expected.expectedDelay);
        if (timingDiff > expected.toleranceMs) {
          matches = false;
          break;
        }
      }

      if (matches) {
        pattern.observationCount++;
        pattern.reliability =
          pattern.observationCount /
          (pattern.observationCount + pattern.violationCount);
        sequence.validated = true;
        sequence.causalConfidence = Math.min(
          0.9,
          sequence.causalConfidence + 0.1
        );
      } else {
        pattern.violationCount++;
        pattern.reliability =
          pattern.observationCount /
          (pattern.observationCount + pattern.violationCount);
      }
    }
  }
}

/**
 * Create a temporal pattern from observed sequences.
 */
export async function createPattern(params: {
  name: string;
  description: string;
  triggers: string[];
  expectedSequence: Array<{
    variableId: string;
    expectedValue: unknown;
    expectedDelay: number;
    toleranceMs?: number;
  }>;
  outcomeVariable: string;
}): Promise<TemporalPattern> {
  await ensureInitialized();

  const pattern: TemporalPattern = {
    id: generateId('pattern'),
    name: params.name,
    description: params.description,
    triggers: params.triggers,
    expectedSequence: params.expectedSequence.map((s) => ({
      ...s,
      toleranceMs: s.toleranceMs ?? 5000,
    })),
    outcomeVariable: params.outcomeVariable,
    reliability: 0.5,
    observationCount: 0,
    violationCount: 0,
  };

  state.patterns.set(pattern.id, pattern);
  await saveCausalState();

  MollyLogger.info(
    `[CAUSAL] Created pattern: "${params.name}"`,
    'causal-reasoning',
    { patternId: pattern.id }
  );

  return pattern;
}

/**
 * Predict when an effect will occur based on temporal patterns.
 */
export async function predictTiming(
  graphId: string,
  params: {
    trigger: string;
    target: string;
  }
): Promise<{
  expectedDelay: number;
  minDelay: number;
  maxDelay: number;
  confidence: number;
  basedOn: string;
}> {
  await ensureInitialized();

  const graph = state.graphs.get(graphId);
  if (!graph) {
    return {
      expectedDelay: 0,
      minDelay: 0,
      maxDelay: 0,
      confidence: 0,
      basedOn: 'no graph found',
    };
  }

  // Find edge(s) on causal path
  const path = findCausalPath(graph, params.trigger, params.target);
  if (path.length === 0) {
    return {
      expectedDelay: 0,
      minDelay: 0,
      maxDelay: 0,
      confidence: 0,
      basedOn: 'no causal path',
    };
  }

  // Sum up temporal properties along path
  let totalMin = 0;
  let totalMax = 0;
  let totalExpected = 0;
  let edgeCount = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const edge = findEdge(graph, path[i], path[i + 1]);
    if (edge) {
      totalMin += edge.temporal.minDelay;
      totalMax += edge.temporal.maxDelay;
      totalExpected += edge.temporal.expectedDelay;
      edgeCount++;
    }
  }

  return {
    expectedDelay: totalExpected,
    minDelay: totalMin,
    maxDelay: totalMax,
    confidence: edgeCount > 0 ? 0.6 : 0,
    basedOn: `${edgeCount} edge(s) on causal path`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STATUS & OBSERVABILITY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get causal reasoning status.
 */
export function getCausalStatus(): {
  totalGraphs: number;
  totalVariables: number;
  totalEdges: number;
  totalInterventions: number;
  totalPatterns: number;
  activeGraph: string | null;
  queryAccuracy: number;
} {
  return {
    totalGraphs: state.graphs.size,
    totalVariables: state.stats.totalVariables,
    totalEdges: state.stats.totalEdges,
    totalInterventions: state.stats.totalInterventions,
    totalPatterns: state.patterns.size,
    activeGraph: state.activeGraphId
      ? state.graphs.get(state.activeGraphId)?.name || state.activeGraphId
      : null,
    queryAccuracy: state.stats.queryAccuracy,
  };
}

/**
 * Get a graph by ID.
 */
export function getGraph(graphId: string): CausalGraph | undefined {
  return state.graphs.get(graphId);
}

/**
 * Get all graphs.
 */
export function getAllGraphs(): CausalGraph[] {
  return Array.from(state.graphs.values());
}

/**
 * Get active graph.
 */
export function getActiveGraph(): CausalGraph | undefined {
  if (!state.activeGraphId) return undefined;
  return state.graphs.get(state.activeGraphId);
}

/**
 * Set active graph.
 */
export async function setActiveGraph(graphId: string): Promise<boolean> {
  if (!state.graphs.has(graphId)) return false;
  state.activeGraphId = graphId;
  await saveCausalState();
  return true;
}

/**
 * Get recent interventions.
 */
export function getRecentInterventions(limit: number = 10): Intervention[] {
  return state.interventions.slice(-limit).reverse();
}

/**
 * Get all patterns.
 */
export function getPatterns(): TemporalPattern[] {
  return Array.from(state.patterns.values());
}

/**
 * Build context for autonomous cycle.
 */
export function buildCausalContext(): string {
  const status = getCausalStatus();
  const activeGraph = getActiveGraph();

  const lines = [
    `Causal Reasoning:`,
    `  Graphs: ${status.totalGraphs}`,
    `  Variables: ${status.totalVariables}`,
    `  Edges: ${status.totalEdges}`,
    `  Patterns: ${status.totalPatterns}`,
  ];

  if (activeGraph) {
    lines.push(
      `  Active: "${activeGraph.name}" (${activeGraph.variables.size} vars, ${activeGraph.edges.size} edges)`
    );
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION & PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

const CAUSAL_COLLECTION = 'system';
const CAUSAL_DOC_ID = 'causal_reasoning';

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  await loadCausalState();
  initialized = true;
}

async function saveCausalState(): Promise<void> {
  try {
    state.metadata.lastUpdated = new Date().toISOString();

    const storage = getStorageRouter();
    await storage.set(CAUSAL_COLLECTION, CAUSAL_DOC_ID, {
      graphs: Array.from(state.graphs.entries()).map(([id, graph]) => [
        id,
        {
          ...graph,
          variables: Array.from(graph.variables.entries()),
          edges: Array.from(graph.edges.entries()),
        },
      ]),
      activeGraphId: state.activeGraphId,
      interventions: state.interventions.slice(-50),
      sequences: Array.from(state.sequences.entries()),
      patterns: Array.from(state.patterns.entries()),
      stats: state.stats,
      metadata: state.metadata,
      savedAt: new Date().toISOString(),
    });
  } catch (err) {
    MollyLogger.warn(
      `[CAUSAL] Failed to save: ${err instanceof Error ? err.message : String(err)}`,
      'causal-reasoning'
    );
  }
}

async function loadCausalState(): Promise<void> {
  try {
    const storage = getStorageRouter();
    const doc = await storage.get(CAUSAL_COLLECTION, CAUSAL_DOC_ID);

    if (doc?.data) {
      // Restore graphs with their Maps
      if (Array.isArray(doc.data.graphs)) {
        state.graphs = new Map();
        for (const [id, graphData] of doc.data.graphs) {
          const graph: CausalGraph = {
            ...graphData,
            variables: new Map(graphData.variables || []),
            edges: new Map(graphData.edges || []),
          };
          state.graphs.set(id, graph);
        }
      }

      if (doc.data.activeGraphId) {
        state.activeGraphId = doc.data.activeGraphId;
      }

      if (Array.isArray(doc.data.interventions)) {
        state.interventions = doc.data.interventions;
      }

      if (Array.isArray(doc.data.sequences)) {
        state.sequences = new Map(doc.data.sequences);
      }

      if (Array.isArray(doc.data.patterns)) {
        state.patterns = new Map(doc.data.patterns);
      }

      if (doc.data.stats) {
        Object.assign(state.stats, doc.data.stats);
      }

      MollyLogger.info(
        `[CAUSAL] Loaded ${state.graphs.size} graphs, ${state.patterns.size} patterns`,
        'causal-reasoning'
      );
    }
  } catch (err) {
    MollyLogger.warn(
      `[CAUSAL] Failed to load: ${err instanceof Error ? err.message : String(err)}`,
      'causal-reasoning'
    );
  }
}

/**
 * Initialize with foundational causal graph.
 */
export async function initializeMollyCausalModel(): Promise<void> {
  // Create core graph for Molly's understanding of her environment
  const graph = await createGraph({
    name: 'Core Environment',
    description: "Molly's causal model of her immediate environment",
    domain: 'self-world',
  });

  // Core variables
  const userInput = await addVariable(graph.id, {
    name: 'User Input',
    description: 'Messages and requests from Eric or others',
    type: 'categorical',
    observable: true,
    manipulable: false,
  });

  const processing = await addVariable(graph.id, {
    name: 'Processing',
    description: "Molly's cognitive processing",
    type: 'continuous',
    observable: true,
    manipulable: true,
  });

  const response = await addVariable(graph.id, {
    name: 'Response',
    description: "Molly's generated response",
    type: 'categorical',
    observable: true,
    manipulable: true,
  });

  const userSatisfaction = await addVariable(graph.id, {
    name: 'User Satisfaction',
    description: 'How satisfied the user is with the response',
    type: 'ordinal',
    domain: {
      type: 'ordinal',
      values: ['unhappy', 'neutral', 'satisfied', 'delighted'],
    },
    observable: false, // Molly must infer this
    manipulable: false,
  });

  const tokens = await addVariable(graph.id, {
    name: 'Token Budget',
    description: 'Available tokens for processing',
    type: 'count',
    observable: true,
    manipulable: false,
  });

  // Core edges
  if (userInput && processing) {
    await addCausalEdge(graph.id, {
      from: userInput.id,
      to: processing.id,
      mechanism: 'deterministic',
      strength: 1.0,
      confidence: 1.0,
      evidence: 'User input always triggers processing',
    });
  }

  if (processing && response) {
    await addCausalEdge(graph.id, {
      from: processing.id,
      to: response.id,
      mechanism: 'deterministic',
      strength: 0.9,
      confidence: 0.95,
      temporal: { minDelay: 100, maxDelay: 30000, expectedDelay: 2000 },
      evidence: 'Processing produces response',
    });
  }

  if (response && userSatisfaction) {
    await addCausalEdge(graph.id, {
      from: response.id,
      to: userSatisfaction.id,
      mechanism: 'probabilistic',
      strength: 0.7,
      confidence: 0.6,
      evidence: 'Response quality affects satisfaction',
    });
  }

  if (tokens && processing) {
    await addCausalEdge(graph.id, {
      from: tokens.id,
      to: processing.id,
      mechanism: 'enabling',
      strength: 0.8,
      confidence: 0.9,
      evidence: 'Tokens enable processing depth',
    });
  }

  MollyLogger.info(
    '[CAUSAL] Foundational causal model initialized',
    'causal-reasoning'
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

const CausalReasoning = {
  // Graph construction
  createGraph,
  addVariable,
  addCausalEdge,

  // do-calculus
  queryCausal,
  doIntervention,

  // Temporal reasoning
  recordSequence,
  createPattern,
  predictTiming,

  // Status
  getCausalStatus,
  getGraph,
  getAllGraphs,
  getActiveGraph,
  setActiveGraph,
  getRecentInterventions,
  getPatterns,
  buildCausalContext,

  // Init
  initializeMollyCausalModel,
};

export default CausalReasoning;
