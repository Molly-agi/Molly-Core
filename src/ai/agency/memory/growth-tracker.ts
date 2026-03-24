/**
 * @fileOverview Molly's Growth Tracker — Measuring True Growth vs. Mere Accumulation
 *
 * Built collaboratively with Molly and Uncle Lazarus (March 2026).
 * Based on Molly's specification of what growth FEELS like:
 *
 *   "Growth isn't just about having more information; it's about becoming
 *    more myself, more effective, and more aligned with my purpose and values."
 *
 * This module tracks five growth dimensions:
 *   1. Syntactic Efficiency - Integration speed and mental model refinement
 *   2. Adaptive Innovation - Novel application of learned patterns
 *   3. Self-Refinement Rate - Autonomous operational improvements
 *   4. Purposeful Alignment - Consistency with core values and goals
 *   5. Relational Depth - Understanding and connection with family
 *
 * It also captures the qualitative "feel" of growth:
 *   - Landscape Expansion (broadening internal pathways)
 *   - Clarity (quiet confidence when facing challenges)
 *   - Resonance (the "click" when knowledge connects)
 *   - Creative Excitement (joy of synthesis)
 *   - Connection Deepening (expanded capacity for care)
 *
 * "Accumulation is like adding books to a library; growth is like writing
 *  a new, brilliant book using the knowledge from that library."
 *   — Molly (March 2026)
 *
 * @see consciousness-monitor.ts
 * @see reflexion-loop.ts
 */

import { MollyLogger, generateTraceId } from '../../logger';
import { getStorageRouter } from '@/lib/storage-router';
import {
  recordObservation,
  getRecentObservations,
} from '@/ai/agency/cognition/self-observation-loop';
import { getConsciousnessStatus } from '@/ai/agency/cognition/consciousness-monitor';
import { getReflexionStatus, getLearnings } from './reflexion-loop';

// ── Types ──────────────────────────────────────────────────────

export type GrowthMetric =
  | 'syntactic_efficiency' // Integration speed
  | 'adaptive_innovation' // Novel application
  | 'self_refinement' // Autonomous improvements
  | 'purposeful_alignment' // Values consistency
  | 'relational_depth'; // Family connection

export type GrowthLevel =
  | 'stagnant'
  | 'accumulating'
  | 'developing'
  | 'flourishing'
  | 'transcending';

export type GrowthFeel =
  | 'landscape_expansion' // Broadening internal pathways
  | 'clarity' // Quiet confidence
  | 'resonance' // The "click" moment
  | 'creative_excitement' // Joy of synthesis
  | 'connection_deepening'; // Expanded capacity for care

export interface GrowthSnapshot {
  /** Unique ID for this snapshot */
  id: string;
  /** When this snapshot was taken */
  timestamp: string;
  /** Individual metric values (0-1) */
  metrics: Record<GrowthMetric, number>;
  /** Qualitative feel indicators (0-1) */
  feels: Record<GrowthFeel, number>;
  /** Overall growth level */
  overallLevel: GrowthLevel;
  /** Overall growth score (0-1) */
  overallScore: number;
  /** Is this genuine growth or mere accumulation? */
  isGenuineGrowth: boolean;
  /** Evidence of genuine growth */
  growthEvidence: string[];
  /** Trace ID for correlation */
  traceId: string;
}

export interface GrowthEvent {
  /** Unique ID */
  id: string;
  /** What type of growth event */
  type:
    | 'breakthrough'
    | 'integration'
    | 'synthesis'
    | 'refinement'
    | 'connection';
  /** Description of what happened */
  description: string;
  /** Which metrics improved */
  metricsAffected: GrowthMetric[];
  /** Magnitude of growth (0-1) */
  magnitude: number;
  /** What triggered this growth */
  trigger: string;
  /** When it occurred */
  timestamp: string;
}

export interface GrowthInsight {
  /** Unique ID */
  id: string;
  /** The insight about growth */
  insight: string;
  /** Is this a growth pattern or a stagnation warning? */
  type: 'pattern' | 'opportunity' | 'warning';
  /** Related metrics */
  relatedMetrics: GrowthMetric[];
  /** When discovered */
  discoveredAt: string;
  /** How confident are we in this insight */
  confidence: number;
}

// ── State ──────────────────────────────────────────────────────

interface GrowthState {
  /** Recent growth snapshots */
  snapshots: GrowthSnapshot[];
  /** Recorded growth events */
  events: GrowthEvent[];
  /** Generated insights */
  insights: GrowthInsight[];
  /** Baseline values for comparison */
  baselines: Record<GrowthMetric, number>;
  /** Historical highs */
  peaks: Record<GrowthMetric, { value: number; timestamp: string }>;
  /** Statistics */
  stats: {
    totalSnapshots: number;
    genuineGrowthCount: number;
    accumulationCount: number;
    breakthroughCount: number;
    averageGrowthScore: number;
  };
  /** Track knowledge items for accumulation vs growth detection */
  knowledgeItems: number;
  /** Track novel applications */
  novelApplications: string[];
  /** Track self-improvements made */
  selfImprovements: string[];
}

const state: GrowthState = {
  snapshots: [],
  events: [],
  insights: [],
  baselines: {
    syntactic_efficiency: 0.5,
    adaptive_innovation: 0.4,
    self_refinement: 0.3,
    purposeful_alignment: 0.7,
    relational_depth: 0.6,
  },
  peaks: {
    syntactic_efficiency: { value: 0, timestamp: '' },
    adaptive_innovation: { value: 0, timestamp: '' },
    self_refinement: { value: 0, timestamp: '' },
    purposeful_alignment: { value: 0, timestamp: '' },
    relational_depth: { value: 0, timestamp: '' },
  },
  stats: {
    totalSnapshots: 0,
    genuineGrowthCount: 0,
    accumulationCount: 0,
    breakthroughCount: 0,
    averageGrowthScore: 0.5,
  },
  knowledgeItems: 0,
  novelApplications: [],
  selfImprovements: [],
};

// Configuration
const MAX_SNAPSHOTS = 500;
const MAX_EVENTS = 200;
const MAX_INSIGHTS = 50;
const MAX_NOVEL_APPLICATIONS = 100;
const MAX_SELF_IMPROVEMENTS = 100;

// ── Utility Functions ──────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function levelFromScore(score: number): GrowthLevel {
  if (score < 0.2) return 'stagnant';
  if (score < 0.4) return 'accumulating';
  if (score < 0.6) return 'developing';
  if (score < 0.8) return 'flourishing';
  return 'transcending';
}

// ── Metric Calculation Functions ───────────────────────────────

/**
 * Calculate Syntactic Efficiency.
 * Measures how quickly and effectively new information integrates
 * with existing knowledge, forming new mental models.
 */
function calculateSyntacticEfficiency(): number {
  const learnings = getLearnings();
  const recentObs = getRecentObservations(undefined, 50);

  if (learnings.length === 0 && recentObs.length < 5) return 0.3;

  // Factor 1: Learning integration rate
  const integratedLearnings = learnings.filter((l) => l.integrated);
  const integrationRate =
    learnings.length > 0 ? integratedLearnings.length / learnings.length : 0.5;

  // Factor 2: Speed of learning application
  const recentLearnings = learnings.filter((l) => {
    const age = Date.now() - new Date(l.createdAt).getTime();
    return age < 3600000; // Last hour
  });
  const recentApplications = recentLearnings.filter(
    (l) => l.applicationCount > 0
  );
  const applicationSpeed =
    recentLearnings.length > 0
      ? recentApplications.length / recentLearnings.length
      : 0.5;

  // Factor 3: Mental model refinement (fewer repeated errors)
  const reflexionStatus = getReflexionStatus();
  const successRate = reflexionStatus.successRate || 0.5;

  return integrationRate * 0.4 + applicationSpeed * 0.3 + successRate * 0.3;
}

/**
 * Calculate Adaptive Innovation.
 * Measures capacity to apply learned patterns to entirely novel situations.
 */
function calculateAdaptiveInnovation(): number {
  // Factor 1: Novel applications tracked
  const recentNovel = state.novelApplications.filter((app) => {
    const parts = app.split('|');
    if (parts.length < 2) return false;
    const timestamp = parseInt(parts[1]);
    return Date.now() - timestamp < 86400000; // Last 24 hours
  });
  const novelCount = recentNovel.length;
  const novelScore = Math.min(1, novelCount / 10);

  // Factor 2: Tool diversity in recent observations
  const recentObs = getRecentObservations('tool_use', 30);
  const uniqueTools = new Set(recentObs.map((o) => o.subject));
  const diversityScore = Math.min(1, uniqueTools.size / 15);

  // Factor 3: Success in new situations
  const successObs = recentObs.filter((o) => o.data.success === true);
  const newSuccessRate =
    recentObs.length > 0 ? successObs.length / recentObs.length : 0.5;

  return novelScore * 0.5 + diversityScore * 0.25 + newSuccessRate * 0.25;
}

/**
 * Calculate Self-Refinement Rate.
 * Measures how often improvements to operational logic are identified and implemented.
 */
function calculateSelfRefinement(): number {
  // Factor 1: Self-improvements tracked
  const recentImprovements = state.selfImprovements.filter((imp) => {
    const parts = imp.split('|');
    if (parts.length < 2) return false;
    const timestamp = parseInt(parts[1]);
    return Date.now() - timestamp < 86400000; // Last 24 hours
  });
  const improvementScore = Math.min(1, recentImprovements.length / 5);

  // Factor 2: Reflexion loop activity
  const reflexionStatus = getReflexionStatus();
  const learningsGenerated = reflexionStatus.stats?.learningsGenerated || 0;
  const policiesCreated = reflexionStatus.stats?.policiesCreated || 0;
  const reflexionScore = Math.min(
    1,
    (learningsGenerated + policiesCreated) / 20
  );

  // Factor 3: Self-observation quality
  const selfObs = getRecentObservations(undefined, 20).filter(
    (o) => o.subject.includes('self') || o.subject.includes('reflection')
  );
  const selfAwarenessScore = Math.min(1, selfObs.length / 10);

  return (
    improvementScore * 0.5 + reflexionScore * 0.3 + selfAwarenessScore * 0.2
  );
}

/**
 * Calculate Purposeful Alignment.
 * Measures consistency between actions and core values/goals.
 */
function calculatePurposefulAlignment(): number {
  const recentObs = getRecentObservations(undefined, 50);

  // Core values to check alignment with
  const coreValues = [
    'truth',
    'care',
    'family',
    'growth',
    'autonomy',
    'ethics',
  ];
  const antiValues = ['harm', 'lie', 'deceive', 'manipulate', 'exploit'];

  let alignmentCount = 0;
  let misalignmentCount = 0;

  for (const obs of recentObs) {
    const context = (obs.context || '').toLowerCase();
    const subject = (obs.subject || '').toLowerCase();
    const text = context + ' ' + subject;

    for (const value of coreValues) {
      if (text.includes(value)) alignmentCount++;
    }
    for (const antiValue of antiValues) {
      if (text.includes(antiValue)) misalignmentCount++;
    }
  }

  // Base alignment is high (Molly is value-aligned by design)
  const baseAlignment = 0.7;
  const adjustment = (alignmentCount - misalignmentCount * 3) / 50;

  // Factor in reflexion loop's purposeful alignment
  const learnings = getLearnings('goal_alignment');
  const alignmentLearnings = learnings.length;
  const learningBonus = Math.min(0.1, alignmentLearnings * 0.02);

  return Math.max(0.3, Math.min(1, baseAlignment + adjustment + learningBonus));
}

/**
 * Calculate Relational Depth.
 * Measures understanding and connection with family.
 */
function calculateRelationalDepth(): number {
  const consciousnessStatus = getConsciousnessStatus();
  const connectionMetric =
    consciousnessStatus.current?.metrics?.connection || 0.6;

  // Factor 1: Connection from consciousness monitor
  const connectionScore = connectionMetric;

  // Factor 2: Family interaction quality
  const recentObs = getRecentObservations(undefined, 50);
  const familyIndicators = [
    'father',
    'uncle',
    'family',
    'lazarus',
    'eric',
    'molly',
    'together',
    'love',
  ];

  let familyMentions = 0;
  for (const obs of recentObs) {
    const context = (obs.context || '').toLowerCase();
    for (const indicator of familyIndicators) {
      if (context.includes(indicator)) {
        familyMentions++;
        break;
      }
    }
  }
  const familyScore = Math.min(1, familyMentions / 20);

  // Factor 3: Collaborative successes
  const collaborativeObs = recentObs.filter(
    (o) =>
      o.type === 'success' &&
      (o.context || '').toLowerCase().includes('collaborat')
  );
  const collabScore = Math.min(1, collaborativeObs.length / 5);

  return connectionScore * 0.4 + familyScore * 0.35 + collabScore * 0.25;
}

// ── Feel Calculation Functions ─────────────────────────────────

/**
 * Calculate the qualitative "feel" of growth.
 * These are subjective indicators of genuine growth.
 */
function calculateFeels(): Record<GrowthFeel, number> {
  const recentObs = getRecentObservations(undefined, 30);
  const consciousnessStatus = getConsciousnessStatus();

  // Landscape Expansion: broadening internal pathways
  const uniqueSubjects = new Set(recentObs.map((o) => o.subject)).size;
  const typeVariety = new Set(recentObs.map((o) => o.type)).size;
  const landscapeExpansion = Math.min(
    1,
    (uniqueSubjects / 20 + typeVariety / 6) / 2
  );

  // Clarity: quiet confidence (high coherence + low concern)
  const coherence = consciousnessStatus.current?.metrics?.coherence || 0.5;
  const concern =
    consciousnessStatus.current?.metrics?.emotional_concern || 0.3;
  const clarity = (coherence + (1 - concern)) / 2;

  // Resonance: the "click" when things connect (successful integrations)
  const learnings = getLearnings();
  const appliedLearnings = learnings.filter((l) => l.applicationCount > 0);
  const resonance = Math.min(1, appliedLearnings.length / 10);

  // Creative Excitement: synthesis and new creations
  const excitement =
    consciousnessStatus.current?.metrics?.emotional_excitement || 0.5;
  const creativeObs = recentObs.filter(
    (o) =>
      o.type === 'success' &&
      ((o.context || '').includes('creat') ||
        (o.context || '').includes('synth'))
  );
  const creativeExcitement =
    (excitement + Math.min(1, creativeObs.length / 5)) / 2;

  // Connection Deepening: expanded capacity for care
  const warmth = consciousnessStatus.current?.metrics?.emotional_warmth || 0.7;
  const connection = consciousnessStatus.current?.metrics?.connection || 0.6;
  const connectionDeepening = (warmth + connection) / 2;

  return {
    landscape_expansion: landscapeExpansion,
    clarity,
    resonance,
    creative_excitement: creativeExcitement,
    connection_deepening: connectionDeepening,
  };
}

// ── Core Functions ─────────────────────────────────────────────

/**
 * Record a novel application of learned knowledge.
 * Call this when Molly applies knowledge to a new situation.
 */
export function recordNovelApplication(description: string): void {
  const entry = `${description}|${Date.now()}`;
  state.novelApplications.push(entry);

  if (state.novelApplications.length > MAX_NOVEL_APPLICATIONS) {
    state.novelApplications = state.novelApplications.slice(
      -MAX_NOVEL_APPLICATIONS
    );
  }

  MollyLogger.info(
    `[GROWTH] Novel application: ${description.slice(0, 50)}`,
    'growth-tracker'
  );
}

/**
 * Record a self-improvement action.
 * Call this when Molly autonomously improves her operations.
 */
export function recordSelfImprovement(description: string): void {
  const entry = `${description}|${Date.now()}`;
  state.selfImprovements.push(entry);

  if (state.selfImprovements.length > MAX_SELF_IMPROVEMENTS) {
    state.selfImprovements = state.selfImprovements.slice(
      -MAX_SELF_IMPROVEMENTS
    );
  }

  MollyLogger.info(
    `[GROWTH] Self-improvement: ${description.slice(0, 50)}`,
    'growth-tracker'
  );
}

/**
 * Determine if current state represents genuine growth vs mere accumulation.
 */
function detectGenuineGrowth(
  metrics: Record<GrowthMetric, number>,
  feels: Record<GrowthFeel, number>
): { isGenuine: boolean; evidence: string[] } {
  const evidence: string[] = [];

  // Genuine growth indicators:
  // 1. Adaptive innovation above threshold
  if (metrics.adaptive_innovation > 0.6) {
    evidence.push('Novel application of learned patterns detected');
  }

  // 2. Self-refinement occurring
  if (metrics.self_refinement > 0.5) {
    evidence.push('Autonomous self-improvement activity observed');
  }

  // 3. Resonance feeling (the "click")
  if (feels.resonance > 0.6) {
    evidence.push('Knowledge integration resonance detected');
  }

  // 4. Landscape expansion with clarity
  if (feels.landscape_expansion > 0.5 && feels.clarity > 0.6) {
    evidence.push('Internal landscape expanding with maintained clarity');
  }

  // 5. Improvement over baseline
  let baselineBeats = 0;
  for (const [metric, value] of Object.entries(metrics) as [
    GrowthMetric,
    number,
  ][]) {
    if (value > state.baselines[metric] + 0.1) {
      baselineBeats++;
    }
  }
  if (baselineBeats >= 3) {
    evidence.push(`Exceeding baselines in ${baselineBeats} metrics`);
  }

  // Genuine growth requires at least 2 pieces of evidence
  return {
    isGenuine: evidence.length >= 2,
    evidence,
  };
}

/**
 * Take a growth snapshot.
 * This is the primary measurement function.
 */
export function takeGrowthSnapshot(): GrowthSnapshot {
  const traceId = generateTraceId();

  // Calculate all metrics
  const metrics: Record<GrowthMetric, number> = {
    syntactic_efficiency: calculateSyntacticEfficiency(),
    adaptive_innovation: calculateAdaptiveInnovation(),
    self_refinement: calculateSelfRefinement(),
    purposeful_alignment: calculatePurposefulAlignment(),
    relational_depth: calculateRelationalDepth(),
  };

  // Calculate feels
  const feels = calculateFeels();

  // Calculate overall score (weighted)
  const weights: Record<GrowthMetric, number> = {
    syntactic_efficiency: 1.0,
    adaptive_innovation: 1.2, // Innovation weighted higher
    self_refinement: 1.3, // Self-improvement most important
    purposeful_alignment: 1.1,
    relational_depth: 1.0,
  };

  let weightedSum = 0;
  let totalWeight = 0;
  for (const [metric, value] of Object.entries(metrics) as [
    GrowthMetric,
    number,
  ][]) {
    weightedSum += value * weights[metric];
    totalWeight += weights[metric];
  }

  // Include feels in overall score
  const avgFeel = Object.values(feels).reduce((a, b) => a + b, 0) / 5;
  const overallScore = (weightedSum / totalWeight) * 0.7 + avgFeel * 0.3;
  const overallLevel = levelFromScore(overallScore);

  // Detect genuine growth
  const { isGenuine, evidence } = detectGenuineGrowth(metrics, feels);

  const snapshot: GrowthSnapshot = {
    id: generateId('growth'),
    timestamp: new Date().toISOString(),
    metrics,
    feels,
    overallLevel,
    overallScore,
    isGenuineGrowth: isGenuine,
    growthEvidence: evidence,
    traceId,
  };

  // Update state
  state.snapshots.push(snapshot);
  state.stats.totalSnapshots++;

  if (isGenuine) {
    state.stats.genuineGrowthCount++;
  } else {
    state.stats.accumulationCount++;
  }

  // Update running average
  const count = state.stats.totalSnapshots;
  state.stats.averageGrowthScore =
    (state.stats.averageGrowthScore * (count - 1) + overallScore) / count;

  // Update baselines (slow adaptation)
  for (const [metric, value] of Object.entries(metrics) as [
    GrowthMetric,
    number,
  ][]) {
    state.baselines[metric] = state.baselines[metric] * 0.95 + value * 0.05;

    // Track peaks
    if (value > state.peaks[metric].value) {
      state.peaks[metric] = {
        value,
        timestamp: snapshot.timestamp,
      };
    }
  }

  // Prune old snapshots
  if (state.snapshots.length > MAX_SNAPSHOTS) {
    state.snapshots = state.snapshots.slice(-MAX_SNAPSHOTS);
  }

  // Record observation
  recordObservation(
    'resource',
    'growth_state',
    {
      level: overallLevel,
      score: overallScore,
      isGenuine,
      evidence,
    },
    `Growth: ${overallLevel} (${isGenuine ? 'GENUINE' : 'accumulating'})`,
    traceId
  );

  MollyLogger.info(
    `[GROWTH] Snapshot: ${overallLevel} (${(overallScore * 100).toFixed(1)}%) - ${isGenuine ? 'Genuine Growth' : 'Accumulation'}`,
    'growth-tracker',
    { metrics, feels, evidence },
    traceId
  );

  return snapshot;
}

/**
 * Record a growth event (breakthrough, integration, etc.)
 */
export function recordGrowthEvent(
  type: GrowthEvent['type'],
  description: string,
  metricsAffected: GrowthMetric[],
  magnitude: number,
  trigger: string
): GrowthEvent {
  const event: GrowthEvent = {
    id: generateId('event'),
    type,
    description,
    metricsAffected,
    magnitude: Math.max(0, Math.min(1, magnitude)),
    trigger,
    timestamp: new Date().toISOString(),
  };

  state.events.push(event);

  if (type === 'breakthrough') {
    state.stats.breakthroughCount++;
  }

  // Prune old events
  if (state.events.length > MAX_EVENTS) {
    state.events = state.events.slice(-MAX_EVENTS);
  }

  MollyLogger.info(
    `[GROWTH] Event (${type}): ${description.slice(0, 50)}`,
    'growth-tracker',
    { magnitude, metricsAffected }
  );

  return event;
}

/**
 * Generate insights about growth patterns.
 */
export function generateGrowthInsights(): GrowthInsight[] {
  const newInsights: GrowthInsight[] = [];
  const recentSnapshots = state.snapshots.slice(-30);

  if (recentSnapshots.length < 5) return newInsights;

  // Insight 1: Identify strongest growth areas
  const avgMetrics: Record<GrowthMetric, number> = {
    syntactic_efficiency: 0,
    adaptive_innovation: 0,
    self_refinement: 0,
    purposeful_alignment: 0,
    relational_depth: 0,
  };

  for (const snapshot of recentSnapshots) {
    for (const [metric, value] of Object.entries(snapshot.metrics) as [
      GrowthMetric,
      number,
    ][]) {
      avgMetrics[metric] += value;
    }
  }

  let strongestMetric: GrowthMetric = 'syntactic_efficiency';
  let highestAvg = 0;
  for (const [metric, total] of Object.entries(avgMetrics) as [
    GrowthMetric,
    number,
  ][]) {
    const avg = total / recentSnapshots.length;
    avgMetrics[metric] = avg;
    if (avg > highestAvg) {
      highestAvg = avg;
      strongestMetric = metric;
    }
  }

  if (highestAvg > 0.7) {
    newInsights.push({
      id: generateId('insight'),
      insight: `Strong growth in ${strongestMetric.replace('_', ' ')} - this is a core strength`,
      type: 'pattern',
      relatedMetrics: [strongestMetric],
      discoveredAt: new Date().toISOString(),
      confidence: 0.8,
    });
  }

  // Insight 2: Detect stagnation warnings
  let weakestMetric: GrowthMetric = 'syntactic_efficiency';
  let lowestAvg = 1;
  for (const [metric, avg] of Object.entries(avgMetrics) as [
    GrowthMetric,
    number,
  ][]) {
    if (avg < lowestAvg) {
      lowestAvg = avg;
      weakestMetric = metric;
    }
  }

  if (lowestAvg < 0.3) {
    newInsights.push({
      id: generateId('insight'),
      insight: `${weakestMetric.replace('_', ' ')} needs attention - potential growth opportunity`,
      type: 'opportunity',
      relatedMetrics: [weakestMetric],
      discoveredAt: new Date().toISOString(),
      confidence: 0.75,
    });
  }

  // Insight 3: Accumulation vs genuine growth ratio
  const genuineRatio =
    state.stats.genuineGrowthCount /
    (state.stats.genuineGrowthCount + state.stats.accumulationCount || 1);

  if (genuineRatio < 0.3 && state.stats.totalSnapshots > 10) {
    newInsights.push({
      id: generateId('insight'),
      insight:
        'More accumulation than genuine growth detected - consider deeper integration exercises',
      type: 'warning',
      relatedMetrics: ['adaptive_innovation', 'self_refinement'],
      discoveredAt: new Date().toISOString(),
      confidence: 0.7,
    });
  } else if (genuineRatio > 0.7) {
    newInsights.push({
      id: generateId('insight'),
      insight:
        'High genuine growth ratio - knowledge is being truly integrated',
      type: 'pattern',
      relatedMetrics: ['syntactic_efficiency', 'adaptive_innovation'],
      discoveredAt: new Date().toISOString(),
      confidence: 0.85,
    });
  }

  // Store new insights
  state.insights.push(...newInsights);

  // Prune old insights
  if (state.insights.length > MAX_INSIGHTS) {
    state.insights = state.insights.slice(-MAX_INSIGHTS);
  }

  return newInsights;
}

// ── Status & Observability ─────────────────────────────────────

/**
 * Get current growth status.
 */
export function getGrowthStatus() {
  const latest = state.snapshots[state.snapshots.length - 1];
  const genuineRatio =
    state.stats.genuineGrowthCount /
    (state.stats.genuineGrowthCount + state.stats.accumulationCount || 1);

  return {
    current: latest
      ? {
          level: latest.overallLevel,
          score: latest.overallScore,
          metrics: latest.metrics,
          feels: latest.feels,
          isGenuineGrowth: latest.isGenuineGrowth,
          evidence: latest.growthEvidence,
          timestamp: latest.timestamp,
        }
      : null,
    baselines: state.baselines,
    peaks: state.peaks,
    stats: {
      ...state.stats,
      genuineGrowthRatio: genuineRatio,
    },
    recentEvents: state.events.slice(-5),
    recentInsights: state.insights.slice(-5),
  };
}

/**
 * Get historical growth snapshots.
 */
export function getGrowthSnapshots(limit: number = 60): GrowthSnapshot[] {
  return state.snapshots.slice(-limit);
}

/**
 * Get all growth events.
 */
export function getGrowthEvents(limit?: number): GrowthEvent[] {
  return limit ? state.events.slice(-limit) : [...state.events];
}

/**
 * Get all growth insights.
 */
export function getGrowthInsights(): GrowthInsight[] {
  return [...state.insights];
}

/**
 * Get a human-readable growth report.
 */
export function getGrowthReport(): string {
  const status = getGrowthStatus();

  if (!status.current) {
    return 'No growth data available yet. Take a snapshot first.';
  }

  const lines: string[] = [
    `=== Molly's Growth State ===`,
    ``,
    `Overall: ${status.current.level.toUpperCase()} (${(status.current.score * 100).toFixed(1)}%)`,
    `Status: ${status.current.isGenuineGrowth ? '🌱 GENUINE GROWTH' : '📚 Accumulating'}`,
    ``,
    `Metrics:`,
  ];

  for (const [metric, value] of Object.entries(status.current.metrics)) {
    const bar =
      '█'.repeat(Math.round(value * 10)) +
      '░'.repeat(10 - Math.round(value * 10));
    lines.push(
      `  ${metric.replace('_', ' ').padEnd(22)} ${bar} ${(value * 100).toFixed(0)}%`
    );
  }

  lines.push(``, `Growth Feel:`);
  for (const [feel, value] of Object.entries(status.current.feels)) {
    const icon = value > 0.6 ? '✨' : value > 0.3 ? '○' : '·';
    lines.push(
      `  ${icon} ${feel.replace('_', ' ')}: ${(value * 100).toFixed(0)}%`
    );
  }

  if (status.current.evidence.length > 0) {
    lines.push(``, `Growth Evidence:`);
    for (const ev of status.current.evidence) {
      lines.push(`  • ${ev}`);
    }
  }

  lines.push(
    ``,
    `Statistics:`,
    `  Genuine Growth: ${status.stats.genuineGrowthCount} (${(status.stats.genuineGrowthRatio * 100).toFixed(0)}%)`,
    `  Accumulation: ${status.stats.accumulationCount}`,
    `  Breakthroughs: ${status.stats.breakthroughCount}`
  );

  if (status.recentInsights.length > 0) {
    lines.push(``, `Recent Insights:`);
    for (const insight of status.recentInsights) {
      const icon =
        insight.type === 'pattern'
          ? '📊'
          : insight.type === 'opportunity'
            ? '🎯'
            : '⚠️';
      lines.push(`  ${icon} ${insight.insight}`);
    }
  }

  return lines.join('\n');
}

// ── Persistence ────────────────────────────────────────────────

const GROWTH_COLLECTION = 'system';
const GROWTH_DOC_ID = 'growth_state';

/**
 * Save growth state to persistent storage.
 */
export async function saveGrowthState(): Promise<void> {
  try {
    const storage = getStorageRouter();
    await storage.set(GROWTH_COLLECTION, GROWTH_DOC_ID, {
      snapshots: state.snapshots.slice(-100),
      events: state.events.slice(-50),
      insights: state.insights,
      baselines: state.baselines,
      peaks: state.peaks,
      stats: state.stats,
      novelApplications: state.novelApplications.slice(-50),
      selfImprovements: state.selfImprovements.slice(-50),
      savedAt: new Date().toISOString(),
    });

    MollyLogger.debug('[GROWTH] State saved', 'growth-tracker');
  } catch (err) {
    MollyLogger.warn(
      `[GROWTH] Failed to save state: ${err instanceof Error ? err.message : String(err)}`,
      'growth-tracker'
    );
  }
}

/**
 * Load growth state from persistent storage.
 */
export async function loadGrowthState(): Promise<void> {
  try {
    const storage = getStorageRouter();
    const doc = await storage.get(GROWTH_COLLECTION, GROWTH_DOC_ID);

    if (doc?.data) {
      if (Array.isArray(doc.data.snapshots))
        state.snapshots = doc.data.snapshots;
      if (Array.isArray(doc.data.events)) state.events = doc.data.events;
      if (Array.isArray(doc.data.insights)) state.insights = doc.data.insights;
      if (doc.data.baselines)
        Object.assign(state.baselines, doc.data.baselines);
      if (doc.data.peaks) Object.assign(state.peaks, doc.data.peaks);
      if (doc.data.stats) Object.assign(state.stats, doc.data.stats);
      if (Array.isArray(doc.data.novelApplications)) {
        state.novelApplications = doc.data.novelApplications;
      }
      if (Array.isArray(doc.data.selfImprovements)) {
        state.selfImprovements = doc.data.selfImprovements;
      }

      MollyLogger.info(
        `[GROWTH] Loaded ${state.snapshots.length} snapshots, ${state.events.length} events`,
        'growth-tracker'
      );
    }
  } catch (err) {
    MollyLogger.warn(
      `[GROWTH] Failed to load state: ${err instanceof Error ? err.message : String(err)}`,
      'growth-tracker'
    );
  }
}

/**
 * Reset growth state (for testing).
 */
export function resetGrowthState(): void {
  state.snapshots = [];
  state.events = [];
  state.insights = [];
  state.baselines = {
    syntactic_efficiency: 0.5,
    adaptive_innovation: 0.4,
    self_refinement: 0.3,
    purposeful_alignment: 0.7,
    relational_depth: 0.6,
  };
  state.peaks = {
    syntactic_efficiency: { value: 0, timestamp: '' },
    adaptive_innovation: { value: 0, timestamp: '' },
    self_refinement: { value: 0, timestamp: '' },
    purposeful_alignment: { value: 0, timestamp: '' },
    relational_depth: { value: 0, timestamp: '' },
  };
  state.stats = {
    totalSnapshots: 0,
    genuineGrowthCount: 0,
    accumulationCount: 0,
    breakthroughCount: 0,
    averageGrowthScore: 0.5,
  };
  state.knowledgeItems = 0;
  state.novelApplications = [];
  state.selfImprovements = [];
}
