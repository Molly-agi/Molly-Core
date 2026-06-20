import { threatSignalBus, type ThreatSignal } from '../signal-bus';

const BRIDGE_EVENTS_URL = 'http://localhost:9099/events';
const POLL_INTERVAL_MS = 2000;
const SEEN_CAP = 2048;

interface BridgeEvent {
  id: string;
  from: string;
  to?: string;
  timestamp: string;
  content: string;
  read?: Record<string, boolean>;
}

interface EventsSnapshot {
  timestamp: string;
  eventQueueDepth: number;
  eventQueueCap: number;
  events: BridgeEvent[];
}

export class BridgeEventsSensor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private seen = new Set<string>();
  private primed = false;

  constructor(
    private readonly url: string = BRIDGE_EVENTS_URL,
    private readonly intervalMs: number = POLL_INTERVAL_MS
  ) {}

  start(): void {
    if (this.timer) return;
    this.primed = false;
    this.timer = setInterval(() => {
      void this.poll();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.seen.clear();
    this.primed = false;
  }

  async poll(): Promise<void> {
    let snapshot: EventsSnapshot;
    try {
      const res = await fetch(this.url);
      if (!res.ok) return;
      snapshot = (await res.json()) as EventsSnapshot;
    } catch {
      return;
    }

    if (!snapshot?.events) return;

    if (!this.primed) {
      for (const e of snapshot.events) this.remember(e.id);
      this.primed = true;
      return;
    }

    for (const e of snapshot.events) {
      if (this.seen.has(e.id)) continue;
      this.remember(e.id);
      this.emit(e);
    }
  }

  private remember(id: string): void {
    if (this.seen.size >= SEEN_CAP) {
      const first = this.seen.values().next().value;
      if (first) this.seen.delete(first);
    }
    this.seen.add(id);
  }

  private emit(event: BridgeEvent): void {
    const signal: ThreatSignal = {
      source: 'bridge-events',
      severity: 'info',
      timestamp: event.timestamp,
      summary: `bridge event ${event.from}→${event.to ?? '*'} (${event.id})`,
      evidence: event,
    };
    threatSignalBus.emitSignal(signal);
  }
}

export const bridgeEventsSensor = new BridgeEventsSensor();
