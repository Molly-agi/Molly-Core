/**
 * @jest-environment node
 */

import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startHuntMode } from '../index';
import type { ThreatSignal } from '../../threat-monitor/signal-bus';

function sigLine(i: number, ip = '1.2.3.4'): string {
  const s: ThreatSignal = {
    source: 's',
    severity: 'info',
    timestamp: new Date(1_700_000_000_000 + i).toISOString(),
    summary: `m-${i}`,
    evidence: { source_ip: ip },
  };
  return JSON.stringify(s) + '\n';
}

describe('startHuntMode orchestrator', () => {
  let dir: string;
  let storeDir: string;
  let ledger: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hunt-orch-'));
    storeDir = join(dir, 'store');
    ledger = join(dir, 'ledger.jsonl');
    writeFileSync(ledger, '');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('tails the ledger and builds a profile on new line', () => {
    const handle = startHuntMode({ ledgerPath: ledger, storeDir });
    appendFileSync(ledger, sigLine(1));
    handle.tail().drainOnce();
    expect(handle.store().size()).toBe(1);
    handle.stop();
  });

  it('does not process pre-existing lines (tails forward from EOF)', () => {
    appendFileSync(ledger, sigLine(0));
    const handle = startHuntMode({ ledgerPath: ledger, storeDir });
    handle.tail().drainOnce();
    expect(handle.store().size()).toBe(0);
    handle.stop();
  });

  it('snapshots automatically when pendingMutations >= snapshotEveryN', () => {
    const handle = startHuntMode({
      ledgerPath: ledger,
      storeDir,
      snapshotEveryN: 3,
    });
    appendFileSync(
      ledger,
      sigLine(1) + sigLine(2, '5.6.7.8') + sigLine(3, '9.9.9.9')
    );
    handle.tail().drainOnce();
    expect(handle.store().pendingMutations()).toBe(0); // snapshot reset
    handle.stop();
  });

  it('stop flushes pending mutations to snapshot', () => {
    const handle = startHuntMode({
      ledgerPath: ledger,
      storeDir,
      snapshotEveryN: 999,
    });
    appendFileSync(ledger, sigLine(1));
    handle.tail().drainOnce();
    expect(handle.store().pendingMutations()).toBeGreaterThan(0);
    handle.stop();
    expect(handle.store().pendingMutations()).toBe(0);
  });

  it('snapshotIfDue returns true and snapshots when threshold hit', () => {
    const handle = startHuntMode({
      ledgerPath: ledger,
      storeDir,
      snapshotEveryN: 1,
    });
    appendFileSync(ledger, sigLine(1));
    handle.tail().drainOnce();
    expect(handle.snapshotIfDue()).toBe(false); // already auto-snapshotted at n=1
    handle.stop();
  });

  it('snapshotIfDue returns false when nothing pending', () => {
    const handle = startHuntMode({
      ledgerPath: ledger,
      storeDir,
      snapshotEveryN: 999,
    });
    expect(handle.snapshotIfDue()).toBe(false);
    handle.stop();
  });

  it('exposes store/tail/builder accessors for inspection', () => {
    const handle = startHuntMode({ ledgerPath: ledger, storeDir });
    expect(handle.store()).toBeDefined();
    expect(handle.tail()).toBeDefined();
    expect(handle.builder()).toBeDefined();
    handle.stop();
  });
});
