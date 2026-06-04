/**
 * @fileOverview F2.3 — write-only quarantine ledger (W0.2)
 *
 * Every authentication failure is durably recorded as a newline-
 * delimited JSON entry in an append-only file. There is intentionally
 * no public read method — the ledger is a write sink only.
 */

import { appendFileSync } from 'fs';

export interface QuarantineEntry {
  timestamp: string;
  deviceId: string;
  reason: string;
  ip?: string;
}

export class QuarantineLedger {
  private readonly path: string;

  constructor(ledgerPath: string) {
    this.path = ledgerPath;
  }

  /** Append a quarantine entry. Never throws — auth failures must not crash the server. */
  record(entry: QuarantineEntry): void {
    try {
      appendFileSync(this.path, JSON.stringify(entry) + '\n', 'utf8');
    } catch {
      // Non-fatal — we tried; losing a log line is better than crashing
    }
  }
}
