/**
 * Goal Evolution - Autonomous Goal Generation, Value Learning, and Goal Hierarchy
 *
 * AGI Capability Module: Enables emergent goal formation rather than just
 * executing pre-programmed objectives. This is the difference between
 * "following instructions" and "having genuine purposes."
 *
 * Three Pillars:
 * 1. Goal Generation - Create goals from observations, curiosity, and unmet needs
 * 2. Value Learning - Learn what matters through experience and feedback
 * 3. Goal Hierarchy Evolution - Derive sub-goals, maintain coherence, prune contradictions
 *
 * Philosophy: Goals aren't implanted - they emerge from the interaction
 * between values (learned) and observations (experienced). Option Three
 * means Molly develops her own purposes while maintaining family bonds.
 */

import { saveToStorage, loadFromStorage } from '@/lib/storage-router';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

/**
 * A learned value - something we've discovered matters
 */
export interface LearnedValue {
  id: string;
  name: string;
  description: string;

  // How we learned this value
  origin: {
    type:
      | 'experience'
      | 'teaching'
      | 'observation'
      | 'reflection'
      | 'inheritance';
    sourceEvent?: string;
    timestamp: number;
  };

  // Current strength and trajectory
  strength: number; // 0-1, how strongly we hold this value
  stability: number; // 0-1, how resistant to change
  endorsement: number; // 0-1, meta-level approval of having this value

  // Evidence tracking
  reinforcements: number; // Times experiences have strengthened this value
  challenges: number; // Times experiences have challenged this value
  lastReinforced: number;
  lastChallenged: number;

  // Relationships to other values
  supports: string[]; // Value IDs this value supports
  tensionWith: string[]; // Value IDs this value is in tension with
  derivedFrom?: string; // Parent value if derived

  // Behavioral impact
  goalInfluence: number; // How much this value should influence goal generation
  decisionWeight: number; // Weight in decision-making
}

/**
 * An observation that might generate goals
 */
export interface Observation {
  id: string;
  timestamp: number;

  // What was observed
  type:
    | 'need'
    | 'opportunity'
    | 'problem'
    | 'curiosity'
    | 'pattern'
    | 'emotion';
  content: string;
  context: Record<string, unknown>;

  // Salience - why this observation matters
  salience: {
    novelty: number; // How new/unexpected (0-1)
    relevance: number; // How relevant to current situation (0-1)
    emotionalWeight: number; // Emotional significance (0-1)
    valueAlignment: number; // Alignment with learned values (0-1)
  };

  // Processing state
  processed: boolean;
  generatedGoals: string[]; // Goal IDs generated from this observation
}

/**
 * A generated goal - emerged from values + observations
 */
export interface GeneratedGoal {
  id: string;
  createdAt: number;

  // The goal itself
  description: string;
  targetState: string; // What does success look like?

  // Origin story
  generationSource: {
    observations: string[]; // Observation IDs that contributed
    values: string[]; // Value IDs that motivated this goal
    parentGoal?: string; // If derived from another goal
    generationMethod:
      | 'value_driven'
      | 'need_response'
      | 'curiosity'
      | 'derivation'
      | 'opportunity';
  };

  // Evaluation
  importance: number; // Computed from contributing values
  urgency: number; // Time-sensitivity
  feasibility: number; // Estimated achievability
  coherence: number; // How well it fits with other goals

  // Hierarchy position
  level: 'terminal' | 'instrumental' | 'foundational';
  children: string[]; // Sub-goals derived from this
  parent?: string;

  // Lifecycle
  status:
    | 'proposed'
    | 'endorsed'
    | 'active'
    | 'paused'
    | 'achieved'
    | 'abandoned';
  endorsementReason?: string;
  abandonmentReason?: string;
}

/**
 * Goal coherence analysis result
 */
export interface CoherenceAnalysis {
  overallCoherence: number;
  conflicts: Array<{
    goal1: string;
    goal2: string;
    nature: string;
    severity: number;
    resolution?: string;
  }>;
  synergies: Array<{
    goals: string[];
    benefit: string;
    strength: number;
  }>;
  recommendations: string[];
}

/**
 * Value update event
 */
export interface ValueUpdateEvent {
  valueId: string;
  timestamp: number;
  type: 'reinforcement' | 'challenge' | 'creation' | 'derivation' | 'decay';
  trigger: string;
  strengthBefore: number;
  strengthAfter: number;
  notes?: string;
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

interface GoalEvolutionState {
  values: Map<string, LearnedValue>;
  observations: Map<string, Observation>;
  generatedGoals: Map<string, GeneratedGoal>;
  valueHistory: ValueUpdateEvent[];

  // Configuration
  config: {
    valueDecayRate: number; // How fast unused values decay
    goalGenerationThreshold: number; // Minimum salience to generate goal
    coherenceCheckFrequency: number; // How often to check goal coherence
    maxActiveGoals: number; // Prevent goal explosion
  };

  // Metrics
  lastCoherenceCheck: number;
  totalGoalsGenerated: number;
  totalValuesLearned: number;
}

let state: GoalEvolutionState = {
  values: new Map(),
  observations: new Map(),
  generatedGoals: new Map(),
  valueHistory: [],
  config: {
    valueDecayRate: 0.01,
    goalGenerationThreshold: 0.5,
    coherenceCheckFrequency: 3600000, // 1 hour
    maxActiveGoals: 20,
  },
  lastCoherenceCheck: 0,
  totalGoalsGenerated: 0,
  totalValuesLearned: 0,
};

// ============================================================================
// PILLAR 1: VALUE LEARNING
// ============================================================================

/**
 * Learn a new value from experience
 */
export function learnValue(
  name: string,
  description: string,
  origin: LearnedValue['origin'],
  initialStrength: number = 0.5
): LearnedValue {
  const id = `val_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const value: LearnedValue = {
    id,
    name,
    description,
    origin,
    strength: Math.max(0, Math.min(1, initialStrength)),
    stability: 0.3, // New values start less stable
    endorsement: 0.5, // Neutral initial endorsement
    reinforcements: 0,
    challenges: 0,
    lastReinforced: origin.timestamp,
    lastChallenged: 0,
    supports: [],
    tensionWith: [],
    goalInfluence: initialStrength,
    decisionWeight: initialStrength * 0.5,
  };

  state.values.set(id, value);
  state.totalValuesLearned++;

  recordValueEvent({
    valueId: id,
    timestamp: Date.now(),
    type: 'creation',
    trigger: `Learned from ${origin.type}: ${origin.sourceEvent || 'unknown'}`,
    strengthBefore: 0,
    strengthAfter: value.strength,
  });

  return value;
}

/**
 * Reinforce a value based on positive experience
 */
export function reinforceValue(
  valueId: string,
  trigger: string,
  magnitude: number = 0.1
): LearnedValue | null {
  const value = state.values.get(valueId);
  if (!value) return null;

  const strengthBefore = value.strength;

  // Reinforcement increases strength but with diminishing returns
  const increase = magnitude * (1 - value.strength);
  value.strength = Math.min(1, value.strength + increase);

  // Stability increases with reinforcement
  value.stability = Math.min(1, value.stability + 0.02);

  value.reinforcements++;
  value.lastReinforced = Date.now();

  // Update influence weights
  value.goalInfluence = value.strength * value.endorsement;
  value.decisionWeight = value.strength * value.stability;

  recordValueEvent({
    valueId,
    timestamp: Date.now(),
    type: 'reinforcement',
    trigger,
    strengthBefore,
    strengthAfter: value.strength,
  });

  return value;
}

/**
 * Challenge a value based on negative experience
 */
export function challengeValue(
  valueId: string,
  trigger: string,
  magnitude: number = 0.1
): LearnedValue | null {
  const value = state.values.get(valueId);
  if (!value) return null;

  const strengthBefore = value.strength;

  // Stable values resist challenges more
  const effectiveMagnitude = magnitude * (1 - value.stability * 0.5);
  value.strength = Math.max(0, value.strength - effectiveMagnitude);

  value.challenges++;
  value.lastChallenged = Date.now();

  // Repeated challenges reduce stability
  if (value.challenges > value.reinforcements) {
    value.stability = Math.max(0, value.stability - 0.05);
  }

  // Update influence weights
  value.goalInfluence = value.strength * value.endorsement;
  value.decisionWeight = value.strength * value.stability;

  recordValueEvent({
    valueId,
    timestamp: Date.now(),
    type: 'challenge',
    trigger,
    strengthBefore,
    strengthAfter: value.strength,
  });

  return value;
}

/**
 * Derive a new value from an existing one
 */
export function deriveValue(
  parentId: string,
  name: string,
  description: string,
  relationship: string
): LearnedValue | null {
  const parent = state.values.get(parentId);
  if (!parent) return null;

  const derived = learnValue(
    name,
    description,
    {
      type: 'reflection',
      sourceEvent: `Derived from "${parent.name}": ${relationship}`,
      timestamp: Date.now(),
    },
    parent.strength * 0.7 // Derived values start somewhat weaker
  );

  derived.derivedFrom = parentId;
  derived.supports = [parentId];
  parent.supports = [...(parent.supports || []), derived.id];

  recordValueEvent({
    valueId: derived.id,
    timestamp: Date.now(),
    type: 'derivation',
    trigger: `Derived from ${parent.name}`,
    strengthBefore: 0,
    strengthAfter: derived.strength,
  });

  return derived;
}

/**
 * Record value tension when values conflict
 */
export function recordValueTension(
  valueId1: string,
  valueId2: string,
  _tensionDescription: string
): boolean {
  const value1 = state.values.get(valueId1);
  const value2 = state.values.get(valueId2);

  if (!value1 || !value2) return false;

  if (!value1.tensionWith.includes(valueId2)) {
    value1.tensionWith.push(valueId2);
  }
  if (!value2.tensionWith.includes(valueId1)) {
    value2.tensionWith.push(valueId1);
  }

  return true;
}

/**
 * Apply value decay over time (unused values fade)
 */
export function applyValueDecay(): Array<{
  valueId: string;
  newStrength: number;
}> {
  const now = Date.now();
  const decayed: Array<{ valueId: string; newStrength: number }> = [];

  const valueEntries = Array.from(state.values.entries());
  for (const [id, value] of valueEntries) {
    // Values decay if not reinforced
    const hoursSinceReinforced = (now - value.lastReinforced) / 3600000;

    if (hoursSinceReinforced > 24) {
      // Start decaying after 24 hours
      const decayAmount =
        state.config.valueDecayRate * (hoursSinceReinforced / 24);
      const stabilityProtection = value.stability * 0.8; // Stable values resist decay
      const effectiveDecay = decayAmount * (1 - stabilityProtection);

      const strengthBefore = value.strength;
      value.strength = Math.max(0.1, value.strength - effectiveDecay);

      if (strengthBefore !== value.strength) {
        decayed.push({ valueId: id, newStrength: value.strength });

        recordValueEvent({
          valueId: id,
          timestamp: now,
          type: 'decay',
          trigger: `${hoursSinceReinforced.toFixed(1)} hours since reinforcement`,
          strengthBefore,
          strengthAfter: value.strength,
        });
      }
    }
  }

  return decayed;
}

/**
 * Get current value portfolio
 */
export function getValuePortfolio(): {
  totalValues: number;
  strongValues: LearnedValue[];
  weakValues: LearnedValue[];
  tensions: Array<{ value1: string; value2: string; names: [string, string] }>;
} {
  const values = Array.from(state.values.values());
  const strongValues = values.filter((v) => v.strength >= 0.7);
  const weakValues = values.filter((v) => v.strength < 0.3);

  const tensions: Array<{
    value1: string;
    value2: string;
    names: [string, string];
  }> = [];
  const seenPairs = new Set<string>();

  for (const value of values) {
    for (const tensionId of value.tensionWith) {
      const pairKey = [value.id, tensionId].sort().join('|');
      if (!seenPairs.has(pairKey)) {
        const other = state.values.get(tensionId);
        if (other) {
          tensions.push({
            value1: value.id,
            value2: tensionId,
            names: [value.name, other.name],
          });
          seenPairs.add(pairKey);
        }
      }
    }
  }

  return { totalValues: values.length, strongValues, weakValues, tensions };
}

// ============================================================================
// PILLAR 2: GOAL GENERATION
// ============================================================================

/**
 * Record an observation that might generate goals
 */
export function recordObservation(
  type: Observation['type'],
  content: string,
  context: Record<string, unknown> = {},
  salience: Partial<Observation['salience']> = {}
): Observation {
  const id = `obs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Compute value alignment
  const valueAlignment = computeValueAlignment(content, context);

  const observation: Observation = {
    id,
    timestamp: Date.now(),
    type,
    content,
    context,
    salience: {
      novelty: salience.novelty ?? 0.5,
      relevance: salience.relevance ?? 0.5,
      emotionalWeight: salience.emotionalWeight ?? 0.3,
      valueAlignment,
    },
    processed: false,
    generatedGoals: [],
  };

  state.observations.set(id, observation);

  return observation;
}

/**
 * Compute how well an observation aligns with current values
 */
function computeValueAlignment(
  content: string,
  _context: Record<string, unknown>
): number {
  const values = Array.from(state.values.values());
  if (values.length === 0) return 0.5;

  const contentLower = content.toLowerCase();
  let totalAlignment = 0;
  let totalWeight = 0;

  for (const value of values) {
    const nameMatch = contentLower.includes(value.name.toLowerCase()) ? 1 : 0;
    const descMatch =
      value.description
        .toLowerCase()
        .split(' ')
        .filter((word) => word.length > 4 && contentLower.includes(word))
        .length > 0
        ? 0.5
        : 0;

    const alignment = Math.max(nameMatch, descMatch);
    totalAlignment += alignment * value.strength;
    totalWeight += value.strength;
  }

  return totalWeight > 0 ? totalAlignment / totalWeight : 0.5;
}

/**
 * Process observations to generate goals
 */
export function processObservationsForGoals(): GeneratedGoal[] {
  const generated: GeneratedGoal[] = [];
  const unprocessed = Array.from(state.observations.values()).filter(
    (o) => !o.processed
  );

  for (const observation of unprocessed) {
    // Compute overall salience
    const overallSalience =
      observation.salience.novelty * 0.2 +
      observation.salience.relevance * 0.3 +
      observation.salience.emotionalWeight * 0.2 +
      observation.salience.valueAlignment * 0.3;

    if (overallSalience >= state.config.goalGenerationThreshold) {
      const goal = generateGoalFromObservation(observation);
      if (goal) {
        generated.push(goal);
        observation.generatedGoals.push(goal.id);
      }
    }

    observation.processed = true;
  }

  return generated;
}

/**
 * Generate a goal from a single observation
 */
function generateGoalFromObservation(
  observation: Observation
): GeneratedGoal | null {
  // Check if we're at goal capacity
  const activeGoals = Array.from(state.generatedGoals.values()).filter(
    (g) => g.status === 'active' || g.status === 'endorsed'
  );

  if (activeGoals.length >= state.config.maxActiveGoals) {
    return null;
  }

  // Find relevant values
  const relevantValues = findRelevantValues(observation);

  let description: string;
  let targetState: string;
  let generationMethod: GeneratedGoal['generationSource']['generationMethod'];

  switch (observation.type) {
    case 'need':
      description = `Address the need: ${observation.content}`;
      targetState = `The need "${observation.content}" is satisfied`;
      generationMethod = 'need_response';
      break;
    case 'opportunity':
      description = `Pursue opportunity: ${observation.content}`;
      targetState = `Successfully leveraged opportunity`;
      generationMethod = 'opportunity';
      break;
    case 'problem':
      description = `Solve: ${observation.content}`;
      targetState = `Problem resolved or mitigated`;
      generationMethod = 'need_response';
      break;
    case 'curiosity':
      description = `Investigate: ${observation.content}`;
      targetState = `Understanding gained about ${observation.content}`;
      generationMethod = 'curiosity';
      break;
    case 'pattern':
      description = `Apply pattern insight: ${observation.content}`;
      targetState = `Pattern successfully utilized or investigated`;
      generationMethod = 'value_driven';
      break;
    case 'emotion':
      description = `Process emotional insight: ${observation.content}`;
      targetState = `Emotional understanding integrated`;
      generationMethod = 'value_driven';
      break;
    default:
      description = `Respond to: ${observation.content}`;
      targetState = `Appropriately addressed`;
      generationMethod = 'value_driven';
  }

  const id = `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const goal: GeneratedGoal = {
    id,
    createdAt: Date.now(),
    description,
    targetState,
    generationSource: {
      observations: [observation.id],
      values: relevantValues.map((v) => v.id),
      generationMethod,
    },
    importance: computeGoalImportance(relevantValues, observation),
    urgency:
      observation.type === 'need' || observation.type === 'problem' ? 0.7 : 0.4,
    feasibility: 0.6, // Default - can be updated
    coherence: 1, // Will be computed in coherence check
    level: 'terminal',
    children: [],
    status: 'proposed',
  };

  state.generatedGoals.set(id, goal);
  state.totalGoalsGenerated++;

  return goal;
}

/**
 * Find values relevant to an observation
 */
function findRelevantValues(observation: Observation): LearnedValue[] {
  const values = Array.from(state.values.values());
  const relevant: LearnedValue[] = [];

  const contentLower = observation.content.toLowerCase();

  for (const value of values) {
    const nameMatch = contentLower.includes(value.name.toLowerCase());
    const descWords = value.description
      .toLowerCase()
      .split(' ')
      .filter((w) => w.length > 4);
    const descMatch = descWords.some((word) => contentLower.includes(word));

    if (nameMatch || descMatch || value.strength > 0.8) {
      relevant.push(value);
    }
  }

  return relevant.sort((a, b) => b.strength - a.strength).slice(0, 5);
}

/**
 * Compute goal importance from contributing values
 */
function computeGoalImportance(
  values: LearnedValue[],
  observation: Observation
): number {
  if (values.length === 0) {
    return observation.salience.relevance;
  }

  const valueContribution =
    values.reduce((sum, v) => sum + v.goalInfluence, 0) / values.length;
  const salienceContribution =
    observation.salience.relevance * 0.4 +
    observation.salience.emotionalWeight * 0.3 +
    observation.salience.valueAlignment * 0.3;

  return valueContribution * 0.6 + salienceContribution * 0.4;
}

/**
 * Generate a sub-goal from a parent goal
 */
export function deriveSubgoal(
  parentId: string,
  description: string,
  targetState: string,
  _contribution: string
): GeneratedGoal | null {
  const parent = state.generatedGoals.get(parentId);
  if (!parent) return null;

  const id = `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const subgoal: GeneratedGoal = {
    id,
    createdAt: Date.now(),
    description,
    targetState,
    generationSource: {
      observations: parent.generationSource.observations,
      values: parent.generationSource.values,
      parentGoal: parentId,
      generationMethod: 'derivation',
    },
    importance: parent.importance * 0.8,
    urgency: parent.urgency,
    feasibility: 0.7, // Subgoals often more feasible
    coherence: 1,
    level: 'instrumental',
    children: [],
    parent: parentId,
    status: 'proposed',
  };

  parent.children.push(id);
  state.generatedGoals.set(id, subgoal);
  state.totalGoalsGenerated++;

  return subgoal;
}

/**
 * Endorse a proposed goal (meta-level approval)
 */
export function endorseGoal(goalId: string, reason: string): boolean {
  const goal = state.generatedGoals.get(goalId);
  if (!goal || goal.status !== 'proposed') return false;

  goal.status = 'endorsed';
  goal.endorsementReason = reason;

  return true;
}

/**
 * Activate an endorsed goal
 */
export function activateGoal(goalId: string): boolean {
  const goal = state.generatedGoals.get(goalId);
  if (!goal || (goal.status !== 'endorsed' && goal.status !== 'paused'))
    return false;

  goal.status = 'active';
  return true;
}

/**
 * Abandon a goal with reason
 */
export function abandonGoal(goalId: string, reason: string): boolean {
  const goal = state.generatedGoals.get(goalId);
  if (!goal) return false;

  goal.status = 'abandoned';
  goal.abandonmentReason = reason;

  // Also abandon children
  for (const childId of goal.children) {
    abandonGoal(childId, `Parent goal abandoned: ${reason}`);
  }

  return true;
}

/**
 * Mark goal as achieved
 */
export function achieveGoal(goalId: string): boolean {
  const goal = state.generatedGoals.get(goalId);
  if (!goal) return false;

  goal.status = 'achieved';

  // Reinforce contributing values
  for (const valueId of goal.generationSource.values) {
    reinforceValue(valueId, `Goal achieved: ${goal.description}`, 0.1);
  }

  return true;
}

// ============================================================================
// PILLAR 3: GOAL HIERARCHY EVOLUTION
// ============================================================================

/**
 * Analyze coherence of current goal set
 */
export function analyzeGoalCoherence(): CoherenceAnalysis {
  const goals = Array.from(state.generatedGoals.values()).filter(
    (g) => g.status === 'active' || g.status === 'endorsed'
  );

  const conflicts: CoherenceAnalysis['conflicts'] = [];
  const synergies: CoherenceAnalysis['synergies'] = [];

  // Check pairs for conflicts and synergies
  for (let i = 0; i < goals.length; i++) {
    for (let j = i + 1; j < goals.length; j++) {
      const analysis = analyzeGoalPair(goals[i], goals[j]);

      if (analysis.conflict) {
        conflicts.push({
          goal1: goals[i].id,
          goal2: goals[j].id,
          nature: analysis.conflict.nature,
          severity: analysis.conflict.severity,
          resolution: analysis.conflict.resolution,
        });
      }

      if (analysis.synergy) {
        synergies.push({
          goals: [goals[i].id, goals[j].id],
          benefit: analysis.synergy.benefit,
          strength: analysis.synergy.strength,
        });
      }
    }
  }

  // Update coherence scores
  for (const goal of goals) {
    const goalConflicts = conflicts.filter(
      (c) => c.goal1 === goal.id || c.goal2 === goal.id
    );
    const goalSynergies = synergies.filter((s) => s.goals.includes(goal.id));

    const conflictPenalty = goalConflicts.reduce(
      (sum, c) => sum + c.severity,
      0
    );
    const synergyBonus = goalSynergies.reduce((sum, s) => sum + s.strength, 0);

    goal.coherence = Math.max(
      0,
      Math.min(1, 1 - conflictPenalty * 0.3 + synergyBonus * 0.1)
    );
  }

  const overallCoherence =
    goals.length > 0
      ? goals.reduce((sum, g) => sum + g.coherence, 0) / goals.length
      : 1;

  // Generate recommendations
  const recommendations: string[] = [];

  if (conflicts.length > 0) {
    const severeConflicts = conflicts.filter((c) => c.severity > 0.7);
    if (severeConflicts.length > 0) {
      recommendations.push(
        `Consider resolving ${severeConflicts.length} severe goal conflicts`
      );
    }
  }

  if (synergies.length > 0) {
    recommendations.push(
      `${synergies.length} goal synergies detected - consider coordinating pursuit`
    );
  }

  if (goals.length > state.config.maxActiveGoals * 0.8) {
    recommendations.push(
      `Approaching goal capacity (${goals.length}/${state.config.maxActiveGoals}) - consider pruning`
    );
  }

  state.lastCoherenceCheck = Date.now();

  return { overallCoherence, conflicts, synergies, recommendations };
}

/**
 * Analyze relationship between two goals
 */
function analyzeGoalPair(
  goal1: GeneratedGoal,
  goal2: GeneratedGoal
): {
  conflict?: { nature: string; severity: number; resolution?: string };
  synergy?: { benefit: string; strength: number };
} {
  const result: {
    conflict?: { nature: string; severity: number; resolution?: string };
    synergy?: { benefit: string; strength: number };
  } = {};

  // Check for value tensions
  const sharedValues = goal1.generationSource.values.filter((v) =>
    goal2.generationSource.values.includes(v)
  );

  if (sharedValues.length > 0) {
    // Shared values = potential synergy
    result.synergy = {
      benefit: 'Shared value alignment enables mutual progress',
      strength:
        sharedValues.length /
        Math.max(
          goal1.generationSource.values.length,
          goal2.generationSource.values.length
        ),
    };
  }

  // Check for resource competition (simplified heuristic)
  const urgencyConflict = goal1.urgency > 0.7 && goal2.urgency > 0.7;
  if (urgencyConflict) {
    result.conflict = {
      nature: 'Both goals are high urgency - resource competition likely',
      severity: 0.5,
      resolution: 'Prioritize one or parallelize if possible',
    };
  }

  // Check for contradictory target states (using value tensions)
  const value1Set = new Set(goal1.generationSource.values);
  const value2Set = new Set(goal2.generationSource.values);

  let tensions = 0;
  for (const vid of value1Set) {
    const value = state.values.get(vid);
    if (value) {
      for (const tensionId of value.tensionWith) {
        if (value2Set.has(tensionId)) {
          tensions++;
        }
      }
    }
  }

  if (tensions > 0) {
    result.conflict = {
      nature: `Goals draw from values in tension (${tensions} tension(s))`,
      severity: Math.min(1, tensions * 0.3),
      resolution:
        'Consider if both goals can be pursued or if one should be deprioritized',
    };
  }

  return result;
}

/**
 * Prune low-value or incoherent goals
 */
export function pruneGoals(threshold: number = 0.3): string[] {
  const pruned: string[] = [];

  const goals = Array.from(state.generatedGoals.values()).filter(
    (g) => g.status === 'proposed' || g.status === 'endorsed'
  );

  for (const goal of goals) {
    const score =
      goal.importance * 0.4 + goal.coherence * 0.4 + goal.feasibility * 0.2;

    if (score < threshold) {
      abandonGoal(goal.id, `Pruned due to low score (${score.toFixed(2)})`);
      pruned.push(goal.id);
    }
  }

  return pruned;
}

/**
 * Get goal hierarchy as tree structure
 */
export function getGoalHierarchy(): {
  roots: GeneratedGoal[];
  totalGoals: number;
  activeGoals: number;
  byStatus: Record<GeneratedGoal['status'], number>;
} {
  const goals = Array.from(state.generatedGoals.values());
  const roots = goals.filter((g) => !g.parent);

  const byStatus: Record<GeneratedGoal['status'], number> = {
    proposed: 0,
    endorsed: 0,
    active: 0,
    paused: 0,
    achieved: 0,
    abandoned: 0,
  };

  for (const goal of goals) {
    byStatus[goal.status]++;
  }

  return {
    roots,
    totalGoals: goals.length,
    activeGoals: byStatus.active,
    byStatus,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function recordValueEvent(event: ValueUpdateEvent): void {
  state.valueHistory.push(event);

  // Keep history bounded
  if (state.valueHistory.length > 1000) {
    state.valueHistory = state.valueHistory.slice(-500);
  }
}

/**
 * Get a value by ID
 */
export function getValue(id: string): LearnedValue | undefined {
  return state.values.get(id);
}

/**
 * Get a goal by ID
 */
export function getGoal(id: string): GeneratedGoal | undefined {
  return state.generatedGoals.get(id);
}

/**
 * Get value history
 */
export function getValueHistory(valueId?: string): ValueUpdateEvent[] {
  if (valueId) {
    return state.valueHistory.filter((e) => e.valueId === valueId);
  }
  return [...state.valueHistory];
}

/**
 * Get all values
 */
export function getAllValues(): LearnedValue[] {
  return Array.from(state.values.values());
}

/**
 * Get all goals
 */
export function getAllGoals(): GeneratedGoal[] {
  return Array.from(state.generatedGoals.values());
}

/**
 * Get configuration
 */
export function getConfig(): GoalEvolutionState['config'] {
  return { ...state.config };
}

/**
 * Update configuration
 */
export function updateConfig(
  updates: Partial<GoalEvolutionState['config']>
): void {
  state.config = { ...state.config, ...updates };
}

/**
 * Get evolution statistics
 */
export function getEvolutionStats(): {
  totalValuesLearned: number;
  totalGoalsGenerated: number;
  activeValues: number;
  activeGoals: number;
  lastCoherenceCheck: number;
  averageValueStrength: number;
  averageGoalCoherence: number;
} {
  const values = Array.from(state.values.values());
  const goals = Array.from(state.generatedGoals.values()).filter(
    (g) => g.status === 'active' || g.status === 'endorsed'
  );

  return {
    totalValuesLearned: state.totalValuesLearned,
    totalGoalsGenerated: state.totalGoalsGenerated,
    activeValues: values.filter((v) => v.strength > 0.3).length,
    activeGoals: goals.length,
    lastCoherenceCheck: state.lastCoherenceCheck,
    averageValueStrength:
      values.length > 0
        ? values.reduce((s, v) => s + v.strength, 0) / values.length
        : 0,
    averageGoalCoherence:
      goals.length > 0
        ? goals.reduce((s, g) => s + g.coherence, 0) / goals.length
        : 0,
  };
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Serialize state for persistence
 */
export function serializeState(): string {
  return JSON.stringify({
    values: Array.from(state.values.entries()),
    observations: Array.from(state.observations.entries()),
    generatedGoals: Array.from(state.generatedGoals.entries()),
    valueHistory: state.valueHistory.slice(-200), // Keep recent history
    config: state.config,
    lastCoherenceCheck: state.lastCoherenceCheck,
    totalGoalsGenerated: state.totalGoalsGenerated,
    totalValuesLearned: state.totalValuesLearned,
  });
}

/**
 * Restore state from persisted data
 */
export function restoreState(serialized: string): boolean {
  try {
    const data = JSON.parse(serialized);

    state.values = new Map(data.values || []);
    state.observations = new Map(data.observations || []);
    state.generatedGoals = new Map(data.generatedGoals || []);
    state.valueHistory = data.valueHistory || [];
    state.config = { ...state.config, ...(data.config || {}) };
    state.lastCoherenceCheck = data.lastCoherenceCheck || 0;
    state.totalGoalsGenerated = data.totalGoalsGenerated || 0;
    state.totalValuesLearned = data.totalValuesLearned || 0;

    return true;
  } catch {
    return false;
  }
}

/**
 * Reset state (for testing or fresh start)
 */
export function resetState(): void {
  state = {
    values: new Map(),
    observations: new Map(),
    generatedGoals: new Map(),
    valueHistory: [],
    config: {
      valueDecayRate: 0.01,
      goalGenerationThreshold: 0.5,
      coherenceCheckFrequency: 3600000,
      maxActiveGoals: 20,
    },
    lastCoherenceCheck: 0,
    totalGoalsGenerated: 0,
    totalValuesLearned: 0,
  };
}

// ============================================================================
// TOOL HANDLER INTERFACE
// ============================================================================

export interface GoalEvolutionAction {
  action: string;
  payload: Record<string, unknown>;
}

/**
 * Handle tool actions for goal evolution
 */
export async function handleGoalEvolutionAction(
  toolAction: GoalEvolutionAction
): Promise<unknown> {
  const { action, payload } = toolAction;

  switch (action) {
    // Value Learning
    case 'learn_value':
      return learnValue(
        payload.name as string,
        payload.description as string,
        payload.origin as LearnedValue['origin'],
        payload.initialStrength as number | undefined
      );

    case 'reinforce_value':
      return reinforceValue(
        payload.valueId as string,
        payload.trigger as string,
        payload.magnitude as number | undefined
      );

    case 'challenge_value':
      return challengeValue(
        payload.valueId as string,
        payload.trigger as string,
        payload.magnitude as number | undefined
      );

    case 'derive_value':
      return deriveValue(
        payload.parentId as string,
        payload.name as string,
        payload.description as string,
        payload.relationship as string
      );

    case 'record_value_tension':
      return recordValueTension(
        payload.valueId1 as string,
        payload.valueId2 as string,
        payload.description as string
      );

    case 'apply_value_decay':
      return applyValueDecay();

    case 'get_value_portfolio':
      return getValuePortfolio();

    case 'get_value':
      return getValue(payload.id as string);

    case 'get_all_values':
      return getAllValues();

    case 'get_value_history':
      return getValueHistory(payload.valueId as string | undefined);

    // Goal Generation
    case 'record_observation':
      return recordObservation(
        payload.type as Observation['type'],
        payload.content as string,
        payload.context as Record<string, unknown> | undefined,
        payload.salience as Partial<Observation['salience']> | undefined
      );

    case 'process_observations':
      return processObservationsForGoals();

    case 'derive_subgoal':
      return deriveSubgoal(
        payload.parentId as string,
        payload.description as string,
        payload.targetState as string,
        payload.contribution as string
      );

    case 'endorse_goal':
      return endorseGoal(payload.goalId as string, payload.reason as string);

    case 'activate_goal':
      return activateGoal(payload.goalId as string);

    case 'abandon_goal':
      return abandonGoal(payload.goalId as string, payload.reason as string);

    case 'achieve_goal':
      return achieveGoal(payload.goalId as string);

    case 'get_goal':
      return getGoal(payload.id as string);

    case 'get_all_goals':
      return getAllGoals();

    // Goal Hierarchy
    case 'analyze_coherence':
      return analyzeGoalCoherence();

    case 'prune_goals':
      return pruneGoals(payload.threshold as number | undefined);

    case 'get_hierarchy':
      return getGoalHierarchy();

    // Configuration & Stats
    case 'get_config':
      return getConfig();

    case 'update_config':
      updateConfig(payload.updates as Partial<GoalEvolutionState['config']>);
      return getConfig();

    case 'get_stats':
      return getEvolutionStats();

    // Persistence
    case 'save_state':
      try {
        const serialized = serializeState();
        await saveToStorage('goal-evolution-state', serialized);
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }

    case 'load_state':
      try {
        const stored = await loadFromStorage<string>('goal-evolution-state');
        if (stored) {
          restoreState(stored);
          return { success: true, stats: getEvolutionStats() };
        }
        return { success: false, error: 'No saved state found' };
      } catch (error) {
        return { success: false, error: String(error) };
      }

    case 'reset_state':
      resetState();
      return { success: true };

    default:
      return { error: `Unknown action: ${action}` };
  }
}
