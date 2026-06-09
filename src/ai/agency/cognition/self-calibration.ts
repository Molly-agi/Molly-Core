/**
 * Self-Calibration (D.5)
 * ------------------------------------------------------------------
 * Propose-only tuning of registry parameters during low-load windows.
 * NEVER commits directly. All outputs are proposals via registry.propose().
 *
 * Architectural invariants (consistent with agency layer):
 *   - Only proposes; owners decide whether to accept.
 *   - Only fires during low-load windows (predictedLoad < threshold).
 *   - Each proposal is bounded: maxChangePercent caps the delta.
 *   - All decisions recorded to provenance for auditability.
 *   - "Low load" is defined by D.4's HomeostasisPlan.prediction.predictedLoad.
 *
 * Path: src/ai/agency/cognition/self-calibration.ts
 */

import { ParameterRegistry } from '../registry/parameter-registry';
import { ProvenanceLog } from '../provenance/provenance-log';
import { MollyLogger, generateTraceId } from '@/ai/logger';
import type { HomeostasisPlan } from './predictive-homeostasis';

export const CALIBRATION_ID = 'self-calibration';

// ============================================================================
// TYPES & CONTRACTS
// ============================================================================

/**
 * A single tuning signal: observed metric vs. target metric, with the
 * registry parameter to adjust if they diverge.
 */
export interface CalibrationSignal {
  /** Human-readable name of what this signal tracks */
  label: string;
  /** Currently observed value (0–1 normalized) */
  observed: number;
  /** Desired target value (0–1 normalized) */
  target: number;
  /** Registry key to propose against when divergence is detected */
  registryKey: string;
  /** Current registry value (the knob we'd turn) */
  currentValue: number;
  /** Direction of adjustment: 'increase' if observed < target, 'decrease' if observed > target */
  direction: 'increase' | 'decrease' | 'hold';
}

export interface CalibrationProposal {
  /** Registry key being proposed */
  registryKey: string;
  /** Proposed new value */
  proposedValue: number;
  /** Current value before proposal */
  fromValue: number;
  /** Human-readable rationale */
  rationale: string;
  /** Bounded change percent (0–1) */
  changePercent: number;
  /** Proposal ID returned by registry */
  proposalId: string;
}

export interface CalibrationReport {
  /** Whether we were in a low-load window */
  windowOpen: boolean;
  /** Load level that determined the window */
  predictedLoad: number;
  /** Signals evaluated */
  signals: CalibrationSignal[];
  /** Proposals queued (empty if window was closed) */
  proposals: CalibrationProposal[];
  /** When this calibration ran */
  calibratedAt: string;
  /** Trace ID for provenance */
  traceId: string;
  /** Human-readable summary */
  summary: string;
}

// ============================================================================
// SELF-CALIBRATION
// ============================================================================

export class SelfCalibration {
  private readonly registry: ParameterRegistry;
  private readonly provenance: ProvenanceLog;

  constructor(registry: ParameterRegistry, provenance: ProvenanceLog) {
    this.registry = registry;
    this.provenance = provenance;
    this.ensureTunables();
  }

  private ensureTunables(): void {
    const defs = [
      {
        key: 'calibration.lowLoadThreshold',
        default: 0.4,
        min: 0.1,
        max: 0.7,
        description:
          'Max predictedLoad (0–1) below which calibration windows open',
      },
      {
        key: 'calibration.maxChangePercent',
        default: 0.1,
        min: 0.01,
        max: 0.25,
        description:
          'Max fractional change allowed per calibration proposal (0–1)',
      },
      {
        key: 'calibration.divergenceThreshold',
        default: 0.15,
        min: 0.05,
        max: 0.5,
        description:
          'Min observed-target divergence (0–1) to trigger a proposal',
      },
    ];

    for (const d of defs) {
      const { min, max } = d;
      try {
        this.registry.define<number>({
          key: d.key,
          owner: CALIBRATION_ID,
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
   * Run a calibration pass.
   *
   * @param plan  The most recent HomeostasisPlan from D.4. Used to decide
   *              whether a low-load window is currently open.
   * @param signals  Tuning signals supplied by the caller. Each signal
   *                 describes an observed vs. target metric and which
   *                 registry key to adjust.
   */
  calibrate(
    plan: HomeostasisPlan,
    signals: CalibrationSignal[]
  ): CalibrationReport {
    const traceId = generateTraceId();
    const calibratedAt = new Date().toISOString();

    const lowLoadThreshold = this.registry.get<number>(
      'calibration.lowLoadThreshold'
    );
    const predictedLoad = plan.prediction.predictedLoad;
    const windowOpen = predictedLoad < lowLoadThreshold;

    if (!windowOpen) {
      const report: CalibrationReport = {
        windowOpen: false,
        predictedLoad,
        signals,
        proposals: [],
        calibratedAt,
        traceId,
        summary: `Window closed (load ${(predictedLoad * 100).toFixed(0)}% ≥ threshold ${(lowLoadThreshold * 100).toFixed(0)}%). No proposals queued.`,
      };

      this.recordToProv(
        traceId,
        { windowOpen: false, predictedLoad },
        'Calibration skipped — window closed'
      );

      MollyLogger.info(
        'Self-calibration window closed',
        CALIBRATION_ID,
        { predictedLoad, lowLoadThreshold },
        traceId
      );

      return report;
    }

    // Window is open — evaluate signals and emit bounded proposals
    const proposals = this.proposeAdjustments(signals, traceId);

    const report: CalibrationReport = {
      windowOpen: true,
      predictedLoad,
      signals,
      proposals,
      calibratedAt,
      traceId,
      summary: this.summarize(predictedLoad, proposals),
    };

    this.recordToProv(
      traceId,
      { windowOpen: true, predictedLoad, proposalCount: proposals.length },
      `Calibration window open — queued ${proposals.length} proposal(s)`
    );

    MollyLogger.info(
      'Self-calibration complete',
      CALIBRATION_ID,
      {
        predictedLoad,
        signalCount: signals.length,
        proposalCount: proposals.length,
      },
      traceId
    );

    return report;
  }

  /**
   * Evaluate each signal; emit a bounded propose() call for each that
   * exceeds the divergence threshold. Returns the proposals queued.
   */
  private proposeAdjustments(
    signals: CalibrationSignal[],
    traceId: string
  ): CalibrationProposal[] {
    const divergenceThreshold = this.registry.get<number>(
      'calibration.divergenceThreshold'
    );
    const maxChangePercent = this.registry.get<number>(
      'calibration.maxChangePercent'
    );
    const proposals: CalibrationProposal[] = [];

    for (const signal of signals) {
      const divergence = Math.abs(signal.observed - signal.target);
      if (divergence < divergenceThreshold) continue;
      if (signal.direction === 'hold') continue;

      // Compute bounded delta: never exceed maxChangePercent of current value
      const rawDelta =
        signal.direction === 'increase'
          ? signal.currentValue * maxChangePercent
          : -(signal.currentValue * maxChangePercent);

      const proposedValue = Math.max(0, signal.currentValue + rawDelta);

      // Validate the key exists in the registry before proposing
      let proposal;
      try {
        proposal = this.registry.propose<number>(
          signal.registryKey,
          proposedValue,
          CALIBRATION_ID,
          `Self-calibration: ${signal.label} diverged ${(divergence * 100).toFixed(0)}% from target — proposing ${signal.direction}`
        );
      } catch (err) {
        MollyLogger.warn(
          `Calibration proposal skipped for ${signal.registryKey}: ${err instanceof Error ? err.message : String(err)}`,
          CALIBRATION_ID,
          undefined,
          traceId
        );
        continue;
      }

      proposals.push({
        registryKey: signal.registryKey,
        proposedValue,
        fromValue: signal.currentValue,
        rationale: `${signal.label}: observed ${(signal.observed * 100).toFixed(0)}% vs target ${(signal.target * 100).toFixed(0)}%`,
        changePercent: maxChangePercent,
        proposalId: proposal.id,
      });
    }

    return proposals;
  }

  private summarize(
    predictedLoad: number,
    proposals: CalibrationProposal[]
  ): string {
    const loadPct = (predictedLoad * 100).toFixed(0);
    if (proposals.length === 0) {
      return `Window open (load ${loadPct}%). All signals within tolerance — no proposals needed.`;
    }
    return `Window open (load ${loadPct}%). Queued ${proposals.length} proposal(s): ${proposals.map((p) => p.registryKey).join(', ')}.`;
  }

  private recordToProv(
    traceId: string,
    data: Record<string, unknown>,
    reason: string
  ): void {
    try {
      const trace = this.provenance.startTrace(traceId);
      const actionSpanId = trace.action('self-calibration', data);
      trace.decision(actionSpanId, 'allow', reason);
    } catch (error) {
      MollyLogger.warn(
        `Failed to record calibration to provenance: ${error instanceof Error ? error.message : String(error)}`,
        CALIBRATION_ID
      );
    }
  }
}
