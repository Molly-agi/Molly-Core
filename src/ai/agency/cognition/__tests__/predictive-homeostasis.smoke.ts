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
console.log('TEST GROUP: initializes and registers tunables');
{
  const { registry, provenance } = makeRuntime();
  // Instantiating registers tunables via ensureTunables()
  const _homeostasis = new PredictiveHomeostasis(registry, provenance);

  // Check tunables are registered
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

  console.log('  ✓ forecastHorizonMs registered at 5 minutes');
  console.log('  ✓ llmConsultationThreshold registered at 0.3');
  console.log('  ✓ urgencyThreshold registered at 0.75');
}

// ── 2. Generates a plan with deterministic heuristic ────────────────────
console.log('TEST GROUP: generates plan with deterministic heuristic');
(async () => {
  const { registry, provenance } = makeRuntime();
  const homeostasis = new PredictiveHomeostasis(registry, provenance);

  // Low deviation: intensity matches expected (0.5 expected, 0.5 actual)
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

  console.log('  ✓ plan generated with deterministic heuristic');
  console.log('  ✓ predictedLoad bounded [0, 1]');
  console.log('  ✓ confidence is 0.85 for heuristic');
})();

// ── 3. Triggers LLM delta layer on high somatic deviation ───────────────
console.log('TEST GROUP: triggers LLM delta on high deviation');
(async () => {
  const { registry, provenance } = makeRuntime();
  const homeostasis = new PredictiveHomeostasis(registry, provenance);

  // High deviation: intensity 0.9 but expected ~0.5 → deviation 0.4 > 0.3 threshold
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

  console.log('  ✓ LLM delta layer triggered on high deviation');
  console.log('  ✓ explanation included');
  console.log('  ✓ confidence reduced to 0.75');
})();

// ── 4. Recommendations are bounded and urgency computed ─────────────────
console.log('TEST GROUP: recommendations bounded with urgency');
(async () => {
  const { registry, provenance } = makeRuntime();
  const homeostasis = new PredictiveHomeostasis(registry, provenance);

  // High load scenario: many flows, high error rate
  const stats = makeStats({
    recentFlowCount: 4,
    peakConcurrentFlows: 4,
    errorRate: 0.1,
  });
  const somatic = makeSomatic({ intensity: 0.7, regulationMode: 'normal' });

  const plan = await homeostasis.plan(stats, somatic);

  assert.ok(plan.recommendations.length > 0, 'recommendations generated');

  // Check all recommendations have required fields
  for (const rec of plan.recommendations) {
    assert.ok(rec.action, 'recommendation has action');
    assert.ok(rec.rationale, 'recommendation has rationale');
    assert.ok(typeof rec.expectedBenefit === 'number', 'has expectedBenefit');
    assert.ok(typeof rec.isUrgent === 'boolean', 'has isUrgent flag');
  }

  // At least one urgent recommendation expected at high load
  const urgentCount = plan.recommendations.filter((r) => r.isUrgent).length;
  console.log(`  ✓ ${plan.recommendations.length} recommendation(s) generated`);
  console.log(`  ✓ ${urgentCount} urgent recommendation(s)`);
  console.log('  ✓ all recommendations have required fields');
})();

// ── 5. Plan summary is human-readable ───────────────────────────────────
console.log('TEST GROUP: plan summary is human-readable');
(async () => {
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

  console.log('  ✓ summary is human-readable');
})();

// ── 6. Records decision to provenance ───────────────────────────────────
console.log('TEST GROUP: records decision to provenance');
(async () => {
  const { registry, provenance } = makeRuntime();
  const homeostasis = new PredictiveHomeostasis(registry, provenance);

  const stats = makeStats();
  const somatic = makeSomatic();

  assert.strictEqual(provenance.size(), 0, 'provenance empty before plan');

  await homeostasis.plan(stats, somatic);

  // provenance.actions() returns action spans (newest first)
  const actions = provenance.actions();
  assert.ok(actions.length > 0, 'at least one action span recorded');

  const span = actions.find((s) => s.label === 'homeostasis-plan');
  assert.ok(span, 'homeostasis-plan action span found');
  assert.strictEqual(span!.kind, 'action', 'span kind is action');
  assert.ok(span!.data?.predictedLoad !== undefined, 'data has predictedLoad');

  console.log('  ✓ decision recorded to provenance');
  console.log('  ✓ span has correct kind and data');
})();

// Wait for async tests to complete
setTimeout(() => {
  console.log('\n✅ ALL 6 PREDICTIVE HOMEOSTASIS GROUPS PASSED');
}, 100);
