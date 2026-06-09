/**
 * Device Embodiment — Smoke Tests (D.7b)
 */
import { strict as assert } from 'assert';
import { ParameterRegistry } from '../../registry/parameter-registry';
import { ProvenanceLog } from '../../provenance/provenance-log';
import { DeviceEmbodiment, type DeviceSnapshot } from '../device-embodiment';

function makeRuntime() {
  const registry = new ParameterRegistry();
  const provenance = new ProvenanceLog(100);
  return { registry, provenance };
}

function makeSnapshot(overrides: Partial<DeviceSnapshot> = {}): DeviceSnapshot {
  return {
    screenState: 'on',
    audioState: 'silent',
    networkState: 'online',
    powerState: 'battery',
    touchActive: false,
    snapshotAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── 1. Initializes and registers tunables ───────────────────────────────
console.log('TEST GROUP: initializes and registers tunables');
{
  const { registry, provenance } = makeRuntime();
  const _device = new DeviceEmbodiment(registry, provenance);

  const degraded = registry.get<number>('device.degradedNetworkPenalty');
  assert.strictEqual(degraded, 0.3, 'degradedNetworkPenalty defaults to 0.3');

  const lowPower = registry.get<number>('device.lowPowerPenalty');
  assert.strictEqual(lowPower, 0.4, 'lowPowerPenalty defaults to 0.4');

  const screenOff = registry.get<number>('device.screenOffPenalty');
  assert.strictEqual(screenOff, 0.2, 'screenOffPenalty defaults to 0.2');

  console.log('  ✓ degradedNetworkPenalty = 0.3');
  console.log('  ✓ lowPowerPenalty = 0.4');
  console.log('  ✓ screenOffPenalty = 0.2');
}

// ── 2. Default affordances on healthy device ───────────────────────────
console.log('TEST GROUP: default affordances on healthy device');
{
  const { registry, provenance } = makeRuntime();
  const device = new DeviceEmbodiment(registry, provenance);

  const affordances = device.getDeviceAffordances();

  assert.strictEqual(affordances.canDisplay, true, 'screen on → canDisplay');
  assert.strictEqual(affordances.canNetwork, true, 'online → canNetwork');
  assert.strictEqual(affordances.hasPower, true, 'battery → hasPower');
  assert.strictEqual(
    affordances.canInteract,
    false,
    'touchActive false → no interact'
  );
  assert.strictEqual(affordances.canPlayAudio, false, 'silent → no audio');
  assert.ok(affordances.readiness >= 0.9, 'healthy device has high readiness');

  console.log(`  ✓ canDisplay=true, canNetwork=true, hasPower=true`);
  console.log(`  ✓ readiness=${affordances.readiness.toFixed(2)} (≥0.9)`);
}

// ── 3. updateFromDeviceSnapshot() transitions affordances ───────────────
console.log('TEST GROUP: snapshot update transitions affordances');
{
  const { registry, provenance } = makeRuntime();
  const device = new DeviceEmbodiment(registry, provenance);

  device.updateFromDeviceSnapshot(
    makeSnapshot({
      screenState: 'off',
      networkState: 'offline',
      powerState: 'low',
      touchActive: false,
    })
  );

  const affordances = device.getDeviceAffordances();

  assert.strictEqual(affordances.canDisplay, false, 'screen off → no display');
  assert.strictEqual(affordances.canNetwork, false, 'offline → no network');
  assert.strictEqual(affordances.hasPower, false, 'low power → no hasPower');
  assert.strictEqual(
    affordances.canInteract,
    false,
    'screen off → no interact'
  );
  assert.ok(
    affordances.readiness < 0.3,
    `degraded device has low readiness (got ${affordances.readiness.toFixed(2)})`
  );

  console.log('  ✓ degraded state correctly reflected in affordances');
  console.log(
    `  ✓ readiness=${affordances.readiness.toFixed(2)} (< 0.3 expected)`
  );
}

// ── 4. Invalid snapshot values are rejected ────────────────────────────
console.log('TEST GROUP: invalid snapshot values are rejected');
{
  const { registry, provenance } = makeRuntime();
  const device = new DeviceEmbodiment(registry, provenance);

  // State before invalid update
  const before = device.getSnapshot();

  // @ts-expect-error — intentionally passing invalid value
  device.updateFromDeviceSnapshot(makeSnapshot({ screenState: 'blinking' }));

  // State should be unchanged
  const after = device.getSnapshot();
  assert.strictEqual(
    after.screenState,
    before.screenState,
    'invalid screenState rejected'
  );

  console.log('  ✓ invalid screenState does not corrupt state');
}

// ── 5. Provenance records transition on state change only ──────────────
console.log('TEST GROUP: provenance records on transition only');
{
  const { registry, provenance } = makeRuntime();
  const device = new DeviceEmbodiment(registry, provenance);

  assert.strictEqual(provenance.size(), 0, 'provenance empty at start');

  // First update — triggers transition from default
  device.updateFromDeviceSnapshot(makeSnapshot({ screenState: 'dimmed' }));
  const afterFirst = provenance.size();
  assert.ok(afterFirst > 0, 'provenance written on first transition');

  // Same state again — no new provenance
  const snapSize = provenance.size();
  device.updateFromDeviceSnapshot(makeSnapshot({ screenState: 'dimmed' }));
  assert.strictEqual(
    provenance.size(),
    snapSize,
    'no provenance write for identical state'
  );

  console.log('  ✓ provenance written on first transition');
  console.log('  ✓ no duplicate writes for identical state');
}

// ── 6. canInteract requires both touch and screen ─────────────────────
console.log('TEST GROUP: canInteract gate');
{
  const { registry, provenance } = makeRuntime();
  const device = new DeviceEmbodiment(registry, provenance);

  device.updateFromDeviceSnapshot(
    makeSnapshot({ screenState: 'on', touchActive: true })
  );
  assert.strictEqual(
    device.getDeviceAffordances().canInteract,
    true,
    'touch+screen → interact'
  );

  device.updateFromDeviceSnapshot(
    makeSnapshot({ screenState: 'off', touchActive: true })
  );
  assert.strictEqual(
    device.getDeviceAffordances().canInteract,
    false,
    'touch+no screen → no interact'
  );

  device.updateFromDeviceSnapshot(
    makeSnapshot({ screenState: 'on', touchActive: false })
  );
  assert.strictEqual(
    device.getDeviceAffordances().canInteract,
    false,
    'screen+no touch → no interact'
  );

  console.log('  ✓ canInteract = touchActive AND screenState !== off');
}

// ── 7. Readiness is bounded [0, 1] under all conditions ───────────────
console.log('TEST GROUP: readiness bounded [0, 1]');
{
  const { registry, provenance } = makeRuntime();
  const device = new DeviceEmbodiment(registry, provenance);

  const states: Array<Partial<DeviceSnapshot>> = [
    { screenState: 'on', networkState: 'online', powerState: 'charging' },
    { screenState: 'off', networkState: 'offline', powerState: 'low' },
    { screenState: 'dimmed', networkState: 'degraded', powerState: 'battery' },
  ];

  for (const state of states) {
    device.updateFromDeviceSnapshot(makeSnapshot(state));
    const { readiness } = device.getDeviceAffordances();
    assert.ok(readiness >= 0, `readiness >= 0 (got ${readiness})`);
    assert.ok(readiness <= 1, `readiness <= 1 (got ${readiness})`);
  }

  console.log('  ✓ readiness is bounded [0, 1] across all tested states');
}

setTimeout(() => {
  console.log('\n✅ ALL 7 DEVICE EMBODIMENT GROUPS PASSED');
}, 100);
