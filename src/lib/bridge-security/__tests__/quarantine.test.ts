/**
 * @fileOverview F2.3 — Write-only quarantine ledger tests.
 */

import { createQuarantineLedger } from '../quarantine';

const THRESHOLD = 5;
const WINDOW_MS = 60_000; // 1 minute
const DURATION_MS = 900_000; // 15 minutes

describe('bridge-security quarantine (F2.3)', () => {
  it('F2.3: device starts with no quarantine', () => {
    const ledger = createQuarantineLedger(THRESHOLD, WINDOW_MS, DURATION_MS);
    expect(ledger.isQuarantined('device-A')).toBe(false);
  });

  it('F2.3: device is quarantined after threshold failures', () => {
    const ledger = createQuarantineLedger(THRESHOLD, WINDOW_MS, DURATION_MS);
    for (let i = 0; i < THRESHOLD; i++) {
      ledger.recordFailure('device-A', 'bad_sig');
    }
    expect(ledger.isQuarantined('device-A')).toBe(true);
  });

  it('F2.3: quarantine expires after duration', () => {
    const ledger = createQuarantineLedger(THRESHOLD, WINDOW_MS, DURATION_MS);
    const now = Date.now();
    for (let i = 0; i < THRESHOLD; i++) {
      ledger.recordFailure('device-A', 'bad_sig', now);
    }
    const future = now + DURATION_MS + 1;
    expect(ledger.isQuarantined('device-A', future)).toBe(false);
  });

  it('F2.3: failures old enough that any quarantine they triggered has since expired', () => {
    const ledger = createQuarantineLedger(THRESHOLD, WINDOW_MS, DURATION_MS);
    // Record failures so long ago that oldTs + DURATION_MS is in the past.
    // Even if threshold was hit at oldTs, the quarantine has expired by now.
    const oldTs = Date.now() - DURATION_MS - WINDOW_MS - 1;
    for (let i = 0; i < THRESHOLD; i++) {
      ledger.recordFailure('device-A', 'bad_sig', oldTs);
    }
    expect(ledger.isQuarantined('device-A')).toBe(false);
  });

  it('F2.3: quarantine is per-device (device B not affected by A failures)', () => {
    const ledger = createQuarantineLedger(THRESHOLD, WINDOW_MS, DURATION_MS);
    for (let i = 0; i < THRESHOLD; i++) {
      ledger.recordFailure('device-A', 'bad_sig');
    }
    expect(ledger.isQuarantined('device-B')).toBe(false);
  });

  it('F2.3: failureCount returns only recent failures', () => {
    const ledger = createQuarantineLedger(THRESHOLD, WINDOW_MS, DURATION_MS);
    const oldTs = Date.now() - WINDOW_MS - 1;
    ledger.recordFailure('device-A', 'bad_sig', oldTs); // old
    ledger.recordFailure('device-A', 'bad_sig'); // recent
    ledger.recordFailure('device-A', 'bad_sig'); // recent
    expect(ledger.failureCount('device-A', WINDOW_MS)).toBe(2);
  });

  it('F2.3: toJSON / fromJSON round-trip preserves quarantine state', () => {
    const ledger = createQuarantineLedger(THRESHOLD, WINDOW_MS, DURATION_MS);
    for (let i = 0; i < THRESHOLD; i++) {
      ledger.recordFailure('device-Q', 'replay');
    }
    const data = ledger.toJSON();
    expect(data.failures.length).toBe(THRESHOLD);
    expect(Object.keys(data.quarantines)).toContain('device-Q');

    const ledger2 = createQuarantineLedger(THRESHOLD, WINDOW_MS, DURATION_MS);
    ledger2.fromJSON(data);
    expect(ledger2.isQuarantined('device-Q')).toBe(true);
  });

  it('F2.3: fromJSON with no quarantines field starts fresh', () => {
    const ledger = createQuarantineLedger(THRESHOLD, WINDOW_MS, DURATION_MS);
    ledger.fromJSON({});
    expect(ledger.isQuarantined('any-device')).toBe(false);
  });
});
