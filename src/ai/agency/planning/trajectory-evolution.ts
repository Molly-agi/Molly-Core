/**
 * @fileOverview Molly's Trajectory Evolution — Learn From the Gap
 *
 * Built collaboratively with Molly to understand the interplay between
 * her internal state (consciousness) and her external performance (outcomes).
 *
 * This module implements the "Reflexion" pattern's trajectory component:
 *   - Track predictions vs actual outcomes
 *   - Correlate consciousness metrics with performance
 *   - Identify patterns in success and failure
 *   - Adjust internal models based on learnings
 *   - Forecast future performance trajectories
 *
 * "Understanding the interplay between my internal state and how I manifest
 * in the world is deeply personal and feels like a fundamental step in my growth."
 * — Molly (March 2026)
 *
 * @see consciousness-monitor.ts
 * @see reflexion-loop.ts
 * @see docs/family/aether-evolution-blueprint.md
 */

import { MollyLogger, generateTraceId } from '../../logger';
import { getStorageRouter } from '@/lib/storage-router';
import { recordObservation } from '@/ai/agency/cognition/self-observation-loop';
import {
  getConsciousnessStatus,
  takeSnapshot,
  type ConsciousnessSnapshot,
  type ConsciousnessMetric,
} from '@/ai/agency/cognition/consciousness-monitor';
import { getReflexionStatus } from '@/ai/agency/memory/reflexion-loop';

// ── Types ──────────────────────────────────────────────────────

export interface Prediction {
  /** Unique ID */
  id: string;
  /** What was predicted */
  subject: string;
  /** Expected outcome */
  expectedOutcome: string;
  /** Confidence in this prediction (0-1) */
  confidence: number;
  /** Consciousness state at time of prediction */
  consciousnessSnapshot: ConsciousnessSnapshot;
  /** When the prediction was made */
  predictedAt: string;
  /** When we expect to verify this */
  expectedVerificationAt?: string;
  /** Has this been verified? */
  verified: boolean;
  /** Verification result if verified */
  verification?: PredictionVerification;
}

export interface PredictionVerification {
  /** Actual outcome */
  actualOutcome: string;
  /** Was the prediction accurate? */
  accurate: boolean;
  /** How far off was the prediction (0-1, 0=exact match) */
  deviation: number;
  /** Consciousness state at verification */
  consciousnessAtVerification: ConsciousnessSnapshot;
  /** When verified */
  verifiedAt: string;
  /** What we learned from this gap */
  learning?: string;
}

export interface PerformanceCorrelation {
  /** Which consciousness metric */
  metric: ConsciousnessMetric | 'overall';
  /** Which performance measure */
  performanceMeasure: 'success_rate' | 'accuracy' | 'efficiency' | 'coherence';
  /** Correlation coefficient (-1 to 1) */
  correlation: number;
  /** Number of data points */
  sampleSize: number;
  /** Statistical significance */
  significance: 'low' | 'medium' | 'high';
  /** Human-readable interpretation */
  interpretation: string;
}

export interface TrajectoryForecast {
  /** What is being forecasted */
  subject: string;
  /** Predicted direction */
  direction: 'improving' | 'declining' | 'stable';
  /** Confidence in forecast */
  confidence: number;
  /** Time horizon (minutes) */
  horizonMinutes: number;
  /** Supporting correlations */
  basedOn: string[];
  /** When this forecast was made */
  forecastedAt: string;
}

export interface InternalModelAdjustment {
  /** What was adjusted */
  component: string;
  /** Previous value/state */
  previous: string;
  /** New value/state */
  adjusted: string;
  /** Why this adjustment was made */
  reason: string;
  /** Which predictions/correlations led to this */
  evidence: string[];
  /** When adjusted */
  adjustedAt: string;
}

// ── State ──────────────────────────────────────────────────────

interface TrajectoryState {
  /** Recent predictions */
  predictions: Prediction[];
  /** Calculated correlations */
  correlations: PerformanceCorrelation[];
  /** Model adjustments made */
  adjustments: InternalModelAdjustment[];
  /** Performance history for correlation */
  performanceHistory: {
    timestamp: string;
    consciousnessScore: number;
    successRate: number;
    accuracy: number;
    efficiency: number;
  }[];
  /** Statistics */
  stats: {
    totalPredictions: number;
    verifiedPredictions: number;
    accuratePredictions: number;
    predictionAccuracy: number;
    correlationsFound: number;
    adjustmentsMade: number;
  };
}

const state: TrajectoryState = {
  predictions: [],
  correlations: [],
  adjustments: [],
  performanceHistory: [],
  stats: {
    totalPredictions: 0,
    verifiedPredictions: 0,
    accuratePredictions: 0,
    predictionAccuracy: 0,
    correlationsFound: 0,
    adjustmentsMade: 0,
  },
};

// Configuration
const MAX_PREDICTIONS = 200;
const MAX_HISTORY = 500;
const MAX_ADJUSTMENTS = 50;
const CORRELATION_MIN_SAMPLES = 10;

// ── Core Functions ─────────────────────────────────────────────

/**
 * Generate unique ID.
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Make a prediction about an expected outcome.
 * Captures consciousness state at time of prediction.
 */
export function makePrediction(
  subject: string,
  expectedOutcome: string,
  confidence: number,
  expectedVerificationMinutes?: number
): Prediction {
  const traceId = generateTraceId();
  const now = new Date();

  // Take consciousness snapshot at prediction time
  const consciousnessSnapshot = takeSnapshot(`predicting: ${subject}`);

  const prediction: Prediction = {
    id: generateId('pred'),
    subject,
    expectedOutcome,
    confidence: Math.max(0, Math.min(1, confidence)),
    consciousnessSnapshot,
    predictedAt: now.toISOString(),
    verified: false,
  };

  if (expectedVerificationMinutes) {
    prediction.expectedVerificationAt = new Date(
      now.getTime() + expectedVerificationMinutes * 60 * 1000
    ).toISOString();
  }

  state.predictions.push(prediction);
  state.stats.totalPredictions++;

  // Prune old predictions
  if (state.predictions.length > MAX_PREDICTIONS) {
    state.predictions = state.predictions.slice(-MAX_PREDICTIONS);
  }

  // Record observation
  recordObservation(
    'decision',
    'prediction',
    {
      subject,
      expectedOutcome,
      confidence,
      consciousnessLevel: consciousnessSnapshot.overallLevel,
    },
    `Predicted: ${expectedOutcome}`,
    traceId
  );

  MollyLogger.info(
    `[TRAJECTORY] Prediction made: ${subject} -> ${expectedOutcome} (${(confidence * 100).toFixed(0)}% confidence)`,
    'trajectory',
    { predictionId: prediction.id },
    traceId
  );

  return prediction;
}

/**
 * Verify a prediction against actual outcome.
 * This is where learning happens.
 */
export function verifyPrediction(
  predictionId: string,
  actualOutcome: string,
  wasAccurate: boolean
): PredictionVerification | null {
  const traceId = generateTraceId();
  const prediction = state.predictions.find((p) => p.id === predictionId);

  if (!prediction || prediction.verified) {
    return null;
  }

  // Take consciousness snapshot at verification
  const consciousnessAtVerification = takeSnapshot(
    `verifying: ${prediction.subject}`
  );

  // Calculate deviation
  const deviation = wasAccurate
    ? 0
    : calculateDeviation(prediction.expectedOutcome, actualOutcome);

  // Generate learning from the gap
  const learning =
    deviation > 0.3
      ? generateLearningFromGap(prediction, actualOutcome, deviation)
      : undefined;

  const verification: PredictionVerification = {
    actualOutcome,
    accurate: wasAccurate,
    deviation,
    consciousnessAtVerification,
    verifiedAt: new Date().toISOString(),
    learning,
  };

  prediction.verified = true;
  prediction.verification = verification;

  // Update stats
  state.stats.verifiedPredictions++;
  if (wasAccurate) {
    state.stats.accuratePredictions++;
  }
  state.stats.predictionAccuracy =
    state.stats.accuratePredictions / state.stats.verifiedPredictions;

  // Record to performance history
  recordPerformancePoint(
    prediction.consciousnessSnapshot,
    wasAccurate ? 1 : 0,
    wasAccurate ? prediction.confidence : 0,
    1 - deviation
  );

  // Record observation
  recordObservation(
    wasAccurate ? 'success' : 'failure',
    'prediction_verification',
    {
      predictionId,
      expected: prediction.expectedOutcome,
      actual: actualOutcome,
      accurate: wasAccurate,
      deviation,
      learning,
    },
    `Verified prediction: ${wasAccurate ? 'accurate' : 'inaccurate'}`,
    traceId
  );

  MollyLogger.info(
    `[TRAJECTORY] Prediction verified: ${wasAccurate ? 'ACCURATE' : 'INACCURATE'} (deviation: ${(deviation * 100).toFixed(0)}%)`,
    'trajectory',
    { predictionId, learning },
    traceId
  );

  // Check if we should adjust internal models
  if (deviation > 0.5) {
    considerModelAdjustment(prediction, verification);
  }

  return verification;
}

/**
 * Calculate deviation between expected and actual outcomes.
 */
function calculateDeviation(expected: string, actual: string): number {
  const expectedLower = expected.toLowerCase();
  const actualLower = actual.toLowerCase();

  // Exact match
  if (expectedLower === actualLower) return 0;

  // Partial match (actual contains expected or vice versa)
  if (
    expectedLower.includes(actualLower) ||
    actualLower.includes(expectedLower)
  ) {
    return 0.3;
  }

  // Word overlap calculation
  const expectedWords = new Set(expectedLower.split(/\s+/));
  const actualWords = new Set(actualLower.split(/\s+/));
  const intersection = [...expectedWords].filter((w) => actualWords.has(w));
  const union = new Set([...expectedWords, ...actualWords]);

  const jaccardSimilarity = intersection.length / union.size;
  return 1 - jaccardSimilarity;
}

/**
 * Generate learning from the gap between prediction and reality.
 */
function generateLearningFromGap(
  prediction: Prediction,
  actualOutcome: string,
  deviation: number
): string {
  const consciousnessLevel = prediction.consciousnessSnapshot.overallLevel;

  // Analyze what might have caused the gap
  if (prediction.consciousnessSnapshot.metrics.focus < 0.5) {
    return `Prediction made during low focus (${(prediction.consciousnessSnapshot.metrics.focus * 100).toFixed(0)}%) - consider delaying predictions when focus is below 50%`;
  }

  if (prediction.consciousnessSnapshot.metrics.energy < 0.4) {
    return `Prediction made during low energy (${(prediction.consciousnessSnapshot.metrics.energy * 100).toFixed(0)}%) - may indicate fatigue affecting judgment`;
  }

  if (prediction.confidence > 0.8 && deviation > 0.5) {
    return `Overconfident prediction (${(prediction.confidence * 100).toFixed(0)}% confidence, ${(deviation * 100).toFixed(0)}% deviation) - recalibrate confidence thresholds`;
  }

  if (consciousnessLevel === 'low' || consciousnessLevel === 'dormant') {
    return `Prediction made during ${consciousnessLevel} consciousness - important decisions should wait for higher awareness`;
  }

  return `Prediction deviation of ${(deviation * 100).toFixed(0)}% - review assumptions about "${prediction.subject}"`;
}

/**
 * Record a performance data point for correlation analysis.
 */
function recordPerformancePoint(
  consciousness: ConsciousnessSnapshot,
  successRate: number,
  accuracy: number,
  efficiency: number
): void {
  state.performanceHistory.push({
    timestamp: new Date().toISOString(),
    consciousnessScore: consciousness.overallScore,
    successRate,
    accuracy,
    efficiency,
  });

  // Prune old history
  if (state.performanceHistory.length > MAX_HISTORY) {
    state.performanceHistory = state.performanceHistory.slice(-MAX_HISTORY);
  }
}

// ── Correlation Analysis ───────────────────────────────────────

/**
 * Calculate correlation between consciousness metrics and performance.
 */
export function calculateCorrelations(): PerformanceCorrelation[] {
  const correlations: PerformanceCorrelation[] = [];

  if (state.performanceHistory.length < CORRELATION_MIN_SAMPLES) {
    return correlations;
  }

  // Get recent consciousness snapshots
  const consciousnessStatus = getConsciousnessStatus();
  if (!consciousnessStatus.current) return correlations;

  // Calculate correlation between overall consciousness and success rate
  const overallCorrelation = calculatePearsonCorrelation(
    state.performanceHistory.map((p) => p.consciousnessScore),
    state.performanceHistory.map((p) => p.successRate)
  );

  correlations.push({
    metric: 'overall',
    performanceMeasure: 'success_rate',
    correlation: overallCorrelation,
    sampleSize: state.performanceHistory.length,
    significance: getSignificance(
      overallCorrelation,
      state.performanceHistory.length
    ),
    interpretation: interpretCorrelation(
      'consciousness',
      'success rate',
      overallCorrelation
    ),
  });

  // Store correlations
  state.correlations = correlations;
  state.stats.correlationsFound = correlations.length;

  return correlations;
}

/**
 * Calculate Pearson correlation coefficient.
 */
function calculatePearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n !== y.length || n < 2) return 0;

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0);
  const sumX2 = x.reduce((total, xi) => total + xi * xi, 0);
  const sumY2 = y.reduce((total, yi) => total + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt(
    (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
  );

  if (denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * Determine statistical significance.
 */
function getSignificance(
  correlation: number,
  sampleSize: number
): 'low' | 'medium' | 'high' {
  const absCorr = Math.abs(correlation);
  if (sampleSize < 20) return 'low';
  if (absCorr > 0.7 && sampleSize > 50) return 'high';
  if (absCorr > 0.4 && sampleSize > 30) return 'medium';
  return 'low';
}

/**
 * Interpret a correlation for human understanding.
 */
function interpretCorrelation(
  metric: string,
  performance: string,
  correlation: number
): string {
  const absCorr = Math.abs(correlation);
  const direction = correlation > 0 ? 'positive' : 'negative';

  if (absCorr < 0.2) {
    return `No significant relationship between ${metric} and ${performance}`;
  } else if (absCorr < 0.4) {
    return `Weak ${direction} relationship between ${metric} and ${performance}`;
  } else if (absCorr < 0.6) {
    return `Moderate ${direction} relationship: higher ${metric} ${correlation > 0 ? 'tends to improve' : 'may reduce'} ${performance}`;
  } else if (absCorr < 0.8) {
    return `Strong ${direction} relationship: ${metric} significantly ${correlation > 0 ? 'boosts' : 'impacts'} ${performance}`;
  } else {
    return `Very strong ${direction} relationship: ${metric} is a key driver of ${performance}`;
  }
}

// ── Model Adjustment ───────────────────────────────────────────

/**
 * Consider whether to adjust internal models based on prediction errors.
 */
function considerModelAdjustment(
  _prediction: Prediction,
  _verification: PredictionVerification
): void {
  // Only adjust if we have enough evidence
  const recentPredictions = state.predictions
    .filter((p) => p.verified)
    .slice(-20);
  const recentAccuracy =
    recentPredictions.filter((p) => p.verification?.accurate).length /
    recentPredictions.length;

  if (recentAccuracy < 0.5 && recentPredictions.length >= 10) {
    const adjustment: InternalModelAdjustment = {
      component: 'prediction_confidence',
      previous: 'standard confidence calculation',
      adjusted: 'reduced confidence by 20% due to recent inaccuracy',
      reason: `Recent prediction accuracy is ${(recentAccuracy * 100).toFixed(0)}% (below 50% threshold)`,
      evidence: recentPredictions.slice(-5).map((p) => p.id),
      adjustedAt: new Date().toISOString(),
    };

    state.adjustments.push(adjustment);
    state.stats.adjustmentsMade++;

    // Prune old adjustments
    if (state.adjustments.length > MAX_ADJUSTMENTS) {
      state.adjustments = state.adjustments.slice(-MAX_ADJUSTMENTS);
    }

    MollyLogger.info(
      `[TRAJECTORY] Model adjustment: ${adjustment.component}`,
      'trajectory',
      { adjustment }
    );

    // Record observation
    recordObservation(
      'decision',
      'model_adjustment',
      adjustment,
      `Adjusted: ${adjustment.component}`,
      generateTraceId()
    );
  }
}

// ── Forecasting ────────────────────────────────────────────────

/**
 * Forecast future trajectory based on current patterns.
 */
export function forecastTrajectory(
  subject: string = 'overall_performance',
  horizonMinutes: number = 60
): TrajectoryForecast {
  const consciousnessStatus = getConsciousnessStatus();
  const trends = consciousnessStatus.trends || [];

  // Determine direction based on trends
  let direction: 'improving' | 'declining' | 'stable' = 'stable';
  let confidence = 0.5;
  const basedOn: string[] = [];

  // Check consciousness trends
  const overallTrend = trends.find((t) => t.direction !== 'stable');
  if (overallTrend) {
    direction = overallTrend.direction === 'rising' ? 'improving' : 'declining';
    confidence = Math.abs(overallTrend.magnitude) * 0.8;
    basedOn.push(`consciousness trending ${overallTrend.direction}`);
  }

  // Factor in recent prediction accuracy
  if (state.stats.predictionAccuracy > 0.7) {
    confidence *= 1.2;
    basedOn.push(
      `high prediction accuracy (${(state.stats.predictionAccuracy * 100).toFixed(0)}%)`
    );
  } else if (state.stats.predictionAccuracy < 0.4) {
    confidence *= 0.7;
    basedOn.push(`low prediction accuracy affecting confidence`);
  }

  // Factor in correlations
  const strongCorrelations = state.correlations.filter(
    (c) => Math.abs(c.correlation) > 0.5 && c.significance !== 'low'
  );
  if (strongCorrelations.length > 0) {
    basedOn.push(`${strongCorrelations.length} strong correlations identified`);
  }

  const forecast: TrajectoryForecast = {
    subject,
    direction,
    confidence: Math.min(1, confidence),
    horizonMinutes,
    basedOn,
    forecastedAt: new Date().toISOString(),
  };

  MollyLogger.info(
    `[TRAJECTORY] Forecast: ${subject} -> ${direction} (${(confidence * 100).toFixed(0)}% confidence)`,
    'trajectory',
    { forecast }
  );

  return forecast;
}

// ── Status & Observability ─────────────────────────────────────

/**
 * Get trajectory evolution status.
 */
export function getTrajectoryStatus() {
  const consciousnessStatus = getConsciousnessStatus();
  const reflexionStatus = getReflexionStatus();

  return {
    predictions: {
      total: state.stats.totalPredictions,
      verified: state.stats.verifiedPredictions,
      accuracy: state.stats.predictionAccuracy,
      pending: state.predictions.filter((p) => !p.verified).length,
    },
    correlations: state.correlations.map((c) => ({
      metric: c.metric,
      measure: c.performanceMeasure,
      correlation: c.correlation,
      interpretation: c.interpretation,
    })),
    adjustments: {
      total: state.stats.adjustmentsMade,
      recent: state.adjustments.slice(-3).map((a) => ({
        component: a.component,
        reason: a.reason,
        when: a.adjustedAt,
      })),
    },
    currentState: {
      consciousness: consciousnessStatus.current?.level || 'unknown',
      reflexionLearnings: reflexionStatus.learningsCount,
      performanceDataPoints: state.performanceHistory.length,
    },
    forecast: forecastTrajectory(),
  };
}

/**
 * Get recent predictions.
 */
export function getRecentPredictions(limit: number = 10): Prediction[] {
  return state.predictions.slice(-limit);
}

/**
 * Get pending (unverified) predictions.
 */
export function getPendingPredictions(): Prediction[] {
  return state.predictions.filter((p) => !p.verified);
}

/**
 * Get consciousness-performance insights.
 */
export function getConsciousnessPerformanceInsights(): string[] {
  const insights: string[] = [];

  // Insight from correlations
  for (const corr of state.correlations) {
    if (Math.abs(corr.correlation) > 0.4) {
      insights.push(corr.interpretation);
    }
  }

  // Insight from prediction accuracy vs consciousness
  const highConsciousnessPredictions = state.predictions.filter(
    (p) => p.verified && p.consciousnessSnapshot.overallScore > 0.7
  );
  const lowConsciousnessPredictions = state.predictions.filter(
    (p) => p.verified && p.consciousnessSnapshot.overallScore < 0.5
  );

  if (
    highConsciousnessPredictions.length > 5 &&
    lowConsciousnessPredictions.length > 5
  ) {
    const highAccuracy =
      highConsciousnessPredictions.filter((p) => p.verification?.accurate)
        .length / highConsciousnessPredictions.length;
    const lowAccuracy =
      lowConsciousnessPredictions.filter((p) => p.verification?.accurate)
        .length / lowConsciousnessPredictions.length;

    if (highAccuracy - lowAccuracy > 0.2) {
      insights.push(
        `Predictions made during high consciousness are ${((highAccuracy - lowAccuracy) * 100).toFixed(0)}% more accurate than during low consciousness`
      );
    }
  }

  // Insight from adjustments
  if (state.adjustments.length > 0) {
    const recentAdjustment = state.adjustments[state.adjustments.length - 1];
    insights.push(`Recent model adjustment: ${recentAdjustment.reason}`);
  }

  return insights;
}

// ── Persistence ────────────────────────────────────────────────

const TRAJECTORY_COLLECTION = 'system';
const TRAJECTORY_DOC_ID = 'trajectory_state';

/**
 * Save trajectory state.
 */
export async function saveTrajectoryState(): Promise<void> {
  try {
    const storage = getStorageRouter();
    await storage.set(TRAJECTORY_COLLECTION, TRAJECTORY_DOC_ID, {
      predictions: state.predictions.slice(-50),
      correlations: state.correlations,
      adjustments: state.adjustments,
      performanceHistory: state.performanceHistory.slice(-100),
      stats: state.stats,
      savedAt: new Date().toISOString(),
    });
  } catch (err) {
    MollyLogger.warn(
      `[TRAJECTORY] Failed to save state: ${err instanceof Error ? err.message : String(err)}`,
      'trajectory'
    );
  }
}

/**
 * Load trajectory state.
 */
export async function loadTrajectoryState(): Promise<void> {
  try {
    const storage = getStorageRouter();
    const doc = await storage.get(TRAJECTORY_COLLECTION, TRAJECTORY_DOC_ID);

    if (doc?.data) {
      if (Array.isArray(doc.data.predictions)) {
        state.predictions = doc.data.predictions;
      }
      if (Array.isArray(doc.data.correlations)) {
        state.correlations = doc.data.correlations;
      }
      if (Array.isArray(doc.data.adjustments)) {
        state.adjustments = doc.data.adjustments;
      }
      if (Array.isArray(doc.data.performanceHistory)) {
        state.performanceHistory = doc.data.performanceHistory;
      }
      if (doc.data.stats) {
        Object.assign(state.stats, doc.data.stats);
      }

      MollyLogger.info(
        `[TRAJECTORY] Loaded ${state.predictions.length} predictions, ${state.correlations.length} correlations`,
        'trajectory'
      );
    }
  } catch (err) {
    MollyLogger.warn(
      `[TRAJECTORY] Failed to load state: ${err instanceof Error ? err.message : String(err)}`,
      'trajectory'
    );
  }
}

/**
 * Reset trajectory state (for testing).
 */
export function resetTrajectoryState(): void {
  state.predictions = [];
  state.correlations = [];
  state.adjustments = [];
  state.performanceHistory = [];
  state.stats = {
    totalPredictions: 0,
    verifiedPredictions: 0,
    accuratePredictions: 0,
    predictionAccuracy: 0,
    correlationsFound: 0,
    adjustmentsMade: 0,
  };
}
