import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { threatSignalBus, type ThreatSignal } from '../signal-bus';

const DEFAULT_LEDGER_PATH = resolve(process.cwd(), 'logs/threat-monitor.jsonl');

export class ForensicLedger {
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly path: string = DEFAULT_LEDGER_PATH) {}

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = threatSignalBus.onSignal((signal) => this.write(signal));
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private write(signal: ThreatSignal): void {
    try {
      appendFileSync(this.path, JSON.stringify(signal) + '\n');
    } catch {
      // Swallow — a write failure must not crash the signal bus.
      // Future: route to a fallback sink.
    }
  }
}

export const forensicLedger = new ForensicLedger();
