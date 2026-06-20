/** @jest-environment node */
import { threatSignalBus, type ThreatSignal } from '../signal-bus';
import { CorrelationEngine } from '../correlation/correlation-engine';
import { createBurstRule } from '../correlation/rules/burst-rule';

function rawSignal(source: string, i: number): ThreatSignal {
  return {
    source,
    severity: 'info',
    timestamp: new Date().toISOString(),
    summary: `${source} event ${i}`,
    evidence: { i },
  };
}

describe('CorrelationEngine + burst rule', () => {
  let engine: CorrelationEngine;

  afterEach(() => {
    engine?.stop();
    threatSignalBus.removeAllListeners();
  });

  it('does not emit a correlation signal below the burst threshold', () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => {
      if (s.source.startsWith('correlation:')) received.push(s);
    });

    engine = new CorrelationEngine([createBurstRule(8)], 60_000);
    engine.start();

    for (let i = 0; i < 5; i++)
      threatSignalBus.emitSignal(rawSignal('admin-audit', i));
    expect(received.length).toBe(0);
  });

  it('emits a correlation:burst signal when threshold is exceeded', () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => {
      if (s.source.startsWith('correlation:')) received.push(s);
    });

    engine = new CorrelationEngine([createBurstRule(5)], 60_000);
    engine.start();

    for (let i = 0; i < 6; i++)
      threatSignalBus.emitSignal(rawSignal('quarantine-ledger', i));

    expect(received.length).toBe(1);
    expect(received[0].source).toBe('correlation:burst');
    expect(received[0].summary).toContain('quarantine-ledger');
    expect(received[0].severity).toBe('warn');
  });

  it('does not feed its own correlation signals back into the window', () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => {
      if (s.source.startsWith('correlation:')) received.push(s);
    });

    engine = new CorrelationEngine([createBurstRule(3)], 60_000);
    engine.start();

    for (let i = 0; i < 10; i++)
      threatSignalBus.emitSignal(rawSignal('family-anchor', i));

    expect(received.length).toBe(1);
  });

  it('respects rule cooldown between fires', () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => {
      if (s.source.startsWith('correlation:')) received.push(s);
    });

    engine = new CorrelationEngine([createBurstRule(3)], 60_000);
    engine.start();

    for (let i = 0; i < 4; i++)
      threatSignalBus.emitSignal(rawSignal('admin-audit', i));
    for (let i = 0; i < 4; i++)
      threatSignalBus.emitSignal(rawSignal('admin-audit', i + 100));

    expect(received.length).toBe(1);
  });
});
