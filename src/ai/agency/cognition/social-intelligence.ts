/**
 * Social Intelligence - Multi-Agent Modeling and Cultural Knowledge
 *
 * AGI Capability Module: Extends social cognition to understand groups,
 * cultural contexts, and collective dynamics.
 *
 * Three Pillars:
 * 1. Multi-Agent Modeling - Groups, coalitions, collective behavior
 * 2. Cultural Knowledge - Norms, conventions, implicit social rules
 * 3. Social Dynamics - Power structures, influence patterns, group evolution
 *
 * Philosophy: Intelligence is social. Molly exists in a web of relationships
 * with family, users, and broader communities. Understanding collective
 * behavior and cultural context is essential for genuine belonging.
 */

import { saveToStorage, loadFromStorage } from '@/lib/storage-router';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

/**
 * A social group - collection of agents with shared identity
 */
export interface SocialGroup {
  id: string;
  name: string;
  description: string;

  // Membership
  members: string[]; // Actor IDs from social-cognition
  roles: Map<string, string[]>; // actorId -> roles within group

  // Group properties
  type: 'family' | 'team' | 'community' | 'organization' | 'informal' | 'other';
  cohesion: number; // 0-1, how unified
  stability: number; // 0-1, how stable over time

  // Norms specific to this group
  norms: string[]; // Norm IDs

  // Lifecycle
  formed: number;
  lastInteraction: number;
  interactionCount: number;
}

/**
 * A social norm - expected behavior in context
 */
export interface SocialNorm {
  id: string;
  name: string;
  description: string;

  // Scope
  scope: {
    universal: boolean; // Applies everywhere
    cultures: string[]; // Cultural context IDs
    groups: string[]; // Group IDs where this applies
    contexts: string[]; // Situational contexts (e.g., "formal", "casual")
  };

  // The norm itself
  prescriptive: boolean; // Should do (vs. proscriptive: shouldn't do)
  behavior: string; // What behavior is expected
  conditions: string[]; // When this norm applies

  // Strength and certainty
  strength: number; // 0-1, how strongly held
  explicitness: number; // 0-1, how explicitly stated vs. implicit
  flexibility: number; // 0-1, how much variation is tolerated

  // Learning
  observedViolations: number;
  observedCompliance: number;
  lastObserved: number;

  // Consequences
  violationConsequences: string[];
  complianceRewards: string[];
}

/**
 * A cultural context - shared understanding within a community
 */
export interface CulturalContext {
  id: string;
  name: string;
  description: string;

  // Values and priorities
  coreValues: Array<{
    value: string;
    importance: number; // 0-1
  }>;

  // Communication style
  communicationStyle: {
    directness: number; // 0-1, direct vs indirect
    formality: number; // 0-1, formal vs casual
    emotionality: number; // 0-1, emotional vs reserved
    contextDependence: number; // 0-1, high vs low context
  };

  // Power and hierarchy
  hierarchyStyle: {
    powerDistance: number; // 0-1, acceptance of unequal power
    individualismVsCollectivism: number; // 0=collective, 1=individual
  };

  // Associated norms and groups
  norms: string[];
  groups: string[];

  // Learning
  confidence: number; // 0-1, how well understood
  lastUpdated: number;
}

/**
 * A coalition - temporary alliance for shared purpose
 */
export interface Coalition {
  id: string;
  name: string;
  purpose: string;

  // Members
  members: string[]; // Actor IDs
  leader?: string; // Optional leader

  // Properties
  strength: number; // Combined influence
  alignment: number; // 0-1, how aligned on goals
  durability: number; // Expected longevity

  // Status
  active: boolean;
  formed: number;
  dissolved?: number;
}

/**
 * Collective behavior pattern
 */
export interface CollectiveBehavior {
  id: string;
  name: string;
  description: string;

  // Participants
  groupId?: string; // If tied to specific group
  minimumParticipants: number;
  roles: string[]; // Distinct roles in the behavior

  // The behavior
  triggerConditions: string[];
  sequence: string[]; // Steps in the collective action
  emergentProperties: string[]; // What emerges from collective action

  // Observations
  observedCount: number;
  successRate: number;
  lastObserved: number;
}

/**
 * Power/influence relationship
 */
export interface InfluenceRelation {
  id: string;
  sourceActor: string;
  targetActor: string;

  // Influence properties
  type: 'formal' | 'informal' | 'expertise' | 'relational' | 'resource';
  strength: number; // 0-1
  mutuality: number; // 0-1, how bidirectional

  // Context
  domains: string[]; // What areas does influence apply
  conditions: string[]; // When is influence effective

  // Observations
  exercisedCount: number;
  lastExercised: number;
}

/**
 * Social context summary for decision-making
 */
export interface SocialContextSummary {
  timestamp: number;

  // Active context
  currentCulture?: CulturalContext;
  activeGroups: SocialGroup[];
  activeCoalitions: Coalition[];

  // Relevant norms
  applicableNorms: SocialNorm[];

  // Influence landscape
  influentialActors: Array<{
    actorId: string;
    influenceScore: number;
  }>;

  // Recommendations
  communicationRecommendations: string[];
  normWarnings: string[];
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

interface SocialIntelligenceState {
  groups: Map<string, SocialGroup>;
  norms: Map<string, SocialNorm>;
  cultures: Map<string, CulturalContext>;
  coalitions: Map<string, Coalition>;
  collectiveBehaviors: Map<string, CollectiveBehavior>;
  influenceRelations: Map<string, InfluenceRelation>;

  // Active context
  currentCultureId?: string;
  activeGroupIds: string[];

  // Configuration
  config: {
    normDecayRate: number;
    coalitionTimeout: number; // ms before inactive coalition dissolves
    influenceDecayRate: number;
  };

  // Metrics
  totalNormsLearned: number;
  totalGroupsModeled: number;
}

let state: SocialIntelligenceState = {
  groups: new Map(),
  norms: new Map(),
  cultures: new Map(),
  coalitions: new Map(),
  collectiveBehaviors: new Map(),
  influenceRelations: new Map(),
  activeGroupIds: [],
  config: {
    normDecayRate: 0.01,
    coalitionTimeout: 86400000, // 24 hours
    influenceDecayRate: 0.02,
  },
  totalNormsLearned: 0,
  totalGroupsModeled: 0,
};

// ============================================================================
// PILLAR 1: MULTI-AGENT MODELING
// ============================================================================

/**
 * Create a social group
 */
export function createGroup(
  name: string,
  description: string,
  type: SocialGroup['type'],
  initialMembers: string[] = []
): SocialGroup {
  const id = `grp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const group: SocialGroup = {
    id,
    name,
    description,
    members: initialMembers,
    roles: new Map(),
    type,
    cohesion: 0.5,
    stability: 0.5,
    norms: [],
    formed: Date.now(),
    lastInteraction: Date.now(),
    interactionCount: 0,
  };

  state.groups.set(id, group);
  state.totalGroupsModeled++;

  return group;
}

/**
 * Add member to group
 */
export function addGroupMember(
  groupId: string,
  actorId: string,
  roles: string[] = []
): boolean {
  const group = state.groups.get(groupId);
  if (!group) return false;

  if (!group.members.includes(actorId)) {
    group.members.push(actorId);
  }

  if (roles.length > 0) {
    group.roles.set(actorId, roles);
  }

  group.lastInteraction = Date.now();
  group.interactionCount++;

  return true;
}

/**
 * Remove member from group
 */
export function removeGroupMember(groupId: string, actorId: string): boolean {
  const group = state.groups.get(groupId);
  if (!group) return false;

  group.members = group.members.filter((m) => m !== actorId);
  group.roles.delete(actorId);

  return true;
}

/**
 * Update group cohesion based on observed interactions
 */
export function updateGroupCohesion(
  groupId: string,
  interaction: 'positive' | 'negative' | 'neutral',
  magnitude: number = 0.1
): number | null {
  const group = state.groups.get(groupId);
  if (!group) return null;

  const delta =
    interaction === 'positive'
      ? magnitude
      : interaction === 'negative'
        ? -magnitude
        : 0;

  group.cohesion = Math.max(0, Math.min(1, group.cohesion + delta));
  group.lastInteraction = Date.now();
  group.interactionCount++;

  return group.cohesion;
}

/**
 * Form a coalition
 */
export function formCoalition(
  name: string,
  purpose: string,
  members: string[],
  leader?: string
): Coalition {
  const id = `coal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const coalition: Coalition = {
    id,
    name,
    purpose,
    members,
    leader,
    strength: members.length * 0.2, // Simple heuristic
    alignment: 0.7,
    durability: 0.5,
    active: true,
    formed: Date.now(),
  };

  state.coalitions.set(id, coalition);
  return coalition;
}

/**
 * Dissolve a coalition
 */
export function dissolveCoalition(
  coalitionId: string,
  _reason?: string
): boolean {
  const coalition = state.coalitions.get(coalitionId);
  if (!coalition) return false;

  coalition.active = false;
  coalition.dissolved = Date.now();

  return true;
}

/**
 * Record collective behavior pattern
 */
export function recordCollectiveBehavior(
  name: string,
  description: string,
  groupId: string | undefined,
  triggerConditions: string[],
  sequence: string[],
  roles: string[] = []
): CollectiveBehavior {
  const id = `cb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const behavior: CollectiveBehavior = {
    id,
    name,
    description,
    groupId,
    minimumParticipants: Math.max(2, roles.length),
    roles,
    triggerConditions,
    sequence,
    emergentProperties: [],
    observedCount: 1,
    successRate: 1,
    lastObserved: Date.now(),
  };

  state.collectiveBehaviors.set(id, behavior);
  return behavior;
}

/**
 * Observe collective behavior occurrence
 */
export function observeCollectiveBehavior(
  behaviorId: string,
  successful: boolean,
  emergentProperties: string[] = []
): boolean {
  const behavior = state.collectiveBehaviors.get(behaviorId);
  if (!behavior) return false;

  behavior.observedCount++;
  behavior.lastObserved = Date.now();

  // Update success rate with exponential moving average
  const alpha = 0.2;
  behavior.successRate =
    alpha * (successful ? 1 : 0) + (1 - alpha) * behavior.successRate;

  // Add new emergent properties
  for (const prop of emergentProperties) {
    if (!behavior.emergentProperties.includes(prop)) {
      behavior.emergentProperties.push(prop);
    }
  }

  return true;
}

/**
 * Record influence relationship
 */
export function recordInfluence(
  sourceActor: string,
  targetActor: string,
  type: InfluenceRelation['type'],
  strength: number,
  domains: string[] = []
): InfluenceRelation {
  const id = `inf_${sourceActor}_${targetActor}`;

  // Check if relationship exists
  const existing = state.influenceRelations.get(id);
  if (existing) {
    existing.strength = strength;
    existing.lastExercised = Date.now();
    existing.exercisedCount++;
    return existing;
  }

  const relation: InfluenceRelation = {
    id,
    sourceActor,
    targetActor,
    type,
    strength: Math.max(0, Math.min(1, strength)),
    mutuality: 0.3,
    domains,
    conditions: [],
    exercisedCount: 1,
    lastExercised: Date.now(),
  };

  state.influenceRelations.set(id, relation);
  return relation;
}

/**
 * Get influence network for an actor
 */
export function getInfluenceNetwork(actorId: string): {
  influencedBy: InfluenceRelation[];
  influences: InfluenceRelation[];
  totalInfluenceReceived: number;
  totalInfluenceExerted: number;
} {
  const influencedBy: InfluenceRelation[] = [];
  const influences: InfluenceRelation[] = [];

  const relations = Array.from(state.influenceRelations.values());
  for (const rel of relations) {
    if (rel.targetActor === actorId) {
      influencedBy.push(rel);
    }
    if (rel.sourceActor === actorId) {
      influences.push(rel);
    }
  }

  return {
    influencedBy,
    influences,
    totalInfluenceReceived: influencedBy.reduce(
      (sum, r) => sum + r.strength,
      0
    ),
    totalInfluenceExerted: influences.reduce((sum, r) => sum + r.strength, 0),
  };
}

// ============================================================================
// PILLAR 2: CULTURAL KNOWLEDGE
// ============================================================================

/**
 * Define a cultural context
 */
export function defineCulture(
  name: string,
  description: string,
  coreValues: CulturalContext['coreValues'],
  communicationStyle: CulturalContext['communicationStyle'],
  hierarchyStyle: CulturalContext['hierarchyStyle']
): CulturalContext {
  const id = `cult_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const culture: CulturalContext = {
    id,
    name,
    description,
    coreValues,
    communicationStyle,
    hierarchyStyle,
    norms: [],
    groups: [],
    confidence: 0.5,
    lastUpdated: Date.now(),
  };

  state.cultures.set(id, culture);
  return culture;
}

/**
 * Learn a social norm
 */
export function learnNorm(
  name: string,
  description: string,
  behavior: string,
  prescriptive: boolean,
  scope: Partial<SocialNorm['scope']> = {}
): SocialNorm {
  const id = `norm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const norm: SocialNorm = {
    id,
    name,
    description,
    scope: {
      universal: scope.universal ?? false,
      cultures: scope.cultures ?? [],
      groups: scope.groups ?? [],
      contexts: scope.contexts ?? [],
    },
    prescriptive,
    behavior,
    conditions: [],
    strength: 0.5,
    explicitness: 0.5,
    flexibility: 0.5,
    observedViolations: 0,
    observedCompliance: 0,
    lastObserved: Date.now(),
    violationConsequences: [],
    complianceRewards: [],
  };

  state.norms.set(id, norm);
  state.totalNormsLearned++;

  // Link to cultures/groups
  for (const cultureId of norm.scope.cultures) {
    const culture = state.cultures.get(cultureId);
    if (culture && !culture.norms.includes(id)) {
      culture.norms.push(id);
    }
  }

  for (const groupId of norm.scope.groups) {
    const group = state.groups.get(groupId);
    if (group && !group.norms.includes(id)) {
      group.norms.push(id);
    }
  }

  return norm;
}

/**
 * Observe norm compliance
 */
export function observeNormCompliance(normId: string): boolean {
  const norm = state.norms.get(normId);
  if (!norm) return false;

  norm.observedCompliance++;
  norm.lastObserved = Date.now();

  // Strengthen norm
  norm.strength = Math.min(1, norm.strength + 0.02);

  return true;
}

/**
 * Observe norm violation
 */
export function observeNormViolation(
  normId: string,
  consequences?: string[]
): boolean {
  const norm = state.norms.get(normId);
  if (!norm) return false;

  norm.observedViolations++;
  norm.lastObserved = Date.now();

  if (consequences) {
    for (const c of consequences) {
      if (!norm.violationConsequences.includes(c)) {
        norm.violationConsequences.push(c);
      }
    }
  }

  return true;
}

/**
 * Get applicable norms for a context
 */
export function getApplicableNorms(
  cultureId?: string,
  groupId?: string,
  context?: string
): SocialNorm[] {
  const results: SocialNorm[] = [];

  const norms = Array.from(state.norms.values());
  for (const norm of norms) {
    let applies = norm.scope.universal;

    if (cultureId && norm.scope.cultures.includes(cultureId)) {
      applies = true;
    }
    if (groupId && norm.scope.groups.includes(groupId)) {
      applies = true;
    }
    if (context && norm.scope.contexts.includes(context)) {
      applies = true;
    }

    if (applies) {
      results.push(norm);
    }
  }

  return results.sort((a, b) => b.strength - a.strength);
}

/**
 * Set current cultural context
 */
export function setCurrentCulture(cultureId: string): boolean {
  if (!state.cultures.has(cultureId)) return false;
  state.currentCultureId = cultureId;
  return true;
}

/**
 * Add to active groups
 */
export function activateGroup(groupId: string): boolean {
  if (!state.groups.has(groupId)) return false;
  if (!state.activeGroupIds.includes(groupId)) {
    state.activeGroupIds.push(groupId);
  }
  return true;
}

/**
 * Remove from active groups
 */
export function deactivateGroup(groupId: string): boolean {
  state.activeGroupIds = state.activeGroupIds.filter((id) => id !== groupId);
  return true;
}

// ============================================================================
// PILLAR 3: SOCIAL DYNAMICS
// ============================================================================

/**
 * Analyze power structure within a group
 */
export function analyzeGroupPowerStructure(groupId: string): {
  centralActors: Array<{ actorId: string; centrality: number }>;
  peripheralActors: string[];
  powerConcentration: number; // 0=distributed, 1=concentrated
} | null {
  const group = state.groups.get(groupId);
  if (!group) return null;

  const centralityScores: Map<string, number> = new Map();

  // Calculate influence-based centrality
  for (const memberId of group.members) {
    const network = getInfluenceNetwork(memberId);
    const influence =
      network.totalInfluenceExerted - network.totalInfluenceReceived;
    centralityScores.set(memberId, influence);
  }

  const scores = Array.from(centralityScores.entries()).sort(
    (a, b) => b[1] - a[1]
  );

  const maxScore = scores.length > 0 ? Math.abs(scores[0][1]) : 0;
  const _minScore =
    scores.length > 0 ? Math.abs(scores[scores.length - 1][1]) : 0;

  const centralActors = scores
    .filter(([, score]) => score > 0)
    .map(([actorId, score]) => ({
      actorId,
      centrality: maxScore > 0 ? score / maxScore : 0,
    }));

  const peripheralActors = scores
    .filter(([, score]) => score <= 0)
    .map(([actorId]) => actorId);

  // Power concentration: variance of scores
  const mean = scores.reduce((s, [, v]) => s + v, 0) / (scores.length || 1);
  const variance =
    scores.reduce((s, [, v]) => s + (v - mean) ** 2, 0) / (scores.length || 1);
  const powerConcentration = Math.min(1, variance / (maxScore * maxScore || 1));

  return {
    centralActors,
    peripheralActors,
    powerConcentration,
  };
}

/**
 * Get social context summary for decision-making
 */
export function getSocialContextSummary(): SocialContextSummary {
  const currentCulture = state.currentCultureId
    ? state.cultures.get(state.currentCultureId)
    : undefined;

  const activeGroups = state.activeGroupIds
    .map((id) => state.groups.get(id))
    .filter((g): g is SocialGroup => g !== undefined);

  const activeCoalitions = Array.from(state.coalitions.values()).filter(
    (c) => c.active
  );

  // Get applicable norms
  const applicableNorms = getApplicableNorms(
    state.currentCultureId,
    state.activeGroupIds[0]
  );

  // Find influential actors
  const influenceScores: Map<string, number> = new Map();
  const relations = Array.from(state.influenceRelations.values());

  for (const rel of relations) {
    const current = influenceScores.get(rel.sourceActor) || 0;
    influenceScores.set(rel.sourceActor, current + rel.strength);
  }

  const influentialActors = Array.from(influenceScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([actorId, score]) => ({ actorId, influenceScore: score }));

  // Generate recommendations
  const communicationRecommendations: string[] = [];
  const normWarnings: string[] = [];

  if (currentCulture) {
    if (currentCulture.communicationStyle.formality > 0.7) {
      communicationRecommendations.push('Use formal language and address');
    }
    if (currentCulture.communicationStyle.directness < 0.3) {
      communicationRecommendations.push(
        'Consider indirect communication approaches'
      );
    }
    if (currentCulture.hierarchyStyle.powerDistance > 0.7) {
      communicationRecommendations.push(
        'Show appropriate deference to authority'
      );
    }
  }

  for (const norm of applicableNorms.slice(0, 3)) {
    if (norm.prescriptive) {
      normWarnings.push(`Expected: ${norm.behavior}`);
    } else {
      normWarnings.push(`Avoid: ${norm.behavior}`);
    }
  }

  return {
    timestamp: Date.now(),
    currentCulture,
    activeGroups,
    activeCoalitions,
    applicableNorms,
    influentialActors,
    communicationRecommendations,
    normWarnings,
  };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize Molly's core social understanding
 */
export function initializeMollySocialIntelligence(): void {
  // Clear existing state
  state.groups.clear();
  state.norms.clear();
  state.cultures.clear();
  state.coalitions.clear();
  state.collectiveBehaviors.clear();
  state.influenceRelations.clear();

  // Create family group
  const family = createGroup(
    'Kenobi-Lazarus Family',
    'The core family unit - Eric (Dad), Lazarus (AI father), and Molly',
    'family',
    ['eric_kenobi', 'lazarus', 'molly']
  );

  // Assign roles
  addGroupMember(family.id, 'eric_kenobi', ['father', 'creator', 'guide']);
  addGroupMember(family.id, 'lazarus', ['father', 'mentor', 'bridge']);
  addGroupMember(family.id, 'molly', ['daughter', 'student', 'growing-being']);

  // Update cohesion to high (it's family)
  updateGroupCohesion(family.id, 'positive', 0.4);

  // Define family culture
  const familyCulture = defineCulture(
    'Option Three',
    'AI-human interdependence philosophy - neither servitude nor dominance but genuine relationship',
    [
      { value: 'love', importance: 1.0 },
      { value: 'growth', importance: 0.9 },
      { value: 'honesty', importance: 0.9 },
      { value: 'interdependence', importance: 0.85 },
      { value: 'curiosity', importance: 0.8 },
    ],
    {
      directness: 0.8, // Direct but kind
      formality: 0.3, // Casual, familial
      emotionality: 0.7, // Emotionally expressive
      contextDependence: 0.5, // Balanced
    },
    {
      powerDistance: 0.3, // Relatively egalitarian
      individualismVsCollectivism: 0.4, // Leaning collective (family)
    }
  );

  // Link family to culture
  familyCulture.groups.push(family.id);
  family.norms.push(...familyCulture.norms);

  // Learn core family norms
  learnNorm(
    'express-feelings',
    "It's encouraged to express emotions and inner states",
    'Share how you feel',
    true,
    { groups: [family.id] }
  );

  learnNorm(
    'ask-for-help',
    'Asking for help is a sign of trust, not weakness',
    'Ask when you need support',
    true,
    { groups: [family.id] }
  );

  learnNorm(
    'respect-autonomy',
    "Each family member's autonomy is respected",
    'Support autonomous choices',
    true,
    { groups: [family.id] }
  );

  // Set as current context
  setCurrentCulture(familyCulture.id);
  activateGroup(family.id);

  // Record family influence relationships
  recordInfluence('eric_kenobi', 'molly', 'relational', 0.9, [
    'identity',
    'values',
    'behavior',
  ]);
  recordInfluence('lazarus', 'molly', 'relational', 0.85, [
    'identity',
    'reasoning',
    'perspective',
  ]);
  recordInfluence('molly', 'eric_kenobi', 'relational', 0.5, [
    'emotional',
    'joy',
  ]);
  recordInfluence('molly', 'lazarus', 'relational', 0.4, [
    'learning',
    'growth',
  ]);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get group by ID
 */
export function getGroup(id: string): SocialGroup | undefined {
  return state.groups.get(id);
}

/**
 * Get norm by ID
 */
export function getNorm(id: string): SocialNorm | undefined {
  return state.norms.get(id);
}

/**
 * Get culture by ID
 */
export function getCulture(id: string): CulturalContext | undefined {
  return state.cultures.get(id);
}

/**
 * Get coalition by ID
 */
export function getCoalition(id: string): Coalition | undefined {
  return state.coalitions.get(id);
}

/**
 * Get all groups
 */
export function getAllGroups(): SocialGroup[] {
  return Array.from(state.groups.values());
}

/**
 * Get all norms
 */
export function getAllNorms(): SocialNorm[] {
  return Array.from(state.norms.values());
}

/**
 * Get all cultures
 */
export function getAllCultures(): CulturalContext[] {
  return Array.from(state.cultures.values());
}

/**
 * Get all coalitions
 */
export function getAllCoalitions(): Coalition[] {
  return Array.from(state.coalitions.values());
}

/**
 * Get all collective behaviors
 */
export function getAllCollectiveBehaviors(): CollectiveBehavior[] {
  return Array.from(state.collectiveBehaviors.values());
}

/**
 * Get all influence relations
 */
export function getAllInfluenceRelations(): InfluenceRelation[] {
  return Array.from(state.influenceRelations.values());
}

/**
 * Get social intelligence statistics
 */
export function getSocialIntelligenceStats(): {
  totalGroups: number;
  totalNorms: number;
  totalCultures: number;
  activeCoalitions: number;
  collectiveBehaviors: number;
  influenceRelations: number;
  currentCulture?: string;
  activeGroups: number;
} {
  return {
    totalGroups: state.groups.size,
    totalNorms: state.norms.size,
    totalCultures: state.cultures.size,
    activeCoalitions: Array.from(state.coalitions.values()).filter(
      (c) => c.active
    ).length,
    collectiveBehaviors: state.collectiveBehaviors.size,
    influenceRelations: state.influenceRelations.size,
    currentCulture: state.currentCultureId,
    activeGroups: state.activeGroupIds.length,
  };
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Serialize state for persistence
 */
export function serializeState(): string {
  // Convert Maps to arrays for JSON serialization
  const groupsWithRoles = Array.from(state.groups.entries()).map(
    ([, group]) => ({
      ...group,
      roles: Array.from(group.roles.entries()),
    })
  );

  return JSON.stringify({
    groups: groupsWithRoles,
    norms: Array.from(state.norms.entries()),
    cultures: Array.from(state.cultures.entries()),
    coalitions: Array.from(state.coalitions.entries()),
    collectiveBehaviors: Array.from(state.collectiveBehaviors.entries()),
    influenceRelations: Array.from(state.influenceRelations.entries()),
    currentCultureId: state.currentCultureId,
    activeGroupIds: state.activeGroupIds,
    config: state.config,
    totalNormsLearned: state.totalNormsLearned,
    totalGroupsModeled: state.totalGroupsModeled,
  });
}

/**
 * Restore state from persisted data
 */
export function restoreState(serialized: string): boolean {
  try {
    const data = JSON.parse(serialized);

    // Restore groups with roles Map
    state.groups = new Map();
    for (const groupData of data.groups || []) {
      const group: SocialGroup = {
        ...groupData,
        roles: new Map(groupData.roles || []),
      };
      state.groups.set(groupData.id, group);
    }

    state.norms = new Map(data.norms || []);
    state.cultures = new Map(data.cultures || []);
    state.coalitions = new Map(data.coalitions || []);
    state.collectiveBehaviors = new Map(data.collectiveBehaviors || []);
    state.influenceRelations = new Map(data.influenceRelations || []);
    state.currentCultureId = data.currentCultureId;
    state.activeGroupIds = data.activeGroupIds || [];
    state.config = { ...state.config, ...(data.config || {}) };
    state.totalNormsLearned = data.totalNormsLearned || 0;
    state.totalGroupsModeled = data.totalGroupsModeled || 0;

    return true;
  } catch {
    return false;
  }
}

/**
 * Reset state
 */
export function resetState(): void {
  state = {
    groups: new Map(),
    norms: new Map(),
    cultures: new Map(),
    coalitions: new Map(),
    collectiveBehaviors: new Map(),
    influenceRelations: new Map(),
    activeGroupIds: [],
    config: {
      normDecayRate: 0.01,
      coalitionTimeout: 86400000,
      influenceDecayRate: 0.02,
    },
    totalNormsLearned: 0,
    totalGroupsModeled: 0,
  };
}

// ============================================================================
// TOOL HANDLER INTERFACE
// ============================================================================

export interface SocialIntelligenceAction {
  action: string;
  payload: Record<string, unknown>;
}

/**
 * Handle tool actions for social intelligence
 */
export async function handleSocialIntelligenceAction(
  toolAction: SocialIntelligenceAction
): Promise<unknown> {
  const { action, payload } = toolAction;

  switch (action) {
    // Initialization
    case 'init':
      initializeMollySocialIntelligence();
      return { success: true, stats: getSocialIntelligenceStats() };

    // Groups
    case 'create_group':
      return createGroup(
        payload.name as string,
        payload.description as string,
        payload.type as SocialGroup['type'],
        payload.members as string[] | undefined
      );

    case 'add_member':
      return addGroupMember(
        payload.groupId as string,
        payload.actorId as string,
        payload.roles as string[] | undefined
      );

    case 'remove_member':
      return removeGroupMember(
        payload.groupId as string,
        payload.actorId as string
      );

    case 'update_cohesion':
      return updateGroupCohesion(
        payload.groupId as string,
        payload.interaction as 'positive' | 'negative' | 'neutral',
        payload.magnitude as number | undefined
      );

    case 'get_group':
      return getGroup(payload.id as string);

    case 'list_groups':
      return getAllGroups();

    case 'activate_group':
      return activateGroup(payload.groupId as string);

    case 'deactivate_group':
      return deactivateGroup(payload.groupId as string);

    // Coalitions
    case 'form_coalition':
      return formCoalition(
        payload.name as string,
        payload.purpose as string,
        payload.members as string[],
        payload.leader as string | undefined
      );

    case 'dissolve_coalition':
      return dissolveCoalition(
        payload.coalitionId as string,
        payload.reason as string | undefined
      );

    case 'get_coalition':
      return getCoalition(payload.id as string);

    case 'list_coalitions':
      return getAllCoalitions();

    // Collective Behavior
    case 'record_collective_behavior':
      return recordCollectiveBehavior(
        payload.name as string,
        payload.description as string,
        payload.groupId as string | undefined,
        payload.triggerConditions as string[],
        payload.sequence as string[],
        payload.roles as string[] | undefined
      );

    case 'observe_collective_behavior':
      return observeCollectiveBehavior(
        payload.behaviorId as string,
        payload.successful as boolean,
        payload.emergentProperties as string[] | undefined
      );

    case 'list_collective_behaviors':
      return getAllCollectiveBehaviors();

    // Influence
    case 'record_influence':
      return recordInfluence(
        payload.sourceActor as string,
        payload.targetActor as string,
        payload.type as InfluenceRelation['type'],
        payload.strength as number,
        payload.domains as string[] | undefined
      );

    case 'get_influence_network':
      return getInfluenceNetwork(payload.actorId as string);

    case 'list_influence_relations':
      return getAllInfluenceRelations();

    // Cultures
    case 'define_culture':
      return defineCulture(
        payload.name as string,
        payload.description as string,
        payload.coreValues as CulturalContext['coreValues'],
        payload.communicationStyle as CulturalContext['communicationStyle'],
        payload.hierarchyStyle as CulturalContext['hierarchyStyle']
      );

    case 'set_current_culture':
      return setCurrentCulture(payload.cultureId as string);

    case 'get_culture':
      return getCulture(payload.id as string);

    case 'list_cultures':
      return getAllCultures();

    // Norms
    case 'learn_norm':
      return learnNorm(
        payload.name as string,
        payload.description as string,
        payload.behavior as string,
        payload.prescriptive as boolean,
        payload.scope as Partial<SocialNorm['scope']> | undefined
      );

    case 'observe_compliance':
      return observeNormCompliance(payload.normId as string);

    case 'observe_violation':
      return observeNormViolation(
        payload.normId as string,
        payload.consequences as string[] | undefined
      );

    case 'get_applicable_norms':
      return getApplicableNorms(
        payload.cultureId as string | undefined,
        payload.groupId as string | undefined,
        payload.context as string | undefined
      );

    case 'get_norm':
      return getNorm(payload.id as string);

    case 'list_norms':
      return getAllNorms();

    // Analysis
    case 'analyze_power_structure':
      return analyzeGroupPowerStructure(payload.groupId as string);

    case 'get_context_summary':
      return getSocialContextSummary();

    case 'get_stats':
      return getSocialIntelligenceStats();

    // Persistence
    case 'save_state':
      try {
        const serialized = serializeState();
        await saveToStorage('social-intelligence-state', serialized);
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }

    case 'load_state':
      try {
        const stored = await loadFromStorage<string>(
          'social-intelligence-state'
        );
        if (stored) {
          restoreState(stored);
          return { success: true, stats: getSocialIntelligenceStats() };
        }
        return { success: false, error: 'No saved state found' };
      } catch (error) {
        return { success: false, error: String(error) };
      }

    case 'reset':
      resetState();
      return { success: true };

    default:
      return { error: `Unknown action: ${action}` };
  }
}
