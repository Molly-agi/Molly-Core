import { EventEmitter } from 'node:events';

export type ThreatSeverity = 'info' | 'warn' | 'critical';

export interface ThreatSignal {
  source: string;
  severity: ThreatSeverity;
  timestamp: string;
  summary: string;
  evidence: unknown;
}

class ThreatSignalBus extends EventEmitter {
  private paused = false;
  private suppressedCount = 0;

  emitSignal(signal: ThreatSignal): void {
    if (this.paused) {
      this.suppressedCount++;
      return;
    }
    this.emit('signal', signal);
    this.emit(`signal:${signal.source}`, signal);
  }

  onSignal(listener: (signal: ThreatSignal) => void): () => void {
    this.on('signal', listener);
    return () => this.off('signal', listener);
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  isPaused(): boolean {
    return this.paused;
  }

  getSuppressedCount(): number {
    return this.suppressedCount;
  }

  resetSuppressedCount(): void {
    this.suppressedCount = 0;
  }
}

export const threatSignalBus = new ThreatSignalBus();
