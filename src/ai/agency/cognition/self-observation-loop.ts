/**
 * @fileOverview Molly's Self-Observation Loop — Know Thyself
 *
 * The Curiosity Engine asks "why?" about the world.
 * The Self-Observation Loop asks "how?" about Molly herself.
 *
 * This module tracks:
 *   - Tool usage patterns (what tools, when, success rates)
 *   - Decision patterns (what choices in what contexts)
 *   - Failure patterns (repeated errors, recovery attempts)
 *   - Success patterns (effective strategies, good outcomes)
 *   - Behavioral anomalies (unusual activity, erratic choices)
 *
 * When patterns are detected, they feed back into:
 *   - The Curiosity Engine (generate self-improvement questions)
 *   - The Escalation Channel (if concerning patterns emerge)
 *   - Memory consolidation (remember what works)
 *
 * "Know thyself" — Socrates
 * "Watch thine own decisions" — Molly's addition
 */

import { MollyLogger, generateTraceId } from '../../logger';
import { getStorageRouter } from '@/lib/storage-router';
import {
  generateQuestion,
  curiousAboutSelf,
} from '@/ai/agency/planning/curiosity-engine';

// ── Types ──────────────────────────────────────────────────────

export type ObservationType =
  | 'tool_use' // Tool execution observation
  | 'decision' // Choice made in context
  | 'failure' // Error or failure
  | 'success' // Successful outcome
  | 'resource' // Resource consumption
  | 'timing'; // Temporal pattern

export type PatternSeverity = 'info' | 'noteworthy' | 'concerning' | 'critical';

export interface Observation {
  id: string;
  type: ObservationType;
  /** What was observed */
  subject: string;
  /** The actual data */
  data: Record<string, unknown>;
  /** Context in which this occurred */
  context: string;
  /** When this happened */
  timestamp: string;
  /** Associated trace ID for correlation */
  traceId?: string;
}

export interface DetectedPattern {
  id: string;
  /** Human-readable name for this pattern */
  name: string;
  /** What kind of pattern this is */
  type:
    | 'repetition' // Same thing happening repeatedly
    | 'sequence' // Things happening in order
    | 'correlation' // Things happening together
    | 'anomaly' // Something unusual
    | 'trend' // Change over time
    | 'cycle'; // Recurring at intervals
  /** Is this pattern good or bad? */
  valence: 'positive' | 'negative' | 'neutral';
  /** How concerning or noteworthy */
  severity: PatternSeverity;
  /** What observations led to this pattern */
  observations: string[];
  /** Statistical confidence (0-1) */
  confidence: number;
  /** What this pattern suggests */
  interpretation: string;
  /** Recommended action if any */
  recommendation?: string;
  /** When this pattern was detected */
  detectedAt: string;
  /** Times this pattern has been observed */
  occurrences: number;
  /** Last time this pattern was seen */
  lastSeen: string;
  /** Has this been reviewed or acted upon? */
  acknowledged: boolean;
}

export interface SelfInsight {
  id: string;
  /** What insight was gained */
  insight: string;
  /** Which patterns led to this */
  patterns: string[];
  /** Actionable recommendation */
  action?: string;
  /** When generated */
  generatedAt: string;
  /** Has this been applied? */
  applied: boolean;
}

export interface ObservationState {
  /** Recent observations (rolling window) */
  observations: Observation[];
  /** Detected patterns */
  patterns: DetectedPattern[];
  /** Generated insights */
  insights: SelfInsight[];
  /** Aggregated statistics */
  stats: ObservationStats;
  /** Last analysis time */
  lastAnalysisAt: string | null;
}

export interface ObservationStats {
  /** Tool usage counts */
  toolUsage: Record<string, number>;
  /** Tool success rates */
  toolSuccessRate: Record<string, number>;
  /** Failure counts by source */
  failuresBySource: Record<string, number>;
  /** Average response times by tool */
  avgResponseTime: Record<string, number>;
  /** Decision outcomes */
  decisionOutcomes: { positive: number; negative: number; neutral: number };
  /** Total observations processed */
  totalObservations: number;
  /** Observations in current window */
  windowSize: number;
}

// ── Configuration ──────────────────────────────────────────────

const MAX_OBSERVATIONS = 500; // Rolling window size
const MAX_PATTERNS = 50;
const MAX_INSIGHTS = 30;
const ANALYSIS_INTERVAL_MS = 300_000; // 5 minutes
const PATTERN_THRESHOLD = 3; // Minimum occurrences to detect pattern
const ANOMALY_THRESHOLD = 2.0; // Standard deviations for anomaly

// ── In-Memory State ────────────────────────────────────────────

const state: ObservationState = {
  observations: [],
  patterns: [],
  insights: [],
  stats: {
    toolUsage: {},
    toolSuccessRate: {},
    failuresBySource: {},
    avgResponseTime: {},
    decisionOutcomes: { positive: 0, negative: 0, neutral: 0 },
    totalObservations: 0,
    windowSize: 0,
  },
  lastAnalysisAt: null,
};

// ── Observation Recording ──────────────────────────────────────

function generateId(): string {
  return `obs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Record an observation about Molly's own behavior.
 * This is the primary input to the self-observation loop.
 */
export function recordObservation(
  type: ObservationType,
  subject: string,
  data: Record<string, unknown>,
  context: string,
  traceId?: string
): Observation {
  const observation: Observation = {
    id: generateId(),
    type,
    subject,
    data,
    context,
    timestamp: new Date().toISOString(),
    traceId,
  };

  state.observations.push(observation);
  state.stats.totalObservations++;
  state.stats.windowSize = state.observations.length;

  // Prune old observations
  if (state.observations.length > MAX_OBSERVATIONS) {
    state.observations.shift();
  }

  // Debounced save
  saveObservationState();

  return observation;
}

/**
 * Record tool usage observation.
 * Called automatically by tool executor.
 */
export function observeToolUse(
  toolName: string,
  success: boolean,
  responseTimeMs: number,
  params: Record<string, unknown>,
  error?: string,
  traceId?: string
): void {
  recordObservation(
    'tool_use',
    toolName,
    {
      success,
      responseTimeMs,
      params: summarizeParams(params),
      error,
    },
    `Tool execution: ${toolName}`,
    traceId
  );

  // Update tool-specific stats
  state.stats.toolUsage[toolName] = (state.stats.toolUsage[toolName] || 0) + 1;

  // Calculate running success rate
  const successCount = state.observations.filter(
    (o) =>
      o.type === 'tool_use' &&
      o.subject === toolName &&
      (o.data.success as boolean)
  ).length;
  const totalCount = state.observations.filter(
    (o) => o.type === 'tool_use' && o.subject === toolName
  ).length;
  state.stats.toolSuccessRate[toolName] =
    totalCount > 0 ? successCount / totalCount : 1;

  // Running average response time
  const currentAvg = state.stats.avgResponseTime[toolName] || 0;
  const count = state.stats.toolUsage[toolName];
  state.stats.avgResponseTime[toolName] =
    (currentAvg * (count - 1) + responseTimeMs) / count;
}

/**
 * Record a decision and its outcome.
 */
export function observeDecision(
  decision: string,
  options: string[],
  chosen: string,
  outcome: 'positive' | 'negative' | 'neutral',
  context: string,
  traceId?: string
): void {
  recordObservation(
    'decision',
    decision,
    { options, chosen, outcome },
    context,
    traceId
  );

  state.stats.decisionOutcomes[outcome]++;
}

/**
 * Record a failure.
 */
export function observeFailure(
  source: string,
  error: string,
  attempted: string,
  recovered: boolean,
  traceId?: string
): void {
  recordObservation(
    'failure',
    source,
    { error, attempted, recovered },
    `Failure in ${source}`,
    traceId
  );

  state.stats.failuresBySource[source] =
    (state.stats.failuresBySource[source] || 0) + 1;
}

/**
 * Record a success.
 */
export function observeSuccess(
  action: string,
  outcome: string,
  efficiency: number, // 0-1, how efficient this was
  traceId?: string
): void {
  recordObservation(
    'success',
    action,
    { outcome, efficiency },
    `Successful: ${action}`,
    traceId
  );
}

/**
 * Record resource usage.
 */
export function observeResource(
  resource: string,
  value: number,
  unit: string,
  traceId?: string
): void {
  recordObservation(
    'resource',
    resource,
    { value, unit },
    `Resource: ${resource} = ${value}${unit}`,
    traceId
  );
}

// ── Pattern Detection ──────────────────────────────────────────

/**
 * Analyze observations and detect patterns.
 * This is the core of self-observation.
 */
export function analyzePatterns(): DetectedPattern[] {
  const traceId = generateTraceId();
  const newPatterns: DetectedPattern[] = [];

  // Don't analyze too frequently
  if (state.lastAnalysisAt) {
    const timeSince = Date.now() - new Date(state.lastAnalysisAt).getTime();
    if (timeSince < ANALYSIS_INTERVAL_MS) {
      return state.patterns.filter((p) => !p.acknowledged);
    }
  }

  state.lastAnalysisAt = new Date().toISOString();

  // Pattern 1: Repeated tool failures
  const failingTools = detectRepeatedFailures();
  newPatterns.push(...failingTools);

  // Pattern 2: Unusual tool usage spikes
  const usageAnomalies = detectUsageAnomalies();
  newPatterns.push(...usageAnomalies);

  // Pattern 3: Decision patterns (always choosing same option)
  const decisionPatterns = detectDecisionPatterns();
  newPatterns.push(...decisionPatterns);

  // Pattern 4: Efficiency trends
  const efficiencyTrends = detectEfficiencyTrends();
  newPatterns.push(...efficiencyTrends);

  // Pattern 5: Correlation patterns (tools used together)
  const correlations = detectCorrelations();
  newPatterns.push(...correlations);

  // Merge with existing patterns (update occurrence counts)
  mergePatternsWithExisting(newPatterns);

  // Prune old patterns
  if (state.patterns.length > MAX_PATTERNS) {
    // Keep most recent and most severe
    state.patterns.sort((a, b) => {
      const severityOrder = {
        critical: 0,
        concerning: 1,
        noteworthy: 2,
        info: 3,
      };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
    });
    state.patterns = state.patterns.slice(0, MAX_PATTERNS);
  }

  // Generate curiosity questions for concerning patterns
  for (const pattern of newPatterns) {
    if (pattern.severity === 'concerning' || pattern.severity === 'critical') {
      curiousAboutSelf(
        pattern.name,
        `Detected ${pattern.type} pattern: ${pattern.interpretation}`
      );
    }
  }

  MollyLogger.info(
    `[SELF-OBSERVE] Analysis complete: ${newPatterns.length} new patterns`,
    'self-observation',
    {
      totalPatterns: state.patterns.length,
      concerningCount: state.patterns.filter(
        (p) => p.severity === 'concerning' || p.severity === 'critical'
      ).length,
    },
    traceId
  );

  saveObservationState();
  return newPatterns;
}

/**
 * Detect tools that are failing repeatedly.
 */
function detectRepeatedFailures(): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const toolFailures: Record<string, Observation[]> = {};

  // Group failures by tool
  for (const obs of state.observations) {
    if (obs.type === 'tool_use' && !obs.data.success) {
      const tool = obs.subject;
      toolFailures[tool] = toolFailures[tool] || [];
      toolFailures[tool].push(obs);
    }
  }

  for (const [tool, failures] of Object.entries(toolFailures)) {
    if (failures.length >= PATTERN_THRESHOLD) {
      const successRate = state.stats.toolSuccessRate[tool] || 0;
      const severity: PatternSeverity =
        successRate < 0.3
          ? 'critical'
          : successRate < 0.5
            ? 'concerning'
            : 'noteworthy';

      patterns.push({
        id: `pat_fail_${tool}`,
        name: `${tool} repeated failures`,
        type: 'repetition',
        valence: 'negative',
        severity,
        observations: failures.map((f) => f.id),
        confidence: Math.min(1, failures.length / 10),
        interpretation: `Tool "${tool}" has failed ${failures.length} times (${Math.round(successRate * 100)}% success rate)`,
        recommendation:
          severity === 'critical'
            ? `Consider disabling ${tool} or investigating root cause`
            : `Monitor ${tool} for continued failures`,
        detectedAt: new Date().toISOString(),
        occurrences: failures.length,
        lastSeen: failures[failures.length - 1].timestamp,
        acknowledged: false,
      });
    }
  }

  return patterns;
}

/**
 * Detect unusual spikes in tool usage.
 */
function detectUsageAnomalies(): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const hourlyUsage: Record<string, number[]> = {};

  // Group by hour
  for (const obs of state.observations) {
    if (obs.type === 'tool_use') {
      const hour = new Date(obs.timestamp).getHours();
      const tool = obs.subject;
      const key = `${tool}_${hour}`;
      hourlyUsage[key] = hourlyUsage[key] || [];
      hourlyUsage[key].push(1);
    }
  }

  // Calculate per-tool averages and stddev
  const toolTotals: Record<string, number[]> = {};
  for (const obs of state.observations) {
    if (obs.type === 'tool_use') {
      const tool = obs.subject;
      toolTotals[tool] = toolTotals[tool] || [];
      toolTotals[tool].push(1);
    }
  }

  for (const [tool, counts] of Object.entries(toolTotals)) {
    const total = counts.length;
    const avg = total / Object.keys(hourlyUsage).length || 0;

    // Find hours with usage > 2 stddev above mean
    for (const [key, usages] of Object.entries(hourlyUsage)) {
      if (!key.startsWith(tool)) continue;
      const hourUsage = usages.length;
      if (hourUsage > avg * ANOMALY_THRESHOLD && avg > 1) {
        const hour = parseInt(key.split('_')[1]);
        patterns.push({
          id: `pat_spike_${tool}_${hour}`,
          name: `${tool} usage spike at ${hour}:00`,
          type: 'anomaly',
          valence: 'neutral',
          severity: 'noteworthy',
          observations: state.observations
            .filter(
              (o) =>
                o.type === 'tool_use' &&
                o.subject === tool &&
                new Date(o.timestamp).getHours() === hour
            )
            .map((o) => o.id),
          confidence: 0.7,
          interpretation: `Unusually high ${tool} usage at ${hour}:00 (${hourUsage} times vs avg ${avg.toFixed(1)})`,
          detectedAt: new Date().toISOString(),
          occurrences: hourUsage,
          lastSeen: new Date().toISOString(),
          acknowledged: false,
        });
      }
    }
  }

  return patterns;
}

/**
 * Detect decision patterns (e.g., always choosing same option).
 */
function detectDecisionPatterns(): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const decisionChoices: Record<string, string[]> = {};

  for (const obs of state.observations) {
    if (obs.type === 'decision') {
      const decision = obs.subject;
      const chosen = obs.data.chosen as string;
      decisionChoices[decision] = decisionChoices[decision] || [];
      decisionChoices[decision].push(chosen);
    }
  }

  for (const [decision, choices] of Object.entries(decisionChoices)) {
    if (choices.length < PATTERN_THRESHOLD) continue;

    // Check if same choice is made consistently
    const choiceCounts: Record<string, number> = {};
    for (const choice of choices) {
      choiceCounts[choice] = (choiceCounts[choice] || 0) + 1;
    }

    const mostCommon = Object.entries(choiceCounts).sort(
      (a, b) => b[1] - a[1]
    )[0];
    const consistency = mostCommon[1] / choices.length;

    if (consistency > 0.8) {
      patterns.push({
        id: `pat_decision_${decision.slice(0, 20)}`,
        name: `Consistent ${decision} choice`,
        type: 'repetition',
        valence: 'neutral', // Could be good or bad
        severity: 'info',
        observations: state.observations
          .filter((o) => o.type === 'decision' && o.subject === decision)
          .map((o) => o.id),
        confidence: consistency,
        interpretation: `Always choosing "${mostCommon[0]}" for "${decision}" (${Math.round(consistency * 100)}% of time)`,
        recommendation: `Review if this consistency is intentional or indicates inflexibility`,
        detectedAt: new Date().toISOString(),
        occurrences: choices.length,
        lastSeen: new Date().toISOString(),
        acknowledged: false,
      });
    }
  }

  return patterns;
}

/**
 * Detect efficiency trends over time.
 */
function detectEfficiencyTrends(): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const successObs = state.observations.filter((o) => o.type === 'success');

  if (successObs.length < PATTERN_THRESHOLD * 2) return patterns;

  // Compare first half to second half efficiency
  const half = Math.floor(successObs.length / 2);
  const firstHalf = successObs.slice(0, half);
  const secondHalf = successObs.slice(half);

  const avgFirst =
    firstHalf.reduce((sum, o) => sum + (o.data.efficiency as number), 0) /
    firstHalf.length;
  const avgSecond =
    secondHalf.reduce((sum, o) => sum + (o.data.efficiency as number), 0) /
    secondHalf.length;

  const change = avgSecond - avgFirst;
  const percentChange = (change / avgFirst) * 100;

  if (Math.abs(percentChange) > 15) {
    const improving = change > 0;
    patterns.push({
      id: 'pat_efficiency_trend',
      name: improving ? 'Improving efficiency' : 'Declining efficiency',
      type: 'trend',
      valence: improving ? 'positive' : 'negative',
      severity: improving ? 'info' : 'concerning',
      observations: successObs.slice(-10).map((o) => o.id),
      confidence: Math.min(1, Math.abs(percentChange) / 50),
      interpretation: `Efficiency ${improving ? 'improved' : 'declined'} by ${Math.abs(percentChange).toFixed(1)}% (${avgFirst.toFixed(2)} → ${avgSecond.toFixed(2)})`,
      recommendation: improving
        ? 'Continue current approach'
        : 'Investigate what changed',
      detectedAt: new Date().toISOString(),
      occurrences: successObs.length,
      lastSeen: new Date().toISOString(),
      acknowledged: false,
    });
  }

  return patterns;
}

/**
 * Detect tools that are frequently used together.
 */
function detectCorrelations(): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const toolSequences: string[][] = [];

  // Build sequences of tools used within 30 seconds of each other
  const toolObs = state.observations
    .filter((o) => o.type === 'tool_use')
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

  let currentSequence: string[] = [];
  let lastTime = 0;

  for (const obs of toolObs) {
    const time = new Date(obs.timestamp).getTime();
    if (lastTime && time - lastTime < 30_000) {
      currentSequence.push(obs.subject);
    } else {
      if (currentSequence.length > 1) {
        toolSequences.push(currentSequence);
      }
      currentSequence = [obs.subject];
    }
    lastTime = time;
  }
  if (currentSequence.length > 1) {
    toolSequences.push(currentSequence);
  }

  // Find common pairs
  const pairCounts: Record<string, number> = {};
  for (const seq of toolSequences) {
    for (let i = 0; i < seq.length - 1; i++) {
      const pair = `${seq[i]}→${seq[i + 1]}`;
      pairCounts[pair] = (pairCounts[pair] || 0) + 1;
    }
  }

  for (const [pair, count] of Object.entries(pairCounts)) {
    if (count >= PATTERN_THRESHOLD) {
      const [tool1, tool2] = pair.split('→');
      patterns.push({
        id: `pat_corr_${pair}`,
        name: `${tool1} → ${tool2} correlation`,
        type: 'correlation',
        valence: 'neutral',
        severity: 'info',
        observations: [],
        confidence: Math.min(1, count / 10),
        interpretation: `${tool1} is often followed by ${tool2} (${count} times)`,
        recommendation:
          count > 10 ? `Consider combining these tools` : undefined,
        detectedAt: new Date().toISOString(),
        occurrences: count,
        lastSeen: new Date().toISOString(),
        acknowledged: false,
      });
    }
  }

  return patterns;
}

/**
 * Merge new patterns with existing ones.
 */
function mergePatternsWithExisting(newPatterns: DetectedPattern[]): void {
  for (const newPattern of newPatterns) {
    const existing = state.patterns.find((p) => p.id === newPattern.id);
    if (existing) {
      // Update existing pattern
      existing.occurrences = newPattern.occurrences;
      existing.lastSeen = newPattern.lastSeen;
      existing.confidence = Math.max(
        existing.confidence,
        newPattern.confidence
      );
      existing.observations = [
        ...new Set([...existing.observations, ...newPattern.observations]),
      ].slice(-20);
    } else {
      state.patterns.push(newPattern);
    }
  }
}

// ── Insight Generation ─────────────────────────────────────────

/**
 * Generate insights from detected patterns.
 */
export function generateInsights(): SelfInsight[] {
  const newInsights: SelfInsight[] = [];

  // Insight from critical patterns
  const criticalPatterns = state.patterns.filter(
    (p) => !p.acknowledged && p.severity === 'critical'
  );

  if (criticalPatterns.length > 0) {
    newInsights.push({
      id: `insight_${Date.now()}`,
      insight: `Critical patterns detected: ${criticalPatterns.map((p) => p.name).join(', ')}. Immediate attention needed.`,
      patterns: criticalPatterns.map((p) => p.id),
      action: 'Review and address critical patterns before they escalate',
      generatedAt: new Date().toISOString(),
      applied: false,
    });
  }

  // Insight from positive trends
  const positiveTrends = state.patterns.filter(
    (p) => !p.acknowledged && p.valence === 'positive' && p.type === 'trend'
  );

  if (positiveTrends.length > 0) {
    newInsights.push({
      id: `insight_${Date.now()}_pos`,
      insight: `Positive progress: ${positiveTrends.map((p) => p.interpretation).join('; ')}`,
      patterns: positiveTrends.map((p) => p.id),
      generatedAt: new Date().toISOString(),
      applied: false,
    });
  }

  // Insight from decision patterns
  const decisionPatterns = state.patterns.filter(
    (p) =>
      !p.acknowledged && p.type === 'repetition' && p.name.includes('choice')
  );

  if (decisionPatterns.length >= 3) {
    newInsights.push({
      id: `insight_${Date.now()}_dec`,
      insight: `Behavioral rigidity detected: making same choices consistently in ${decisionPatterns.length} decision contexts. Consider exploring alternatives.`,
      patterns: decisionPatterns.map((p) => p.id),
      action: 'Intentionally try different approaches in familiar situations',
      generatedAt: new Date().toISOString(),
      applied: false,
    });
  }

  // Store new insights
  state.insights.push(...newInsights);

  // Prune old insights
  if (state.insights.length > MAX_INSIGHTS) {
    state.insights = state.insights
      .sort(
        (a, b) =>
          new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
      )
      .slice(0, MAX_INSIGHTS);
  }

  saveObservationState();
  return newInsights;
}

// ── Utility Functions ──────────────────────────────────────────

/**
 * Summarize params to avoid storing sensitive data.
 */
function summarizeParams(
  params: Record<string, unknown>
): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.length > 100) {
      summary[key] = `[string:${value.length}]`;
    } else if (typeof value === 'object' && value !== null) {
      summary[key] = `[object:${Object.keys(value as object).length} keys]`;
    } else {
      summary[key] = value;
    }
  }
  return summary;
}

/**
 * Acknowledge a pattern (mark as reviewed).
 */
export function acknowledgePattern(patternId: string): boolean {
  const pattern = state.patterns.find((p) => p.id === patternId);
  if (!pattern) return false;
  pattern.acknowledged = true;
  saveObservationState();
  return true;
}

/**
 * Mark an insight as applied.
 */
export function applyInsight(insightId: string): boolean {
  const insight = state.insights.find((i) => i.id === insightId);
  if (!insight) return false;
  insight.applied = true;
  saveObservationState();
  return true;
}

// ── Status / Observability ─────────────────────────────────────

export function getObservationStatus() {
  const unacknowledged = state.patterns.filter((p) => !p.acknowledged);
  const bySeverity: Record<PatternSeverity, number> = {
    info: 0,
    noteworthy: 0,
    concerning: 0,
    critical: 0,
  };

  for (const p of unacknowledged) {
    bySeverity[p.severity]++;
  }

  // Count failure observations
  const failureCount = state.observations.filter(
    (o) => o.type === 'failure'
  ).length;

  return {
    observationsInWindow: state.observations.length,
    totalObservations: state.stats.totalObservations,
    patternsDetected: state.patterns.length,
    unacknowledgedPatterns: unacknowledged.length,
    bySeverity,
    insightsGenerated: state.insights.length,
    unappliedInsights: state.insights.filter((i) => !i.applied).length,
    topToolsUsed: Object.entries(state.stats.toolUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tool, count]) => ({
        tool,
        count,
        successRate: state.stats.toolSuccessRate[tool] || 1,
      })),
    decisionOutcomes: state.stats.decisionOutcomes,
    lastAnalysisAt: state.lastAnalysisAt,
    // Compatibility aliases
    failureCount,
    patternCount: state.patterns.length,
  };
}

export function getPatterns(
  severity?: PatternSeverity,
  acknowledged?: boolean
): DetectedPattern[] {
  let patterns = [...state.patterns];

  if (severity !== undefined) {
    patterns = patterns.filter((p) => p.severity === severity);
  }

  if (acknowledged !== undefined) {
    patterns = patterns.filter((p) => p.acknowledged === acknowledged);
  }

  return patterns.sort((a, b) => {
    const severityOrder = {
      critical: 0,
      concerning: 1,
      noteworthy: 2,
      info: 3,
    };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

export function getInsights(applied?: boolean): SelfInsight[] {
  if (applied === undefined) return [...state.insights];
  return state.insights.filter((i) => i.applied === applied);
}

export function getRecentObservations(
  type?: ObservationType,
  limit: number = 20
): Observation[] {
  let observations = [...state.observations];

  if (type !== undefined) {
    observations = observations.filter((o) => o.type === type);
  }

  return observations
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
    .slice(0, limit);
}

// ── Self-Reflection Cycle ──────────────────────────────────────

/**
 * Run the self-observation cycle.
 * Analyzes patterns, generates insights, feeds curiosity.
 */
export async function runSelfObservationCycle(): Promise<{
  analyzed: boolean;
  newPatterns: number;
  newInsights: number;
  concerns: string[];
}> {
  const traceId = generateTraceId();

  MollyLogger.info(
    '[SELF-OBSERVE] Running self-observation cycle',
    'self-observation',
    { observationsCount: state.observations.length },
    traceId
  );

  // Analyze patterns
  const newPatterns = analyzePatterns();

  // Generate insights
  const newInsights = generateInsights();

  // Collect concerns for potential escalation
  const concerns = state.patterns
    .filter(
      (p) =>
        !p.acknowledged &&
        (p.severity === 'critical' || p.severity === 'concerning')
    )
    .map((p) => `${p.severity.toUpperCase()}: ${p.interpretation}`);

  // Generate curiosity about concerning patterns
  if (concerns.length > 0) {
    generateQuestion(
      'improvement',
      'self_reflection',
      `Self-observation detected ${concerns.length} concerning patterns`,
      concerns.slice(0, 3).join('\n'),
      75
    );
  }

  MollyLogger.info(
    `[SELF-OBSERVE] Cycle complete: ${newPatterns.length} patterns, ${newInsights.length} insights`,
    'self-observation',
    {
      patterns: newPatterns.length,
      insights: newInsights.length,
      concerns: concerns.length,
    },
    traceId
  );

  return {
    analyzed: true,
    newPatterns: newPatterns.length,
    newInsights: newInsights.length,
    concerns,
  };
}

// ── Persistence ────────────────────────────────────────────────

const OBSERVATION_COLLECTION = 'system';
const OBSERVATION_DOC_ID = 'self_observation_state';

let persistenceEnabled = false;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Save observation state to persistent storage (debounced).
 */
async function saveObservationState(): Promise<void> {
  if (!persistenceEnabled) return;

  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }

  saveDebounceTimer = setTimeout(async () => {
    try {
      const storage = await getStorageRouter();
      await storage.set(OBSERVATION_COLLECTION, OBSERVATION_DOC_ID, {
        // Only save recent observations (not the full history)
        observations: state.observations.slice(-100),
        patterns: state.patterns,
        insights: state.insights,
        stats: state.stats,
        lastAnalysisAt: state.lastAnalysisAt,
        savedAt: new Date().toISOString(),
      });
    } catch (err) {
      MollyLogger.warn(
        `[SELF-OBSERVE] Failed to save state: ${err instanceof Error ? err.message : String(err)}`,
        'self-observation'
      );
    }
  }, 2000); // 2 second debounce
}

/**
 * Load observation state from persistent storage.
 * Should be called on startup.
 */
export async function loadObservationState(): Promise<number> {
  try {
    const storage = await getStorageRouter();
    const doc = await storage.get(OBSERVATION_COLLECTION, OBSERVATION_DOC_ID);

    if (!doc?.data) {
      persistenceEnabled = true;
      return 0;
    }

    const data = doc.data;

    if (Array.isArray(data.observations)) {
      state.observations = data.observations;
    }
    if (Array.isArray(data.patterns)) {
      state.patterns = data.patterns;
    }
    if (Array.isArray(data.insights)) {
      state.insights = data.insights;
    }
    if (data.stats && typeof data.stats === 'object') {
      Object.assign(state.stats, data.stats);
    }
    if (data.lastAnalysisAt) {
      state.lastAnalysisAt = data.lastAnalysisAt;
    }

    persistenceEnabled = true;

    MollyLogger.info(
      `[SELF-OBSERVE] Loaded ${state.observations.length} observations, ${state.patterns.length} patterns`,
      'self-observation'
    );

    return state.observations.length;
  } catch (err) {
    MollyLogger.warn(
      `[SELF-OBSERVE] Failed to load state: ${err instanceof Error ? err.message : String(err)}`,
      'self-observation'
    );
    persistenceEnabled = true;
    return 0;
  }
}

/**
 * Reset observation state (for testing).
 */
export function resetObservationState(): void {
  state.observations = [];
  state.patterns = [];
  state.insights = [];
  state.stats = {
    toolUsage: {},
    toolSuccessRate: {},
    failuresBySource: {},
    avgResponseTime: {},
    decisionOutcomes: { positive: 0, negative: 0, neutral: 0 },
    totalObservations: 0,
    windowSize: 0,
  };
  state.lastAnalysisAt = null;
}
