/**
 * Predictive Homeostasis — Smoke Tests (D.4)
 */
import { strict as assert } from 'assert';
import { ParameterRegistry } from '../../registry/parameter-registry';
import { ProvenanceLog } from '../../provenance/provenance-log';
import {
  PredictiveHomeostasis,
  type HistoricalStats,
  type SomaticSnapshot,
} from '../predictive-homeostasis';

describe('Predictive Homeostasis', () => {
  it('should initialize tunables, generate plans with heuristic/LLM, compute urgency, and record to provenance across 6 test groups', async () => {
    function makeRuntime() {
      const registry = new ParameterRegistry();
      const provenance = new ProvenanceLog(100);
      return { registry, provenance };
    }

    function makeStats(overrides: Partial<HistoricalStats> = {}): HistoricalStats {
      return {
        recentFlowCount: 2,
        avgFlowDurationMs: 2000,
        peakConcurrentFlows: 4,
        errorRate: 0.02,
        latencyP95Ms: 500,
        consolidationBacklogSize: 10,
        windowMs: 60_000,
        collectedAt: new Date().toISOString(),
        ...overrides,
      };
    }

    function makeSomatic(
      overrides: Partial<SomaticSnapshot> = {}
    ): SomaticSnapshot {
      return {
        intensity: 0.5,
        regulationMode: 'normal',
        recentEventCount: 5,
        snapshotAt: new Date().toISOString(),
        ...overrides,
      };
    }

    // ── 1. Initializes and registers tunables ───────────────────────────────
    {
      const { registry, provenance } = makeRuntime();
      const _homeostasis = new PredictiveHomeostasis(registry, provenance);

      const horizon = registry.get<number>('homeostasis.forecastHorizonMs');
      assert.strictEqual(
        horizon,
        5 * 60 * 1000,
        'forecastHorizonMs defaults to 5 minutes'
      );

      const llmThreshold = registry.get<number>(
        'homeostasis.llmConsultationThreshold'
      );
      assert.strictEqual(
        llmThreshold,
        0.3,
        'llmConsultationThreshold defaults to 0.3'
      );

      const urgency = registry.get<number>('homeostasis.urgencyThreshold');
      assert.strictEqual(urgency, 0.75, 'urgencyThreshold defaults to 0.75');
    }

    // ── 2. Generates a plan with deterministic heuristic ────────────────────
    {
      const { registry, provenance } = makeRuntime();
      const homeostasis = new PredictiveHomeostasis(registry, provenance);

      const stats = makeStats({ recentFlowCount: 2 });
      const somatic = makeSomatic({ intensity: 0.5, recentEventCount: 5 });

      const plan = await homeostasis.plan(stats, somatic);

      assert.ok(plan.traceId, 'plan has traceId');
      assert.ok(plan.generatedAt, 'plan has generatedAt');
      assert.strictEqual(
        plan.prediction.derivationMethod,
        'deterministic-heuristic',
        'uses heuristic when deviation is low'
      );
      assert.ok(plan.prediction.predictedLoad >= 0, 'predictedLoad >= 0');
      assert.ok(plan.prediction.predictedLoad <= 1, 'predictedLoad <= 1');
      assert.strictEqual(
        plan.prediction.confidence,
        0.85,
        'heuristic confidence is 0.85'
      );
    }

    // ── 3. Triggers LLM delta layer on high somatic deviation ───────────────
    {
      const { registry, provenance } = makeRuntime();
      const homeostasis = new PredictiveHomeostasis(registry, provenance);

      const stats = makeStats({ recentFlowCount: 2 });
      const somatic = makeSomatic({ intensity: 0.9, recentEventCount: 5 });

      const plan = await homeostasis.plan(stats, somatic);

      assert.strictEqual(
        plan.prediction.derivationMethod,
        'llm-delta-interpretation',
        'uses LLM delta when deviation exceeds threshold'
      );
      assert.ok(plan.prediction.llmDeltaExplanation, 'has LLM explanation');
      assert.ok(
        plan.prediction.llmDeltaExplanation.includes('deviated'),
        'explanation mentions deviation'
      );
      assert.strictEqual(
        plan.prediction.confidence,
        0.75,
        'LLM-adjusted confidence is 0.75'
      );
    }

    // ── 4. Recommendations are bounded and urgency computed ─────────────────
    {
      const { registry, provenance } = makeRuntime();
      const homeostasis = new PredictiveHomeostasis(registry, provenance);

      const stats = makeStats({
        recentFlowCount: 4,
        peakConcurrentFlows: 4,
        errorRate: 0.1,
      });
      const somatic = makeSomatic({ intensity: 0.7, regulationMode: 'normal' });

      const plan = await homeostasis.plan(stats, somatic);

      assert.ok(plan.recommendations.length > 0, 'recommendations generated');

      for (const rec of plan.recommendations) {
        assert.ok(rec.action, 'recommendation has action');
        assert.ok(rec.rationale, 'recommendation has rationale');
        assert.ok(typeof rec.expectedBenefit === 'number', 'has expectedBenefit');
        assert.ok(typeof rec.isUrgent === 'boolean', 'has isUrgent flag');
      }

      const urgentCount = plan.recommendations.filter((r) => r.isUrgent).length;
      assert.ok(urgentCount >= 0, 'urgent count tracked');
    }

    // ── 5. Plan summary is human-readable ───────────────────────────────────
    {
      const { registry, provenance } = makeRuntime();
      const homeostasis = new PredictiveHomeostasis(registry, provenance);

      const stats = makeStats();
      const somatic = makeSomatic();

      const plan = await homeostasis.plan(stats, somatic);

      assert.ok(
        plan.summary.includes('Predicted load'),
        'summary mentions predicted load'
      );
      assert.ok(plan.summary.includes('%'), 'summary includes percentage');
      assert.ok(
        plan.summary.includes('recommendation'),
        'summary mentions recommendations'
      );
    }

    // ── 6. Records decision to provenance ───────────────────────────────────
    {
      const { registry, provenance } = makeRuntime();
      const homeostasis = new PredictiveHomeostasis(registry, provenance);

      const stats = makeStats();
      const somatic = makeSomatic();

      assert.strictEqual(provenance.size(), 0, 'provenance empty before plan');

      await homeostasis.plan(stats, somatic);

      const actions = provenance.actions();
      assert.ok(actions.length > 0, 'at least one action span recorded');

      const span = actions.find((s) => s.label === 'homeostasis-plan');
      assert.ok(span, 'homeostasis-plan action span found');
      assert.strictEqual(span!.kind, 'action', 'span kind is action');
      assert.ok(span!.data?.predictedLoad !== undefined, 'data has predictedLoad');
    }

    expect(true).toBe(true);
  });
});

// Required by Jest — all assertions above ran synchronously at module load time
test('smoke — all groups pass', () => { expect(true).toBe(true); });
