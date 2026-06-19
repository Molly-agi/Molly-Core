/**
 * @jest-environment node
 */

import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LedgerTail, replayLedger } from '../ledger-tail';
import type { ThreatSignal } from '../../threat-monitor/signal-bus';

function makeSignal(i: number): ThreatSignal {
  return {
    source: 's',
    severity: 'info',
    timestamp: new Date(1_700_000_000_000 + i).toISOString(),
    summary: `sig-${i}`,
    evidence: { source_ip: '1.2.3.4' },
  };
}

describe('LedgerTail', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tail-'));
    path = join(dir, 'threat-monitor.jsonl');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('start is safe when file does not exist', () => {
    const tail = new LedgerTail({ path, onSignal: jest.fn() });
    expect(() => tail.start()).not.toThrow();
    tail.stop();
  });

  it('drainOnce emits only new appended lines (skips pre-existing tail)', () => {
    writeFileSync(path, JSON.stringify(makeSignal(0)) + '\n');
    const received: ThreatSignal[] = [];
    const tail = new LedgerTail({
      path,
      onSignal: (s) => received.push(s),
    });
    tail.start();
    appendFileSync(path, JSON.stringify(makeSignal(1)) + '\n');
    tail.drainOnce();
    expect(received).toHaveLength(1);
    expect(received[0].summary).toBe('sig-1');
    tail.stop();
  });

  it('handles file truncation (smaller file) by resetting and re-reading', () => {
    writeFileSync(
      path,
      JSON.stringify(makeSignal(0)) +
        '\n' +
        JSON.stringify(makeSignal(1)) +
        '\n' +
        JSON.stringify(makeSignal(2)) +
        '\n'
    );
    const received: ThreatSignal[] = [];
    const tail = new LedgerTail({
      path,
      onSignal: (s) => received.push(s),
    });
    tail.start();
    writeFileSync(path, JSON.stringify(makeSignal(99)) + '\n');
    tail.drainOnce();
    expect(received).toHaveLength(1);
    expect(received[0].summary).toBe('sig-99');
    tail.stop();
  });

  it('skips malformed lines without throwing', () => {
    writeFileSync(path, '');
    const received: ThreatSignal[] = [];
    const tail = new LedgerTail({
      path,
      onSignal: (s) => received.push(s),
    });
    tail.start();
    appendFileSync(
      path,
      'not-json\n' +
        JSON.stringify(makeSignal(1)) +
        '\n' +
        'also-bad\n' +
        JSON.stringify(makeSignal(2)) +
        '\n'
    );
    tail.drainOnce();
    expect(received).toHaveLength(2);
    expect(received[0].summary).toBe('sig-1');
    expect(received[1].summary).toBe('sig-2');
    tail.stop();
  });

  it('stop clears watcher and leftover', () => {
    writeFileSync(path, '');
    const tail = new LedgerTail({ path, onSignal: jest.fn() });
    tail.start();
    tail.stop();
    expect(() => tail.stop()).not.toThrow();
  });
});

describe('replayLedger', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'replay-'));
    path = join(dir, 'threat-monitor.jsonl');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns 0,0 when file does not exist', () => {
    expect(replayLedger(path, jest.fn())).toEqual({ processed: 0, skipped: 0 });
  });

  it('processes every valid line and counts skips for malformed', () => {
    writeFileSync(
      path,
      JSON.stringify(makeSignal(1)) +
        '\n' +
        'bad-line\n' +
        JSON.stringify(makeSignal(2)) +
        '\n'
    );
    const received: ThreatSignal[] = [];
    const r = replayLedger(path, (s) => received.push(s));
    expect(r.processed).toBe(2);
    expect(r.skipped).toBe(1);
    expect(received.map((s) => s.summary)).toEqual(['sig-1', 'sig-2']);
  });

  it('handles empty file as 0,0', () => {
    writeFileSync(path, '');
    expect(replayLedger(path, jest.fn())).toEqual({ processed: 0, skipped: 0 });
  });
});
