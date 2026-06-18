/** @jest-environment node */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { threatSignalBus, type ThreatSignal } from '../signal-bus';
import { MemoryAuditSensor } from '../sensors/memory-audit.sensor';

const STREAM_PATHS = {
  consol: resolve(process.cwd(), 'logs/memory-audit-user-consol.jsonl'),
  evict: resolve(process.cwd(), 'logs/memory-audit-user-evict.jsonl'),
  lifecycle: resolve(process.cwd(), 'logs/memory-audit-user-lifecycle.jsonl'),
} as const;

describe('MemoryAuditSensor', () => {
  const originals: Record<string, string> = {};

  beforeAll(() => {
    for (const [k, p] of Object.entries(STREAM_PATHS)) {
      originals[k] = readFileSync(p, 'utf8');
    }
  });

  afterAll(() => {
    for (const [k, p] of Object.entries(STREAM_PATHS)) {
      writeFileSync(p, originals[k]);
    }
  });

  afterEach(() => {
    threatSignalBus.removeAllListeners();
  });

  it.each(['consol', 'evict', 'lifecycle'] as const)(
    'emits info signal with source memory-audit-%s when record is appended',
    async (streamName) => {
      const sensor = new MemoryAuditSensor(streamName);
      const received: ThreatSignal[] = [];
      threatSignalBus.onSignal((s) => received.push(s));

      sensor.start();

      const marker = `jest-engram-${streamName}-${Date.now()}`;
      const record = {
        timestamp: new Date().toISOString(),
        userId: `user-${streamName}`,
        engramId: marker,
        actionTaken: 'CONSOLIDATED',
        reasonCode: 'CAPACITY_CONSTRAINT',
        impactMetrics: { bytesSaved: 1234 },
      };

      await new Promise((r) => setTimeout(r, 50));
      appendFileSync(STREAM_PATHS[streamName], JSON.stringify(record) + '\n');
      await new Promise((r) => setTimeout(r, 300));

      const hit = received.find(
        (s) => (s.evidence as { engramId?: string })?.engramId === marker
      );
      expect(hit).toBeDefined();
      expect(hit?.source).toBe(`memory-audit-${streamName}`);
      expect(hit?.severity).toBe('info');
      expect(hit?.summary).toContain(marker);
      expect(hit?.summary).toContain('CONSOLIDATED');

      sensor.stop();
    }
  );

  it('does not crash on malformed JSON', async () => {
    const sensor = new MemoryAuditSensor('consol');
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => received.push(s));

    sensor.start();

    await new Promise((r) => setTimeout(r, 50));
    appendFileSync(STREAM_PATHS.consol, 'not-valid-json\n');
    await new Promise((r) => setTimeout(r, 200));

    expect(
      received.find((s) => s.evidence === 'not-valid-json')
    ).toBeUndefined();
    sensor.stop();
  });
});
