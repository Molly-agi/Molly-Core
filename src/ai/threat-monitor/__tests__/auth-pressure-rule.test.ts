/** @jest-environment node */
import { threatSignalBus, type ThreatSignal } from '../signal-bus';
import { CorrelationEngine } from '../correlation/correlation-engine';
import { createAuthPressureRule } from '../correlation/rules/auth-pressure-rule';

function quarantine(): ThreatSignal {
  return {
    source: 'quarantine-ledger',
    severity: 'warn',
    timestamp: new Date().toISOString(),
    summary: 'quarantine event',
    evidence: { reason: 'invalid_sender_or_missing_content' },
  };
}

function adminFail(): ThreatSignal {
  return {
    source: 'admin-audit',
    severity: 'warn',
    timestamp: new Date().toISOString(),
    summary: 'admin failed',
    evidence: { success: false, command: 'health-check' },
  };
}

function adminOk(): ThreatSignal {
  return {
    source: 'admin-audit',
    severity: 'info',
    timestamp: new Date().toISOString(),
    summary: 'admin ok',
    evidence: { success: true, command: 'health-check' },
  };
}

function registryChange(): ThreatSignal {
  return {
    source: 'agent-registry',
    severity: 'warn',
    timestamp: new Date().toISOString(),
    summary: 'agent registry added',
    evidence: { kind: 'added', name: 'unknown' },
  };
}

describe('CorrelationEngine + auth-pressure rule', () => {
  let engine: CorrelationEngine;

  afterEach(() => {
    engine?.stop();
    threatSignalBus.removeAllListeners();
  });

  it('does not fire on quarantine alone', () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => {
      if (s.source.startsWith('correlation:')) received.push(s);
    });

    engine = new CorrelationEngine([createAuthPressureRule()], 60_000);
    engine.start();

    threatSignalBus.emitSignal(quarantine());
    threatSignalBus.emitSignal(quarantine());

    expect(received.length).toBe(0);
  });

  it('does not fire on admin-success + quarantine + registry (no failure)', () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => {
      if (s.source.startsWith('correlation:')) received.push(s);
    });

    engine = new CorrelationEngine([createAuthPressureRule()], 60_000);
    engine.start();

    threatSignalBus.emitSignal(quarantine());
    threatSignalBus.emitSignal(adminOk());
    threatSignalBus.emitSignal(registryChange());

    expect(received.length).toBe(0);
  });

  it('fires critical when all three required sources are present', () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => {
      if (s.source.startsWith('correlation:')) received.push(s);
    });

    engine = new CorrelationEngine([createAuthPressureRule()], 60_000);
    engine.start();

    threatSignalBus.emitSignal(quarantine());
    threatSignalBus.emitSignal(adminFail());
    threatSignalBus.emitSignal(registryChange());

    expect(received.length).toBe(1);
    expect(received[0].source).toBe('correlation:auth-pressure');
    expect(received[0].severity).toBe('critical');
    expect(received[0].summary).toContain('quarantine');
    expect(received[0].summary).toContain('admin-fail');
    expect(received[0].summary).toContain('registry-change');
  });
});
