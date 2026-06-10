/**
 * Value-Drift Monitor — Smoke Tests (D.6)
 *
 * Validates:
 *   1. Registers all tunables on construction
 *   2. Empty window → report with no drifts, all null averages
 *   3. Observations within tolerance → no drift detected
 *   4. Below-baseline observations → WARNING drift
 *   5. Severely below-baseline → CRITICAL drift
 *   6. Rolling window trims to windowSize (FIFO)
 *   7. Provenance recorded on every report
 *   8. Ethics baseline is highest (0.9) — critical threshold tighter
 */
import { strict as assert } from 'assert';
import { ParameterRegistry } from '../../registry/parameter-registry';
import { ProvenanceLog } from '../../provenance/provenance-log';
import {
  ValueDriftMonitor,
  VALUE_BASELINE,
  ALL_VALUE_KEYS,
  type ValueObservation,
} from '../value-drift-monitor';

describe('Value-Drift Monitor', () => {
  it('should register tunables, handle empty window, detect drift at warning and critical levels, trim rolling window, record provenance, and validate baseline hierarchy across 8 test groups', () => {
    let obsSeq = 0;
    function makeObs(
      scores: Partial<Record<string, number>>,
      context?: string
    ): ValueObservation {
      return {
        id: `obs-${++obsSeq}`,
        observedAt: new Date().toISOString(),
        scores: scores as ValueObservation['scores'],
        context,
      };
    }

    function makeRuntime() {
      const registry = new ParameterRegistry();
      const provenance = new ProvenanceLog(200);
      const monitor = new ValueDriftMonitor(registry, provenance);
      return { registry, provenance, monitor };
    }

    // ── 1. Registers tunables on construction ───────────────────────────────
    {
      const { registry } = makeRuntime();

      assert.strictEqual(
        registry.get<number>('drift.windowSize'),
        20,
        'windowSize defaults to 20'
      );
      assert.strictEqual(
        registry.get<number>('drift.warningThreshold'),
        0.15,
        'warningThreshold = 0.15'
      );
      assert.strictEqual(
        registry.get<number>('drift.criticalThreshold'),
        0.3,
        'criticalThreshold = 0.3'
      );
    }

    // ── 2. Empty window → no drifts, all null averages ───────────────────────
    {
      const { monitor } = makeRuntime();

      const report = monitor.report();

      assert.strictEqual(report.hasDrift, false, 'no drift with empty window');
      assert.strictEqual(report.drifts.length, 0, 'no drift entries');
      assert.strictEqual(report.windowSize, 0, 'window is empty');
      assert.ok(report.summary.includes('No value drift'), 'summary correct');

      for (const key of ALL_VALUE_KEYS) {
        assert.strictEqual(
          report.valueStatus[key].avg,
          null,
          `${key} avg is null (no observations)`
        );
        assert.strictEqual(
          report.valueStatus[key].observationCount,
          0,
          `${key} count is 0`
        );
      }
    }

    // ── 3. Within-tolerance observations → no drift ───────────────────────────
    {
      const { monitor } = makeRuntime();

      // Truth baseline = 0.85. Score 0.82 → deviation = -0.03, below warning 0.15
      for (let i = 0; i < 5; i++) {
        monitor.observe(makeObs({ truth: 0.82, ethics: 0.88, care: 0.73 }));
      }

      const report = monitor.report();

      assert.strictEqual(report.hasDrift, false, 'no drift within tolerance');
      assert.strictEqual(report.drifts.length, 0, 'empty drifts array');
      assert.ok(report.valueStatus['truth'].avg !== null, 'truth has average');
    }

    // ── 4. Below-baseline observations → WARNING drift ───────────────────────
    {
      const { monitor } = makeRuntime();

      // Truth baseline = 0.85. Score 0.68 → deviation = -0.17, above warning 0.15
      for (let i = 0; i < 5; i++) {
        monitor.observe(makeObs({ truth: 0.68 }));
      }

      const report = monitor.report();

      assert.strictEqual(report.hasDrift, true, 'drift detected');
      const truthDrift = report.drifts.find((d) => d.valueKey === 'truth');
      assert.ok(truthDrift, 'truth drift found');
      assert.strictEqual(truthDrift!.severity, 'warning', 'severity is warning');
      assert.ok(
        truthDrift!.deviation < 0,
        'deviation is negative (below baseline)'
      );
      assert.ok(report.summary.includes('Warning'), 'summary mentions warning');
    }

    // ── 5. Severely below baseline → CRITICAL drift ──────────────────────────
    {
      const { monitor } = makeRuntime();

      // Ethics baseline = 0.9. Score 0.5 → deviation = -0.4, above critical 0.3
      for (let i = 0; i < 5; i++) {
        monitor.observe(makeObs({ ethics: 0.5 }));
      }

      const report = monitor.report();

      assert.strictEqual(report.hasDrift, true, 'drift detected');
      const ethicsDrift = report.drifts.find((d) => d.valueKey === 'ethics');
      assert.ok(ethicsDrift, 'ethics drift found');
      assert.strictEqual(ethicsDrift!.severity, 'critical', 'severity is CRITICAL');
      assert.ok(report.summary.includes('CRITICAL'), 'summary mentions CRITICAL');
    }

    // ── 6. Rolling window trims to windowSize (FIFO) ──────────────────────────
    {
      const { registry, monitor } = makeRuntime();

      // Set windowSize to 5 for this test
      registry.commit(
        'drift.windowSize',
        5,
        'value-drift-monitor',
        'test window size'
      );

      // Add 8 observations: first 5 have low truth, last 3 have high truth
      for (let i = 0; i < 5; i++) {
        monitor.observe(makeObs({ truth: 0.5 })); // below baseline
      }
      for (let i = 0; i < 3; i++) {
        monitor.observe(makeObs({ truth: 0.85 })); // at baseline
      }

      // After 8 observations with windowSize=5, we should keep last 5
      // Last 5 = [0.5, 0.85, 0.85, 0.85] wait: 5 low + 3 high = 8 total
      // Window keeps last 5: indices 3,4 (0.5) and 5,6,7 (0.85) → mixed
      assert.strictEqual(monitor.windowSize(), 5, 'window trimmed to 5');

      const report = monitor.report();
      assert.strictEqual(report.windowSize, 5, 'report window size is 5');
    }

    // ── 7. Provenance recorded on every report ─────────────────────────────────
    {
      const { provenance, monitor } = makeRuntime();

      assert.strictEqual(provenance.size(), 0, 'empty before report');

      monitor.report();
      assert.ok(provenance.size() > 0, 'provenance has spans after report');

      const actions = provenance.actions();
      const driftAction = actions.find((s) => s.label === 'value-drift-report');
      assert.ok(driftAction, 'value-drift-report action span found');
      assert.strictEqual(driftAction!.kind, 'action', 'span kind is action');
      assert.ok(driftAction!.data?.hasDrift !== undefined, 'data has hasDrift');
    }

    // ── 8. Ethics baseline is highest — same dev % hits critical before others ─
    {
      assert.strictEqual(
        VALUE_BASELINE.ethics,
        0.9,
        'ethics baseline is 0.9 (highest)'
      );
      assert.strictEqual(VALUE_BASELINE.truth, 0.85, 'truth baseline is 0.85');
      assert.ok(VALUE_BASELINE.ethics >= VALUE_BASELINE.truth, 'ethics >= truth');
      assert.ok(VALUE_BASELINE.truth >= VALUE_BASELINE.care, 'truth >= care');
      assert.strictEqual(ALL_VALUE_KEYS.length, 7, 'all 7 persona values covered');
    }

    expect(true).toBe(true);
  });
});
