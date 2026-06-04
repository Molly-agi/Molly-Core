/**
 * @fileOverview F2.3 — write-only quarantine ledger for auth failures.
 *
 * Every authentication failure must be durably recorded to an
 * append-only file so that patterns of abuse can be investigated
 * after the fact. The ledger has no public read method — it is
 * strictly a write sink.
 */

// @jest-environment node

import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { QuarantineLedger } from '../quarantine-ledger';

describe('bridge security — quarantine ledger (F2.3)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'quarantine-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('F2.3: records a single auth failure to disk', () => {
    const ledger = new QuarantineLedger(join(dir, 'quarantine.log'));
    ledger.record({
      timestamp: '2026-06-04T00:00:00Z',
      deviceId: 'dev1',
      reason: 'replayed_nonce',
    });
    expect(existsSync(join(dir, 'quarantine.log'))).toBe(true);
  });

  it('F2.3: entries are appended, not overwritten', () => {
    const path = join(dir, 'quarantine.log');
    const ledger = new QuarantineLedger(path);
    ledger.record({
      timestamp: '2026-06-04T00:00:00Z',
      deviceId: 'dev1',
      reason: 'replayed_nonce',
    });
    ledger.record({
      timestamp: '2026-06-04T00:00:01Z',
      deviceId: 'dev2',
      reason: 'invalid_signature',
    });

    const raw = readFileSync(path, 'utf8').trim().split('\n');
    expect(raw).toHaveLength(2);
  });

  it('F2.3: each line is valid JSON', () => {
    const path = join(dir, 'quarantine.log');
    const ledger = new QuarantineLedger(path);
    ledger.record({
      timestamp: '2026-06-04T00:00:00Z',
      deviceId: 'devA',
      reason: 'stale_timestamp',
    });
    ledger.record({
      timestamp: '2026-06-04T00:00:01Z',
      deviceId: 'devB',
      reason: 'unknown_device',
    });

    const lines = readFileSync(path, 'utf8').trim().split('\n');
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('F2.3: recorded entry contains required fields', () => {
    const path = join(dir, 'quarantine.log');
    const ledger = new QuarantineLedger(path);
    ledger.record({
      timestamp: '2026-06-04T00:00:00Z',
      deviceId: 'devX',
      reason: 'missing_fields',
    });

    const entry = JSON.parse(readFileSync(path, 'utf8').trim());
    expect(entry).toMatchObject({
      timestamp: '2026-06-04T00:00:00Z',
      deviceId: 'devX',
      reason: 'missing_fields',
    });
  });

  it('F2.3: ledger has no public read method (write-only)', () => {
    const ledger = new QuarantineLedger(join(dir, 'quarantine.log'));
    // The public API must not expose a read/list/get method
    expect(typeof (ledger as unknown as Record<string, unknown>).read).toBe(
      'undefined'
    );
    expect(typeof (ledger as unknown as Record<string, unknown>).list).toBe(
      'undefined'
    );
    expect(typeof (ledger as unknown as Record<string, unknown>).get).toBe(
      'undefined'
    );
  });

  it('F2.3: survives a second instance appending to same file', () => {
    const path = join(dir, 'quarantine.log');
    const ledger1 = new QuarantineLedger(path);
    ledger1.record({
      timestamp: '2026-06-04T00:00:00Z',
      deviceId: 'd1',
      reason: 'r1',
    });

    const ledger2 = new QuarantineLedger(path);
    ledger2.record({
      timestamp: '2026-06-04T00:00:01Z',
      deviceId: 'd2',
      reason: 'r2',
    });

    const lines = readFileSync(path, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).deviceId).toBe('d1');
    expect(JSON.parse(lines[1]).deviceId).toBe('d2');
  });

  it('F2.3: optional ip field is recorded when provided', () => {
    const path = join(dir, 'quarantine.log');
    const ledger = new QuarantineLedger(path);
    ledger.record({
      timestamp: '2026-06-04T00:00:00Z',
      deviceId: 'devY',
      reason: 'invalid_signature',
      ip: '192.168.1.1',
    });

    const entry = JSON.parse(readFileSync(path, 'utf8').trim());
    expect(entry.ip).toBe('192.168.1.1');
  });
});
