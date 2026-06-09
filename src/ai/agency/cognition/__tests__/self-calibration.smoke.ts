/**
 * Self-Calibration — Smoke Tests (D.5)
 *
 * Validates:
 *   1. Registers all tunables on construction
 *   2. Window closed when predictedLoad >= threshold — no proposals queued
 *   3. Window open when predictedLoad < threshold — proposals can be queued
 *   4. Signals within divergence tolerance → no proposal emitted
 *   5. Signals exceeding tolerance → bounded proposal queued via registry.propose()
 *   6. maxChangePercent bound is respected in every proposal
 *   7. Provenance recorded for each calibration pass
 */
import { strict as assert } from 'assert';
import { ParameterRegistry } from '../../registry/parameter-registry';
import { ProvenanceLog } from '../../provenance/provenance-log';
import { SelfCalibration, CALIBRATION_ID } from '../self-calibration';
import type { CalibrationSignal } from '../self-calibration';
import type { HomeostasisPlan } from '../predictive-homeostasis';

function makeRuntime() {
  const registry = new ParameterRegistry();
  const provenance = new ProvenanceLog(200);
  const calibration = new SelfCalibration(registry, provenance);
  return { registry, provenance, calibration };
}

function makePlan(predictedLoad: number): HomeostasisPlan {
  return {
    prediction: {
      predictedLoad,
      confidence: 0.85,
      derivationMethod: 'deterministic-heuristic',
      heuristicBaseline: predictedLoad,
      forecastHorizonMs: 5 * 60 * 1000,
    },
    recommendations: [],
    generatedAt: new Date().toISOString(),
    traceId: `t-test-${Date.now()}`,
    summary: `Test plan at ${(predictedLoad * 100).toFixed(0)}%`,
  };
}

// ── 1. Registers tunables on construction ───────────────────────────────
console.log('TEST GROUP: registers tunables on construction');
{
  const { registry } = makeRuntime();

  assert.strictEqual(
    registry.get<number>('calibration.lowLoadThreshold'),
    0.4,
    'lowLoadThreshold defaults to 0.4'
  );
  assert.strictEqual(
    registry.get<number>('calibration.maxChangePercent'),
    0.1,
    'maxChangePercent defaults to 0.1'
  );
  assert.strictEqual(
    registry.get<number>('calibration.divergenceThreshold'),
    0.15,
    'divergenceThreshold defaults to 0.15'
  );

  console.log('  ✓ lowLoadThreshold = 0.4');
  console.log('  ✓ maxChangePercent = 0.1');
  console.log('  ✓ divergenceThreshold = 0.15');
}

// ── 2. Window closed at high load — no proposals ─────────────────────────
console.log('TEST GROUP: window closed when load >= threshold');
{
  const { calibration } = makeRuntime();
  const plan = makePlan(0.6); // 0.6 >= 0.4 threshold

  const report = calibration.calibrate(plan, []);

  assert.strictEqual(report.windowOpen, false, 'window closed at 60% load');
  assert.strictEqual(
    report.proposals.length,
    0,
    'no proposals when window closed'
  );
  assert.ok(
    report.summary.includes('closed'),
    'summary mentions window closed'
  );

  console.log('  ✓ window closed at load >= threshold');
  console.log('  ✓ no proposals queued');
}

// ── 3. Window open at low load ────────────────────────────────────────────
console.log('TEST GROUP: window open when load < threshold');
{
  const { calibration } = makeRuntime();
  const plan = makePlan(0.2); // 0.2 < 0.4 threshold

  const report = calibration.calibrate(plan, []);

  assert.strictEqual(report.windowOpen, true, 'window open at 20% load');
  assert.ok(report.summary.includes('open'), 'summary mentions window open');

  console.log('  ✓ window open at load < threshold');
}

// ── 4. Signals within tolerance → no proposal ────────────────────────────
console.log('TEST GROUP: signals within divergence tolerance → no proposal');
{
  const { registry, calibration } = makeRuntime();

  // Register a dummy param to propose against
  registry.define<number>({
    key: 'test.dummy',
    owner: 'test-owner',
    default: 0.5,
    description: 'Test parameter',
  });

  const plan = makePlan(0.1); // low load, window open

  // Signal with divergence = 0.05, below threshold 0.15
  const signals: CalibrationSignal[] = [
    {
      label: 'test signal',
      observed: 0.5,
      target: 0.55, // 5% divergence — below 15% threshold
      registryKey: 'test.dummy',
      currentValue: 0.5,
      direction: 'increase',
    },
  ];

  const report = calibration.calibrate(plan, signals);

  assert.strictEqual(report.windowOpen, true, 'window is open');
  assert.strictEqual(
    report.proposals.length,
    0,
    'no proposal for sub-threshold divergence'
  );
  assert.ok(report.summary.includes('tolerance'), 'summary mentions tolerance');

  console.log('  ✓ sub-threshold divergence produces no proposal');
}

// ── 5. Signals exceeding tolerance → bounded proposal ────────────────────
console.log('TEST GROUP: signals exceeding tolerance → proposal queued');
{
  const { registry, calibration } = makeRuntime();

  // Register a param that self-calibration can propose against
  registry.define<number>({
    key: 'test.calibratable',
    owner: 'test-owner',
    default: 1.0,
    description: 'Test calibratable parameter',
  });

  const plan = makePlan(0.1); // low load, window open

  // Divergence = 0.3 > 0.15 threshold
  const signals: CalibrationSignal[] = [
    {
      label: 'response latency',
      observed: 0.8,
      target: 0.5, // 30% divergence — above threshold
      registryKey: 'test.calibratable',
      currentValue: 1.0,
      direction: 'decrease',
    },
  ];

  const report = calibration.calibrate(plan, signals);

  assert.strictEqual(report.windowOpen, true, 'window open');
  assert.strictEqual(report.proposals.length, 1, 'one proposal queued');
  assert.strictEqual(
    report.proposals[0].registryKey,
    'test.calibratable',
    'correct key'
  );
  assert.ok(report.proposals[0].proposalId.length > 0, 'proposal has ID');
  assert.ok(
    report.proposals[0].proposedValue < report.proposals[0].fromValue,
    'decrease proposal reduces value'
  );

  // Verify proposal is in the registry pending queue
  const pending = registry.pendingProposals<number>('test.calibratable');
  assert.strictEqual(pending.length, 1, 'proposal in registry queue');
  assert.strictEqual(
    pending[0].by,
    CALIBRATION_ID,
    'proposal from self-calibration'
  );

  console.log('  ✓ above-threshold divergence produces proposal');
  console.log('  ✓ proposal lands in registry queue');
  console.log('  ✓ proposal attributed to self-calibration');
}

// ── 6. maxChangePercent is respected ─────────────────────────────────────
console.log('TEST GROUP: maxChangePercent caps proposal delta');
{
  const { registry, calibration } = makeRuntime();

  registry.define<number>({
    key: 'test.bounded',
    owner: 'test-owner',
    default: 10.0,
    description: 'Test bounded parameter',
  });

  const plan = makePlan(0.1);
  const currentValue = 10.0;

  const signals: CalibrationSignal[] = [
    {
      label: 'big drift signal',
      observed: 0.9,
      target: 0.1, // 80% divergence
      registryKey: 'test.bounded',
      currentValue,
      direction: 'decrease',
    },
  ];

  const report = calibration.calibrate(plan, signals);

  assert.strictEqual(report.proposals.length, 1, 'one proposal');
  const proposed = report.proposals[0].proposedValue;
  const fromValue = report.proposals[0].fromValue;

  // Max change is 10% of current value
  const maxDelta = fromValue * 0.1;
  const actualDelta = Math.abs(fromValue - proposed);
  assert.ok(
    actualDelta <= maxDelta + 0.0001,
    `delta ${actualDelta.toFixed(3)} within maxChangePercent bound ${maxDelta.toFixed(3)}`
  );

  console.log(
    `  ✓ delta ${actualDelta.toFixed(3)} ≤ maxChange ${maxDelta.toFixed(3)} (10% of ${fromValue})`
  );
}

// ── 7. Provenance recorded each calibration pass ─────────────────────────
console.log('TEST GROUP: provenance recorded');
{
  const { provenance, calibration } = makeRuntime();

  assert.strictEqual(provenance.size(), 0, 'empty before calibration');

  calibration.calibrate(makePlan(0.2), []);

  assert.ok(provenance.size() > 0, 'provenance has spans after calibration');

  const actions = provenance.actions();
  const calAction = actions.find((s) => s.label === 'self-calibration');
  assert.ok(calAction, 'self-calibration action span recorded');
  assert.strictEqual(calAction!.kind, 'action', 'span kind is action');
  assert.ok(calAction!.data?.windowOpen !== undefined, 'data has windowOpen');

  console.log('  ✓ provenance recorded after calibration');
  console.log('  ✓ action span label and kind correct');
}

console.log('\n✅ ALL 7 D.5 SELF-CALIBRATION GROUPS PASSED');
