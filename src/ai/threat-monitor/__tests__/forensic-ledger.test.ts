/** @jest-environment node */
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { threatSignalBus, type ThreatSignal } from '../signal-bus';
import { ForensicLedger } from '../response/forensic-ledger';

describe('ForensicLedger', () => {
  let tmpDir: string;
  let ledgerPath: string;
  let ledger: ForensicLedger;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'forensic-ledger-'));
    ledgerPath = join(tmpDir, 'threat-monitor.jsonl');
    ledger = new ForensicLedger(ledgerPath);
  });

  afterEach(() => {
    ledger.stop();
    threatSignalBus.removeAllListeners();
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes every signal to the ledger file', () => {
    ledger.start();

    const signals: ThreatSignal[] = [
      {
        source: 'admin-audit',
        severity: 'info',
        timestamp: new Date().toISOString(),
        summary: 's1',
        evidence: { a: 1 },
      },
      {
        source: 'quarantine-ledger',
        severity: 'warn',
        timestamp: new Date().toISOString(),
        summary: 's2',
        evidence: { b: 2 },
      },
      {
        source: 'correlation:burst',
        severity: 'critical',
        timestamp: new Date().toISOString(),
        summary: 's3',
        evidence: { c: 3 },
      },
    ];

    for (const s of signals) threatSignalBus.emitSignal(s);

    const lines = readFileSync(ledgerPath, 'utf8').trim().split('\n');
    expect(lines.length).toBe(3);

    const parsed = lines.map((l) => JSON.parse(l) as ThreatSignal);
    expect(parsed[0].source).toBe('admin-audit');
    expect(parsed[1].source).toBe('quarantine-ledger');
    expect(parsed[2].source).toBe('correlation:burst');
    expect(parsed[2].severity).toBe('critical');
  });

  it('appends — does not overwrite existing ledger contents', () => {
    ledger.start();
    threatSignalBus.emitSignal({
      source: 'admin-audit',
      severity: 'info',
      timestamp: new Date().toISOString(),
      summary: 'first',
      evidence: {},
    });
    ledger.stop();

    const ledger2 = new ForensicLedger(ledgerPath);
    ledger2.start();
    threatSignalBus.emitSignal({
      source: 'admin-audit',
      severity: 'info',
      timestamp: new Date().toISOString(),
      summary: 'second',
      evidence: {},
    });
    ledger2.stop();

    const lines = readFileSync(ledgerPath, 'utf8').trim().split('\n');
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).summary).toBe('first');
    expect(JSON.parse(lines[1]).summary).toBe('second');
  });

  it('survives a write to an invalid path without crashing the bus', () => {
    const bad = new ForensicLedger(
      '/nonexistent-dir-xyz/should-not-exist.jsonl'
    );
    bad.start();

    let downstreamReceived = false;
    threatSignalBus.onSignal(() => {
      downstreamReceived = true;
    });

    expect(() => {
      threatSignalBus.emitSignal({
        source: 'admin-audit',
        severity: 'info',
        timestamp: new Date().toISOString(),
        summary: 'will-fail-to-write',
        evidence: {},
      });
    }).not.toThrow();

    expect(downstreamReceived).toBe(true);
    bad.stop();
  });

  it('stop() unsubscribes — no further writes after stop', () => {
    ledger.start();
    threatSignalBus.emitSignal({
      source: 'admin-audit',
      severity: 'info',
      timestamp: new Date().toISOString(),
      summary: 'before-stop',
      evidence: {},
    });
    ledger.stop();
    threatSignalBus.emitSignal({
      source: 'admin-audit',
      severity: 'info',
      timestamp: new Date().toISOString(),
      summary: 'after-stop',
      evidence: {},
    });

    const lines = readFileSync(ledgerPath, 'utf8').trim().split('\n');
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]).summary).toBe('before-stop');
  });
});
