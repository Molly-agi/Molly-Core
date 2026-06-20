/** @jest-environment node */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { threatSignalBus, type ThreatSignal } from '../signal-bus';
import { AgentRegistrySensor } from '../sensors/agent-registry.sensor';

const REGISTRY_PATH = resolve(
  process.cwd(),
  'data/.bridge-registered-agents.json'
);

describe('AgentRegistrySensor', () => {
  let originalRegistry: string;
  let sensor: AgentRegistrySensor;

  beforeAll(() => {
    originalRegistry = readFileSync(REGISTRY_PATH, 'utf8');
  });

  afterAll(() => {
    writeFileSync(REGISTRY_PATH, originalRegistry);
  });

  beforeEach(() => {
    writeFileSync(REGISTRY_PATH, originalRegistry);
    sensor = new AgentRegistrySensor();
  });

  afterEach(() => {
    sensor.stop();
    threatSignalBus.removeAllListeners();
  });

  it('emits warn signal when a new agent appears', async () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => received.push(s));

    sensor.start();

    const base = JSON.parse(originalRegistry);
    const next = {
      ...base,
      'jest-new-agent': { id: 9999, registeredAt: new Date().toISOString() },
    };
    await new Promise((r) => setTimeout(r, 50));
    writeFileSync(REGISTRY_PATH, JSON.stringify(next, null, 2));
    await new Promise((r) => setTimeout(r, 300));

    const hit = received.find(
      (s) => (s.evidence as { name?: string })?.name === 'jest-new-agent'
    );
    expect(hit).toBeDefined();
    expect(hit?.source).toBe('agent-registry');
    expect(hit?.severity).toBe('warn');
    expect(hit?.summary).toContain('added');
    expect(hit?.summary).toContain('jest-new-agent');
  });

  it('emits warn signal when an agent is removed', async () => {
    const base = JSON.parse(originalRegistry);
    const seed = {
      ...base,
      'jest-temp-agent': { id: 8888, registeredAt: new Date().toISOString() },
    };
    writeFileSync(REGISTRY_PATH, JSON.stringify(seed, null, 2));

    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => received.push(s));

    sensor.start();

    await new Promise((r) => setTimeout(r, 50));
    writeFileSync(REGISTRY_PATH, JSON.stringify(base, null, 2));
    await new Promise((r) => setTimeout(r, 300));

    const hit = received.find(
      (s) => (s.evidence as { name?: string })?.name === 'jest-temp-agent'
    );
    expect(hit).toBeDefined();
    expect(hit?.summary).toContain('removed');
  });

  it('does not crash on malformed registry JSON', async () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => received.push(s));

    sensor.start();

    await new Promise((r) => setTimeout(r, 50));
    writeFileSync(REGISTRY_PATH, 'not-valid-json');
    await new Promise((r) => setTimeout(r, 200));

    expect(
      received.every(
        (s) => (s.evidence as { name?: string })?.name !== undefined
      )
    ).toBe(true);
  });
});
