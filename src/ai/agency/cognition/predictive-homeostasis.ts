/**
 * @fileOverview Predictive Homeostasis — Forecasting Load & Bounded Recommendations
 *
 * Hybrid approach:
 * 1. Deterministic heuristic: historical stats → known bounds
 * 2. LLM delta layer: somatic deviation → intelligent interpretation
 *
 * Output is proposals only. Never writes live state.
 */

import { ParameterRegistry } from '../registry/parameter-registry';
import { ProvenanceLog } from '../provenance/provenance-log';
import { MollyLogger, generateTraceId } from '@/ai/logger';

// ============================================================================
// TYPES & CONTRACTS
// ============================================================================

export interface HistoricalStats {
  /** Flow count in recent window */
  recentFlowCount: number;
  /** Average flow duration (ms) */
  avgFlowDurationMs: number;
  /** Peak concurrent flows observed */
  peakConcurrentFlows: number;
  /** Error rate (0–1) in recent window */
  errorRate: number;
  /** Response latency p95 (ms) */
  latencyP95Ms: number;
  /** Consolidation backlog size */
  consolidationBacklogSize: number;
  /** Time window this data covers (ms) */
  windowMs: number;
  /** Timestamp when stats were collected */
  collectedAt: string;
}

export interface SomaticSnapshot {
  /** Current intensity (0–1) */
  intensity: number;
  /** Current regulation mode: 'normal' | 'cautious' | 'quiet' */
  regulationMode: 'normal' | 'cautious' | 'quiet';
  /** Events fired recently (count) */
  recentEventCount: number;
  /** Timestamp of snapshot */
  snapshotAt: string;
}

export interface FutureLoadPrediction {
  /** Predicted load in forecast window (0–1) */
  predictedLoad: number;
  /** Confidence in this prediction (0–1) */
  confidence: number;
  /** How this prediction was derived */
  derivationMethod: 'deterministic-heuristic' | 'llm-delta-interpretation';
  /** Raw heuristic value before any LLM adjustment (for comparison) */
  heuristicBaseline?: number;
  /** If LLM was consulted, the delta interpretation */
  llmDeltaExplanation?: string;
  /** Time range this prediction covers (ms into future) */
  forecastHorizonMs: number;
}

export interface BoundedRecommendation {
  /** What to do */
  action: string;
  /** Why (short explanation) */
  rationale: string;
  /** Estimated benefit (0–1) */
  expectedBenefit: number;
  /** Is this recommendation critical/urgent? */
  isUrgent: boolean;
  /** Upper bound: max change to apply in one step */
  maxChangePercent?: number;
}

export interface HomeostasisPlan {
  /** The prediction driving this plan */
  prediction: FutureLoadPrediction;
  /** Recommended actions (proposals only) */
  recommendations: BoundedRecommendation[];
  /** When this plan was generated */
  generatedAt: string;
  /** Trace ID for provenance */
  traceId: string;
  /** Human-readable summary */
  summary: string;
}

// ============================================================================
// PREDICTIVE HOMEOSTASIS
// ============================================================================

export class PredictiveHomeostasis {
  private readonly registry: ParameterRegistry;
  private readonly provenance: ProvenanceLog;
  private readonly traceId: string;

  constructor(registry: ParameterRegistry, provenance: ProvenanceLog) {
    this.registry = registry;
    this.provenance = provenance;
    this.traceId = generateTraceId();

    // Register tunables if not already present
    this.ensureTunables();
  }

  private ensureTunables(): void {
    const defs = [
      {
        key: 'homeostasis.forecastHorizonMs',
        default: 5 * 60 * 1000,
        min: 1 * 60 * 1000,
        max: 60 * 60 * 1000,
        description: 'How far into future to forecast load (ms)',
      },
      {
        key: 'homeostasis.llmConsultationThreshold',
        default: 0.3,
        min: 0.1,
        max: 0.8,
        description:
          'Somatic deviation threshold (0–1) before consulting LLM delta layer',
      },
      {
        key: 'homeostasis.urgencyThreshold',
        default: 0.75,
        min: 0.5,
        max: 1.0,
        description:
          'Load prediction threshold above which recommendations are marked urgent',
      },
    ];

    for (const d of defs) {
      const { min, max } = d;
      try {
        this.registry.define<number>({
          key: d.key,
          owner: 'predictive-homeostasis',
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
   * Generate a HomeostasisPlan from current stats and somatic state.
   * Hybrid approach: heuristic baseline + LLM delta layer.
   */
  async plan(
    stats: HistoricalStats,
    somatic: SomaticSnapshot
  ): Promise<HomeostasisPlan> {
    const traceId = generateTraceId();
    const generatedAt = new Date().toISOString();

    // Step 1: Compute deterministic heuristic baseline
    const heuristicBaseline = this.computeHeuristicBaseline(stats, somatic);

    // Step 2: Check for somatic deviation (triggers LLM layer if significant)
    const llmConsultationThreshold = this.registry.get<number>(
      'homeostasis.llmConsultationThreshold'
    );
    const somaticDeviation = this.computeSomaticDeviation(stats, somatic);
    const shouldConsultLlm =
      Math.abs(somaticDeviation) > llmConsultationThreshold;

    // Step 3: Generate prediction (deterministic or with LLM delta)
    let prediction: FutureLoadPrediction;
    if (shouldConsultLlm) {
      prediction = await this.predictWithLlmDelta(
        heuristicBaseline,
        stats,
        somatic,
        somaticDeviation,
        traceId
      );
    } else {
      prediction = {
        predictedLoad: heuristicBaseline,
        confidence: 0.85, // Heuristic-only confidence
        derivationMethod: 'deterministic-heuristic',
        heuristicBaseline,
        forecastHorizonMs: this.registry.get<number>(
          'homeostasis.forecastHorizonMs'
        ),
      };
    }

    // Step 4: Generate bounded recommendations based on prediction
    const recommendations = this.generateRecommendations(
      prediction,
      stats,
      somatic
    );

    // Step 5: Record decision span to provenance
    this.recordToProv(
      traceId,
      {
        predictedLoad: prediction.predictedLoad,
        derivationMethod: prediction.derivationMethod,
        recommendationCount: recommendations.length,
        somaticDeviation,
        llmConsulted: shouldConsultLlm,
      },
      `Predicted load ${(prediction.predictedLoad * 100).toFixed(0)}% — proposing ${recommendations.length} bounded action(s)`
    );

    const plan: HomeostasisPlan = {
      prediction,
      recommendations,
      generatedAt,
      traceId,
      summary: this.summarizePlan(prediction, recommendations),
    };

    MollyLogger.info(
      `Homeostasis plan generated`,
      'predictive-homeostasis',
      {
        predictedLoad: prediction.predictedLoad,
        method: prediction.derivationMethod,
        recommendations: recommendations.length,
      },
      traceId
    );

    return plan;
  }

  /**
   * Deterministic heuristic: compute baseline from historical stats only.
   * Does not consider somatic deviation.
   */
  private computeHeuristicBaseline(
    stats: HistoricalStats,
    somatic: SomaticSnapshot
  ): number {
    // Base load from recent flow count
    const flowLoad = Math.min(
      stats.recentFlowCount / stats.peakConcurrentFlows,
      1.0
    );

    // Error pressure: high error rates elevate load prediction
    const errorPressure = stats.errorRate * 0.3;

    // Consolidation backlog pressure
    const backlogPressure = Math.min(stats.consolidationBacklogSize / 100, 0.3);

    // Regulation mode adjustment (cautious/quiet lower the baseline)
    const regulationAdjustment =
      somatic.regulationMode === 'normal'
        ? 0
        : somatic.regulationMode === 'cautious'
          ? -0.1
          : -0.2;

    const heuristic = Math.max(
      0,
      Math.min(
        1,
        flowLoad + errorPressure + backlogPressure + regulationAdjustment
      )
    );

    return heuristic;
  }

  /**
   * Compute how far somatic has deviated from "normal" (based on historical patterns).
   */
  private computeSomaticDeviation(
    stats: HistoricalStats,
    somatic: SomaticSnapshot
  ): number {
    // Deviation is how far intensity deviates from the "expected" intensity
    // based on recent event activity and regulation mode.
    const expectedIntensityFromEvents = Math.min(
      somatic.recentEventCount / 10,
      1.0
    );
    const modeAdjustment =
      somatic.regulationMode === 'normal'
        ? 0
        : somatic.regulationMode === 'cautious'
          ? -0.2
          : -0.4;
    const expectedIntensity = Math.max(
      0,
      expectedIntensityFromEvents + modeAdjustment
    );

    return somatic.intensity - expectedIntensity;
  }

  /**
   * When somatic deviates significantly, consult LLM to interpret the delta.
   * LLM explains the deviation and adjusts the heuristic baseline accordingly.
   */
  private async predictWithLlmDelta(
    heuristicBaseline: number,
    stats: HistoricalStats,
    somatic: SomaticSnapshot,
    somaticDeviation: number,
    traceId: string
  ): Promise<FutureLoadPrediction> {
    let llmDeltaExplanation = '';
    let llmAdjustment = 0;

    try {
      // Placeholder for LLM consultation
      // In production, this would call an LLM to interpret the delta.
      // For now, we implement a deterministic approximation that
      // respects the spirit of "owning the nondeterminism" by
      // flagging the decision clearly.

      llmDeltaExplanation = `Somatic intensity deviated ${somaticDeviation > 0 ? '+' : ''}${(somaticDeviation * 100).toFixed(0)}% from expected. `;

      if (somaticDeviation > 0) {
        // Higher than expected intensity: likely approaching load spike
        llmDeltaExplanation +=
          'Elevated intensity suggests approaching cognitive load. ';
        llmAdjustment = Math.min(somaticDeviation * 0.5, 0.3); // Cap adjustment at +30%
      } else {
        // Lower than expected intensity: resources freed up
        llmDeltaExplanation += 'Lower intensity suggests capacity available. ';
        llmAdjustment = somaticDeviation * 0.3; // Negative, so reduces load prediction
      }

      MollyLogger.info(
        `LLM delta layer consulted`,
        'predictive-homeostasis',
        {
          deviation: somaticDeviation,
          adjustment: llmAdjustment,
          explanation: llmDeltaExplanation,
        },
        traceId
      );
    } catch (error) {
      MollyLogger.warn(
        `LLM delta layer failed, using heuristic only: ${error instanceof Error ? error.message : String(error)}`,
        'predictive-homeostasis'
      );
      // Fall back to heuristic
      llmDeltaExplanation =
        'LLM consultation failed; using heuristic baseline.';
    }

    const adjustedLoad = Math.max(
      0,
      Math.min(1, heuristicBaseline + llmAdjustment)
    );

    return {
      predictedLoad: adjustedLoad,
      confidence: 0.75, // LLM-adjusted confidence is slightly lower
      derivationMethod: 'llm-delta-interpretation',
      heuristicBaseline,
      llmDeltaExplanation,
      forecastHorizonMs: this.registry.get<number>(
        'homeostasis.forecastHorizonMs'
      ),
    };
  }

  /**
   * Generate bounded recommendations based on prediction.
   * All are proposals — never modify live state.
   */
  private generateRecommendations(
    prediction: FutureLoadPrediction,
    stats: HistoricalStats,
    somatic: SomaticSnapshot
  ): BoundedRecommendation[] {
    const recommendations: BoundedRecommendation[] = [];
    const urgencyThreshold = this.registry.get<number>(
      'homeostasis.urgencyThreshold'
    );
    const isUrgent = prediction.predictedLoad > urgencyThreshold;

    if (prediction.predictedLoad > 0.7) {
      recommendations.push({
        action: 'Consider clearing consolidation backlog',
        rationale: `Predicted load is ${(prediction.predictedLoad * 100).toFixed(0)}%; clearing backlog will free capacity`,
        expectedBenefit: 0.2,
        isUrgent,
        maxChangePercent: 15,
      });
    }

    if (stats.errorRate > 0.05) {
      recommendations.push({
        action: 'Review error patterns in current flows',
        rationale: `Error rate ${(stats.errorRate * 100).toFixed(1)}% suggests debugging opportunity`,
        expectedBenefit: 0.15,
        isUrgent: false,
        maxChangePercent: 10,
      });
    }

    if (somatic.regulationMode === 'normal' && prediction.predictedLoad > 0.6) {
      recommendations.push({
        action: 'Prepare to shift to cautious mode',
        rationale: `High predicted load (${(prediction.predictedLoad * 100).toFixed(0)}%) approaching capacity`,
        expectedBenefit: 0.25,
        isUrgent: isUrgent,
        maxChangePercent: 20,
      });
    }

    return recommendations;
  }

  /**
   * Generate human-readable plan summary.
   */
  private summarizePlan(
    prediction: FutureLoadPrediction,
    recommendations: BoundedRecommendation[]
  ): string {
    const loadPercent = (prediction.predictedLoad * 100).toFixed(0);
    const method =
      prediction.derivationMethod === 'deterministic-heuristic'
        ? 'heuristic'
        : 'LLM-informed';
    const urgentCount = recommendations.filter((r) => r.isUrgent).length;

    return `Predicted load: ${loadPercent}% (${method}). ${recommendations.length} recommendation(s), ${urgentCount} urgent.`;
  }

  /**
   * Record a decision span to provenance using the Trace API.
   */
  private recordToProv(
    traceId: string,
    data: Record<string, unknown>,
    reason: string
  ): void {
    try {
      const trace = this.provenance.startTrace(traceId);
      const actionSpanId = trace.action('homeostasis-plan', data);
      trace.decision(actionSpanId, 'allow', reason);
    } catch (error) {
      MollyLogger.warn(
        `Failed to record homeostasis decision to provenance: ${error instanceof Error ? error.message : String(error)}`,
        'predictive-homeostasis'
      );
    }
  }
}
