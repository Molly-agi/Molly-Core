import { threatSignalBus, type ThreatSignal } from '../signal-bus';

export interface CorrelationRule {
  name: string;
  cooldownMs: number;
  evaluate(window: ThreatSignal[]): Omit<ThreatSignal, 'source'> | null;
}

const DEFAULT_WINDOW_MS = 60_000;

export class CorrelationEngine {
  private readonly window: ThreatSignal[] = [];
  private readonly lastFiredAt = new Map<string, number>();
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly rules: CorrelationRule[],
    private readonly windowMs: number = DEFAULT_WINDOW_MS
  ) {}

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = threatSignalBus.onSignal((signal) =>
      this.ingest(signal)
    );
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.window.length = 0;
    this.lastFiredAt.clear();
  }

  ingest(signal: ThreatSignal): void {
    if (signal.source.startsWith('correlation:')) return;

    this.window.push(signal);
    this.evictExpired();

    const now = Date.now();
    for (const rule of this.rules) {
      const last = this.lastFiredAt.get(rule.name) ?? 0;
      if (now - last < rule.cooldownMs) continue;

      const partial = rule.evaluate([...this.window]);
      if (!partial) continue;

      this.lastFiredAt.set(rule.name, now);
      threatSignalBus.emitSignal({
        ...partial,
        source: `correlation:${rule.name}`,
      });
    }
  }

  private evictExpired(): void {
    const cutoff = Date.now() - this.windowMs;
    while (this.window.length > 0) {
      const head = this.window[0];
      const t = new Date(head.timestamp).getTime();
      if (Number.isFinite(t) && t >= cutoff) return;
      this.window.shift();
    }
  }
}
