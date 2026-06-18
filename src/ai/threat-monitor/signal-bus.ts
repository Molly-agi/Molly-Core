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
  emitSignal(signal: ThreatSignal): void {
    this.emit('signal', signal);
    this.emit(`signal:${signal.source}`, signal);
  }

  onSignal(listener: (signal: ThreatSignal) => void): () => void {
    this.on('signal', listener);
    return () => this.off('signal', listener);
  }
}

export const threatSignalBus = new ThreatSignalBus();
