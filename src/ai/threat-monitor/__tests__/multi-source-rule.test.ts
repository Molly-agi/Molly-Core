/** @jest-environment node */
import {
  threatSignalBus,
  type ThreatSignal,
  type ThreatSeverity,
} from '../signal-bus';
import { CorrelationEngine } from '../correlation/correlation-engine';
import { createMultiSourceRule } from '../correlation/rules/multi-source-rule';

function rawSignal(
  source: string,
  severity: ThreatSeverity = 'info'
): ThreatSignal {
  return {
    source,
    severity,
    timestamp: new Date().toISOString(),
    summary: `${source} event`,
    evidence: {},
  };
}

describe('CorrelationEngine + multi-source rule', () => {
  let engine: CorrelationEngine;

  afterEach(() => {
    engine?.stop();
    threatSignalBus.removeAllListeners();
  });

  it('does not emit when fewer than N distinct sources are active', () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => {
      if (s.source.startsWith('correlation:')) received.push(s);
    });

    engine = new CorrelationEngine([createMultiSourceRule(4)], 60_000);
    engine.start();

    threatSignalBus.emitSignal(rawSignal('admin-audit'));
    threatSignalBus.emitSignal(rawSignal('quarantine-ledger'));
    threatSignalBus.emitSignal(rawSignal('family-anchor'));

    expect(received.length).toBe(0);
  });

  it('emits warn signal when N distinct sources are info-only', () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => {
      if (s.source.startsWith('correlation:')) received.push(s);
    });

    engine = new CorrelationEngine([createMultiSourceRule(4)], 60_000);
    engine.start();

    threatSignalBus.emitSignal(rawSignal('admin-audit', 'info'));
    threatSignalBus.emitSignal(rawSignal('family-anchor', 'info'));
    threatSignalBus.emitSignal(rawSignal('memory-audit-consol', 'info'));
    threatSignalBus.emitSignal(rawSignal('bridge-events', 'info'));

    expect(received.length).toBe(1);
    expect(received[0].source).toBe('correlation:multi-source');
    expect(received[0].severity).toBe('warn');
    expect(received[0].summary).toContain('4 distinct sources');
  });

  it('escalates to critical when any contributing signal is warn or critical', () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => {
      if (s.source.startsWith('correlation:')) received.push(s);
    });

    engine = new CorrelationEngine([createMultiSourceRule(4)], 60_000);
    engine.start();

    threatSignalBus.emitSignal(rawSignal('admin-audit', 'info'));
    threatSignalBus.emitSignal(rawSignal('family-anchor', 'info'));
    threatSignalBus.emitSignal(rawSignal('memory-audit-consol', 'info'));
    threatSignalBus.emitSignal(rawSignal('quarantine-ledger', 'warn'));

    expect(received.length).toBe(1);
    expect(received[0].severity).toBe('critical');
  });
});
