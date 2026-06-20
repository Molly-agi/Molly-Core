import {
  honeypotLogger,
  type AttackerCommand,
} from '../../security/honeypot-command-logger';
import { threatSignalBus, type ThreatSignal } from '../signal-bus';

const POLL_INTERVAL_MS = 5000;
const WINDOW_MS = 60_000;
const FAILURE_THRESHOLD = 5;
const UNIQUE_TYPE_THRESHOLD = 6;
const COOLDOWN_MS = 60_000;

export interface HoneypotScanSnapshot {
  windowMs: number;
  failures: number;
  uniqueTypes: number;
  totalCommands: number;
  sampleIps: string[];
}

export class HoneypotScanSensor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastFiredAt = 0;

  constructor(
    private readonly intervalMs: number = POLL_INTERVAL_MS,
    private readonly source: {
      getCommandLog: () => AttackerCommand[];
    } = honeypotLogger
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.scan(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.lastFiredAt = 0;
  }

  scan(): HoneypotScanSnapshot {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;

    const recent = this.source.getCommandLog().filter((c) => {
      const t = new Date(c.timestamp).getTime();
      return Number.isFinite(t) && t >= cutoff;
    });

    const failures = recent.filter((c) => !c.success).length;
    const uniqueTypes = new Set(recent.map((c) => c.command_type)).size;
    const sampleIps = Array.from(new Set(recent.map((c) => c.source_ip))).slice(
      0,
      5
    );

    const snapshot: HoneypotScanSnapshot = {
      windowMs: WINDOW_MS,
      failures,
      uniqueTypes,
      totalCommands: recent.length,
      sampleIps,
    };

    const breach =
      failures > FAILURE_THRESHOLD || uniqueTypes > UNIQUE_TYPE_THRESHOLD;

    if (breach && now - this.lastFiredAt >= COOLDOWN_MS) {
      this.lastFiredAt = now;
      const signal: ThreatSignal = {
        source: 'honeypot-scan',
        severity: 'critical',
        timestamp: new Date(now).toISOString(),
        summary: `honeypot scan threshold: ${failures} failures, ${uniqueTypes} unique types in ${WINDOW_MS / 1000}s`,
        evidence: snapshot,
      };
      threatSignalBus.emitSignal(signal);
    }

    return snapshot;
  }
}

export const honeypotScanSensor = new HoneypotScanSensor();
