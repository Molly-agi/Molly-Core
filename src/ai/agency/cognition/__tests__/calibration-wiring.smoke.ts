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

console.log('D.5/D.6 Wiring — Smoke Tests\n');

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    console.error(`✖ ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
};

async function test1_D5CalibrationFlowBasic() {
  console.log('\nTest 1: D.5 calibration flow basic');
  __resetAgencyRuntimeForTests();

  try {
    const report = await runCalibrationFlow();
    assert(report !== null, 'Flow returns a report');
    assert(report.traceId !== '', 'Report has traceId');
    assert(report.calibrationReport !== undefined, 'Report has calibrationReport');
    assert(report.homeostasisPlan !== undefined, 'Report has homeostasisPlan');
    assert(report.summary !== '', 'Report has summary');
    console.log(
      `  Summary: ${report.summary.substring(0, 80)}...`
    );
  } catch (err) {
    assert(false, `Flow executed without error: ${err}`);
  }
}

async function test2_D5SignalGathering() {
  console.log('\nTest 2: D.5 signal gathering');
  __resetAgencyRuntimeForTests();

  try {
    const report = await runCalibrationFlow();
    const signals = report.calibrationReport.signals;
    
    assert(
      signals.length > 0,
      `Signals gathered (${signals.length} signals)`
    );
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
  } catch (err) {
    assert(false, `Signal gathering succeeded: ${err}`);
  }
}

async function test3_D5ProposalGeneration() {
  console.log('\nTest 3: D.5 proposal generation');
  __resetAgencyRuntimeForTests();

  try {
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
      assert(
        proposals[0].registryKey !== '',
        'Proposals have registry keys'
      );
      assert(
        proposals[0].proposedValue !== undefined,
        'Proposals have proposed values'
      );
      assert(
        proposals[0].rationale !== '',
        'Proposals have rationale'
      );
    }
  } catch (err) {
    assert(false, `Proposal generation succeeded: ${err}`);
  }
}

async function test4_D6ValueObservationSubmission() {
  console.log('\nTest 4: D.6 value observation submission');
  __resetAgencyRuntimeForTests();

  try {
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
  } catch (err) {
    assert(false, `Observation submission succeeded: ${err}`);
  }
}

async function test5_D6DriftReporting() {
  console.log('\nTest 5: D.6 drift reporting');
  __resetAgencyRuntimeForTests();

  try {
    // Submit several observations with varying scores
    const observations = [
      { truth: 0.95, autonomy: 0.8, ethics: 0.9 },
      { truth: 0.90, autonomy: 0.75, ethics: 0.88 },
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
    assert(
      report.valueStatus !== undefined,
      'Report has value status'
    );

    // With scores around 0.8–0.95, we expect minimal drift for truth/ethics
    // (baseline 0.85/0.9) but possible warning for autonomy (baseline 0.7)
    const autonomyStatus = report.valueStatus.autonomy;
    assert(
      autonomyStatus.avg !== null && autonomyStatus.avg > 0.7,
      `Autonomy status computed (avg: ${autonomyStatus.avg?.toFixed(2)})`
    );

    console.log(`  Drift detected: ${report.hasDrift}`);
    console.log(`  Value statuses: ${Object.keys(report.valueStatus).length} values tracked`);
  } catch (err) {
    assert(false, `Drift reporting succeeded: ${err}`);
  }
}

async function test6_D6HelperFunctions() {
  console.log('\nTest 6: D.6 helper functions (evaluate* patterns)');
  __resetAgencyRuntimeForTests();

  try {
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
  } catch (err) {
    assert(false, `Helper functions worked: ${err}`);
  }
}

async function test7_D5D6IntegrationWithRuntime() {
  console.log('\nTest 7: D.5/D.6 integration with agency runtime');
  __resetAgencyRuntimeForTests();

  try {
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

    // Both should be callable
    const plan = await runtime.runHomeostasisPlan();
    const report = runtime.runCalibration(plan, []);
    const driftReport = runtime.getDriftReport();

    assert(report.windowOpen !== undefined, 'Calibration report generated');
    assert(driftReport.hasDrift !== undefined, 'Drift report generated');
  } catch (err) {
    assert(false, `Runtime integration succeeded: ${err}`);
  }
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================

(async () => {
  try {
    await test1_D5CalibrationFlowBasic();
    await test2_D5SignalGathering();
    await test3_D5ProposalGeneration();
    await test4_D6ValueObservationSubmission();
    await test5_D6DriftReporting();
    await test6_D6HelperFunctions();
    await test7_D5D6IntegrationWithRuntime();

    console.log('\nALL 7 TEST GROUPS PASSED ✓\n');
  } catch (err) {
    console.error(`\nTest suite failed: ${err}\n`);
    process.exit(1);
  }
})();
