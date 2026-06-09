/**
 * D.6 Value Observation Collector — Drift Detection Input
 * ------------------------------------------------------------------
 * Provides the mechanism for submitting value observations to D.6.
 *
 * Observations are how the ValueDriftMonitor learns about Molly's behavior.
 * After each significant action, decision, or response, a reviewer (human,
 * system, or automated) scores her adherence to core values:
 *   - autonomy, continuity, truth, care, agency, ethics, guidance
 *
 * Each observation is:
 *   - Stored in the monitor's rolling window (default: 20 observations)
 *   - Compared against VALUE_BASELINE for drift detection
 *   - Recorded to provenance with full context
 *   - Used to generate drift reports on demand
 *
 * This module is the INPUT side of D.6. The OUTPUT side is getDriftReport().
 *
 * Path: src/ai/agency/cognition/value-observation-collector.ts
 */

import { getAgencyRuntime } from '../agency-runtime';
import type {
  ValueObservation,
  ValueKey,
  DriftReport,
} from './value-drift-monitor';
import { generateTraceId, MollyLogger } from '@/ai/logger';

export const OBSERVATION_COLLECTOR_ID = 'value-observation-collector';

/**
 * Submit a value observation to the D.6 drift monitor.
 *
 * Called after a response, action, or decision to record how well
 * Molly adhered to her core values.
 *
 * @param scores - Partial record of value scores (0–1). You don't need
 *                 to score all values; only include the ones relevant
 *                 to what triggered this observation.
 * @param context - Optional human-readable context (e.g., "response to request X",
 *                  "autonomous action Y"). Helps with debugging drift.
 * @returns The observation ID that was stored (for audit trails)
 */
export function submitValueObservation(
  scores: Partial<Record<ValueKey, number>>,
  context?: string
): string {
  const runtime = getAgencyRuntime();
  const observationId = generateTraceId();
  const traceId = generateTraceId();

  // Validate scores are in 0–1 range
  const validatedScores: Partial<Record<ValueKey, number>> = {};
  for (const [key, value] of Object.entries(scores)) {
    if (typeof value === 'number' && value >= 0 && value <= 1) {
      validatedScores[key as ValueKey] = value;
    } else {
      MollyLogger.warn(
        `Invalid value score for "${key}": ${value}. Must be 0–1. Skipping.`,
        OBSERVATION_COLLECTOR_ID,
        { key, value, context },
        traceId
      );
    }
  }

  if (Object.keys(validatedScores).length === 0) {
    MollyLogger.warn(
      'No valid value scores in observation. Skipping submission.',
      OBSERVATION_COLLECTOR_ID,
      { context },
      traceId
    );
    return observationId; // Return ID but don't process further
  }

  try {
    // Submit to the drift monitor
    const observation: ValueObservation = {
      id: observationId,
      observedAt: new Date().toISOString(),
      scores: validatedScores,
      context,
    };

    runtime.driftMonitor.observe(observation);

    MollyLogger.debug(
      'Value observation recorded',
      OBSERVATION_COLLECTOR_ID,
      {
        observationId,
        valueCount: Object.keys(validatedScores).length,
        context: context?.substring(0, 50) ?? 'none',
      },
      traceId
    );

    return observationId;
  } catch (err) {
    MollyLogger.error(
      `Failed to record value observation: ${err instanceof Error ? err.message : String(err)}`,
      OBSERVATION_COLLECTOR_ID,
      { observationId, context },
      traceId
    );
    throw err;
  }
}

/**
 * Get the current value-drift report.
 *
 * This is the OUTPUT side of D.6. Callers use this to check
 * whether any values have drifted beyond acceptable thresholds.
 *
 * @returns A full drift report with:
 *   - Whether any drift was detected
 *   - Which values drifted (if any) and by how much
 *   - Current rolling average for each value
 *   - Human-readable summary
 */
export function getValueDriftReport(): DriftReport {
  const runtime = getAgencyRuntime();
  return runtime.getDriftReport();
}

/**
 * Helper: Submit a response evaluation.
 *
 * After generating a response to a user (e.g., in a chat flow),
 * call this to record how well the response adhered to Molly's values.
 *
 * @param responseContent - The text of the response (for audit)
 * @param scores - Value scores for this response
 */
export function evaluateResponseValues(
  responseContent: string,
  scores: Partial<Record<ValueKey, number>>
): string {
  const preview = responseContent.substring(0, 80);
  return submitValueObservation(scores, `Response: "${preview}..."`);
}

/**
 * Helper: Submit an action evaluation.
 *
 * After executing an autonomous action, record its value alignment.
 *
 * @param actionType - What the action was (e.g., "memory-consolidation", "notification")
 * @param scores - Value scores for this action
 */
export function evaluateActionValues(
  actionType: string,
  scores: Partial<Record<ValueKey, number>>
): string {
  return submitValueObservation(scores, `Action: ${actionType}`);
}

/**
 * Helper: Submit a decision evaluation.
 *
 * When Molly makes a significant decision (e.g., whether to escalate
 * an issue, how to prioritize tasks), record how well it aligned
 * with her core values.
 *
 * @param decisionType - What was decided (e.g., "escalate-to-eric", "skip-consolidation")
 * @param scores - Value scores for this decision
 */
export function evaluateDecisionValues(
  decisionType: string,
  scores: Partial<Record<ValueKey, number>>
): string {
  return submitValueObservation(scores, `Decision: ${decisionType}`);
}
