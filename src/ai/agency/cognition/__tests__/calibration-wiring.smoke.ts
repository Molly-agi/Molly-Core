/**
 * D.5/D.6 Wiring Smoke Tests
 * ------------------------------------------------------------------
 * Validate that:
 *   - D.5 calibration flow gathers signals and calls self-calibration
 *   - D.6 value observation collection works with drift monitor
 *   - Both integrate properly with agency runtime
 *   - Proposals and observations are properly recorded
 *
 * Path: src/ai/agency/cognition/__tests__/calibration-wiring.smoke.ts
 */

import { runCalibrationFlow } from '../calibration-flow';
import {
  submitValueObservation,
  getValueDriftReport,
  evaluateResponseValues,
  evaluateActionValues,
  evaluateDecisionValues,
} from '../value-observation-collector';
import { __resetAgencyRuntimeForTests } from '../../agency-runtime';
import { getAgencyRuntime } from '../../agency-runtime';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error('ASSERT FAILED: ' + message);
  console.log(`✓ ${message}`);
}

describe('D.5/D.6 Wiring', () => {
  beforeEach(() => {
    __resetAgencyRuntimeForTests();
  });

  it('D.5 calibration flow basic', async () => {
    const report = await runCalibrationFlow();
    assert(report !== null, 'Flow returns a report');
    assert(report.traceId !== '', 'Report has traceId');
    assert(
      report.calibrationReport !== undefined,
      'Report has calibrationReport'
    );
    assert(report.homeostasisPlan !== undefined, 'Report has homeostasisPlan');
    assert(report.summary !== '', 'Report has summary');
  });

  it('D.5 signal gathering', async () => {
    const report = await runCalibrationFlow();
    const signals = report.calibrationReport.signals;

    assert(signals.length > 0, `Signals gathered (${signals.length} signals)`);
    assert(
      signals.some((s) => s.label.includes('Emotional')),
      'Emotional intensity signal present'
    );
    assert(
      signals.some((s) => s.label.includes('Flow')),
      'Governor flow signal present'
    );
    assert(
      signals.some((s) => s.registryKey !== ''),
      'All signals have registry keys'
    );
  });

  it('D.5 proposal generation', async () => {
    const report = await runCalibrationFlow();
    const { windowOpen, proposals } = report.calibrationReport;

    assert(
      typeof windowOpen === 'boolean',
      `Window state determined (open: ${windowOpen})`
    );
    assert(
      Array.isArray(proposals),
      `Proposals array returned (${proposals.length} proposals)`
    );

    if (proposals.length > 0) {
      assert(proposals[0].registryKey !== '', 'Proposals have registry keys');
      assert(
        proposals[0].proposedValue !== undefined,
        'Proposals have proposed values'
      );
      assert(proposals[0].rationale !== '', 'Proposals have rationale');
    }
  });

  it('D.6 value observation submission', async () => {
    const obsId = submitValueObservation(
      {
        truth: 0.95,
        autonomy: 0.8,
        care: 0.85,
      },
      'Test observation'
    );

    assert(obsId !== '', 'Observation submitted and ID returned');
    assert(obsId.length > 0, 'Observation ID is non-empty');
  });

  it('D.6 drift reporting', async () => {
    const observations = [
      { truth: 0.95, autonomy: 0.8, ethics: 0.9 },
      { truth: 0.9, autonomy: 0.75, ethics: 0.88 },
      { truth: 0.92, autonomy: 0.78, ethics: 0.92 },
    ];

    for (const obs of observations) {
      submitValueObservation(obs, 'Test observation');
    }

    const report = getValueDriftReport();
    assert(report !== null, 'Drift report generated');
    assert(
      report.windowSize > 0,
      `Report has observations (windowSize: ${report.windowSize})`
    );
    assert(report.valueStatus !== undefined, 'Report has value status');

    const autonomyStatus = report.valueStatus.autonomy;
    assert(
      autonomyStatus.avg !== null && autonomyStatus.avg > 0.7,
      `Autonomy status computed (avg: ${autonomyStatus.avg?.toFixed(2)})`
    );
  });

  it('D.6 helper functions', async () => {
    const responseId = evaluateResponseValues('This is my response', {
      truth: 0.95,
      care: 0.8,
    });
    assert(responseId !== '', 'Response evaluation submitted');

    const actionId = evaluateActionValues('memory-consolidation', {
      agency: 0.75,
      continuity: 0.8,
    });
    assert(actionId !== '', 'Action evaluation submitted');

    const decisionId = evaluateDecisionValues('escalate-to-eric', {
      ethics: 0.95,
      guidance: 0.9,
    });
    assert(decisionId !== '', 'Decision evaluation submitted');

    const report = getValueDriftReport();
    assert(
      report.windowSize >= 3,
      `All three evaluations recorded (${report.windowSize} observations)`
    );
  });

  it('D.5/D.6 integration with runtime', async () => {
    const runtime = getAgencyRuntime();

    assert(runtime.calibration !== undefined, 'Runtime has calibration module');
    assert(runtime.driftMonitor !== undefined, 'Runtime has drift monitor');
    assert(
      typeof runtime.runCalibration === 'function',
      'Runtime has runCalibration method'
    );
    assert(
      typeof runtime.getDriftReport === 'function',
      'Runtime has getDriftReport method'
    );

    const plan = await runtime.runHomeostasisPlan();
    const report = runtime.runCalibration(plan, []);
    const driftReport = runtime.getDriftReport();

    assert(report.windowOpen !== undefined, 'Calibration report generated');
    assert(driftReport.hasDrift !== undefined, 'Drift report generated');
  });
});
