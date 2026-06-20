/** @jest-environment node */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { threatSignalBus, type ThreatSignal } from '../signal-bus';
import { AdminAuditSensor } from '../sensors/admin-audit.sensor';

const AUDIT_PATH = resolve(process.cwd(), '.admin-audit.jsonl');

describe('AdminAuditSensor', () => {
  let originalAudit: string;
  let sensor: AdminAuditSensor;

  beforeAll(() => {
    originalAudit = readFileSync(AUDIT_PATH, 'utf8');
  });

  afterAll(() => {
    writeFileSync(AUDIT_PATH, originalAudit);
  });

  beforeEach(() => {
    sensor = new AdminAuditSensor();
  });

  afterEach(() => {
    sensor.stop();
    threatSignalBus.removeAllListeners();
  });

  it('emits info-severity signal on successful admin command', async () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => received.push(s));

    sensor.start();

    const marker = `jest-cmd-ok-${Date.now()}`;
    const record = {
      timestamp: new Date().toISOString(),
      tokenHash:
        'abcdef1234567890aabbccddeeff00112233445566778899aabbccddeeff0011',
      command: marker,
      success: true,
      result: 'ok',
    };

    await new Promise((r) => setTimeout(r, 50));
    appendFileSync(AUDIT_PATH, JSON.stringify(record) + '\n');
    await new Promise((r) => setTimeout(r, 300));

    const hit = received.find(
      (s) => (s.evidence as { command?: string })?.command === marker
    );
    expect(hit).toBeDefined();
    expect(hit?.source).toBe('admin-audit');
    expect(hit?.severity).toBe('info');
    expect(hit?.summary).toContain(marker);
    expect(hit?.summary).toContain('ok');
  });

  it('emits warn-severity signal on failed admin command', async () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => received.push(s));

    sensor.start();

    const marker = `jest-cmd-fail-${Date.now()}`;
    const record = {
      timestamp: new Date().toISOString(),
      tokenHash:
        'deadbeefcafe0011223344556677889900aabbccddeeff00112233445566778899',
      command: marker,
      success: false,
      result: 'denied',
    };

    await new Promise((r) => setTimeout(r, 50));
    appendFileSync(AUDIT_PATH, JSON.stringify(record) + '\n');
    await new Promise((r) => setTimeout(r, 300));

    const hit = received.find(
      (s) => (s.evidence as { command?: string })?.command === marker
    );
    expect(hit).toBeDefined();
    expect(hit?.severity).toBe('warn');
    expect(hit?.summary).toContain('failed');
  });

  it('does not crash on malformed JSON in the audit log', async () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => received.push(s));

    sensor.start();

    await new Promise((r) => setTimeout(r, 50));
    appendFileSync(AUDIT_PATH, 'not-valid-json\n');
    await new Promise((r) => setTimeout(r, 200));

    expect(
      received.find((s) => s.evidence === 'not-valid-json')
    ).toBeUndefined();
  });
});
