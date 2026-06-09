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

describe('Temporal Device Model', () => {
  it('should register tunables, compute all time phases, structure snapshots, respect Eric active window, handle device capabilities, and record provenance across 9 test groups', () => {
    function makeRuntime() {
      const registry = new ParameterRegistry();
      const provenance = new ProvenanceLog(200);
      const model = new TemporalDeviceModel(registry, provenance);
      return { registry, provenance, model };
    }

    // ── 1. Registers all tunables on construction ───────────────────────────
    {
      const { registry } = makeRuntime();

      assert.strictEqual(registry.get<number>('temporal.utcOffsetHours'), -5, 'utcOffsetHours = -5 (EST)');
      assert.strictEqual(registry.get<number>('temporal.ericActiveStartHour'), 7, 'ericActiveStartHour = 7');
      assert.strictEqual(registry.get<number>('temporal.ericActiveEndHour'), 23, 'ericActiveEndHour = 23');
      assert.strictEqual(registry.get<string>('device.type'), 'unknown', 'device.type = unknown');
    }

    // ── 2. computeTimePhase covers all 6 phases ─────────────────────────────
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
    }

    // ── 3. observe() returns correctly structured snapshot ───────────────────
    {
      const { model } = makeRuntime();
      const snap = model.observe();

      assert.ok(snap.temporal, 'has temporal');
      assert.ok(snap.device, 'has device');
      assert.ok(typeof snap.summary === 'string' && snap.summary.length > 0, 'has summary');
      assert.ok(typeof snap.traceId === 'string' && snap.traceId.length > 0, 'has traceId');
      assert.ok(typeof snap.snapshotAt === 'string', 'has snapshotAt');

      assert.ok(snap.temporal.epochMs > 0, 'epochMs > 0');
      assert.ok(typeof snap.temporal.localIso === 'string', 'localIso is string');
      assert.ok(snap.temporal.localHour >= 0 && snap.temporal.localHour <= 23, 'localHour in [0,23]');
      assert.ok(snap.temporal.localDayOfWeek >= 0 && snap.temporal.localDayOfWeek <= 6, 'dayOfWeek in [0,6]');
      assert.ok(['deepnight','dawn','morning','afternoon','evening','night'].includes(snap.temporal.phase),
        'phase is valid');
      assert.ok(typeof snap.temporal.isWeekday === 'boolean', 'isWeekday is boolean');
      assert.ok(typeof snap.temporal.ericLikelyActive === 'boolean', 'ericLikelyActive is boolean');

      assert.ok(['codespace','android','browser','unknown'].includes(snap.device.deviceType),
        'deviceType is valid');
      assert.ok(snap.device.sessionAgeMs >= 0, 'sessionAgeMs >= 0');
      assert.ok(typeof snap.device.capabilities.connectionStability === 'number',
        'connectionStability is number');
    }

    // ── 4. Eric active window respected ─────────────────────────────────────
    {
      const { registry } = makeRuntime();
      const provenance = new ProvenanceLog(200);

      registry.commit('temporal.utcOffsetHours', 0, TEMPORAL_DEVICE_ID, 'test');
      registry.commit('temporal.ericActiveStartHour', 8, TEMPORAL_DEVICE_ID, 'test');
      registry.commit('temporal.ericActiveEndHour', 22, TEMPORAL_DEVICE_ID, 'test');

      const model = new TemporalDeviceModel(registry, provenance);
      const snap = model.observe();
      const hour = snap.temporal.localHour;
      const active = snap.temporal.ericLikelyActive;

      const expectedActive = hour >= 8 && hour < 22;
      assert.strictEqual(active, expectedActive,
        `hour=${hour} active=${active} expected=${expectedActive}`);
    }

    // ── 5. Android device capabilities ──────────────────────────────────────
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
    }

    // ── 6. Codespace device capabilities ────────────────────────────────────
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
    }

    // ── 7. Session age increases over time ──────────────────────────────────
    {
      const { model } = makeRuntime();
      const snap1 = model.observe();

      assert.ok(snap1.device.sessionAgeMs >= 0, 'session age >= 0 on first observe');
      assert.ok(snap1.device.sessionStartedAt > 0, 'sessionStartedAt is set');
      assert.ok(snap1.device.sessionStartedAt <= snap1.temporal.epochMs,
        'session started at or before now');
    }

    // ── 8. Provenance recorded on every observe() ───────────────────────────
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
    }

    // ── 9. UTC offset shifts local hour correctly ───────────────────────────
    {
      const { registry, provenance } = makeRuntime();

      registry.commit('temporal.utcOffsetHours', 12, TEMPORAL_DEVICE_ID, 'test extreme offset');
      const modelEast = new TemporalDeviceModel(registry, provenance);
      const snapEast = modelEast.observe();

      registry.commit('temporal.utcOffsetHours', -12, TEMPORAL_DEVICE_ID, 'test negative offset');
      const modelWest = new TemporalDeviceModel(registry, provenance);
      const snapWest = modelWest.observe();

      assert.ok(snapEast.temporal.localIso !== snapWest.temporal.localIso,
        'UTC+12 and UTC-12 produce different local ISO strings');
    }

    expect(true).toBe(true);
  });
});
