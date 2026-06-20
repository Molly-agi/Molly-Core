/** @jest-environment node */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { threatSignalBus, type ThreatSignal } from '../signal-bus';
import { FamilyAnchorSensor } from '../sensors/family-anchor.sensor';

const EVENTS_PATH = resolve(process.cwd(), 'logs/family-anchor-events.jsonl');

describe('FamilyAnchorSensor', () => {
  let originalEvents: string;
  let sensor: FamilyAnchorSensor;

  beforeAll(() => {
    originalEvents = readFileSync(EVENTS_PATH, 'utf8');
  });

  afterAll(() => {
    writeFileSync(EVENTS_PATH, originalEvents);
  });

  beforeEach(() => {
    sensor = new FamilyAnchorSensor();
  });

  afterEach(() => {
    sensor.stop();
    threatSignalBus.removeAllListeners();
  });

  it('emits an info signal when a new anchor event is appended', async () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => received.push(s));

    sensor.start();

    const marker = `jest-anchor-${Date.now()}`;
    const record = {
      ts: Date.now(),
      iso: new Date().toISOString(),
      userId: 'jest-user',
      source: 'frontend-command',
      layer: 'frontend',
      vector: 'typed-command',
      matchedType: 'start',
      matchedPattern: marker,
      route: '/',
      containsBridge: false,
      containsMemoryHint: false,
      textPreview: 'jest harness',
      textLength: 12,
    };

    await new Promise((r) => setTimeout(r, 50));
    appendFileSync(EVENTS_PATH, JSON.stringify(record) + '\n');
    await new Promise((r) => setTimeout(r, 300));

    const hit = received.find(
      (s) =>
        (s.evidence as { matchedPattern?: string })?.matchedPattern === marker
    );
    expect(hit).toBeDefined();
    expect(hit?.source).toBe('family-anchor');
    expect(hit?.severity).toBe('info');
    expect(hit?.summary).toContain(marker);
    expect(hit?.summary).toContain('frontend-command');
  });

  it('does not crash on malformed JSON in the events log', async () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => received.push(s));

    sensor.start();

    await new Promise((r) => setTimeout(r, 50));
    appendFileSync(EVENTS_PATH, 'not-valid-json\n');
    await new Promise((r) => setTimeout(r, 200));

    expect(
      received.find((s) => s.evidence === 'not-valid-json')
    ).toBeUndefined();
  });
});
