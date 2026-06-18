/** @jest-environment node */
import { threatSignalBus, type ThreatSignal } from '../signal-bus';
import { HoneypotScanSensor } from '../sensors/honeypot-scan.sensor';
import type { AttackerCommand } from '../../security/honeypot-command-logger';

function fakeCommand(
  i: number,
  opts: {
    success?: boolean;
    type?: AttackerCommand['command_type'];
    ageMs?: number;
    ip?: string;
  } = {}
): AttackerCommand {
  const ageMs = opts.ageMs ?? 0;
  return {
    id: `fake_${i}`,
    timestamp: new Date(Date.now() - ageMs).toISOString(),
    source_ip: opts.ip ?? '10.0.0.1',
    command_type: opts.type ?? 'probe',
    parameters: {},
    response_time_ms: 1,
    success: opts.success ?? false,
    forensic_hash: 'jest',
  };
}

describe('HoneypotScanSensor', () => {
  afterEach(() => {
    threatSignalBus.removeAllListeners();
  });

  it('does not fire when activity is below thresholds', () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => received.push(s));

    const log: AttackerCommand[] = [
      fakeCommand(1, { success: false, type: 'probe' }),
      fakeCommand(2, { success: false, type: 'probe' }),
    ];
    const sensor = new HoneypotScanSensor(60_000, { getCommandLog: () => log });

    const snap = sensor.scan();
    expect(snap.failures).toBe(2);
    expect(received.length).toBe(0);
  });

  it('emits critical signal when failure threshold exceeded', () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => received.push(s));

    const log: AttackerCommand[] = Array.from({ length: 6 }, (_, i) =>
      fakeCommand(i, { success: false, type: 'probe' })
    );
    const sensor = new HoneypotScanSensor(60_000, { getCommandLog: () => log });

    sensor.scan();

    const hit = received.find((s) => s.source === 'honeypot-scan');
    expect(hit).toBeDefined();
    expect(hit?.severity).toBe('critical');
    expect(hit?.summary).toContain('6 failures');
  });

  it('does not fire on 5 unique types but fires on 6+', () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => received.push(s));

    const fiveTypes: AttackerCommand[] = [
      fakeCommand(1, { type: 'probe', success: true }),
      fakeCommand(2, { type: 'list', success: true }),
      fakeCommand(3, { type: 'retrieve', success: true }),
      fakeCommand(4, { type: 'analyze', success: true }),
      fakeCommand(5, { type: 'decrypt', success: true }),
    ];
    let log: AttackerCommand[] = fiveTypes;
    const sensor = new HoneypotScanSensor(60_000, { getCommandLog: () => log });

    sensor.scan();
    expect(received.length).toBe(0);

    log = [
      ...fiveTypes,
      fakeCommand(6, { type: 'probe', success: true }),
      fakeCommand(7, { type: 'list', success: true }),
    ];
    expect(new Set(log.map((c) => c.command_type)).size).toBe(5);
    sensor.scan();
    expect(received.length).toBe(0);
  });

  it('ignores entries outside the time window', () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => received.push(s));

    const log: AttackerCommand[] = Array.from({ length: 20 }, (_, i) =>
      fakeCommand(i, { success: false, type: 'probe', ageMs: 5 * 60_000 })
    );
    const sensor = new HoneypotScanSensor(60_000, { getCommandLog: () => log });

    const snap = sensor.scan();
    expect(snap.totalCommands).toBe(0);
    expect(received.length).toBe(0);
  });

  it('does not double-fire within cooldown window', () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => received.push(s));

    const log: AttackerCommand[] = Array.from({ length: 10 }, (_, i) =>
      fakeCommand(i, { success: false, type: 'probe' })
    );
    const sensor = new HoneypotScanSensor(60_000, { getCommandLog: () => log });

    sensor.scan();
    sensor.scan();
    sensor.scan();

    expect(received.filter((s) => s.source === 'honeypot-scan').length).toBe(1);
  });
});
