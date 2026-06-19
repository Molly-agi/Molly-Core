/**
 * @jest-environment node
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rebuildProfiles } from '../rebuild';
import type { ThreatSignal } from '../../threat-monitor/signal-bus';

function sigLine(i: number, ip = '1.2.3.4'): string {
  const s: ThreatSignal = {
    source: 'admin-audit',
    severity: 'info',
    timestamp: new Date(1_700_000_000_000 + i).toISOString(),
    summary: `m-${i}`,
    evidence: { source_ip: ip },
  };
  return JSON.stringify(s) + '\n';
}

describe('rebuildProfiles', () => {
  let dir: string;
  let storeDir: string;
  let ledger: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hunt-rebuild-'));
    storeDir = join(dir, 'store');
    ledger = join(dir, 'ledger.jsonl');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns zero counts when ledger does not exist', () => {
    const r = rebuildProfiles({ ledgerPath: ledger, storeDir });
    expect(r).toEqual({
      processed: 0,
      skipped: 0,
      created: 0,
      updated: 0,
      noIdentity: 0,
      profiles: 0,
    });
  });

  it('processes valid lines, splits create vs update, writes snapshot', () => {
    writeFileSync(
      ledger,
      sigLine(1, '1.1.1.1') +
        sigLine(2, '1.1.1.1') +
        sigLine(3, '2.2.2.2') +
        sigLine(4, '1.1.1.1')
    );
    const r = rebuildProfiles({ ledgerPath: ledger, storeDir });
    expect(r.processed).toBe(4);
    expect(r.skipped).toBe(0);
    expect(r.created).toBe(2);
    expect(r.updated).toBe(2);
    expect(r.profiles).toBe(2);
  });

  it('counts noIdentity for signals with no identifier fields', () => {
    const noId: ThreatSignal = {
      source: 's',
      severity: 'info',
      timestamp: '2026-06-19T00:00:00.000Z',
      summary: 'm',
      evidence: {},
    };
    writeFileSync(ledger, JSON.stringify(noId) + '\n' + sigLine(1));
    const r = rebuildProfiles({ ledgerPath: ledger, storeDir });
    expect(r.noIdentity).toBe(1);
    expect(r.processed).toBe(2);
    expect(r.profiles).toBe(1);
  });

  it('counts skipped for malformed lines', () => {
    writeFileSync(ledger, 'not-json\n' + sigLine(1) + 'also-bad\n');
    const r = rebuildProfiles({ ledgerPath: ledger, storeDir });
    expect(r.skipped).toBe(2);
    expect(r.processed).toBe(1);
    expect(r.created).toBe(1);
  });
});
