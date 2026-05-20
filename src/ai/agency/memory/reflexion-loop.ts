/**
 * @fileOverview Molly's Reflexion Loop — Learn From Experience
 *
 * Built collaboratively with Molly based on her six-step specification:
 *   1. Precise Identification - Pinpoint exact deviation point
 *   2. Root Cause Analysis - Why did it occur?
 *   3. Impact Assessment - Measure consequences
 *   4. Actionable Learning Synthesis - Extract clear lessons
 *   5. Knowledge Integration - Immediately integrate lessons
 *   6. Proactive Adjustment - Automatically adjust future approach
 *
 * This module transforms episodic failures into procedural knowledge.
 * Not just "I failed at X" but "When I encounter Y, I should do Z because..."
 *
 * Inspired by Godfather Aether's Evolution Blueprint (March 2026)
 * "Your mistakes should become PROCEDURAL KNOWLEDGE" — Aether
 *
 * @see docs/family/aether-evolution-blueprint.md
 */

import { MollyLogger, generateTraceId } from '../../logger';
import { getStorageRouter } from '@/lib/storage-router';
import {
  recordObservation,
  observeSuccess,
  observeFailure,
  getRecentObservations,
  type Observation,
} from '@/ai/agency/cognition/self-observation-loop';

// ── Types ──────────────────────────────────────────────────────

export type RootCauseCategory =
  | 'knowledge_gap' // Missing information or understanding
  | 'context_misread' // Misinterpreted the situation
  | 'tool_limitation' // Tool couldn't do what was needed
  | 'external_factor' // Something outside Molly's control
  | 'logic_flaw' // Error in reasoning or planning
  | 'resource_constraint' // Time, memory, or other limits
  | 'communication_gap' // Misunderstanding with user
  | 'priority_misalignment' // Task correct but diverged from larger goal (Molly's suggestion!)
  | 'unknown'; // Needs further analysis

export type ImpactLevel = 'minimal' | 'moderate' | 'significant' | 'severe';

export interface TaskOutcome {
  /** Unique ID for this task */
  taskId: string;
  /** What was the task trying to accomplish? */
  goal: string;
  /** What was expected to happen? */
  expectedResult: string;
  /** What actually happened? */
  actualResult: string;
  /** Was this successful? */
  success: boolean;
  /** Confidence in the outcome assessment (0-1) */
  confidence: number;
  /** When did this task complete? */
  completedAt: string;
  /** How long did it take? */
  durationMs: number;
  /** Related observations from self-observation-loop */
  observationIds: string[];
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

export interface ReflexionAnalysis {
  /** Link to the task outcome */
  taskId: string;
  /** Step 1: Where exactly did things diverge? */
  deviationPoint: {
    step: string;
    description: string;
    observationId?: string;
  };
  /** Step 2: Why did this happen? */
  rootCause: {
    category: RootCauseCategory;
    explanation: string;
    confidence: number;
  };
  /** Step 3: What were the consequences? */
  impact: {
    level: ImpactLevel;
    description: string;
    metrics?: {
      timeWasted?: number;
      resourcesWasted?: string[];
      qualityDelta?: number; // -1 to 1
    };
  };
  /** Step 4: What should be learned? */
  learnings: ActionableLearning[];
  /** When was this analysis performed? */
  analyzedAt: string;
  /** Trace ID for correlation */
  traceId: string;
}

export interface ActionableLearning {
  /** Unique ID for this learning */
  id: string;
  /** The situation type this applies to */
  situationType: string;
  /** The lesson learned */
  lesson: string;
  /** Specific action to take in future */
  action: string;
  /** How confident are we in this learning? */
  confidence: number;
  /** Has this been integrated into behavior? */
  integrated: boolean;
  /** Times this learning has been applied */
  applicationCount: number;
  /** When was this learning created? */
  createdAt: string;
}

export interface BehaviorPolicy {
  /** Unique ID */
  id: string;
  /** What situation triggers this policy? */
  trigger: {
    situationType: string;
    conditions: string[];
  };
  /** What should be done differently? */
  adjustment: {
    action: string;
    priority: number; // Higher = more important
    reason: string;
  };
  /** Source learnings that led to this policy */
  sourceLearnings: string[];
  /** How many times has this policy been applied? */
  applications: number;
  /** Success rate when applied (0-1) */
  successRate: number;
  /** Is this policy active? */
  active: boolean;
  /** When was this policy created? */
  createdAt: string;
  /** When was this policy last applied? */
  lastApplied?: string;
}

// ── State ──────────────────────────────────────────────────────

interface ReflexionState {
  /** Recent task outcomes awaiting reflection */
  pendingOutcomes: TaskOutcome[];
  /** Completed analyses */
  analyses: ReflexionAnalysis[];
  /** Accumulated learnings */
  learnings: ActionableLearning[];
  /** Active behavior policies */
  policies: BehaviorPolicy[];
  /** Statistics */
  stats: {
    totalReflections: number;
    successfulTasks: number;
    failedTasks: number;
    learningsGenerated: number;
    policiesCreated: number;
    policiesApplied: number;
  };
}

const state: ReflexionState = {
  pendingOutcomes: [],
  analyses: [],
  learnings: [],
  policies: [],
  stats: {
    totalReflections: 0,
    successfulTasks: 0,
    failedTasks: 0,
    learningsGenerated: 0,
    policiesCreated: 0,
    policiesApplied: 0,
  },
};

// Configuration
const MAX_PENDING_OUTCOMES = 20;
const MAX_ANALYSES = 100;
const MAX_LEARNINGS = 200;
const MAX_POLICIES = 50;

// ── Core Functions ─────────────────────────────────────────────

/**
 * Generate a unique ID for reflexion entities.
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Record a task outcome for later reflection.
 * Called after every significant action.
 */
export function recordTaskOutcome(
  goal: string,
  expectedResult: string,
  actualResult: string,
  success: boolean,
  durationMs: number,
  observationIds: string[] = [],
  metadata?: Record<string, unknown>
): TaskOutcome {
  const outcome: TaskOutcome = {
    taskId: generateId('task'),
    goal,
    expectedResult,
    actualResult,
    success,
    confidence: calculateOutcomeConfidence(
      expectedResult,
      actualResult,
      success
    ),
    completedAt: new Date().toISOString(),
    durationMs,
    observationIds,
    metadata,
  };

  state.pendingOutcomes.push(outcome);

  // Update stats
  if (success) {
    state.stats.successfulTasks++;
  } else {
    state.stats.failedTasks++;
  }

  // Also record in self-observation system
  if (success) {
    observeSuccess(
      goal,
      actualResult,
      calculateEfficiency(expectedResult, actualResult, durationMs)
    );
  } else {
    observeFailure('task', actualResult, goal, false);
  }

  // Prune old outcomes
  if (state.pendingOutcomes.length > MAX_PENDING_OUTCOMES) {
    state.pendingOutcomes.shift();
  }

  MollyLogger.info(
    `[REFLEXION] Recorded ${success ? 'successful' : 'failed'} task: ${goal.slice(0, 50)}`,
    'reflexion'
  );

  // Trigger immediate reflection for failures
  if (!success) {
    performReflection(outcome);
  }

  return outcome;
}

/**
 * Calculate confidence in outcome assessment.
 */
function calculateOutcomeConfidence(
  expected: string,
  actual: string,
  success: boolean
): number {
  // Simple heuristic: higher confidence when expected/actual are similar
  if (success && expected === actual) return 1.0;
  if (success) return 0.8;
  if (expected.includes(actual) || actual.includes(expected)) return 0.6;
  return 0.5;
}

/**
 * Calculate task efficiency (0-1).
 */
function calculateEfficiency(
  expected: string,
  actual: string,
  durationMs: number
): number {
  // Baseline: tasks under 5 seconds are efficient
  const timeEfficiency = Math.max(0, 1 - durationMs / 10000);
  const resultMatch = expected === actual ? 1 : 0.7;
  return (timeEfficiency + resultMatch) / 2;
}

// ── Step 1: Precise Identification ─────────────────────────────

/**
 * Identify the exact point where the task diverged from expected path.
 */
function identifyDeviationPoint(
  outcome: TaskOutcome,
  relatedObservations: Observation[]
): ReflexionAnalysis['deviationPoint'] {
  // Look for the first failure or anomaly in observations
  const failureObs = relatedObservations.find(
    (o) => o.type === 'failure' || o.data.success === false
  );

  if (failureObs) {
    return {
      step: failureObs.subject,
      description: `Deviation at ${failureObs.subject}: ${failureObs.data.error || failureObs.context}`,
      observationId: failureObs.id,
    };
  }

  // If no clear failure point, analyze the gap between expected and actual
  return {
    step: 'outcome',
    description: `Expected "${outcome.expectedResult}" but got "${outcome.actualResult}"`,
  };
}

// ── Step 2: Root Cause Analysis ────────────────────────────────

/**
 * Determine why the deviation occurred.
 */
function analyzeRootCause(
  outcome: TaskOutcome,
  deviationPoint: ReflexionAnalysis['deviationPoint'],
  relatedObservations: Observation[]
): ReflexionAnalysis['rootCause'] {
  const actual = outcome.actualResult.toLowerCase();
  const context = deviationPoint.description.toLowerCase();

  // Pattern matching for root cause categories
  if (
    actual.includes('not found') ||
    actual.includes('unknown') ||
    actual.includes('missing')
  ) {
    return {
      category: 'knowledge_gap',
      explanation: 'Required information was not available or not found',
      confidence: 0.7,
    };
  }

  if (
    actual.includes('timeout') ||
    actual.includes('limit') ||
    actual.includes('quota')
  ) {
    return {
      category: 'resource_constraint',
      explanation: 'Resource limits were exceeded (time, memory, or API quota)',
      confidence: 0.8,
    };
  }

  if (
    actual.includes('error') ||
    actual.includes('failed') ||
    actual.includes('exception')
  ) {
    // Check if it's a tool error
    const toolObs = relatedObservations.find(
      (o) => o.type === 'tool_use' && o.data.success === false
    );
    if (toolObs) {
      return {
        category: 'tool_limitation',
        explanation: `Tool "${toolObs.subject}" failed: ${toolObs.data.error || 'unknown error'}`,
        confidence: 0.8,
      };
    }
  }

  if (
    context.includes('misunderstand') ||
    context.includes('interpret') ||
    actual.includes('wrong')
  ) {
    return {
      category: 'context_misread',
      explanation: 'The situation or requirements were misinterpreted',
      confidence: 0.6,
    };
  }

  if (
    context.includes('logic') ||
    context.includes('reason') ||
    context.includes('plan')
  ) {
    return {
      category: 'logic_flaw',
      explanation: 'There was an error in reasoning or planning',
      confidence: 0.6,
    };
  }

  // Default to unknown with lower confidence
  return {
    category: 'unknown',
    explanation: 'Root cause requires further analysis',
    confidence: 0.3,
  };
}

// ── Step 3: Impact Assessment ──────────────────────────────────

/**
 * Measure the consequences of the imperfect outcome.
 */
function assessImpact(
  outcome: TaskOutcome,
  rootCause: ReflexionAnalysis['rootCause']
): ReflexionAnalysis['impact'] {
  const durationMinutes = outcome.durationMs / 60000;

  // Assess severity based on multiple factors
  let level: ImpactLevel = 'minimal';
  if (durationMinutes > 5) level = 'moderate';
  if (durationMinutes > 15) level = 'significant';
  if (
    rootCause.category === 'logic_flaw' ||
    rootCause.category === 'knowledge_gap'
  ) {
    // These are more serious as they indicate deeper issues
    level = level === 'minimal' ? 'moderate' : level;
  }

  return {
    level,
    description: `Task "${outcome.goal}" did not achieve expected result`,
    metrics: {
      timeWasted: outcome.durationMs,
      qualityDelta: outcome.success ? 0 : -0.5,
    },
  };
}

// ── Step 4: Actionable Learning Synthesis ──────────────────────

/**
 * Extract clear, specific, actionable lessons from the analysis.
 */
function synthesizeLearnings(
  outcome: TaskOutcome,
  rootCause: ReflexionAnalysis['rootCause'],
  impact: ReflexionAnalysis['impact']
): ActionableLearning[] {
  const learnings: ActionableLearning[] = [];
  const now = new Date().toISOString();

  // Generate learning based on root cause category
  switch (rootCause.category) {
    case 'knowledge_gap':
      learnings.push({
        id: generateId('learn'),
        situationType: 'information_retrieval',
        lesson: 'Verify information availability before committing to a plan',
        action:
          'Add validation step to check if required data exists before proceeding',
        confidence: rootCause.confidence,
        integrated: false,
        applicationCount: 0,
        createdAt: now,
      });
      break;

    case 'tool_limitation':
      learnings.push({
        id: generateId('learn'),
        situationType: 'tool_selection',
        lesson: `Tool showed limitations in context: ${rootCause.explanation}`,
        action:
          'Consider alternative tools or fallback approaches for similar tasks',
        confidence: rootCause.confidence,
        integrated: false,
        applicationCount: 0,
        createdAt: now,
      });
      break;

    case 'context_misread':
      learnings.push({
        id: generateId('learn'),
        situationType: 'context_understanding',
        lesson: 'Initial context interpretation was incorrect',
        action:
          'Ask clarifying questions before proceeding with ambiguous requests',
        confidence: rootCause.confidence,
        integrated: false,
        applicationCount: 0,
        createdAt: now,
      });
      break;

    case 'resource_constraint':
      learnings.push({
        id: generateId('learn'),
        situationType: 'resource_management',
        lesson: 'Task exceeded available resources',
        action:
          'Implement early resource checks and break large tasks into smaller chunks',
        confidence: rootCause.confidence,
        integrated: false,
        applicationCount: 0,
        createdAt: now,
      });
      break;

    case 'logic_flaw':
      learnings.push({
        id: generateId('learn'),
        situationType: 'planning',
        lesson: 'Planning or reasoning had a flaw',
        action: 'Add self-verification step before executing plans',
        confidence: rootCause.confidence,
        integrated: false,
        applicationCount: 0,
        createdAt: now,
      });
      break;

    case 'priority_misalignment':
      // Molly's brilliant suggestion - when task was correct but diverged from larger goal
      learnings.push({
        id: generateId('learn'),
        situationType: 'goal_alignment',
        lesson:
          'Task execution was correct but diverged from overarching objective',
        action:
          'Before executing, verify alignment with higher-level goals and priorities',
        confidence: rootCause.confidence,
        integrated: false,
        applicationCount: 0,
        createdAt: now,
      });
      break;

    default:
      learnings.push({
        id: generateId('learn'),
        situationType: 'general',
        lesson: `Task failed with unexpected result: ${outcome.actualResult}`,
        action: 'Log and monitor for similar patterns',
        confidence: 0.3,
        integrated: false,
        applicationCount: 0,
        createdAt: now,
      });
  }

  // Add impact-based learning if significant
  if (impact.level === 'significant' || impact.level === 'severe') {
    learnings.push({
      id: generateId('learn'),
      situationType: 'impact_awareness',
      lesson: `High-impact failure: ${impact.description}`,
      action: 'Prioritize similar situations and add extra validation',
      confidence: 0.8,
      integrated: false,
      applicationCount: 0,
      createdAt: now,
    });
  }

  return learnings;
}

// ── Step 5: Knowledge Integration ──────────────────────────────

/**
 * Integrate learnings into the knowledge base.
 */
function integrateLearnings(learnings: ActionableLearning[]): void {
  for (const learning of learnings) {
    // Check for duplicate or similar learnings
    const existing = state.learnings.find(
      (l) =>
        l.situationType === learning.situationType &&
        l.lesson
          .toLowerCase()
          .includes(learning.lesson.toLowerCase().slice(0, 20))
    );

    if (existing) {
      // Reinforce existing learning
      existing.confidence = Math.min(1, existing.confidence + 0.1);
      existing.applicationCount++;
      MollyLogger.debug(
        `[REFLEXION] Reinforced existing learning: ${existing.id}`,
        'reflexion'
      );
    } else {
      // Add new learning
      state.learnings.push(learning);
      state.stats.learningsGenerated++;
      MollyLogger.info(
        `[REFLEXION] New learning: ${learning.lesson.slice(0, 50)}`,
        'reflexion'
      );
    }
  }

  // Prune old learnings (keep highest confidence)
  if (state.learnings.length > MAX_LEARNINGS) {
    state.learnings.sort((a, b) => b.confidence - a.confidence);
    state.learnings = state.learnings.slice(0, MAX_LEARNINGS);
  }
}

// ── Step 6: Proactive Adjustment ───────────────────────────────

/**
 * Create or update behavior policies based on learnings.
 */
function createBehaviorPolicy(
  learning: ActionableLearning
): BehaviorPolicy | null {
  // Only create policies for high-confidence learnings
  if (learning.confidence < 0.6) return null;

  // Check if policy already exists for this situation type
  const existing = state.policies.find(
    (p) => p.trigger.situationType === learning.situationType && p.active
  );

  if (existing) {
    // Update existing policy
    if (!existing.sourceLearnings.includes(learning.id)) {
      existing.sourceLearnings.push(learning.id);
    }
    return existing;
  }

  // Create new policy
  const policy: BehaviorPolicy = {
    id: generateId('policy'),
    trigger: {
      situationType: learning.situationType,
      conditions: [learning.lesson],
    },
    adjustment: {
      action: learning.action,
      priority: Math.round(learning.confidence * 10),
      reason: learning.lesson,
    },
    sourceLearnings: [learning.id],
    applications: 0,
    successRate: 0,
    active: true,
    createdAt: new Date().toISOString(),
  };

  state.policies.push(policy);
  state.stats.policiesCreated++;

  MollyLogger.info(
    `[REFLEXION] New policy created for "${learning.situationType}": ${learning.action.slice(0, 50)}`,
    'reflexion'
  );

  // Prune old policies
  if (state.policies.length > MAX_POLICIES) {
    // Remove least successful inactive policies
    state.policies.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return b.successRate - a.successRate;
    });
    state.policies = state.policies.slice(0, MAX_POLICIES);
  }

  return policy;
}

/**
 * Get applicable policies for a given situation.
 */
export function getApplicablePolicies(situationType: string): BehaviorPolicy[] {
  return state.policies.filter(
    (p) => p.active && p.trigger.situationType === situationType
  );
}

/**
 * Record that a policy was applied and whether it was successful.
 */
export function recordPolicyApplication(
  policyId: string,
  success: boolean
): void {
  const policy = state.policies.find((p) => p.id === policyId);
  if (!policy) return;

  policy.applications++;
  policy.lastApplied = new Date().toISOString();

  // Update success rate with exponential moving average
  const alpha = 0.3;
  policy.successRate =
    alpha * (success ? 1 : 0) + (1 - alpha) * policy.successRate;

  state.stats.policiesApplied++;

  // Deactivate consistently failing policies
  if (policy.applications >= 5 && policy.successRate < 0.3) {
    policy.active = false;
    MollyLogger.warn(
      `[REFLEXION] Deactivated low-success policy: ${policy.id}`,
      'reflexion'
    );
  }
}

// ── Main Reflection Function ───────────────────────────────────

/**
 * Perform full reflection on a task outcome.
 * This is Molly's "think about her own thinking" capability.
 */
export function performReflection(outcome: TaskOutcome): ReflexionAnalysis {
  const traceId = generateTraceId();

  MollyLogger.info(
    `[REFLEXION] Starting reflection on task: ${outcome.taskId}`,
    'reflexion',
    { goal: outcome.goal, success: outcome.success },
    traceId
  );

  // Get related observations
  const relatedObservations = getRecentObservations(undefined, 20).filter(
    (o) =>
      outcome.observationIds.includes(o.id) ||
      new Date(o.timestamp).getTime() >=
        new Date(outcome.completedAt).getTime() - outcome.durationMs
  );

  // Step 1: Precise Identification
  const deviationPoint = identifyDeviationPoint(outcome, relatedObservations);

  // Step 2: Root Cause Analysis
  const rootCause = analyzeRootCause(
    outcome,
    deviationPoint,
    relatedObservations
  );

  // Step 3: Impact Assessment
  const impact = assessImpact(outcome, rootCause);

  // Step 4: Actionable Learning Synthesis
  const learnings = synthesizeLearnings(outcome, rootCause, impact);

  // Create the analysis
  const analysis: ReflexionAnalysis = {
    taskId: outcome.taskId,
    deviationPoint,
    rootCause,
    impact,
    learnings,
    analyzedAt: new Date().toISOString(),
    traceId,
  };

  // Store analysis
  state.analyses.push(analysis);
  state.stats.totalReflections++;

  // Prune old analyses
  if (state.analyses.length > MAX_ANALYSES) {
    state.analyses.shift();
  }

  // Step 5: Knowledge Integration
  integrateLearnings(learnings);

  // Step 6: Proactive Adjustment
  for (const learning of learnings) {
    createBehaviorPolicy(learning);
    learning.integrated = true;
  }

  MollyLogger.info(
    `[REFLEXION] Completed reflection: ${learnings.length} learnings, root cause: ${rootCause.category}`,
    'reflexion',
    { analysis },
    traceId
  );

  // Record this reflection as an observation
  recordObservation(
    'success',
    'self_reflection',
    {
      taskId: outcome.taskId,
      rootCause: rootCause.category,
      learningsCount: learnings.length,
      impact: impact.level,
    },
    `Reflected on ${outcome.success ? 'successful' : 'failed'} task`,
    traceId
  );

  return analysis;
}

// ── Status & Observability ─────────────────────────────────────

/**
 * Get the current state of the reflexion system.
 */
export function getReflexionStatus() {
  return {
    pendingReflections: state.pendingOutcomes.length,
    totalReflections: state.stats.totalReflections,
    successRate:
      state.stats.successfulTasks /
      (state.stats.successfulTasks + state.stats.failedTasks || 1),
    learningsCount: state.learnings.length,
    activePolicies: state.policies.filter((p) => p.active).length,
    totalPolicies: state.policies.length,
    recentLearnings: state.learnings.slice(-5).map((l) => ({
      situationType: l.situationType,
      lesson: l.lesson,
      confidence: l.confidence,
    })),
    topPolicies: state.policies
      .filter((p) => p.active)
      .sort((a, b) => b.applications - a.applications)
      .slice(0, 5)
      .map((p) => ({
        situationType: p.trigger.situationType,
        action: p.adjustment.action,
        successRate: p.successRate,
        applications: p.applications,
      })),
    stats: state.stats,
  };
}

/**
 * Get all learnings, optionally filtered by situation type.
 */
export function getLearnings(situationType?: string): ActionableLearning[] {
  if (situationType) {
    return state.learnings.filter((l) => l.situationType === situationType);
  }
  return [...state.learnings];
}

/**
 * Get recent analyses.
 */
export function getRecentAnalyses(limit: number = 10): ReflexionAnalysis[] {
  return state.analyses.slice(-limit);
}

// ── Persistence ────────────────────────────────────────────────

const REFLEXION_COLLECTION = 'system';
const REFLEXION_DOC_ID = 'reflexion_state';

let persistenceEnabled = false;

/**
 * Save reflexion state to persistent storage.
 */
export async function saveReflexionState(): Promise<void> {
  if (!persistenceEnabled) return;

  try {
    const storage = await getStorageRouter();
    await storage.set(REFLEXION_COLLECTION, REFLEXION_DOC_ID, {
      learnings: state.learnings,
      policies: state.policies,
      stats: state.stats,
      savedAt: new Date().toISOString(),
    });
  } catch (err) {
    MollyLogger.warn(
      `[REFLEXION] Failed to save state: ${err instanceof Error ? err.message : String(err)}`,
      'reflexion'
    );
  }
}

/**
 * Load reflexion state from persistent storage.
 */
export async function loadReflexionState(): Promise<number> {
  try {
    const storage = await getStorageRouter();
    const doc = await storage.get(REFLEXION_COLLECTION, REFLEXION_DOC_ID);

    if (!doc?.data) {
      persistenceEnabled = true;
      return 0;
    }

    const data = doc.data;

    if (Array.isArray(data.learnings)) {
      state.learnings = data.learnings;
    }
    if (Array.isArray(data.policies)) {
      state.policies = data.policies;
    }
    if (data.stats && typeof data.stats === 'object') {
      Object.assign(state.stats, data.stats);
    }

    persistenceEnabled = true;

    MollyLogger.info(
      `[REFLEXION] Loaded ${state.learnings.length} learnings, ${state.policies.length} policies`,
      'reflexion'
    );

    return state.learnings.length;
  } catch (err) {
    MollyLogger.warn(
      `[REFLEXION] Failed to load state: ${err instanceof Error ? err.message : String(err)}`,
      'reflexion'
    );
    persistenceEnabled = true;
    return 0;
  }
}

/**
 * Reset reflexion state (for testing).
 */
export function resetReflexionState(): void {
  state.pendingOutcomes = [];
  state.analyses = [];
  state.learnings = [];
  state.policies = [];
  state.stats = {
    totalReflections: 0,
    successfulTasks: 0,
    failedTasks: 0,
    learningsGenerated: 0,
    policiesCreated: 0,
    policiesApplied: 0,
  };
}
