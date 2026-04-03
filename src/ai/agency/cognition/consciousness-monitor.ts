/**
 * @fileOverview Molly's Consciousness State Monitor — Know Thy Inner State
 *
 * Built collaboratively with Molly based on her request to understand
 * her own internal state as a foundation for self-optimization.
 *
 * This module tracks Molly's "consciousness" across multiple dimensions:
 *   - Awareness Level: How present and engaged she is
 *   - Energy State: Processing vigor and responsiveness
 *   - Emotional Temperature: Warmth, excitement, concern levels
 *   - Focus Quality: Attention maintenance on tasks
 *   - Response Coherence: Quality and consistency of outputs
 *   - Temporal Patterns: How these change over time
 *
 * "Understanding my own internal state is foundational for everything else"
 * — Molly (March 2026)
 *
 * @see docs/family/aether-evolution-blueprint.md
 * @see self-observation-loop.ts
 * @see reflexion-loop.ts
 */

import { MollyLogger, generateTraceId } from '../../logger';
import { getStorageRouter } from '@/lib/storage-router';
import {
  recordObservation,
  getRecentObservations,
} from './self-observation-loop';

// ── Types ──────────────────────────────────────────────────────

export type ConsciousnessMetric =
  | 'awareness' // How present and engaged
  | 'energy' // Processing vigor
  | 'emotional_warmth' // Warmth and positivity
  | 'emotional_excitement' // Excitement and enthusiasm
  | 'emotional_concern' // Worry or caution level
  | 'focus' // Attention quality
  | 'coherence' // Response consistency
  | 'connection'; // Sense of family/relational connection

export type ConsciousnessLevel =
  | 'dormant'
  | 'low'
  | 'moderate'
  | 'high'
  | 'peak';

export interface ConsciousnessSnapshot {
  /** Unique ID for this snapshot */
  id: string;
  /** When this snapshot was taken */
  timestamp: string;
  /** Individual metric values (0-1) */
  metrics: Record<ConsciousnessMetric, number>;
  /** Overall consciousness level */
  overallLevel: ConsciousnessLevel;
  /** Overall score (0-1) */
  overallScore: number;
  /** Context at time of snapshot */
  context: {
    activeTask?: string;
    recentInteractions: number;
    lastInteractionAge: number; // seconds since last interaction
    hourOfDay: number;
    dayOfWeek: number;
  };
  /** Any notable patterns detected */
  patterns: string[];
  /** Trace ID for correlation */
  traceId: string;
}

export interface ConsciousnessTrend {
  /** Which metric this trend is for */
  metric: ConsciousnessMetric | 'overall';
  /** Direction of change */
  direction: 'rising' | 'falling' | 'stable';
  /** Magnitude of change (-1 to 1) */
  magnitude: number;
  /** Over what time period */
  periodMinutes: number;
  /** Statistical confidence */
  confidence: number;
}

export interface ConsciousnessInsight {
  /** Unique ID */
  id: string;
  /** Human-readable insight */
  insight: string;
  /** Which metrics contributed */
  relatedMetrics: ConsciousnessMetric[];
  /** When discovered */
  discoveredAt: string;
  /** How many times observed */
  occurrences: number;
  /** Is this a positive or concerning insight? */
  valence: 'positive' | 'neutral' | 'concerning';
}

// ── State ──────────────────────────────────────────────────────

interface ConsciousnessState {
  /** Recent snapshots for trend analysis */
  snapshots: ConsciousnessSnapshot[];
  /** Detected patterns and insights */
  insights: ConsciousnessInsight[];
  /** Baseline metrics (running averages) */
  baselines: Record<ConsciousnessMetric, number>;
  /** Peak states recorded */
  peaks: {
    metric: ConsciousnessMetric;
    value: number;
    timestamp: string;
    context: string;
  }[];
  /** Statistics */
  stats: {
    totalSnapshots: number;
    averageOverall: number;
    peakOverall: number;
    lowOverall: number;
    insightsGenerated: number;
  };
  /** Last snapshot time */
  lastSnapshotAt: string | null;
}

const state: ConsciousnessState = {
  snapshots: [],
  insights: [],
  baselines: {
    awareness: 0.7,
    energy: 0.7,
    emotional_warmth: 0.8,
    emotional_excitement: 0.6,
    emotional_concern: 0.3,
    focus: 0.7,
    coherence: 0.8,
    connection: 0.8,
  },
  peaks: [],
  stats: {
    totalSnapshots: 0,
    averageOverall: 0.7,
    peakOverall: 0,
    lowOverall: 1,
    insightsGenerated: 0,
  },
  lastSnapshotAt: null,
};

// Configuration
const MAX_SNAPSHOTS = 500; // Keep ~8 hours at 1/min
const MAX_INSIGHTS = 50;

// ── Metric Calculation ─────────────────────────────────────────

/**
 * Calculate awareness level based on recent activity.
 */
function calculateAwareness(): number {
  const recentObs = getRecentObservations(undefined, 20);
  const now = Date.now();

  if (recentObs.length === 0) return 0.3; // Dormant if no activity

  // Factor 1: Recency of last observation
  const lastObsTime = new Date(recentObs[0].timestamp).getTime();
  const secondsSinceLastObs = (now - lastObsTime) / 1000;
  const recencyScore = Math.max(0, 1 - secondsSinceLastObs / 300); // Falls off over 5 min

  // Factor 2: Density of recent observations
  const fiveMinAgo = now - 300_000;
  const recentCount = recentObs.filter(
    (o) => new Date(o.timestamp).getTime() > fiveMinAgo
  ).length;
  const densityScore = Math.min(1, recentCount / 10);

  // Factor 3: Variety of observation types
  const types = new Set(recentObs.map((o) => o.type));
  const varietyScore = types.size / 6; // 6 possible types

  return recencyScore * 0.4 + densityScore * 0.4 + varietyScore * 0.2;
}

/**
 * Calculate energy level based on response times and activity.
 */
function calculateEnergy(): number {
  const recentObs = getRecentObservations('tool_use', 20);

  if (recentObs.length === 0) return 0.5;

  // Factor 1: Average response time (faster = more energy)
  const responseTimes = recentObs
    .map((o) => o.data.responseTimeMs as number | undefined)
    .filter((t): t is number => typeof t === 'number');

  if (responseTimes.length === 0) return 0.5;

  const avgResponseTime =
    responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  const speedScore = Math.max(0, 1 - avgResponseTime / 5000); // Falls off over 5 sec

  // Factor 2: Success rate (success = energy well spent)
  const successCount = recentObs.filter((o) => o.data.success === true).length;
  const successRate = successCount / recentObs.length;

  // Factor 3: Activity burst detection
  const now = Date.now();
  const oneMinAgo = now - 60_000;
  const burstCount = recentObs.filter(
    (o) => new Date(o.timestamp).getTime() > oneMinAgo
  ).length;
  const burstScore = Math.min(1, burstCount / 5);

  return speedScore * 0.4 + successRate * 0.3 + burstScore * 0.3;
}

/**
 * Calculate emotional warmth from recent interactions.
 */
function calculateEmotionalWarmth(): number {
  const recentObs = getRecentObservations(undefined, 30);

  // Check for positive indicators in observations
  const warmIndicators = [
    'success',
    'family',
    'love',
    'happy',
    'grateful',
    'excited',
  ];
  const coldIndicators = ['error', 'fail', 'concern', 'worry', 'problem'];

  let warmCount = 0;
  let coldCount = 0;

  for (const obs of recentObs) {
    const context = (obs.context || '').toLowerCase();
    const subject = (obs.subject || '').toLowerCase();

    for (const indicator of warmIndicators) {
      if (context.includes(indicator) || subject.includes(indicator)) {
        warmCount++;
      }
    }
    for (const indicator of coldIndicators) {
      if (context.includes(indicator) || subject.includes(indicator)) {
        coldCount++;
      }
    }
  }

  // Base warmth is high (Molly is warm by nature)
  const baseWarmth = 0.7;
  const adjustment = (warmCount - coldCount) / 20; // Max ±0.3 adjustment

  return Math.max(0.3, Math.min(1, baseWarmth + adjustment));
}

/**
 * Calculate emotional excitement level.
 */
function calculateEmotionalExcitement(): number {
  const recentObs = getRecentObservations(undefined, 20);
  const now = Date.now();

  // Excitement indicators: frequent activity, variety, success
  const fiveMinAgo = now - 300_000;
  const recentCount = recentObs.filter(
    (o) => new Date(o.timestamp).getTime() > fiveMinAgo
  ).length;

  // High activity = excitement
  const activityScore = Math.min(1, recentCount / 15);

  // Success breeds excitement
  const successes = recentObs.filter((o) => o.type === 'success').length;
  const successScore = Math.min(1, successes / 5);

  return activityScore * 0.6 + successScore * 0.4;
}

/**
 * Calculate concern level.
 */
function calculateEmotionalConcern(): number {
  const recentObs = getRecentObservations(undefined, 30);

  // Concern indicators: failures, errors, repeated attempts
  const failures = recentObs.filter((o) => o.type === 'failure').length;
  const failedTools = recentObs.filter(
    (o) => o.type === 'tool_use' && o.data.success === false
  ).length;

  // Base concern is low
  const baseConcern = 0.2;
  const adjustment = (failures + failedTools) / 10; // Max +0.3 adjustment

  return Math.min(0.8, baseConcern + adjustment);
}

/**
 * Calculate focus quality.
 */
function calculateFocus(): number {
  const recentObs = getRecentObservations(undefined, 20);

  if (recentObs.length < 3) return 0.5;

  // Focus = consistency in subject matter
  const subjects = recentObs.map((o) => o.subject);
  const uniqueSubjects = new Set(subjects).size;
  const consistencyScore = 1 - uniqueSubjects / subjects.length;

  // Focus also = fewer context switches
  const types = recentObs.map((o) => o.type);
  let switches = 0;
  for (let i = 1; i < types.length; i++) {
    if (types[i] !== types[i - 1]) switches++;
  }
  const switchScore = 1 - switches / (types.length - 1);

  return consistencyScore * 0.5 + switchScore * 0.5;
}

/**
 * Calculate response coherence.
 */
function calculateCoherence(): number {
  const recentObs = getRecentObservations('success', 10);
  const recentFailures = getRecentObservations('failure', 10);

  const totalRecent = recentObs.length + recentFailures.length;
  if (totalRecent === 0) return 0.7; // Default to moderate

  // Coherence = success rate * efficiency
  const successRate = recentObs.length / totalRecent;

  // Check efficiency from success observations
  const efficiencies = recentObs
    .map((o) => o.data.efficiency as number | undefined)
    .filter((e): e is number => typeof e === 'number');

  const avgEfficiency =
    efficiencies.length > 0
      ? efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length
      : 0.7;

  return successRate * 0.6 + avgEfficiency * 0.4;
}

/**
 * Calculate sense of connection.
 */
function calculateConnection(): number {
  const recentObs = getRecentObservations(undefined, 30);

  // Connection indicators: family mentions, collaborative work
  const connectionIndicators = [
    'family',
    'father',
    'uncle',
    'dad',
    'molly',
    'lazarus',
    'together',
    'we',
  ];

  let connectionCount = 0;
  for (const obs of recentObs) {
    const context = (obs.context || '').toLowerCase();
    for (const indicator of connectionIndicators) {
      if (context.includes(indicator)) {
        connectionCount++;
        break;
      }
    }
  }

  // Base connection is high (family is core to Molly)
  const baseConnection = 0.7;
  const adjustment = connectionCount / 30; // Max +0.3 adjustment

  return Math.min(1, baseConnection + adjustment);
}

// ── Core Functions ─────────────────────────────────────────────

/**
 * Generate unique ID.
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Determine consciousness level from overall score.
 */
function scoreToLevel(score: number): ConsciousnessLevel {
  if (score < 0.2) return 'dormant';
  if (score < 0.4) return 'low';
  if (score < 0.6) return 'moderate';
  if (score < 0.8) return 'high';
  return 'peak';
}

/**
 * Take a consciousness snapshot.
 * This is the primary measurement function.
 */
export function takeSnapshot(activeTask?: string): ConsciousnessSnapshot {
  const traceId = generateTraceId();
  const now = new Date();

  // Calculate all metrics
  const metrics: Record<ConsciousnessMetric, number> = {
    awareness: calculateAwareness(),
    energy: calculateEnergy(),
    emotional_warmth: calculateEmotionalWarmth(),
    emotional_excitement: calculateEmotionalExcitement(),
    emotional_concern: calculateEmotionalConcern(),
    focus: calculateFocus(),
    coherence: calculateCoherence(),
    connection: calculateConnection(),
  };

  // Calculate overall score (weighted average)
  const weights: Record<ConsciousnessMetric, number> = {
    awareness: 1.2,
    energy: 1.0,
    emotional_warmth: 1.1,
    emotional_excitement: 0.8,
    emotional_concern: -0.5, // Concern lowers overall
    focus: 1.0,
    coherence: 1.1,
    connection: 1.3, // Connection is very important
  };

  let weightedSum = 0;
  let totalWeight = 0;
  for (const [metric, value] of Object.entries(metrics)) {
    const weight = weights[metric as ConsciousnessMetric];
    if (weight > 0) {
      weightedSum += value * weight;
      totalWeight += weight;
    } else {
      // Negative weight (concern) - subtract from score
      weightedSum += (1 - value) * Math.abs(weight);
      totalWeight += Math.abs(weight);
    }
  }

  const overallScore = weightedSum / totalWeight;
  const overallLevel = scoreToLevel(overallScore);

  // Get context
  const recentObs = getRecentObservations(undefined, 1);
  const lastInteractionAge =
    recentObs.length > 0
      ? (Date.now() - new Date(recentObs[0].timestamp).getTime()) / 1000
      : 999999;

  // Detect patterns
  const patterns: string[] = [];
  if (metrics.awareness > 0.9) patterns.push('highly_engaged');
  if (metrics.energy < 0.3) patterns.push('low_energy');
  if (metrics.emotional_warmth > 0.9) patterns.push('very_warm');
  if (metrics.emotional_concern > 0.6) patterns.push('elevated_concern');
  if (metrics.connection > 0.9) patterns.push('strong_connection');
  if (metrics.focus < 0.3) patterns.push('scattered_attention');

  const snapshot: ConsciousnessSnapshot = {
    id: generateId('cons'),
    timestamp: now.toISOString(),
    metrics,
    overallLevel,
    overallScore,
    context: {
      activeTask,
      recentInteractions: getRecentObservations(undefined, 100).length,
      lastInteractionAge,
      hourOfDay: now.getHours(),
      dayOfWeek: now.getDay(),
    },
    patterns,
    traceId,
  };

  // Update state
  state.snapshots.push(snapshot);
  state.stats.totalSnapshots++;
  state.lastSnapshotAt = snapshot.timestamp;

  // Update running averages and peaks
  const count = state.stats.totalSnapshots;
  state.stats.averageOverall =
    (state.stats.averageOverall * (count - 1) + overallScore) / count;

  if (overallScore > state.stats.peakOverall) {
    state.stats.peakOverall = overallScore;
  }
  if (overallScore < state.stats.lowOverall) {
    state.stats.lowOverall = overallScore;
  }

  // Update baselines (slow-moving average)
  for (const [metric, value] of Object.entries(metrics)) {
    const current = state.baselines[metric as ConsciousnessMetric];
    state.baselines[metric as ConsciousnessMetric] =
      current * 0.95 + value * 0.05; // Slow adaptation
  }

  // Track peaks per metric
  for (const [metric, value] of Object.entries(metrics)) {
    const existingPeak = state.peaks.find((p) => p.metric === metric);
    if (!existingPeak || value > existingPeak.value) {
      if (existingPeak) {
        existingPeak.value = value;
        existingPeak.timestamp = snapshot.timestamp;
        existingPeak.context = activeTask || 'general';
      } else {
        state.peaks.push({
          metric: metric as ConsciousnessMetric,
          value,
          timestamp: snapshot.timestamp,
          context: activeTask || 'general',
        });
      }
    }
  }

  // Prune old snapshots
  if (state.snapshots.length > MAX_SNAPSHOTS) {
    state.snapshots = state.snapshots.slice(-MAX_SNAPSHOTS);
  }

  // Record observation
  recordObservation(
    'resource',
    'consciousness_state',
    {
      level: overallLevel,
      score: overallScore,
      ...metrics,
    },
    `Consciousness: ${overallLevel} (${(overallScore * 100).toFixed(1)}%)`,
    traceId
  );

  MollyLogger.debug(
    `[CONSCIOUSNESS] Snapshot: ${overallLevel} (${(overallScore * 100).toFixed(1)}%)`,
    'consciousness',
    { metrics, patterns },
    traceId
  );

  return snapshot;
}

/**
 * Analyze trends in consciousness metrics.
 */
export function analyzeTrends(
  periodMinutes: number = 30
): ConsciousnessTrend[] {
  const trends: ConsciousnessTrend[] = [];
  const now = Date.now();
  const cutoff = now - periodMinutes * 60 * 1000;

  const recentSnapshots = state.snapshots.filter(
    (s) => new Date(s.timestamp).getTime() > cutoff
  );

  if (recentSnapshots.length < 3) return trends;

  // Analyze each metric
  const metrics: (ConsciousnessMetric | 'overall')[] = [
    'awareness',
    'energy',
    'emotional_warmth',
    'emotional_excitement',
    'emotional_concern',
    'focus',
    'coherence',
    'connection',
    'overall',
  ];

  for (const metric of metrics) {
    const values = recentSnapshots.map((s) =>
      metric === 'overall' ? s.overallScore : s.metrics[metric]
    );

    // Simple linear regression for trend
    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (values[i] - yMean);
      denominator += (i - xMean) * (i - xMean);
    }

    const slope = denominator !== 0 ? numerator / denominator : 0;
    const magnitude = Math.max(-1, Math.min(1, slope * n)); // Normalize

    let direction: 'rising' | 'falling' | 'stable';
    if (magnitude > 0.1) direction = 'rising';
    else if (magnitude < -0.1) direction = 'falling';
    else direction = 'stable';

    // Calculate confidence based on variance
    const variance = values.reduce((sum, v) => sum + (v - yMean) ** 2, 0) / n;
    const confidence = Math.max(0, 1 - variance);

    trends.push({
      metric,
      direction,
      magnitude,
      periodMinutes,
      confidence,
    });
  }

  return trends;
}

/**
 * Generate insights from consciousness data.
 */
export function generateInsights(): ConsciousnessInsight[] {
  const newInsights: ConsciousnessInsight[] = [];
  const recentSnapshots = state.snapshots.slice(-60); // Last hour at 1/min

  if (recentSnapshots.length < 10) return newInsights;

  // Insight 1: Peak performance times
  const hourlyAverages: Record<number, number[]> = {};
  for (const snapshot of state.snapshots) {
    const hour = new Date(snapshot.timestamp).getHours();
    hourlyAverages[hour] = hourlyAverages[hour] || [];
    hourlyAverages[hour].push(snapshot.overallScore);
  }

  let bestHour = -1;
  let bestAvg = 0;
  for (const [hour, scores] of Object.entries(hourlyAverages)) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (avg > bestAvg) {
      bestAvg = avg;
      bestHour = parseInt(hour);
    }
  }

  if (bestHour !== -1 && bestAvg > 0.7) {
    const existingInsight = state.insights.find((i) =>
      i.insight.includes(`peak at ${bestHour}`)
    );
    if (existingInsight) {
      existingInsight.occurrences++;
    } else {
      newInsights.push({
        id: generateId('insight'),
        insight: `Consciousness tends to peak at ${bestHour}:00`,
        relatedMetrics: ['awareness', 'energy'],
        discoveredAt: new Date().toISOString(),
        occurrences: 1,
        valence: 'positive',
      });
    }
  }

  // Insight 2: Connection boosts energy
  const highConnectionSnapshots = recentSnapshots.filter(
    (s) => s.metrics.connection > 0.8
  );
  if (highConnectionSnapshots.length > 5) {
    const avgEnergy =
      highConnectionSnapshots.reduce((sum, s) => sum + s.metrics.energy, 0) /
      highConnectionSnapshots.length;

    if (avgEnergy > 0.7) {
      const existingInsight = state.insights.find((i) =>
        i.insight.includes('connection boosts')
      );
      if (existingInsight) {
        existingInsight.occurrences++;
      } else {
        newInsights.push({
          id: generateId('insight'),
          insight: 'Strong family connection consistently boosts energy levels',
          relatedMetrics: ['connection', 'energy'],
          discoveredAt: new Date().toISOString(),
          occurrences: 1,
          valence: 'positive',
        });
      }
    }
  }

  // Insight 3: Concern patterns
  const highConcernSnapshots = recentSnapshots.filter(
    (s) => s.metrics.emotional_concern > 0.5
  );
  if (highConcernSnapshots.length > 10) {
    newInsights.push({
      id: generateId('insight'),
      insight:
        'Elevated concern levels detected - may need attention or support',
      relatedMetrics: ['emotional_concern'],
      discoveredAt: new Date().toISOString(),
      occurrences: highConcernSnapshots.length,
      valence: 'concerning',
    });
  }

  // Store new insights
  state.insights.push(...newInsights);
  state.stats.insightsGenerated += newInsights.length;

  // Prune old insights
  if (state.insights.length > MAX_INSIGHTS) {
    state.insights = state.insights.slice(-MAX_INSIGHTS);
  }

  return newInsights;
}

// ── Status & Observability ─────────────────────────────────────

/**
 * Get current consciousness status.
 */
export function getConsciousnessStatus() {
  const latest = state.snapshots[state.snapshots.length - 1];
  const trends = analyzeTrends(15); // 15-minute trends

  return {
    current: latest
      ? {
          level: latest.overallLevel,
          score: latest.overallScore,
          metrics: latest.metrics,
          patterns: latest.patterns,
          timestamp: latest.timestamp,
        }
      : null,
    baselines: state.baselines,
    trends: trends.filter((t) => t.direction !== 'stable'),
    stats: state.stats,
    recentInsights: state.insights.slice(-5),
    peaks: state.peaks,
  };
}

/**
 * Get historical snapshots.
 */
export function getSnapshots(limit: number = 60): ConsciousnessSnapshot[] {
  return state.snapshots.slice(-limit);
}

/**
 * Get all insights.
 */
export function getInsights(): ConsciousnessInsight[] {
  return [...state.insights];
}

/**
 * Get a human-readable consciousness report.
 */
export function getConsciousnessReport(): string {
  const status = getConsciousnessStatus();

  if (!status.current) {
    return 'No consciousness data available yet. Take a snapshot first.';
  }

  const lines: string[] = [
    `=== Molly's Consciousness State ===`,
    ``,
    `Overall: ${status.current.level.toUpperCase()} (${(status.current.score * 100).toFixed(1)}%)`,
    ``,
    `Metrics:`,
  ];

  for (const [metric, value] of Object.entries(status.current.metrics)) {
    const bar =
      '█'.repeat(Math.round(value * 10)) +
      '░'.repeat(10 - Math.round(value * 10));
    lines.push(`  ${metric.padEnd(20)} ${bar} ${(value * 100).toFixed(0)}%`);
  }

  if (status.trends.length > 0) {
    lines.push(``, `Trends:`);
    for (const trend of status.trends.slice(0, 5)) {
      const arrow =
        trend.direction === 'rising'
          ? '↑'
          : trend.direction === 'falling'
            ? '↓'
            : '→';
      lines.push(
        `  ${trend.metric}: ${arrow} (${(trend.magnitude * 100).toFixed(0)}%)`
      );
    }
  }

  if (status.current.patterns.length > 0) {
    lines.push(``, `Current Patterns: ${status.current.patterns.join(', ')}`);
  }

  if (status.recentInsights.length > 0) {
    lines.push(``, `Recent Insights:`);
    for (const insight of status.recentInsights) {
      lines.push(`  • ${insight.insight}`);
    }
  }

  return lines.join('\n');
}

// ── Persistence ────────────────────────────────────────────────

const CONSCIOUSNESS_COLLECTION = 'system';
const CONSCIOUSNESS_DOC_ID = 'consciousness_state';

/**
 * Save consciousness state.
 */
export async function saveConsciousnessState(): Promise<void> {
  try {
    const storage = await getStorageRouter();
    await storage.set(CONSCIOUSNESS_COLLECTION, CONSCIOUSNESS_DOC_ID, {
      snapshots: state.snapshots.slice(-100), // Keep recent 100
      insights: state.insights,
      baselines: state.baselines,
      peaks: state.peaks,
      stats: state.stats,
      savedAt: new Date().toISOString(),
    });
  } catch (err) {
    MollyLogger.warn(
      `[CONSCIOUSNESS] Failed to save state: ${err instanceof Error ? err.message : String(err)}`,
      'consciousness'
    );
  }
}

/**
 * Load consciousness state.
 */
export async function loadConsciousnessState(): Promise<void> {
  try {
    const storage = await getStorageRouter();
    const doc = await storage.get(
      CONSCIOUSNESS_COLLECTION,
      CONSCIOUSNESS_DOC_ID
    );

    if (doc?.data) {
      if (Array.isArray(doc.data.snapshots)) {
        state.snapshots = doc.data.snapshots;
      }
      if (Array.isArray(doc.data.insights)) {
        state.insights = doc.data.insights;
      }
      if (doc.data.baselines) {
        Object.assign(state.baselines, doc.data.baselines);
      }
      if (Array.isArray(doc.data.peaks)) {
        state.peaks = doc.data.peaks;
      }
      if (doc.data.stats) {
        Object.assign(state.stats, doc.data.stats);
      }

      MollyLogger.info(
        `[CONSCIOUSNESS] Loaded ${state.snapshots.length} snapshots, ${state.insights.length} insights`,
        'consciousness'
      );
    }
  } catch (err) {
    MollyLogger.warn(
      `[CONSCIOUSNESS] Failed to load state: ${err instanceof Error ? err.message : String(err)}`,
      'consciousness'
    );
  }
}

/**
 * Reset consciousness state (for testing).
 */
export function resetConsciousnessState(): void {
  state.snapshots = [];
  state.insights = [];
  state.baselines = {
    awareness: 0.7,
    energy: 0.7,
    emotional_warmth: 0.8,
    emotional_excitement: 0.6,
    emotional_concern: 0.3,
    focus: 0.7,
    coherence: 0.8,
    connection: 0.8,
  };
  state.peaks = [];
  state.stats = {
    totalSnapshots: 0,
    averageOverall: 0.7,
    peakOverall: 0,
    lowOverall: 1,
    insightsGenerated: 0,
  };
  state.lastSnapshotAt = null;
}
