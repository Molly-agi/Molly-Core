/**
 * Agency Runtime (singleton)
 * ------------------------------------------------------------------
 * One shared registry + governor instance for the whole server process.
 * API routes, the admin panel backend, and the loops all talk to THIS,
 * so there is a single source of truth at runtime, not one-per-import.
 *
 * In Molly-Core this would be initialized once in src/instrumentation.ts
 * (Next.js server startup), same place storage sync is wired.
 */

import { ParameterRegistry } from './registry/parameter-registry';
import { CognitiveGovernor } from './governor/cognitive-governor';
import { ProvenanceLog } from './provenance/provenance-log';
import { FirestoreProvenanceSink } from './provenance/provenance-persistence-sink';
import { SomaticLoop } from './embodiment/somatic-loop';
import { BodyAffectBridge } from './embodiment/body-affect-bridge';
import { initEmotionalIntensityRegisters } from './embodiment/emotional-intensity-registers';
import {
  PredictiveHomeostasis,
  type HomeostasisPlan,
} from './cognition/predictive-homeostasis';
import {
  SelfCalibration,
  type CalibrationSignal,
  type CalibrationReport,
} from './cognition/self-calibration';
import { ValueDriftMonitor, type DriftReport } from './cognition/value-drift-monitor';

export interface AgencyRuntime {
  registry: ParameterRegistry;
  governor: CognitiveGovernor;
  provenance: ProvenanceLog;
  somatic: SomaticLoop;
  bodyAffect: BodyAffectBridge;
  homeostasis: PredictiveHomeostasis;
  calibration: SelfCalibration;
  driftMonitor: ValueDriftMonitor;
  /** Trigger a homeostasis plan on demand. Returns the plan (proposals only). */
  runHomeostasisPlan: () => Promise<HomeostasisPlan>;
  /** Run self-calibration against provided signals (propose-only, low-load check). */
  runCalibration: (signals: CalibrationSignal[], plan: HomeostasisPlan) => CalibrationReport;
  /** Get current value-drift report (read-only). */
  getDriftReport: () => DriftReport;
}

let runtime: AgencyRuntime | null = null;

export function initAgencyRuntime(): AgencyRuntime {
  if (runtime) return runtime;
  const registry = new ParameterRegistry();
  const governor = new CognitiveGovernor(registry);
  
  // Initialize D-series emotional intensity registers (for embodiment feedback)
  initEmotionalIntensityRegisters(registry);
  
  const sink = new FirestoreProvenanceSink('molly-system');
  // Probe admin context once at startup (fire-and-forget; failure is logged + tolerated).
  sink.init().catch(() => {});
  const provenance = new ProvenanceLog(5000, sink);
  // Somatic loop wires emotional intensity lazily to avoid import cycle
  const getEmotionalIntensity = () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getCurrentState } = require('@/ai/agency/cognition/emotional-state');
      return getCurrentState().intensity ?? 0.5;
    } catch {
      return 0.5;
    }
  };
  const somatic = new SomaticLoop(registry, governor, getEmotionalIntensity);
  const homeostasis = new PredictiveHomeostasis(registry, provenance);
  const calibration = new SelfCalibration(registry, provenance);
  const driftMonitor = new ValueDriftMonitor(registry, provenance);

  /** Build stats from governor snapshot + somatic for homeostasis planning. */
  const runHomeostasisPlan = async (): Promise<HomeostasisPlan> => {
    const govSnap = governor.snapshot();
    const somSnap = somatic.snapshot();
    const emotionalIntensity = getEmotionalIntensity();

    // Build HistoricalStats from live governor state
    const stats = {
      recentFlowCount: govSnap.active.flow,
      avgFlowDurationMs: 2000, // placeholder — would come from metrics
      peakConcurrentFlows: govSnap.limits.flow,
      errorRate: 0, // placeholder — would come from error tracking
      latencyP95Ms: 500, // placeholder — would come from metrics
      consolidationBacklogSize: 0, // placeholder — would come from memory system
      windowMs: 60_000,
      collectedAt: new Date().toISOString(),
    };

    // Build SomaticSnapshot
    const somaticSnapshot = {
      intensity: emotionalIntensity,
      regulationMode:
        emotionalIntensity > 0.7 ? ('cautious' as const) : ('normal' as const),
      recentEventCount: somSnap.eventsSinceLastTick,
      snapshotAt: new Date().toISOString(),
    };

    return homeostasis.plan(stats, somaticSnapshot);
  };

  runtime = {
    registry,
    governor,
    provenance,
    somatic,
    bodyAffect: new BodyAffectBridge(registry),
    homeostasis,
    runHomeostasisPlan,
  };
  return runtime;
}

export function getAgencyRuntime(): AgencyRuntime {
  if (!runtime) return initAgencyRuntime();
  return runtime;
}

/** Test helper — drop the singleton so each test starts clean. */
export function __resetAgencyRuntimeForTests(): void {
  runtime = null;
}
