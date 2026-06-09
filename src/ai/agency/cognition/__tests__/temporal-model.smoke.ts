/**
 * Temporal Model — Smoke Tests (D.7a)
 */
import { strict as assert } from 'assert';
import { ParameterRegistry } from '../../registry/parameter-registry';
import { ProvenanceLog } from '../../provenance/provenance-log';
import { TemporalModel } from '../temporal-model';

function makeRuntime() {
  const registry = new ParameterRegistry();
  const provenance = new ProvenanceLog(100);
  return { registry, provenance };
}

/** Create a fake Date with controlled hour + dayOfWeek. */
function fakeDate(hour: number, dayOfWeek: number): Date {
  const d = new Date();
  Object.defineProperty(d, 'getHours', { value: () => hour });
  Object.defineProperty(d, 'getDay', { value: () => dayOfWeek });
  Object.defineProperty(d, 'toISOString', {
    value: () => `2026-06-09T${String(hour).padStart(2, '0')}:00:00.000Z`,
  });
  return d;
}

// ── 1. Initializes and registers tunables ───────────────────────────────
console.log('TEST GROUP: initializes and registers tunables');
{
  const { registry, provenance } = makeRuntime();
  const _model = new TemporalModel(registry, provenance);

  const morning = registry.get<number>('temporal.morningStartHour');
  assert.strictEqual(morning, 6, 'morningStartHour defaults to 6');

  const afternoon = registry.get<number>('temporal.afternoonStartHour');
  assert.strictEqual(afternoon, 12, 'afternoonStartHour defaults to 12');

  const evening = registry.get<number>('temporal.eveningStartHour');
  assert.strictEqual(evening, 17, 'eveningStartHour defaults to 17');

  const night = registry.get<number>('temporal.nightStartHour');
  assert.strictEqual(night, 21, 'nightStartHour defaults to 21');

  const project = registry.get<string>('temporal.projectPhase');
  assert.strictEqual(
    project,
    'production',
    'projectPhase defaults to production'
  );

  console.log('  ✓ all 5 tunables registered at expected defaults');
}

// ── 2. getDayPhase() covers all 4 phases ───────────────────────────────
console.log('TEST GROUP: getDayPhase covers all phases');
{
  const { registry, provenance } = makeRuntime();
  const model = new TemporalModel(registry, provenance);

  assert.strictEqual(model.getDayPhase(3), 'night', 'hour 3 → night');
  assert.strictEqual(model.getDayPhase(6), 'morning', 'hour 6 → morning');
  assert.strictEqual(
    model.getDayPhase(11),
    'morning',
    'hour 11 → still morning'
  );
  assert.strictEqual(model.getDayPhase(12), 'afternoon', 'hour 12 → afternoon');
  assert.strictEqual(
    model.getDayPhase(16),
    'afternoon',
    'hour 16 → still afternoon'
  );
  assert.strictEqual(model.getDayPhase(17), 'evening', 'hour 17 → evening');
  assert.strictEqual(
    model.getDayPhase(20),
    'evening',
    'hour 20 → still evening'
  );
  assert.strictEqual(model.getDayPhase(21), 'night', 'hour 21 → night');
  assert.strictEqual(model.getDayPhase(23), 'night', 'hour 23 → night');

  console.log('  ✓ all 4 day phases covered correctly');
}

// ── 3. getWeekPhase() weekend vs weekday ───────────────────────────────
console.log('TEST GROUP: getWeekPhase weekend vs weekday');
{
  const { registry, provenance } = makeRuntime();
  const model = new TemporalModel(registry, provenance);

  assert.strictEqual(model.getWeekPhase(0), 'weekend', 'Sunday → weekend');
  assert.strictEqual(model.getWeekPhase(6), 'weekend', 'Saturday → weekend');
  for (let d = 1; d <= 5; d++) {
    assert.strictEqual(model.getWeekPhase(d), 'weekday', `day ${d} → weekday`);
  }

  console.log('  ✓ weekend (0, 6) and weekday (1–5) correct');
}

// ── 4. getTemporalContext() returns all required fields ────────────────
console.log('TEST GROUP: getTemporalContext returns complete context');
{
  const { registry, provenance } = makeRuntime();
  const model = new TemporalModel(registry, provenance);

  const ctx = model.getTemporalContext(fakeDate(14, 1)); // Tuesday 2pm

  assert.strictEqual(ctx.dayPhase, 'afternoon', 'hour 14 → afternoon');
  assert.strictEqual(ctx.weekPhase, 'weekday', 'Tuesday → weekday');
  assert.strictEqual(ctx.projectPhase, 'production', 'default projectPhase');
  assert.ok(typeof ctx.readAt === 'string', 'readAt is a string');
  assert.strictEqual(ctx.hourOfDay, 14, 'hourOfDay = 14');
  assert.strictEqual(ctx.dayOfWeek, 1, 'dayOfWeek = 1');

  console.log('  ✓ context has all required fields');
  console.log(
    `  ✓ dayPhase=${ctx.dayPhase}, weekPhase=${ctx.weekPhase}, projectPhase=${ctx.projectPhase}`
  );
}

// ── 5. Provenance written on transition, not every read ────────────────
console.log('TEST GROUP: provenance written on transition only');
{
  const { registry, provenance } = makeRuntime();
  const model = new TemporalModel(registry, provenance);

  // First call — records initial state
  model.getTemporalContext(fakeDate(9, 1)); // morning, weekday
  const afterFirst = provenance.size();
  assert.ok(afterFirst > 0, 'provenance written on first context read');

  // Same phase — no new write
  model.getTemporalContext(fakeDate(10, 2)); // still morning, still weekday
  assert.strictEqual(provenance.size(), afterFirst, 'no write for same phase');

  // Phase change — new write
  model.getTemporalContext(fakeDate(13, 2)); // afternoon, weekday
  assert.ok(
    provenance.size() > afterFirst,
    'provenance written on phase change'
  );

  console.log('  ✓ provenance written on first call and on phase transitions');
  console.log('  ✓ no duplicate writes for same phase');
}

// ── 6. projectPhase is registry-tunable ───────────────────────────────
console.log('TEST GROUP: projectPhase is registry-tunable');
{
  const { registry, provenance } = makeRuntime();
  const model = new TemporalModel(registry, provenance);

  // Override via registry
  registry.commit(
    'temporal.projectPhase',
    'alpha',
    'temporal-model',
    'test override'
  );

  const ctx = model.getTemporalContext(fakeDate(10, 1));
  assert.strictEqual(
    ctx.projectPhase,
    'alpha',
    'projectPhase reflects registry value'
  );

  console.log('  ✓ projectPhase reads live from registry');
}

setTimeout(() => {
  console.log('\n✅ ALL 6 TEMPORAL MODEL GROUPS PASSED');
}, 100);
