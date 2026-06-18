/** @jest-environment node */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { threatSignalBus, type ThreatSignal } from '../signal-bus';
import { QuarantineLedgerSensor } from '../sensors/quarantine-ledger.sensor';

const LEDGER_PATH = resolve(process.cwd(), 'data/.bridge-quarantine-ledger');

describe('QuarantineLedgerSensor', () => {
  let originalLedger: string;
  let sensor: QuarantineLedgerSensor;

  beforeAll(() => {
    originalLedger = readFileSync(LEDGER_PATH, 'utf8');
  });

  afterAll(() => {
    writeFileSync(LEDGER_PATH, originalLedger);
  });

  beforeEach(() => {
    sensor = new QuarantineLedgerSensor();
  });

  afterEach(() => {
    sensor.stop();
    threatSignalBus.removeAllListeners();
  });

  it('emits a ThreatSignal when a new record is appended', async () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => received.push(s));

    sensor.start();

    const marker = `JEST_INJECTION_${Date.now()}`;
    const record = {
      timestamp: new Date().toISOString(),
      reason: marker,
      messageHash: 'jest-hash',
      from: 'jest-harness',
      summary: 'verification record',
    };

    await new Promise((r) => setTimeout(r, 50));
    appendFileSync(LEDGER_PATH, JSON.stringify(record) + '\n');
    await new Promise((r) => setTimeout(r, 300));

    const hit = received.find(
      (s) => (s.evidence as { reason?: string })?.reason === marker
    );
    expect(hit).toBeDefined();
    expect(hit?.source).toBe('quarantine-ledger');
    expect(hit?.severity).toBe('warn');
    expect(hit?.summary).toContain(marker);
    expect(hit?.summary).toContain('jest-harness');
  });

  it('does not crash on malformed JSON in the ledger', async () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => received.push(s));

    sensor.start();

    await new Promise((r) => setTimeout(r, 50));
    appendFileSync(LEDGER_PATH, 'not-valid-json\n');
    await new Promise((r) => setTimeout(r, 200));

    expect(
      received.find((s) => s.evidence === 'not-valid-json')
    ).toBeUndefined();
  });
});
