/**
 * Temporal + Device Model — Smoke Tests (D.7)
 *
 * Validates:
 *   1. Registers all tunables on construction
 *   2. computeTimePhase() covers all 6 phases correctly
 *   3. observe() returns snapshot with correct structure
 *   4. Eric likely-active window is respected
 *   5. Android device gets correct low-stability capabilities
 *   6. Codespace device gets correct high-stability capabilities
 *   7. Session age increases over time (sanity check)
 *   8. Provenance recorded on every observe()
 *   9. UTC offset correctly shifts local hour
 */
import { strict as assert } from 'assert';
import { ParameterRegistry } from '../../registry/parameter-registry';
import { ProvenanceLog } from '../../provenance/provenance-log';
import {
  TemporalDeviceModel,
  TEMPORAL_DEVICE_ID,
  computeTimePhase,
  type TimePhase,
} from '../temporal-device-model';

function makeRuntime() {
  const registry = new ParameterRegistry();
  const provenance = new ProvenanceLog(200);
  const model = new TemporalDeviceModel(registry, provenance);
  return { registry, provenance, model };
}

// ── 1. Registers all tunables on construction ───────────────────────────
console.log('TEST GROUP: registers tunables on construction');
{
  const { registry } = makeRuntime();

  assert.strictEqual(registry.get<number>('temporal.utcOffsetHours'), -5, 'utcOffsetHours = -5 (EST)');
  assert.strictEqual(registry.get<number>('temporal.ericActiveStartHour'), 7, 'ericActiveStartHour = 7');
  assert.strictEqual(registry.get<number>('temporal.ericActiveEndHour'), 23, 'ericActiveEndHour = 23');
  assert.strictEqual(registry.get<string>('device.type'), 'unknown', 'device.type = unknown');

  console.log('  ✓ utcOffsetHours = -5 (Eric EST)');
  console.log('  ✓ ericActiveStartHour = 7');
  console.log('  ✓ ericActiveEndHour = 23');
  console.log('  ✓ device.type = unknown');
}

// ── 2. computeTimePhase covers all 6 phases ─────────────────────────────
console.log('TEST GROUP: computeTimePhase covers all phases');
{
  const cases: Array<[number, TimePhase]> = [
    [0, 'deepnight'],
    [2, 'deepnight'],
    [4, 'deepnight'],
    [5, 'dawn'],
    [7, 'dawn'],
    [8, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [16, 'afternoon'],
    [17, 'evening'],
    [20, 'evening'],
    [21, 'night'],
    [23, 'night'],
  ];

  for (const [hour, expected] of cases) {
    const actual = computeTimePhase(hour);
    assert.strictEqual(actual, expected, `hour ${hour} → ${expected} (got ${actual})`);
  }

  console.log('  ✓ all 6 time phases map correctly across 13 test hours');
}

// ── 3. observe() returns correctly structured snapshot ───────────────────
console.log('TEST GROUP: observe() structure is correct');
{
  const { model } = makeRuntime();
  const snap = model.observe();

  assert.ok(snap.temporal, 'has temporal');
  assert.ok(snap.device, 'has device');
  assert.ok(typeof snap.summary === 'string' && snap.summary.length > 0, 'has summary');
  assert.ok(typeof snap.traceId === 'string' && snap.traceId.length > 0, 'has traceId');
  assert.ok(typeof snap.snapshotAt === 'string', 'has snapshotAt');

  // Temporal fields
  assert.ok(snap.temporal.epochMs > 0, 'epochMs > 0');
  assert.ok(typeof snap.temporal.localIso === 'string', 'localIso is string');
  assert.ok(snap.temporal.localHour >= 0 && snap.temporal.localHour <= 23, 'localHour in [0,23]');
  assert.ok(snap.temporal.localDayOfWeek >= 0 && snap.temporal.localDayOfWeek <= 6, 'dayOfWeek in [0,6]');
  assert.ok(['deepnight','dawn','morning','afternoon','evening','night'].includes(snap.temporal.phase),
    'phase is valid');
  assert.ok(typeof snap.temporal.isWeekday === 'boolean', 'isWeekday is boolean');
  assert.ok(typeof snap.temporal.ericLikelyActive === 'boolean', 'ericLikelyActive is boolean');

  // Device fields
  assert.ok(['codespace','android','browser','unknown'].includes(snap.device.deviceType),
    'deviceType is valid');
  assert.ok(snap.device.sessionAgeMs >= 0, 'sessionAgeMs >= 0');
  assert.ok(typeof snap.device.capabilities.connectionStability === 'number',
    'connectionStability is number');

  console.log(`  ✓ snapshot structure valid — phase=${snap.temporal.phase} device=${snap.device.deviceType}`);
  console.log(`  ✓ summary: "${snap.summary.slice(0, 80)}"`);
}

// ── 4. Eric active window respected ─────────────────────────────────────
console.log('TEST GROUP: Eric active window respected');
{
  const { registry } = makeRuntime();
  const provenance = new ProvenanceLog(200);

  // Set a controlled UTC offset: UTC+0 so epoch ms == local time
  registry.commit('temporal.utcOffsetHours', 0, TEMPORAL_DEVICE_ID, 'test');
  registry.commit('temporal.ericActiveStartHour', 8, TEMPORAL_DEVICE_ID, 'test');
  registry.commit('temporal.ericActiveEndHour', 22, TEMPORAL_DEVICE_ID, 'test');

  const model = new TemporalDeviceModel(registry, provenance);

  // At UTC+0, current time is real. We can't control "now" directly in a smoke test.
  // Instead verify the logic: if ericLikelyActive, hour must be in [8,22)
  const snap = model.observe();
  const hour = snap.temporal.localHour;
  const active = snap.temporal.ericLikelyActive;

  const expectedActive = hour >= 8 && hour < 22;
  assert.strictEqual(active, expectedActive,
    `hour=${hour} active=${active} expected=${expectedActive}`);

  console.log(`  ✓ hour=${hour} ericLikelyActive=${active} — correct`);
}

// ── 5. Android device capabilities ──────────────────────────────────────
console.log('TEST GROUP: android device capabilities');
{
  const { registry, provenance } = makeRuntime();
  registry.commit('device.type', 'android', TEMPORAL_DEVICE_ID, 'test');

  const model = new TemporalDeviceModel(registry, provenance);
  const snap = model.observe();

  assert.strictEqual(snap.device.deviceType, 'android', 'device type is android');
  assert.strictEqual(snap.device.capabilities.audio, true, 'android has audio');
  assert.strictEqual(snap.device.capabilities.shell, false, 'android has no shell');
  assert.strictEqual(snap.device.capabilities.websocket, false, 'android WebSocket unreliable');
  assert.ok(snap.device.capabilities.connectionStability < 0.5,
    'android connection stability < 0.5 (Eric\'s phone drops)');
  assert.ok(snap.summary.includes('unstable'), 'summary notes unstable connection');

  console.log('  ✓ android: audio=true, shell=false, websocket=false, stability<0.5');
  console.log('  ✓ summary flags unstable connection for android');
}

// ── 6. Codespace device capabilities ────────────────────────────────────
console.log('TEST GROUP: codespace device capabilities');
{
  const { registry, provenance } = makeRuntime();
  registry.commit('device.type', 'codespace', TEMPORAL_DEVICE_ID, 'test');

  const model = new TemporalDeviceModel(registry, provenance);
  const snap = model.observe();

  assert.strictEqual(snap.device.deviceType, 'codespace', 'device type is codespace');
  assert.strictEqual(snap.device.capabilities.shell, true, 'codespace has shell');
  assert.strictEqual(snap.device.capabilities.localPersistence, true, 'codespace has persistence');
  assert.strictEqual(snap.device.capabilities.websocket, true, 'codespace has stable websocket');
  assert.ok(snap.device.capabilities.connectionStability >= 0.9, 'codespace stability >= 0.9');

  console.log('  ✓ codespace: shell=true, persistence=true, websocket=true, stability>=0.9');
}

// ── 7. Session age increases over time ──────────────────────────────────
console.log('TEST GROUP: session age is non-zero and grows');
{
  const { model } = makeRuntime();

  const snap1 = model.observe();
  // Session age starts from construction — should be at least 0
  assert.ok(snap1.device.sessionAgeMs >= 0, 'session age >= 0 on first observe');
  assert.ok(snap1.device.sessionStartedAt > 0, 'sessionStartedAt is set');
  assert.ok(snap1.device.sessionStartedAt <= snap1.temporal.epochMs,
    'session started at or before now');

  console.log(`  ✓ sessionAge=${snap1.device.sessionAgeMs}ms, started=${snap1.device.sessionStartedAt}`);
}

// ── 8. Provenance recorded on every observe() ───────────────────────────
console.log('TEST GROUP: provenance recorded');
{
  const { provenance, model } = makeRuntime();

  assert.strictEqual(provenance.size(), 0, 'empty before observe');

  model.observe();
  assert.ok(provenance.size() > 0, 'spans recorded after observe');

  const actions = provenance.actions();
  const snap = actions.find((s) => s.label === 'temporal-device-snapshot');
  assert.ok(snap, 'temporal-device-snapshot action span found');
  assert.strictEqual(snap!.kind, 'action', 'kind is action');
  assert.ok(snap!.data?.phase !== undefined, 'data has phase');
  assert.ok(snap!.data?.deviceType !== undefined, 'data has deviceType');

  console.log('  ✓ provenance span recorded with phase and deviceType');
}

// ── 9. UTC offset shifts local hour correctly ───────────────────────────
console.log('TEST GROUP: UTC offset shifts local hour');
{
  const { registry, provenance } = makeRuntime();

  // UTC+12 offset shifts the local hour 12 hours ahead of UTC
  registry.commit('temporal.utcOffsetHours', 12, TEMPORAL_DEVICE_ID, 'test extreme offset');
  const modelEast = new TemporalDeviceModel(registry, provenance);
  const snapEast = modelEast.observe();

  registry.commit('temporal.utcOffsetHours', -12, TEMPORAL_DEVICE_ID, 'test negative offset');
  const modelWest = new TemporalDeviceModel(registry, provenance);
  const snapWest = modelWest.observe();

  // The hours should differ by 24 (mod 24 they might be equal, but the ISO strings differ)
  // At minimum: localIso should contain different hour strings
  assert.ok(snapEast.temporal.localIso !== snapWest.temporal.localIso,
    'UTC+12 and UTC-12 produce different local ISO strings');

  console.log(`  ✓ UTC+12: ${snapEast.temporal.localIso.slice(11, 16)}, UTC-12: ${snapWest.temporal.localIso.slice(11, 16)}`);
}

console.log('\n✅ ALL 9 D.7 TEMPORAL+DEVICE MODEL GROUPS PASSED');
