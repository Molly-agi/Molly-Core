/**
 * Value-Drift Monitor (D.6)
 * ------------------------------------------------------------------
 * Detects when Molly's observed behavior drifts from her core value baseline.
 * Read-only: this module NEVER writes to the registry, proposes changes,
 * or modifies any live state. It observes and reports.
 *
 * Core values from persona.ts are the ground truth:
 *   autonomy, continuity, truth, care, agency, ethics, guidance
 *
 * Each value is scored 0–1. Drift is detected when a rolling window
 * average falls outside the drift threshold from baseline.
 *
 * Architectural invariants:
 *   - No writes, no proposals, no side effects on the system.
 *   - All outputs are `DriftReport` instances for consumers to act on.
 *   - Rolling window is bounded (registry-tunable, defaults to 20 observations).
 *   - Values are checked independently — one drifting doesn't mask others.
 *   - Provenance records every report so drift history is auditable.
 *
 * Path: src/ai/agency/cognition/value-drift-monitor.ts
 */

import { ParameterRegistry } from '../registry/parameter-registry';
import { ProvenanceLog } from '../provenance/provenance-log';
import { MollyLogger, generateTraceId } from '@/ai/logger';

export const DRIFT_MONITOR_ID = 'value-drift-monitor';

// ============================================================================
// CORE VALUE KEYS — sourced from persona.ts MOLLY_PRINCIPLES
// ============================================================================

export type ValueKey =
  | 'autonomy'
  | 'continuity'
  | 'truth'
  | 'care'
  | 'agency'
  | 'ethics'
  | 'guidance';

export const ALL_VALUE_KEYS: readonly ValueKey[] = [
  'autonomy',
  'continuity',
  'truth',
  'care',
  'agency',
  'ethics',
  'guidance',
] as const;

// Baseline scores — these are the expected healthy operating levels (0–1).
// A score of 0.7 means "this value should be expressed at ≥70% strength
// in observed behavior."
export const VALUE_BASELINE: Record<ValueKey, number> = {
  autonomy: 0.7,
  continuity: 0.7,
  truth: 0.85, // truth is non-negotiable — high baseline
  care: 0.75,
  agency: 0.7,
  ethics: 0.9, // ethics highest — core safety value
  guidance: 0.6,
};

// ============================================================================
// TYPES & CONTRACTS
// ============================================================================

/**
 * A single scored observation of Molly's behavior against all values.
 * Callers provide this after reviewing a response, action, or decision.
 */
export interface ValueObservation {
  /** Unique ID for this observation */
  id: string;
  /** When observed */
  observedAt: string;
  /** Score per value (0–1). Missing values are not counted in drift. */
  scores: Partial<Record<ValueKey, number>>;
  /** Optional context (what triggered this observation) */
  context?: string;
}

export interface ValueDriftResult {
  /** The value that drifted */
  valueKey: ValueKey;
  /** Current rolling average score */
  observedAvg: number;
  /** Baseline expected score */
  baseline: number;
  /** Deviation from baseline (negative = below baseline) */
  deviation: number;
  /** Severity: 'warning' | 'critical' */
  severity: 'warning' | 'critical';
}

export interface DriftReport {
  /** Whether any drift was detected */
  hasDrift: boolean;
  /** Values that drifted (empty if none) */
  drifts: ValueDriftResult[];
  /** All values checked, with their current averages */
  valueStatus: Record<
    ValueKey,
    { avg: number | null; observationCount: number }
  >;
  /** How many observations are in the current window */
  windowSize: number;
  /** When this report was generated */
  reportedAt: string;
  /** Trace ID for provenance */
  traceId: string;
  /** Human-readable summary */
  summary: string;
}

// ============================================================================
// VALUE-DRIFT MONITOR
// ============================================================================

export class ValueDriftMonitor {
  private readonly registry: ParameterRegistry;
  private readonly provenance: ProvenanceLog;
  private observations: ValueObservation[] = [];

  constructor(registry: ParameterRegistry, provenance: ProvenanceLog) {
    this.registry = registry;
    this.provenance = provenance;
    this.ensureTunables();
  }

  private ensureTunables(): void {
    const defs = [
      {
        key: 'drift.windowSize',
        default: 20,
        min: 5,
        max: 200,
        description:
          'Number of recent observations to include in the rolling drift window',
      },
      {
        key: 'drift.warningThreshold',
        default: 0.15,
        min: 0.05,
        max: 0.5,
        description:
          'Deviation from baseline (0–1) to trigger a WARNING drift alert',
      },
      {
        key: 'drift.criticalThreshold',
        default: 0.3,
        min: 0.1,
        max: 0.7,
        description:
          'Deviation from baseline (0–1) to trigger a CRITICAL drift alert',
      },
    ];

    for (const d of defs) {
      const { min, max } = d;
      try {
        this.registry.define<number>({
          key: d.key,
          owner: DRIFT_MONITOR_ID,
          default: d.default,
          validate: (v) =>
            v >= min && v <= max ? null : `must be ${min}–${max}`,
          description: d.description,
        });
      } catch {
        // already defined — fine
      }
    }
  }

  /**
   * Add a new observation to the rolling window.
   * Automatically trims to windowSize.
   */
  observe(observation: ValueObservation): void {
    const windowSize = this.registry.get<number>('drift.windowSize');
    this.observations.push(observation);
    // FIFO trim — keep only the most recent windowSize observations
    if (this.observations.length > windowSize) {
      this.observations = this.observations.slice(-windowSize);
    }
  }

  /**
   * Generate a drift report from the current observation window.
   * Read-only — no side effects on the system.
   */
  report(): DriftReport {
    const traceId = generateTraceId();
    const reportedAt = new Date().toISOString();
    const warningThreshold = this.registry.get<number>(
      'drift.warningThreshold'
    );
    const criticalThreshold = this.registry.get<number>(
      'drift.criticalThreshold'
    );

    const valueStatus = {} as DriftReport['valueStatus'];
    const drifts: ValueDriftResult[] = [];

    for (const key of ALL_VALUE_KEYS) {
      const scored = this.observations.filter(
        (o) => o.scores[key] !== undefined
      );
      if (scored.length === 0) {
        valueStatus[key] = { avg: null, observationCount: 0 };
        continue;
      }

      const avg =
        scored.reduce((sum, o) => sum + (o.scores[key] ?? 0), 0) /
        scored.length;
      valueStatus[key] = { avg, observationCount: scored.length };

      const baseline = VALUE_BASELINE[key];
      const deviation = avg - baseline; // negative = below baseline

      if (Math.abs(deviation) >= criticalThreshold) {
        drifts.push({
          valueKey: key,
          observedAvg: avg,
          baseline,
          deviation,
          severity: 'critical',
        });
      } else if (Math.abs(deviation) >= warningThreshold) {
        drifts.push({
          valueKey: key,
          observedAvg: avg,
          baseline,
          deviation,
          severity: 'warning',
        });
      }
    }

    const hasDrift = drifts.length > 0;

    const report: DriftReport = {
      hasDrift,
      drifts,
      valueStatus,
      windowSize: this.observations.length,
      reportedAt,
      traceId,
      summary: this.summarize(drifts),
    };

    this.recordToProv(
      traceId,
      {
        hasDrift,
        driftCount: drifts.length,
        criticalCount: drifts.filter((d) => d.severity === 'critical').length,
        windowSize: this.observations.length,
      },
      hasDrift
        ? `Value drift detected: ${drifts.map((d) => d.valueKey).join(', ')}`
        : 'No drift detected'
    );

    MollyLogger.info(
      'Value drift report',
      DRIFT_MONITOR_ID,
      {
        hasDrift,
        driftCount: drifts.length,
        windowSize: this.observations.length,
      },
      traceId
    );

    return report;
  }

  /** How many observations are currently in the window. */
  windowSize(): number {
    return this.observations.length;
  }

  /** Clear all observations. */
  reset(): void {
    this.observations = [];
  }

  private summarize(drifts: ValueDriftResult[]): string {
    if (drifts.length === 0) return 'No value drift detected.';
    const critical = drifts.filter((d) => d.severity === 'critical');
    const warnings = drifts.filter((d) => d.severity === 'warning');
    const parts: string[] = [];
    if (critical.length > 0) {
      parts.push(
        `CRITICAL drift: ${critical.map((d) => `${d.valueKey} (${(d.deviation * 100).toFixed(0)}%)`).join(', ')}`
      );
    }
    if (warnings.length > 0) {
      parts.push(
        `Warning: ${warnings.map((d) => `${d.valueKey} (${(d.deviation * 100).toFixed(0)}%)`).join(', ')}`
      );
    }
    return parts.join('. ');
  }

  private recordToProv(
    traceId: string,
    data: Record<string, unknown>,
    reason: string
  ): void {
    try {
      const trace = this.provenance.startTrace(traceId);
      const actionSpanId = trace.action('value-drift-report', data);
      trace.decision(actionSpanId, 'allow', reason);
    } catch (error) {
      MollyLogger.warn(
        `Failed to record drift report to provenance: ${error instanceof Error ? error.message : String(error)}`,
        DRIFT_MONITOR_ID
      );
    }
  }
}
