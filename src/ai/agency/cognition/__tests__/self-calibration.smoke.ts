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

describe('Self-Calibration', () => {
  it('should register tunables, manage calibration windows, validate signal divergence, cap proposal deltas, and record provenance across 7 test groups', () => {
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
    }

    // ── 2. Window closed at high load — no proposals ─────────────────────────
    {
      const { calibration } = makeRuntime();
      const plan = makePlan(0.6);

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
    }

    // ── 3. Window open at low load ────────────────────────────────────────────
    {
      const { calibration } = makeRuntime();
      const plan = makePlan(0.2);

      const report = calibration.calibrate(plan, []);

      assert.strictEqual(report.windowOpen, true, 'window open at 20% load');
      assert.ok(report.summary.includes('open'), 'summary mentions window open');
    }

    // ── 4. Signals within tolerance → no proposal ────────────────────────────
    {
      const { registry, calibration } = makeRuntime();

      registry.define<number>({
        key: 'test.dummy',
        owner: 'test-owner',
        default: 0.5,
        description: 'Test parameter',
      });

      const plan = makePlan(0.1);

      const signals: CalibrationSignal[] = [
        {
          label: 'test signal',
          observed: 0.5,
          target: 0.55,
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
    }

    // ── 5. Signals exceeding tolerance → bounded proposal ────────────────────
    {
      const { registry, calibration } = makeRuntime();

      registry.define<number>({
        key: 'test.calibratable',
        owner: 'test-owner',
        default: 1.0,
        description: 'Test calibratable parameter',
      });

      const plan = makePlan(0.1);

      const signals: CalibrationSignal[] = [
        {
          label: 'response latency',
          observed: 0.8,
          target: 0.5,
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

      const pending = registry.pendingProposals<number>('test.calibratable');
      assert.strictEqual(pending.length, 1, 'proposal in registry queue');
      assert.strictEqual(
        pending[0].by,
        CALIBRATION_ID,
        'proposal from self-calibration'
      );
    }

    // ── 6. maxChangePercent is respected ─────────────────────────────────────
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
          target: 0.1,
          registryKey: 'test.bounded',
          currentValue,
          direction: 'decrease',
        },
      ];

      const report = calibration.calibrate(plan, signals);

      assert.strictEqual(report.proposals.length, 1, 'one proposal');
      const proposed = report.proposals[0].proposedValue;
      const fromValue = report.proposals[0].fromValue;

      const maxDelta = fromValue * 0.1;
      const actualDelta = Math.abs(fromValue - proposed);
      assert.ok(
        actualDelta <= maxDelta + 0.0001,
        `delta ${actualDelta.toFixed(3)} within maxChangePercent bound ${maxDelta.toFixed(3)}`
      );
    }

    // ── 7. Provenance recorded each calibration pass ─────────────────────────
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
    }

    expect(true).toBe(true);
  });
});
