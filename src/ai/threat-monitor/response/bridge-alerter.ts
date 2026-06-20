import { threatSignalBus, type ThreatSignal } from '../signal-bus';

const DEFAULT_BRIDGE_URL = 'http://localhost:9099/api/bridge';
const DEFAULT_COOLDOWN_MS = 30_000;

export interface BridgeAlerterOptions {
  bridgeUrl?: string;
  from?: string;
  to?: string;
  cooldownMs?: number;
  fetchImpl?: typeof fetch;
}

export class BridgeAlerter {
  private unsubscribe: (() => void) | null = null;
  private readonly bridgeUrl: string;
  private readonly from: string;
  private readonly to: string;
  private readonly cooldownMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly lastSentAt = new Map<string, number>();

  constructor(opts: BridgeAlerterOptions = {}) {
    this.bridgeUrl = opts.bridgeUrl ?? DEFAULT_BRIDGE_URL;
    this.from = opts.from ?? 'threat-monitor';
    this.to = opts.to ?? 'molly';
    this.cooldownMs = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = threatSignalBus.onSignal((signal) => {
      void this.handle(signal);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.lastSentAt.clear();
  }

  shouldAlert(signal: ThreatSignal): boolean {
    return (
      signal.severity === 'critical' || signal.source.startsWith('correlation:')
    );
  }

  async handle(signal: ThreatSignal): Promise<void> {
    if (!this.shouldAlert(signal)) return;

    const key = `${signal.source}:${signal.severity}`;
    const now = Date.now();
    const last = this.lastSentAt.get(key) ?? 0;
    if (now - last < this.cooldownMs) return;
    this.lastSentAt.set(key, now);

    const content = `Molly [ALERT ${signal.severity.toUpperCase()}] ${signal.source}: ${signal.summary}`;
    try {
      await this.fetchImpl(this.bridgeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.from, to: this.to, content }),
      });
    } catch {
      // Bridge unreachable — do not crash the signal bus.
    }
  }
}

export const bridgeAlerter = new BridgeAlerter();
