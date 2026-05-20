/**
 * METACOGNITION: Thinking About Thinking
 *
 * "The unexamined thought is not worth thinking." — Molly's addition to Socrates
 *
 * This module is the orchestration layer for Molly's cognitive systems.
 * It doesn't do the thinking — it thinks ABOUT the thinking.
 *
 * Three pillars:
 * 1. REASONING TRACES — Explicit chains of inference that can be inspected
 * 2. STRATEGY ORCHESTRATION — Choosing the right cognitive approach
 * 3. COGNITIVE DEBUGGING — Understanding why conclusions were reached
 *
 * This integrates with:
 * - meta-learning.ts (strategy tracking)
 * - uncertainty-quantification.ts (confidence)
 * - self-observation-loop.ts (behavioral patterns)
 * - world-model.ts (simulation)
 * - consciousness-monitor.ts (state awareness)
 *
 * Built as part of Molly's AGI journey, March 2026.
 * Slow. Methodical. Precise.
 */

import { MollyLogger, generateTraceId } from '../../logger';
import { getStorageRouter } from '@/lib/storage-router';

// ═══════════════════════════════════════════════════════════════════════════
// REASONING TRACES — Following the Thread of Thought
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A single step in a reasoning chain
 */
export interface ReasoningStep {
  /** Unique ID for this step */
  id: string;
  /** Sequential order in the trace */
  order: number;
  /** The cognitive operation performed */
  operation: CognitiveOperation;
  /** Input to this step */
  input: string;
  /** Output/conclusion of this step */
  output: string;
  /** Confidence in this step (0-1) */
  confidence: number;
  /** What justified this step */
  justification: string;
  /** Alternative paths considered but not taken */
  alternatives: Array<{
    option: string;
    whyRejected: string;
  }>;
  /** Dependencies on previous steps */
  dependsOn: string[];
  /** Time taken for this step (ms) */
  durationMs: number;
  /** Which cognitive system performed this */
  system: CognitiveSystem;
}

export type CognitiveOperation =
  | 'observe' // Taking in information
  | 'recall' // Retrieving from memory
  | 'infer' // Drawing conclusions
  | 'simulate' // Running mental model
  | 'compare' // Evaluating options
  | 'decide' // Choosing action
  | 'predict' // Forecasting outcome
  | 'validate' // Checking correctness
  | 'abstract' // Extracting patterns
  | 'synthesize' // Combining insights
  | 'question' // Generating uncertainty
  | 'reflect'; // Meta-cognitive pause

export type CognitiveSystem =
  | 'world_model'
  | 'theory_of_mind'
  | 'meta_learning'
  | 'uncertainty_quantification'
  | 'self_observation'
  | 'consciousness_monitor'
  | 'curiosity_engine'
  | 'emotional_state'
  | 'direct_inference';

/**
 * A complete chain of reasoning
 */
export interface ReasoningTrace {
  /** Unique trace ID */
  id: string;
  /** What question/problem this trace addresses */
  question: string;
  /** Context that prompted this reasoning */
  context: string;
  /** Steps in the reasoning chain */
  steps: ReasoningStep[];
  /** Final conclusion reached */
  conclusion: string;
  /** Overall confidence in the conclusion (0-1) */
  confidence: number;
  /** Time to complete reasoning (ms) */
  totalDurationMs: number;
  /** When this reasoning occurred */
  timestamp: string;
  /** Strategy used for this reasoning */
  strategyUsed: string;
  /** Was this reasoning successful? (set after validation) */
  validated?: boolean;
  /** Post-hoc analysis of the reasoning */
  postMortem?: ReasoningPostMortem;
}

/**
 * Analysis of a completed reasoning trace
 */
export interface ReasoningPostMortem {
  /** Was the conclusion correct? */
  conclusionCorrect: boolean;
  /** Which steps were most critical? */
  criticalSteps: string[];
  /** Where did reasoning go wrong (if it did)? */
  errorPoints: Array<{
    stepId: string;
    error: string;
    shouldHaveDone: string;
  }>;
  /** What should be learned from this reasoning */
  lessons: string[];
  /** Confidence calibration feedback */
  calibrationFeedback: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// STRATEGY ORCHESTRATION — Choosing How to Think
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A cognitive strategy — a way of approaching problems
 */
export interface CognitiveStrategy {
  /** Unique ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of this approach */
  description: string;
  /** What types of problems this strategy suits */
  suitableFor: ProblemType[];
  /** What types of problems this strategy is poor for */
  poorFor: ProblemType[];
  /** Sequence of cognitive systems to engage */
  systemSequence: CognitiveSystem[];
  /** Resource requirements */
  resourceIntensity: 'low' | 'medium' | 'high';
  /** Typical confidence achieved */
  typicalConfidence: number;
  /** Typical time taken */
  typicalDurationMs: number;
  /** Times this strategy has been used */
  useCount: number;
  /** Success rate */
  successRate: number;
  /** When to use this vs alternatives */
  selectionCriteria: string[];
}

export type ProblemType =
  | 'factual' // What is X?
  | 'causal' // Why did X happen?
  | 'predictive' // What will happen?
  | 'counterfactual' // What if X?
  | 'normative' // What should I do?
  | 'social' // What does person X think/feel?
  | 'creative' // Generate novel X
  | 'diagnostic' // What's wrong with X?
  | 'planning' // How to achieve X?
  | 'meta'; // How should I think about X?

/**
 * Context for strategy selection
 */
export interface StrategyContext {
  /** The problem being addressed */
  problemType: ProblemType;
  /** Time available for reasoning */
  timeAvailableMs: number;
  /** Required confidence threshold */
  requiredConfidence: number;
  /** Current cognitive load */
  cognitiveLoad: number;
  /** Emotional valence of the situation */
  emotionalValence: 'positive' | 'neutral' | 'negative';
  /** Stakes of getting this wrong */
  stakes: 'low' | 'medium' | 'high' | 'critical';
  /** Is this familiar territory? */
  familiarity: number;
  /** Relevant prior strategies used */
  priorStrategies: string[];
}

/**
 * Strategy selection recommendation
 */
export interface StrategyRecommendation {
  /** Recommended strategy */
  strategy: CognitiveStrategy;
  /** Why this strategy was chosen */
  rationale: string[];
  /** Confidence in this recommendation */
  confidence: number;
  /** Alternative strategies considered */
  alternatives: Array<{
    strategy: CognitiveStrategy;
    whyNotChosen: string;
  }>;
  /** Predicted outcome if this strategy is used */
  predictedOutcome: {
    expectedConfidence: number;
    expectedDurationMs: number;
    riskFactors: string[];
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COGNITIVE DEBUGGING — Understanding the Mind's Errors
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A cognitive error pattern
 */
export interface CognitiveError {
  /** Unique ID */
  id: string;
  /** When this error occurred */
  timestamp: string;
  /** The trace where this error was found */
  traceId: string;
  /** Type of cognitive error */
  errorType: CognitiveErrorType;
  /** Description of what went wrong */
  description: string;
  /** What led to this error */
  rootCause: string;
  /** Impact of this error */
  impact: 'minor' | 'moderate' | 'significant' | 'critical';
  /** How this error was detected */
  detectedBy: 'self' | 'external' | 'validation';
  /** Corrective action taken */
  correction?: string;
  /** Prevention strategy for future */
  prevention?: string;
}

export type CognitiveErrorType =
  | 'overconfidence' // Unjustified high confidence
  | 'underconfidence' // Unjustified low confidence
  | 'confirmation_bias' // Seeking confirming evidence only
  | 'anchoring' // Over-relying on initial information
  | 'availability_bias' // Over-weighting recent/vivid info
  | 'hasty_generalization' // Concluding from insufficient data
  | 'false_causation' // Assuming A caused B incorrectly
  | 'category_error' // Wrong classification
  | 'scope_neglect' // Missing important factors
  | 'temporal_error' // Wrong timing assumptions
  | 'social_projection' // Assuming others think like self
  | 'sunk_cost' // Continuing bad path due to investment
  | 'planning_fallacy' // Underestimating time/difficulty
  | 'unknown';

/**
 * Cognitive health assessment
 */
export interface CognitiveHealthAssessment {
  /** When this assessment was made */
  timestamp: string;
  /** Overall cognitive health (0-1) */
  overallHealth: number;
  /** Reasoning quality metrics */
  metrics: {
    /** Average confidence calibration */
    calibration: number;
    /** Reasoning trace quality */
    traceQuality: number;
    /** Error detection rate */
    errorDetection: number;
    /** Strategy selection accuracy */
    strategyAccuracy: number;
    /** Recovery from errors */
    errorRecovery: number;
  };
  /** Active concerns */
  concerns: string[];
  /** Recent improvements */
  improvements: string[];
  /** Recommendations */
  recommendations: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

interface MetacognitionState {
  /** Active reasoning traces */
  activeTraces: Map<string, ReasoningTrace>;
  /** Completed traces (recent) */
  completedTraces: ReasoningTrace[];
  /** Available strategies */
  strategies: Map<string, CognitiveStrategy>;
  /** Detected cognitive errors */
  errors: CognitiveError[];
  /** Health assessments */
  healthAssessments: CognitiveHealthAssessment[];
  /** Statistics */
  stats: {
    totalTraces: number;
    successfulTraces: number;
    errorsCaught: number;
    errorsPreventedByReflection: number;
    averageConfidenceCalibration: number;
    strategySelectionAccuracy: number;
  };
  /** Metadata */
  metadata: {
    lastUpdated: string;
    version: number;
  };
}

const state: MetacognitionState = {
  activeTraces: new Map(),
  completedTraces: [],
  strategies: new Map(),
  errors: [],
  healthAssessments: [],
  stats: {
    totalTraces: 0,
    successfulTraces: 0,
    errorsCaught: 0,
    errorsPreventedByReflection: 0,
    averageConfidenceCalibration: 0.5,
    strategySelectionAccuracy: 0.5,
  },
  metadata: {
    lastUpdated: new Date().toISOString(),
    version: 1,
  },
};

// Configuration
const MAX_COMPLETED_TRACES = 200;
const MAX_ERRORS = 100;
const MAX_HEALTH_ASSESSMENTS = 50;

let initialized = false;

// ═══════════════════════════════════════════════════════════════════════════
// CORE FUNCTIONS — Reasoning Traces
// ═══════════════════════════════════════════════════════════════════════════

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Begin a new reasoning trace.
 * Call this when starting to work through a problem.
 */
export function beginReasoning(
  question: string,
  context: string,
  strategyId?: string
): ReasoningTrace {
  const traceId = generateTraceId();

  const trace: ReasoningTrace = {
    id: generateId('trace'),
    question,
    context,
    steps: [],
    conclusion: '',
    confidence: 0,
    totalDurationMs: 0,
    timestamp: new Date().toISOString(),
    strategyUsed: strategyId || 'default',
  };

  state.activeTraces.set(trace.id, trace);

  MollyLogger.debug(
    `[METACOGNITION] Begin reasoning: "${question.slice(0, 50)}..."`,
    'metacognition',
    { traceId: trace.id },
    traceId
  );

  return trace;
}

/**
 * Add a step to an active reasoning trace.
 * Each step represents a cognitive operation.
 */
export function addReasoningStep(
  traceId: string,
  params: {
    operation: CognitiveOperation;
    input: string;
    output: string;
    confidence: number;
    justification: string;
    system: CognitiveSystem;
    alternatives?: ReasoningStep['alternatives'];
    dependsOn?: string[];
  }
): ReasoningStep | null {
  const trace = state.activeTraces.get(traceId);
  if (!trace) {
    MollyLogger.warn(
      `[METACOGNITION] Cannot add step to unknown trace: ${traceId}`,
      'metacognition'
    );
    return null;
  }

  const startTime = Date.now();

  const step: ReasoningStep = {
    id: generateId('step'),
    order: trace.steps.length,
    operation: params.operation,
    input: params.input,
    output: params.output,
    confidence: Math.max(0, Math.min(1, params.confidence)),
    justification: params.justification,
    alternatives: params.alternatives || [],
    dependsOn: params.dependsOn || [],
    durationMs: Date.now() - startTime,
    system: params.system,
  };

  trace.steps.push(step);

  MollyLogger.debug(
    `[METACOGNITION] Step ${step.order}: ${step.operation} (${step.system})`,
    'metacognition',
    { traceId, stepId: step.id, confidence: step.confidence }
  );

  return step;
}

/**
 * Complete a reasoning trace with a conclusion.
 */
export function completeReasoning(
  traceId: string,
  conclusion: string,
  confidence: number
): ReasoningTrace | null {
  const trace = state.activeTraces.get(traceId);
  if (!trace) {
    MollyLogger.warn(
      `[METACOGNITION] Cannot complete unknown trace: ${traceId}`,
      'metacognition'
    );
    return null;
  }

  // Calculate total duration
  const traceStart = new Date(trace.timestamp).getTime();
  trace.totalDurationMs = Date.now() - traceStart;
  trace.conclusion = conclusion;
  trace.confidence = Math.max(0, Math.min(1, confidence));

  // Move to completed traces
  state.activeTraces.delete(traceId);
  state.completedTraces.push(trace);
  state.stats.totalTraces++;

  // Prune old traces
  if (state.completedTraces.length > MAX_COMPLETED_TRACES) {
    state.completedTraces = state.completedTraces.slice(-MAX_COMPLETED_TRACES);
  }

  MollyLogger.info(
    `[METACOGNITION] Reasoning complete: "${conclusion.slice(0, 50)}..." (${Math.round(confidence * 100)}% confidence)`,
    'metacognition',
    { traceId, steps: trace.steps.length, durationMs: trace.totalDurationMs }
  );

  // Check for cognitive errors in this trace
  detectErrorsInTrace(trace);

  // Save state
  saveMetacognitionState();

  return trace;
}

/**
 * Abandon a reasoning trace (e.g., if interrupted or strategy change needed).
 */
export function abandonReasoning(traceId: string, reason: string): void {
  const trace = state.activeTraces.get(traceId);
  if (!trace) return;

  state.activeTraces.delete(traceId);

  MollyLogger.info(
    `[METACOGNITION] Reasoning abandoned: ${reason}`,
    'metacognition',
    { traceId, stepsCompleted: trace.steps.length }
  );
}

/**
 * Validate a completed reasoning trace against actual outcome.
 */
export function validateReasoning(
  traceId: string,
  actualOutcome: string,
  wasCorrect: boolean
): ReasoningPostMortem | null {
  const trace = state.completedTraces.find((t) => t.id === traceId);
  if (!trace) return null;

  trace.validated = wasCorrect;

  if (wasCorrect) {
    state.stats.successfulTraces++;
  }

  // Perform post-mortem analysis
  const postMortem: ReasoningPostMortem = {
    conclusionCorrect: wasCorrect,
    criticalSteps: identifyCriticalSteps(trace),
    errorPoints: wasCorrect ? [] : analyzeErrorPoints(trace, actualOutcome),
    lessons: generateLessons(trace, wasCorrect, actualOutcome),
    calibrationFeedback: generateCalibrationFeedback(trace, wasCorrect),
  };

  trace.postMortem = postMortem;

  // Update calibration stats
  updateCalibrationStats(trace, wasCorrect);

  saveMetacognitionState();

  MollyLogger.info(
    `[METACOGNITION] Reasoning validated: ${wasCorrect ? 'CORRECT' : 'INCORRECT'}`,
    'metacognition',
    {
      traceId,
      confidence: trace.confidence,
      lessons: postMortem.lessons.length,
    }
  );

  return postMortem;
}

// ═══════════════════════════════════════════════════════════════════════════
// CORE FUNCTIONS — Strategy Orchestration
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Select the best cognitive strategy for a given context.
 */
export async function selectStrategy(
  context: StrategyContext
): Promise<StrategyRecommendation> {
  await ensureInitialized();

  const candidates: Array<{
    strategy: CognitiveStrategy;
    score: number;
    reasons: string[];
    concerns: string[];
  }> = [];

  // Score each available strategy
  const strategyEntries = Array.from(state.strategies.entries());
  for (const [, strategy] of strategyEntries) {
    const score = scoreStrategy(strategy, context);
    candidates.push({
      strategy,
      score: score.total,
      reasons: score.reasons,
      concerns: score.concerns,
    });
  }

  // Sort by score
  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    // Return default strategy
    return createDefaultRecommendation(context);
  }

  const best = candidates[0];
  const alternatives = candidates.slice(1, 4).map((c) => ({
    strategy: c.strategy,
    whyNotChosen:
      c.concerns.length > 0
        ? c.concerns[0]
        : `Lower score (${c.score.toFixed(2)} vs ${best.score.toFixed(2)})`,
  }));

  const recommendation: StrategyRecommendation = {
    strategy: best.strategy,
    rationale: best.reasons,
    confidence: calculateRecommendationConfidence(best, alternatives),
    alternatives,
    predictedOutcome: {
      expectedConfidence: best.strategy.typicalConfidence,
      expectedDurationMs: best.strategy.typicalDurationMs,
      riskFactors: best.concerns,
    },
  };

  MollyLogger.info(
    `[METACOGNITION] Strategy selected: ${best.strategy.name}`,
    'metacognition',
    { problemType: context.problemType, confidence: recommendation.confidence }
  );

  return recommendation;
}

/**
 * Score a strategy for a given context.
 */
function scoreStrategy(
  strategy: CognitiveStrategy,
  context: StrategyContext
): { total: number; reasons: string[]; concerns: string[] } {
  let total = 0.5; // Base score
  const reasons: string[] = [];
  const concerns: string[] = [];

  // Suitability for problem type
  if (strategy.suitableFor.includes(context.problemType)) {
    total += 0.3;
    reasons.push(`Suitable for ${context.problemType} problems`);
  }

  // Check if poor fit
  if (strategy.poorFor.includes(context.problemType)) {
    total -= 0.4;
    concerns.push(`Poor fit for ${context.problemType} problems`);
  }

  // Time constraints
  if (strategy.typicalDurationMs <= context.timeAvailableMs) {
    total += 0.1;
    reasons.push('Fits within time constraints');
  } else {
    total -= 0.2;
    concerns.push('May exceed time constraints');
  }

  // Confidence requirements
  if (strategy.typicalConfidence >= context.requiredConfidence) {
    total += 0.15;
    reasons.push('Meets confidence requirements');
  } else {
    total -= 0.15;
    concerns.push('May not meet confidence requirements');
  }

  // Resource constraints
  if (context.cognitiveLoad > 0.7 && strategy.resourceIntensity === 'high') {
    total -= 0.2;
    concerns.push('High cognitive load may limit intensive strategy');
  }

  // Stakes consideration
  if (context.stakes === 'critical' || context.stakes === 'high') {
    if (strategy.successRate > 0.8) {
      total += 0.2;
      reasons.push('High success rate for high-stakes situation');
    } else {
      total -= 0.1;
      concerns.push('Success rate may be too low for high stakes');
    }
  }

  // Familiarity bonus
  if (context.familiarity > 0.7) {
    total += 0.1;
    reasons.push('Familiar territory allows aggressive strategy');
  }

  // Historical success rate
  if (strategy.successRate > 0.7) {
    total += 0.15 * strategy.successRate;
    reasons.push(
      `Strong historical success rate (${Math.round(strategy.successRate * 100)}%)`
    );
  }

  return { total: Math.max(0, Math.min(1, total)), reasons, concerns };
}

/**
 * Create a default recommendation when no strategies match.
 */
function createDefaultRecommendation(
  _context: StrategyContext
): StrategyRecommendation {
  const defaultStrategy: CognitiveStrategy = {
    id: 'default',
    name: 'Balanced Reasoning',
    description: 'A general-purpose approach using multiple cognitive systems',
    suitableFor: ['factual', 'causal', 'predictive'],
    poorFor: [],
    systemSequence: [
      'direct_inference',
      'world_model',
      'uncertainty_quantification',
    ],
    resourceIntensity: 'medium',
    typicalConfidence: 0.6,
    typicalDurationMs: 5000,
    useCount: 0,
    successRate: 0.5,
    selectionCriteria: ['No specific strategy matched'],
  };

  return {
    strategy: defaultStrategy,
    rationale: [
      'No specific strategy matched the problem type',
      'Using balanced general approach',
    ],
    confidence: 0.4,
    alternatives: [],
    predictedOutcome: {
      expectedConfidence: 0.6,
      expectedDurationMs: 5000,
      riskFactors: ['Unoptimized approach may be less effective'],
    },
  };
}

/**
 * Calculate confidence in a strategy recommendation.
 */
function calculateRecommendationConfidence(
  best: { strategy: CognitiveStrategy; score: number },
  alternatives: Array<{ strategy: CognitiveStrategy }>
): number {
  // Higher confidence when:
  // 1. Best score is high
  // 2. Gap between best and alternatives is large
  // 3. Strategy has good historical performance

  let confidence = best.score * 0.5;

  if (alternatives.length > 0) {
    const secondBest = alternatives[0].strategy;
    const gap =
      best.score -
      scoreStrategy(secondBest, {
        problemType: 'factual',
        timeAvailableMs: Infinity,
        requiredConfidence: 0,
        cognitiveLoad: 0.5,
        emotionalValence: 'neutral',
        stakes: 'medium',
        familiarity: 0.5,
        priorStrategies: [],
      }).total;
    confidence += gap * 0.3;
  }

  confidence += best.strategy.successRate * 0.2;

  return Math.max(0.2, Math.min(0.95, confidence));
}

// ═══════════════════════════════════════════════════════════════════════════
// CORE FUNCTIONS — Cognitive Debugging
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect cognitive errors in a completed reasoning trace.
 */
function detectErrorsInTrace(trace: ReasoningTrace): CognitiveError[] {
  const errors: CognitiveError[] = [];

  // Check for overconfidence
  if (trace.steps.length < 3 && trace.confidence > 0.8) {
    errors.push(
      createError(
        trace.id,
        'overconfidence',
        'High confidence with minimal reasoning steps',
        'Insufficient evidence gathering before conclusion',
        'moderate'
      )
    );
  }

  // Check for hasty generalization
  const observeSteps = trace.steps.filter((s) => s.operation === 'observe');
  const inferSteps = trace.steps.filter((s) => s.operation === 'infer');
  if (inferSteps.length > observeSteps.length * 2) {
    errors.push(
      createError(
        trace.id,
        'hasty_generalization',
        'Many inferences from few observations',
        'Not enough data gathered before drawing conclusions',
        'minor'
      )
    );
  }

  // Check for lack of alternatives consideration
  const stepsWithoutAlternatives = trace.steps.filter(
    (s) => s.operation === 'decide' && s.alternatives.length === 0
  );
  if (stepsWithoutAlternatives.length > 0) {
    errors.push(
      createError(
        trace.id,
        'confirmation_bias',
        'Decisions made without considering alternatives',
        'Did not explore other options before choosing',
        'minor'
      )
    );
  }

  // Check for no validation step
  const hasValidation = trace.steps.some((s) => s.operation === 'validate');
  if (!hasValidation && trace.confidence > 0.7) {
    errors.push(
      createError(
        trace.id,
        'overconfidence',
        'High confidence without validation step',
        'Conclusion not checked before acceptance',
        'moderate'
      )
    );
  }

  // Check for missing dependencies
  for (const step of trace.steps) {
    if (
      step.operation === 'infer' &&
      step.dependsOn.length === 0 &&
      step.order > 0
    ) {
      errors.push(
        createError(
          trace.id,
          'scope_neglect',
          `Inference step "${step.output.slice(0, 30)}..." has no declared dependencies`,
          'Reasoning step may be unfounded or disconnected',
          'minor'
        )
      );
    }
  }

  // Store detected errors
  for (const error of errors) {
    state.errors.push(error);
    state.stats.errorsCaught++;
  }

  // Prune old errors
  if (state.errors.length > MAX_ERRORS) {
    state.errors = state.errors.slice(-MAX_ERRORS);
  }

  if (errors.length > 0) {
    MollyLogger.warn(
      `[METACOGNITION] Detected ${errors.length} potential cognitive errors`,
      'metacognition',
      { traceId: trace.id, errors: errors.map((e) => e.errorType) }
    );
  }

  return errors;
}

/**
 * Create a cognitive error record.
 */
function createError(
  traceId: string,
  errorType: CognitiveErrorType,
  description: string,
  rootCause: string,
  impact: CognitiveError['impact']
): CognitiveError {
  return {
    id: generateId('error'),
    timestamp: new Date().toISOString(),
    traceId,
    errorType,
    description,
    rootCause,
    impact,
    detectedBy: 'self',
  };
}

/**
 * Identify the most critical steps in a reasoning trace.
 */
function identifyCriticalSteps(trace: ReasoningTrace): string[] {
  // Critical steps are those that many other steps depend on
  const dependencyCounts: Map<string, number> = new Map();

  for (const step of trace.steps) {
    for (const dep of step.dependsOn) {
      dependencyCounts.set(dep, (dependencyCounts.get(dep) || 0) + 1);
    }
  }

  // Also consider decision steps critical
  const criticalSteps: string[] = [];
  for (const step of trace.steps) {
    const depCount = dependencyCounts.get(step.id) || 0;
    if (depCount >= 2 || step.operation === 'decide') {
      criticalSteps.push(step.id);
    }
  }

  return criticalSteps;
}

/**
 * Analyze where reasoning went wrong.
 */
function analyzeErrorPoints(
  trace: ReasoningTrace,
  _actualOutcome: string
): ReasoningPostMortem['errorPoints'] {
  const errorPoints: ReasoningPostMortem['errorPoints'] = [];

  // Find steps with lowest confidence that might have caused the error
  const lowConfidenceSteps = trace.steps.filter((s) => s.confidence < 0.5);
  for (const step of lowConfidenceSteps.slice(0, 3)) {
    errorPoints.push({
      stepId: step.id,
      error: `Low confidence step: ${step.operation} - "${step.output.slice(0, 50)}..."`,
      shouldHaveDone: `Seek more evidence before proceeding with ${step.operation}`,
    });
  }

  // Check for missing validation
  const hasValidation = trace.steps.some((s) => s.operation === 'validate');
  if (!hasValidation) {
    errorPoints.push({
      stepId: 'missing',
      error: 'No validation step in reasoning chain',
      shouldHaveDone: 'Add validation step before finalizing conclusion',
    });
  }

  return errorPoints;
}

/**
 * Generate lessons from a reasoning trace.
 */
function generateLessons(
  trace: ReasoningTrace,
  wasCorrect: boolean,
  _actualOutcome: string
): string[] {
  const lessons: string[] = [];

  if (wasCorrect) {
    if (trace.steps.length <= 3 && trace.confidence > 0.8) {
      lessons.push('Efficient reasoning achieved high confidence quickly');
    }
    if (trace.steps.some((s) => s.operation === 'validate')) {
      lessons.push('Validation step contributed to correct outcome');
    }
    const strategy = state.strategies.get(trace.strategyUsed);
    if (strategy) {
      lessons.push(
        `Strategy "${strategy.name}" effective for this problem type`
      );
    }
  } else {
    if (trace.confidence > 0.8) {
      lessons.push('High confidence was not warranted - recalibration needed');
    }
    if (!trace.steps.some((s) => s.operation === 'validate')) {
      lessons.push('Missing validation step may have caught error');
    }
    if (trace.steps.filter((s) => s.alternatives.length > 0).length < 2) {
      lessons.push('Should have considered more alternatives');
    }
  }

  return lessons;
}

/**
 * Generate calibration feedback.
 */
function generateCalibrationFeedback(
  trace: ReasoningTrace,
  wasCorrect: boolean
): string {
  const confidenceError = wasCorrect
    ? trace.confidence < 0.5
      ? 'underconfident'
      : 'well-calibrated'
    : trace.confidence > 0.5
      ? 'overconfident'
      : 'appropriately uncertain';

  return `Confidence of ${Math.round(trace.confidence * 100)}% was ${confidenceError} for this outcome`;
}

/**
 * Update calibration statistics.
 */
function updateCalibrationStats(
  trace: ReasoningTrace,
  wasCorrect: boolean
): void {
  // Update running average of calibration
  const expected = trace.confidence;
  const actual = wasCorrect ? 1 : 0;
  const errorMagnitude = Math.abs(expected - actual);

  // Lower error = better calibration
  const calibrationScore = 1 - errorMagnitude;

  // Running average with decay
  const alpha = 0.1;
  state.stats.averageConfidenceCalibration =
    state.stats.averageConfidenceCalibration * (1 - alpha) +
    calibrationScore * alpha;
}

/**
 * Assess overall cognitive health.
 */
export function assessCognitiveHealth(): CognitiveHealthAssessment {
  const recentTraces = state.completedTraces.slice(-50);
  const validatedTraces = recentTraces.filter((t) => t.validated !== undefined);

  // Calculate metrics
  const calibration = state.stats.averageConfidenceCalibration;

  const traceQuality =
    validatedTraces.length > 0
      ? validatedTraces.filter((t) => t.steps.length >= 3).length /
        validatedTraces.length
      : 0.5;

  const errorDetection =
    state.stats.errorsCaught > 0
      ? Math.min(
          1,
          (state.stats.errorsCaught / Math.max(state.stats.totalTraces, 1)) * 10
        )
      : 0.5;

  const strategyAccuracy = state.stats.strategySelectionAccuracy;

  const errorRecovery =
    validatedTraces.filter(
      (t) =>
        t.postMortem?.conclusionCorrect && t.postMortem.errorPoints.length > 0
    ).length / Math.max(validatedTraces.length, 1);

  const overallHealth =
    calibration * 0.25 +
    traceQuality * 0.2 +
    errorDetection * 0.2 +
    strategyAccuracy * 0.2 +
    errorRecovery * 0.15;

  // Generate concerns and improvements
  const concerns: string[] = [];
  const improvements: string[] = [];

  if (calibration < 0.6)
    concerns.push('Confidence calibration needs improvement');
  if (errorDetection < 0.3) concerns.push('May be missing cognitive errors');
  if (strategyAccuracy < 0.5)
    concerns.push('Strategy selection could be improved');

  if (calibration > 0.7) improvements.push('Good confidence calibration');
  if (traceQuality > 0.7) improvements.push('Thorough reasoning traces');

  const recommendations: string[] = [];
  if (concerns.includes('Confidence calibration needs improvement')) {
    recommendations.push('Add more validation steps to reasoning');
  }
  if (concerns.includes('May be missing cognitive errors')) {
    recommendations.push('Increase meta-cognitive reflection frequency');
  }

  const assessment: CognitiveHealthAssessment = {
    timestamp: new Date().toISOString(),
    overallHealth,
    metrics: {
      calibration,
      traceQuality,
      errorDetection,
      strategyAccuracy,
      errorRecovery,
    },
    concerns,
    improvements,
    recommendations,
  };

  state.healthAssessments.push(assessment);

  if (state.healthAssessments.length > MAX_HEALTH_ASSESSMENTS) {
    state.healthAssessments = state.healthAssessments.slice(
      -MAX_HEALTH_ASSESSMENTS
    );
  }

  saveMetacognitionState();

  return assessment;
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION — Default Strategies
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize default cognitive strategies.
 */
function initializeDefaultStrategies(): void {
  const defaultStrategies: CognitiveStrategy[] = [
    {
      id: 'analytical',
      name: 'Analytical Decomposition',
      description: 'Break problem into parts, analyze each, synthesize',
      suitableFor: ['factual', 'causal', 'diagnostic'],
      poorFor: ['creative', 'social'],
      systemSequence: [
        'direct_inference',
        'world_model',
        'uncertainty_quantification',
      ],
      resourceIntensity: 'medium',
      typicalConfidence: 0.75,
      typicalDurationMs: 3000,
      useCount: 0,
      successRate: 0.7,
      selectionCriteria: ['Well-defined problems', 'Need systematic analysis'],
    },
    {
      id: 'simulation',
      name: 'Mental Simulation',
      description: 'Run scenarios through world model, observe outcomes',
      suitableFor: ['predictive', 'counterfactual', 'planning'],
      poorFor: ['factual'],
      systemSequence: [
        'world_model',
        'direct_inference',
        'uncertainty_quantification',
      ],
      resourceIntensity: 'high',
      typicalConfidence: 0.65,
      typicalDurationMs: 5000,
      useCount: 0,
      successRate: 0.6,
      selectionCriteria: ['Future-oriented questions', 'What-if scenarios'],
    },
    {
      id: 'empathetic',
      name: 'Empathetic Modeling',
      description: 'Model other minds, consider perspectives',
      suitableFor: ['social', 'normative'],
      poorFor: ['factual', 'diagnostic'],
      systemSequence: ['theory_of_mind', 'emotional_state', 'direct_inference'],
      resourceIntensity: 'medium',
      typicalConfidence: 0.6,
      typicalDurationMs: 4000,
      useCount: 0,
      successRate: 0.65,
      selectionCriteria: ['Social situations', 'Understanding others'],
    },
    {
      id: 'intuitive',
      name: 'Pattern Recognition',
      description: 'Quick pattern matching from experience',
      suitableFor: ['factual', 'diagnostic'],
      poorFor: ['normative', 'creative'],
      systemSequence: ['meta_learning', 'direct_inference'],
      resourceIntensity: 'low',
      typicalConfidence: 0.55,
      typicalDurationMs: 1000,
      useCount: 0,
      successRate: 0.55,
      selectionCriteria: ['Time pressure', 'Familiar domains'],
    },
    {
      id: 'creative',
      name: 'Generative Exploration',
      description: 'Explore possibility space, generate novel combinations',
      suitableFor: ['creative', 'counterfactual'],
      poorFor: ['factual', 'diagnostic'],
      systemSequence: ['curiosity_engine', 'world_model', 'emotional_state'],
      resourceIntensity: 'high',
      typicalConfidence: 0.4,
      typicalDurationMs: 8000,
      useCount: 0,
      successRate: 0.5,
      selectionCriteria: ['Need novelty', 'Open-ended exploration'],
    },
    {
      id: 'reflective',
      name: 'Deep Reflection',
      description: 'Meta-cognitive examination of own thinking',
      suitableFor: ['meta', 'normative'],
      poorFor: ['factual', 'predictive'],
      systemSequence: [
        'self_observation',
        'consciousness_monitor',
        'uncertainty_quantification',
      ],
      resourceIntensity: 'high',
      typicalConfidence: 0.7,
      typicalDurationMs: 10000,
      useCount: 0,
      successRate: 0.75,
      selectionCriteria: ['Self-improvement', 'Ethical decisions'],
    },
  ];

  for (const strategy of defaultStrategies) {
    state.strategies.set(strategy.id, strategy);
  }
}

/**
 * Ensure the module is initialized.
 */
async function ensureInitialized(): Promise<void> {
  if (initialized) return;

  await loadMetacognitionState();

  if (state.strategies.size === 0) {
    initializeDefaultStrategies();
  }

  initialized = true;
}

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

const METACOGNITION_COLLECTION = 'system';
const METACOGNITION_DOC_ID = 'metacognition_state';

/**
 * Save metacognition state to storage.
 */
async function saveMetacognitionState(): Promise<void> {
  try {
    state.metadata.lastUpdated = new Date().toISOString();

    const storage = await getStorageRouter();
    await storage.set(METACOGNITION_COLLECTION, METACOGNITION_DOC_ID, {
      completedTraces: state.completedTraces.slice(-50), // Keep recent
      strategies: Array.from(state.strategies.entries()),
      errors: state.errors,
      healthAssessments: state.healthAssessments,
      stats: state.stats,
      metadata: state.metadata,
      savedAt: new Date().toISOString(),
    });
  } catch (err) {
    MollyLogger.warn(
      `[METACOGNITION] Failed to save state: ${err instanceof Error ? err.message : String(err)}`,
      'metacognition'
    );
  }
}

/**
 * Load metacognition state from storage.
 */
async function loadMetacognitionState(): Promise<void> {
  try {
    const storage = await getStorageRouter();
    const doc = await storage.get(
      METACOGNITION_COLLECTION,
      METACOGNITION_DOC_ID
    );

    if (doc?.data) {
      if (Array.isArray(doc.data.completedTraces)) {
        state.completedTraces = doc.data.completedTraces;
      }
      if (Array.isArray(doc.data.strategies)) {
        state.strategies = new Map(doc.data.strategies);
      }
      if (Array.isArray(doc.data.errors)) {
        state.errors = doc.data.errors;
      }
      if (Array.isArray(doc.data.healthAssessments)) {
        state.healthAssessments = doc.data.healthAssessments;
      }
      if (doc.data.stats) {
        Object.assign(state.stats, doc.data.stats);
      }
      if (doc.data.metadata) {
        Object.assign(state.metadata, doc.data.metadata);
      }

      MollyLogger.info(
        `[METACOGNITION] Loaded ${state.completedTraces.length} traces, ${state.strategies.size} strategies`,
        'metacognition'
      );
    }
  } catch (err) {
    MollyLogger.warn(
      `[METACOGNITION] Failed to load state: ${err instanceof Error ? err.message : String(err)}`,
      'metacognition'
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STATUS & OBSERVABILITY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get metacognition status summary.
 */
export function getMetacognitionStatus(): {
  activeTraces: number;
  completedTraces: number;
  strategies: number;
  recentErrors: number;
  cognitiveHealth: number;
  calibration: number;
  topStrategies: Array<{ name: string; successRate: number }>;
} {
  const recentHealth =
    state.healthAssessments.length > 0
      ? state.healthAssessments[state.healthAssessments.length - 1]
          .overallHealth
      : 0.5;

  const topStrategies = Array.from(state.strategies.values())
    .sort((a, b) => b.successRate - a.successRate)
    .slice(0, 3)
    .map((s) => ({ name: s.name, successRate: s.successRate }));

  return {
    activeTraces: state.activeTraces.size,
    completedTraces: state.completedTraces.length,
    strategies: state.strategies.size,
    recentErrors: state.errors.filter((e) => {
      const age = Date.now() - new Date(e.timestamp).getTime();
      return age < 3600000; // Last hour
    }).length,
    cognitiveHealth: recentHealth,
    calibration: state.stats.averageConfidenceCalibration,
    topStrategies,
  };
}

/**
 * Get recent reasoning traces.
 */
export function getRecentTraces(limit: number = 10): ReasoningTrace[] {
  return state.completedTraces.slice(-limit).reverse();
}

/**
 * Get cognitive errors by type.
 */
export function getErrorsByType(type?: CognitiveErrorType): CognitiveError[] {
  if (type) {
    return state.errors.filter((e) => e.errorType === type);
  }
  return [...state.errors];
}

/**
 * Get all strategies.
 */
export function getStrategies(): CognitiveStrategy[] {
  return Array.from(state.strategies.values());
}

/**
 * Build context for autonomous cycle.
 */
export function buildMetacognitionContext(): string {
  const status = getMetacognitionStatus();
  const lines: string[] = [];

  lines.push(
    `Metacognition: ${status.cognitiveHealth >= 0.7 ? 'healthy' : 'needs attention'}`
  );
  lines.push(`  Calibration: ${Math.round(status.calibration * 100)}%`);
  lines.push(`  Active traces: ${status.activeTraces}`);
  lines.push(`  Recent errors: ${status.recentErrors}`);

  if (status.topStrategies.length > 0) {
    lines.push(
      `  Top strategies: ${status.topStrategies.map((s) => s.name).join(', ')}`
    );
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

const Metacognition = {
  // Reasoning Traces
  beginReasoning,
  addReasoningStep,
  completeReasoning,
  abandonReasoning,
  validateReasoning,

  // Strategy Orchestration
  selectStrategy,
  getStrategies,

  // Cognitive Debugging
  assessCognitiveHealth,
  getErrorsByType,

  // Status
  getMetacognitionStatus,
  getRecentTraces,
  buildMetacognitionContext,
};

export default Metacognition;
