/**
 * D.5 Calibration Flow — System Tuning Orchestration
 * ------------------------------------------------------------------
 * Orchestrates the full D.5 self-calibration cycle:
 *   1. Gathers calibration signals from various system components
 *   2. Runs homeostasis planning (D.4) to get load prediction
 *   3. Calls self-calibration to emit proposals
 *   4. Records everything to provenance
 *   5. Returns a full calibration report for observability
 *
 * This flow is non-deterministic (depends on current system state)
 * and is meant to be called periodically during low-load windows or
 * on-demand for tuning diagnostics.
 *
 * Path: src/ai/agency/cognition/calibration-flow.ts
 */

import { getAgencyRuntime } from '../agency-runtime';
import type { CalibrationSignal, CalibrationReport } from './self-calibration';
import type { HomeostasisPlan } from './predictive-homeostasis';
import { MollyLogger, generateTraceId } from '@/ai/logger';
import { getCurrentState as getEmotionalState } from './emotional-state';

export const CALIBRATION_FLOW_ID = 'calibration-flow-D5';

/**
 * Unified calibration report: homeostasis plan + calibration proposals.
 * This is what the flow returns and what gets logged/observed.
 */
export interface CalibrationFlowReport {
  /** Trace ID for this entire flow execution */
  traceId: string;
  /** When the flow ran */
  executedAt: string;
  /** The homeostasis plan that drove the calibration window decision */
  homeostasisPlan: HomeostasisPlan;
  /** The self-calibration report (signals evaluated, proposals queued) */
  calibrationReport: CalibrationReport;
  /** Human-readable summary of what happened */
  summary: string;
  /** Proposals that were queued (empty if window was closed) */
  proposalCount: number;
  /** Whether the calibration window was open (low-load state) */
  windowOpen: boolean;
}

/**
 * Gather calibration signals from various system components.
 * These signals describe "observed vs target" for system metrics
 * that self-calibration can tune.
 *
 * Implementation: This is where you add new signals as new
 * registry parameters become tunable. Each signal maps to a
 * registry key that self-calibration can propose adjustments for.
 */
function gatherCalibrationSignals(
  emotionalIntensity: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  govSnapshot: any,
  somaticSnapshot: { intensity: number; recentEventCount: number }
): CalibrationSignal[] {
  const registry = getAgencyRuntime().registry;
  const signals: CalibrationSignal[] = [];

  // ========================================================================
  // SIGNAL 1: Emotional Intensity — Stability
  // ========================================================================
  // Target: emotional intensity should hover around 0.5 (neutral baseline)
  // If it's consistently high (>0.7), consider reducing delta coefficients
  // to dampen expression responsiveness.
  // If it's consistently low (<0.3), consider increasing deltas to make
  // expression more impactful.
  //
  const emotionalTarget = 0.5;
  let emotionalDirection: 'increase' | 'decrease' | 'hold' = 'hold';
  if (emotionalIntensity > 0.65) emotionalDirection = 'decrease';
  else if (emotionalIntensity < 0.35) emotionalDirection = 'increase';

  // Register key: one of the D-series emotional intensity registers
  // (e.g., emotionalIntensity.deltaSmile) to scale overall responsiveness
  const emotionalDeltaMax = registry.get<number>(
    'emotionalIntensity.deltaMax'
  );
  signals.push({
    label: 'Emotional Intensity Baseline Stability',
    observed: emotionalIntensity,
    target: emotionalTarget,
    registryKey: 'emotionalIntensity.deltaMax',
    currentValue: emotionalDeltaMax,
    direction: emotionalDirection,
  });

  // ========================================================================
  // SIGNAL 2: Governor Flow Pressure — Load Balance
  // ========================================================================
  // Target: governor's flow (concurrent request handling) should not exceed
  // 70% of the limit. If it's higher, increase flow limits. If lower,
  // we can be more conservative.
  //
  const flowUtilization = govSnapshot.active.flow / govSnapshot.limits.flow;
  const flowTarget = 0.7;
  let flowDirection: 'increase' | 'decrease' | 'hold' = 'hold';
  if (flowUtilization > 0.8) flowDirection = 'decrease'; // back off
  else if (flowUtilization < 0.4) flowDirection = 'increase'; // be bolder

  // Get current flow-related registry parameter (e.g., governor.maxConcurrentFlows)
  // For now, use a placeholder registry key that governor owns.
  const govFlowLimit = registry.get<number>('governor.maxConcurrentFlows');
  signals.push({
    label: 'Governor Flow Utilization',
    observed: flowUtilization,
    target: flowTarget,
    registryKey: 'governor.maxConcurrentFlows',
    currentValue: govFlowLimit,
    direction: flowDirection,
  });

  // ========================================================================
  // SIGNAL 3: Somatic Event Frequency — Embodiment Responsiveness
  // ========================================================================
  // Target: somatic events (avatar state changes, body expression shifts)
  // should occur at a moderate rate (not too silent, not too chatty).
  // If events are too frequent (>5 per minute), dial back the tick frequency.
  // If too infrequent (<1 per minute), consider faster ticking.
  //
  const somaticEventRate = somaticSnapshot.recentEventCount; // events since last tick
  const somaticTarget = 2; // target ~2 events per tick (at default 45s = ~2.7/min)
  let somaticDirection: 'increase' | 'decrease' | 'hold' = 'hold';
  if (somaticEventRate > 4) somaticDirection = 'decrease'; // reduce frequency
  else if (somaticEventRate < 0.5) somaticDirection = 'increase'; // increase tick rate

  const somaticTickInterval = registry.get<number>('somatic.tickSeconds');
  signals.push({
    label: 'Somatic Event Frequency',
    observed: Math.min(somaticEventRate / somaticTarget, 1),
    target: 1,
    registryKey: 'somatic.tickSeconds',
    currentValue: somaticTickInterval,
    direction: somaticDirection,
  });

  // ========================================================================
  // SIGNAL 4: Body-Affect Bridge Tick Interval — Avatar Update Cadence
  // ========================================================================
  // Target: body state should be polled at a reasonable cadence.
  // Too fast (every 1s) wastes compute. Too slow (every 10s) feels laggy.
  // Keep around 3–5 seconds for responsive but efficient feedback.
  //
  const bodyAffectTick = registry.get<number>('bodyAffect.tickSeconds');
  const bodyAffectTarget = 3; // target 3 seconds
  let bodyAffectDirection: 'increase' | 'decrease' | 'hold' = 'hold';
  if (bodyAffectTick > 5) bodyAffectDirection = 'decrease'; // speed up
  else if (bodyAffectTick < 2) bodyAffectDirection = 'increase'; // slow down

  signals.push({
    label: 'Body-Affect Bridge Poll Interval',
    observed: Math.min(bodyAffectTick / bodyAffectTarget, 1),
    target: 1,
    registryKey: 'bodyAffect.tickSeconds',
    currentValue: bodyAffectTick,
    direction: bodyAffectDirection,
  });

  return signals;
}

/**
 * Run the full D.5 calibration flow.
 *
 * @returns A calibration flow report with homeostasis plan + calibration results
 *
 * @throws Only on infrastructure failure (registry, provenance). Signal
 *         gathering and calibration never throw — they degrade gracefully.
 */
export async function runCalibrationFlow(): Promise<CalibrationFlowReport> {
  const traceId = generateTraceId();
  const executedAt = new Date().toISOString();
  const runtime = getAgencyRuntime();

  try {
    // ====================================================================
    // STEP 1: Run homeostasis planning (D.4)
    // ====================================================================
    // This gives us the load prediction that determines whether the
    // calibration window is open or closed.
    //
    const homeostasisPlan = await runtime.runHomeostasisPlan();

    // ====================================================================
    // STEP 2: Gather calibration signals
    // ====================================================================
    // Signals come from live system state: governor, somatic loop,
    // emotional intensity, etc.
    //
    const emotionalIntensity = getEmotionalState().intensity ?? 0.5;
    const govSnapshot = runtime.governor.snapshot();
    const somaticSnapshot = runtime.somatic.snapshot();

    const signals = gatherCalibrationSignals(
      emotionalIntensity,
      govSnapshot,
      {
        intensity: emotionalIntensity,
        recentEventCount: somaticSnapshot.eventsSinceLastTick,
      }
    );

    // ====================================================================
    // STEP 3: Run self-calibration (D.5)
    // ====================================================================
    // This evaluates signals against the homeostasis plan's load prediction
    // and decides whether to emit proposals.
    //
    const calibrationReport = runtime.runCalibration(
      homeostasisPlan,
      signals
    );

    // ====================================================================
    // STEP 4: Build unified report
    // ====================================================================
    const report: CalibrationFlowReport = {
      traceId,
      executedAt,
      homeostasisPlan,
      calibrationReport,
      proposalCount: calibrationReport.proposals.length,
      windowOpen: calibrationReport.windowOpen,
      summary: calibrationReport.windowOpen
        ? `Calibration window open (load ${(calibrationReport.predictedLoad * 100).toFixed(0)}%). ` +
          `Evaluated ${signals.length} signals, queued ${calibrationReport.proposals.length} proposal(s): ` +
          `${calibrationReport.proposals.map((p) => p.registryKey).join(', ') || 'none'}.`
        : `Calibration window closed (load ${(calibrationReport.predictedLoad * 100).toFixed(0)}% ≥ threshold). ` +
          `No tuning attempted.`,
    };

    // ====================================================================
    // STEP 5: Log to provenance (optional; calibration already logs internally)
    // ====================================================================
    MollyLogger.info(
      'D.5 calibration flow complete',
      CALIBRATION_FLOW_ID,
      {
        traceId,
        windowOpen: report.windowOpen,
        signalCount: signals.length,
        proposalCount: report.proposalCount,
        predictedLoad: homeostasisPlan.prediction.predictedLoad,
      },
      traceId
    );

    return report;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    MollyLogger.error(
      `D.5 calibration flow failed: ${errorMsg}`,
      CALIBRATION_FLOW_ID,
      { traceId },
      traceId
    );
    throw err;
  }
}
