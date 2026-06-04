/**
 * @fileOverview F2.3 — QuarantineLedger tests
 *
 * Verifies per-device failure tracking, quarantine triggering,
 * persistence (survives restart), and write-only (append) semantics.
 */

import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  QuarantineLedger,
  DEFAULT_QUARANTINE_CONFIG,
} from '../quarantine-ledger';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'quarantine-test-'));
}

describe('QuarantineLedger (F2.3)', () => {
  let dir: string;

  beforeEach(() => {
    dir = tempDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function paths(d: string) {
    return {
      failures: join(d, 'failures.ndjson'),
      quarantine: join(d, 'quarantine.ndjson'),
    };
  }

  it('F2.3: new device is not quarantined', () => {
    const { failures, quarantine } = paths(dir);
    const ledger = new QuarantineLedger(failures, quarantine);
    expect(ledger.isQuarantined('device-a')).toBe(false);
  });

  it('F2.3: single failure does not quarantine below threshold', () => {
    const { failures, quarantine } = paths(dir);
    const ledger = new QuarantineLedger(failures, quarantine, {
      failureThreshold: 5,
      windowMs: 60_000,
    });
    const result = ledger.recordFailure('device-b', 'invalid_signature');
    expect(result.quarantined).toBe(false);
    expect(ledger.isQuarantined('device-b')).toBe(false);
  });

  it('F2.3: device is quarantined after reaching failureThreshold', () => {
    const { failures, quarantine } = paths(dir);
    const ledger = new QuarantineLedger(failures, quarantine, {
      failureThreshold: 3,
      windowMs: 60_000,
    });
    ledger.recordFailure('device-c', 'invalid_signature');
    ledger.recordFailure('device-c', 'invalid_signature');
    const result = ledger.recordFailure('device-c', 'invalid_signature');
    expect(result.quarantined).toBe(true);
    expect(ledger.isQuarantined('device-c')).toBe(true);
  });

  it('F2.3: quarantine state survives restart', () => {
    const { failures, quarantine } = paths(dir);
    const ledger1 = new QuarantineLedger(failures, quarantine, {
      failureThreshold: 2,
      windowMs: 60_000,
    });
    ledger1.recordFailure('device-d', 'bad_sig');
    ledger1.recordFailure('device-d', 'bad_sig'); // triggers quarantine

    // Simulate restart.
    const ledger2 = new QuarantineLedger(failures, quarantine, {
      failureThreshold: 2,
      windowMs: 60_000,
    });
    expect(ledger2.isQuarantined('device-d')).toBe(true);
  });

  it('F2.3: failures for different devices are tracked independently', () => {
    const { failures, quarantine } = paths(dir);
    const ledger = new QuarantineLedger(failures, quarantine, {
      failureThreshold: 2,
      windowMs: 60_000,
    });
    ledger.recordFailure('dev-x', 'err');
    ledger.recordFailure('dev-x', 'err'); // dev-x quarantined
    expect(ledger.isQuarantined('dev-y')).toBe(false);
  });

  it('F2.3: failure file is append-only (never overwrites past lines)', () => {
    const { failures, quarantine } = paths(dir);
    const ledger = new QuarantineLedger(failures, quarantine, {
      failureThreshold: 5,
      windowMs: 60_000,
    });
    ledger.recordFailure('dev-e', 'err1');
    const after1 = readFileSync(failures, 'utf8');
    ledger.recordFailure('dev-e', 'err2');
    const after2 = readFileSync(failures, 'utf8');
    // after1 must be a prefix of after2
    expect(after2.startsWith(after1)).toBe(true);
  });

  it('F2.3: quarantinedDevices returns all quarantined device IDs', () => {
    const { failures, quarantine } = paths(dir);
    const ledger = new QuarantineLedger(failures, quarantine, {
      failureThreshold: 1,
      windowMs: 60_000,
    });
    ledger.recordFailure('dev-f', 'err');
    ledger.recordFailure('dev-g', 'err');
    const list = ledger.quarantinedDevices();
    expect(list).toContain('dev-f');
    expect(list).toContain('dev-g');
  });

  it('F2.3: failures outside the window do not count toward threshold', () => {
    const { failures, quarantine } = paths(dir);
    const windowMs = 5_000;
    const ledger = new QuarantineLedger(failures, quarantine, {
      failureThreshold: 2,
      windowMs,
    });
    const now = Date.now();
    // Place the two old failures more than windowMs apart from each other
    // so neither counts toward the other's sliding window, and both are
    // outside `now`'s window.
    const oldTime1 = now - windowMs * 3 - 1;
    const oldTime2 = now - windowMs * 2;
    ledger.recordFailure('dev-h', 'err', oldTime1);
    ledger.recordFailure('dev-h', 'err', oldTime2);
    // One fresh failure — only 1 within now's window, below threshold of 2.
    const result = ledger.recordFailure('dev-h', 'err', now);
    expect(result.quarantined).toBe(false);
  });

  it('F2.3: default config has reasonable threshold and window', () => {
    expect(DEFAULT_QUARANTINE_CONFIG.failureThreshold).toBeGreaterThanOrEqual(
      1
    );
    expect(DEFAULT_QUARANTINE_CONFIG.windowMs).toBeGreaterThan(0);
  });
});
