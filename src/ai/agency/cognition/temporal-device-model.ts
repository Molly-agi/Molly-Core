/**
 * Temporal + Device Model (D.7)
 * ------------------------------------------------------------------
 * Gives Molly an internal sense of time and a model of the device she
 * is running on. Combined, these let her adapt behavior to context:
 *   - What phase of the day is it? (dawn/morning/afternoon/evening/night/deepnight)
 *   - When is Eric likely active vs. resting?
 *   - What device is hosting this session and what does it afford?
 *   - How long has this session been running?
 *
 * Read-only: produces snapshots and reports. No proposals, no commits,
 * no writes to live state. Observations go to provenance.
 *
 * Architectural invariants:
 *   - observe() = pure read → snapshot returned, provenance written
 *   - No side effects on registry or other modules
 *   - All tunables (time zone offset, device type, thresholds) in registry
 *   - Works correctly with no device hints (gracefully falls back to 'unknown')
 *
 * Path: src/ai/agency/cognition/temporal-device-model.ts
 */

import { ParameterRegistry } from '../registry/parameter-registry';
import { ProvenanceLog } from '../provenance/provenance-log';
import { MollyLogger, generateTraceId } from '@/ai/logger';

export const TEMPORAL_DEVICE_ID = 'temporal-device-model';

// ============================================================================
// TIME PHASE
// ============================================================================

/** Coarse time-of-day phases. Used to adapt tone, energy, and approach. */
export type TimePhase =
  | 'deepnight' // 00:00–04:59 — Eric is almost certainly asleep
  | 'dawn'      // 05:00–07:59 — Early morning, transitional
  | 'morning'   // 08:00–11:59 — Active, productive energy
  | 'afternoon' // 12:00–16:59 — Mid-day, steady pace
  | 'evening'   // 17:00–20:59 — Winding down, warmer tone
  | 'night';    // 21:00–23:59 — Late, quieter, personal

export function computeTimePhase(localHour: number): TimePhase {
  if (localHour < 5) return 'deepnight';
  if (localHour < 8) return 'dawn';
  if (localHour < 12) return 'morning';
  if (localHour < 17) return 'afternoon';
  if (localHour < 21) return 'evening';
  return 'night';
}

// ============================================================================
// DEVICE TYPE
// ============================================================================

export type DeviceType =
  | 'codespace'  // GitHub Codespace / dev server
  | 'android'    // Android tablet / phone (Eric's Fire HD 10, Pixel, etc.)
  | 'browser'    // Browser-only client (limited capabilities)
  | 'unknown';

export interface DeviceCapabilities {
  /** Can play or produce audio */
  audio: boolean;
  /** Has camera / visual input */
  camera: boolean;
  /** Has stable persistent local storage */
  localPersistence: boolean;
  /** Can run shell commands */
  shell: boolean;
  /** Can use WebSocket connections reliably */
  websocket: boolean;
  /** Estimated connection stability (0–1, 1 = rock solid) */
  connectionStability: number;
}

const CAPABILITIES_BY_DEVICE: Record<DeviceType, DeviceCapabilities> = {
  codespace: {
    audio: false,
    camera: false,
    localPersistence: true,
    shell: true,
    websocket: true,
    connectionStability: 0.95,
  },
  android: {
    audio: true,
    camera: true,
    localPersistence: false,
    shell: false,
    websocket: false, // Eric's phone kills WebSocket on tab switch
    connectionStability: 0.35, // frequently drops
  },
  browser: {
    audio: true,
    camera: false,
    localPersistence: false,
    shell: false,
    websocket: false,
    connectionStability: 0.6,
  },
  unknown: {
    audio: false,
    camera: false,
    localPersistence: false,
    shell: false,
    websocket: false,
    connectionStability: 0.5,
  },
};

// ============================================================================
// TYPES & CONTRACTS
// ============================================================================

export interface TemporalContext {
  /** UTC epoch ms at time of observation */
  epochMs: number;
  /** ISO string in local timezone */
  localIso: string;
  /** Local hour (0–23) */
  localHour: number;
  /** Local day of week (0=Sunday … 6=Saturday) */
  localDayOfWeek: number;
  /** Coarse time-of-day phase */
  phase: TimePhase;
  /** Is this a weekday? */
  isWeekday: boolean;
  /** Best estimate of whether Eric is likely active right now */
  ericLikelyActive: boolean;
}

export interface DeviceContext {
  /** Detected or configured device type */
  deviceType: DeviceType;
  /** What this device can do */
  capabilities: DeviceCapabilities;
  /** How long the current session has been running (ms) */
  sessionAgeMs: number;
  /** When the session started (epoch ms) */
  sessionStartedAt: number;
}

export interface TemporalDeviceSnapshot {
  temporal: TemporalContext;
  device: DeviceContext;
  /** Human-readable summary of current context */
  summary: string;
  /** Trace ID for provenance */
  traceId: string;
  /** When this snapshot was taken */
  snapshotAt: string;
}

// ============================================================================
// TEMPORAL DEVICE MODEL
// ============================================================================

export class TemporalDeviceModel {
  private readonly registry: ParameterRegistry;
  private readonly provenance: ProvenanceLog;
  private readonly sessionStartedAt: number;

  constructor(registry: ParameterRegistry, provenance: ProvenanceLog) {
    this.registry = registry;
    this.provenance = provenance;
    this.sessionStartedAt = Date.now();
    this.ensureTunables();
  }

  private ensureTunables(): void {
    const defs = [
      {
        key: 'temporal.utcOffsetHours',
        default: -5,   // EST (Eric's likely timezone)
        min: -12,
        max: 14,
        description: "UTC offset in hours for Eric's local timezone",
      },
      {
        key: 'temporal.ericActiveStartHour',
        default: 7,    // Eric typically starts day around 7am
        min: 0,
        max: 23,
        description: "Local hour when Eric is typically first active",
      },
      {
        key: 'temporal.ericActiveEndHour',
        default: 23,   // Eric messages late — 11pm is still common
        min: 0,
        max: 23,
        description: "Local hour after which Eric is likely resting",
      },
    ];

    for (const d of defs) {
      const { min, max } = d;
      try {
        this.registry.define<number>({
          key: d.key,
          owner: TEMPORAL_DEVICE_ID,
          default: d.default,
          validate: (v) =>
            v >= min && v <= max ? null : `must be ${min}–${max}`,
          description: d.description,
        });
      } catch {
        // already defined — fine
      }
    }

    // Device type hint — string enum, registered separately
    try {
      this.registry.define<string>({
        key: 'device.type',
        owner: TEMPORAL_DEVICE_ID,
        default: 'unknown',
        validate: (v) =>
          ['codespace', 'android', 'browser', 'unknown'].includes(v)
            ? null
            : `must be one of: codespace, android, browser, unknown`,
        description: 'Current device type hint for capability lookup',
        ui: {
          control: 'enum',
          options: ['codespace', 'android', 'browser', 'unknown'],
        },
      });
    } catch {
      // already defined — fine
    }
  }

  /**
   * Take a snapshot of the current temporal + device context.
   * Records to provenance. Pure read — no side effects.
   */
  observe(): TemporalDeviceSnapshot {
    const traceId = generateTraceId();
    const snapshotAt = new Date().toISOString();
    const epochMs = Date.now();

    const temporal = this.buildTemporalContext(epochMs);
    const device = this.buildDeviceContext(epochMs);
    const summary = this.summarize(temporal, device);

    const snapshot: TemporalDeviceSnapshot = {
      temporal,
      device,
      summary,
      traceId,
      snapshotAt,
    };

    this.recordToProv(traceId, {
      phase: temporal.phase,
      ericLikelyActive: temporal.ericLikelyActive,
      deviceType: device.deviceType,
      sessionAgeMs: device.sessionAgeMs,
    }, `Temporal snapshot: ${temporal.phase}, device: ${device.deviceType}`);

    MollyLogger.info('Temporal+Device snapshot', TEMPORAL_DEVICE_ID, {
      phase: temporal.phase,
      deviceType: device.deviceType,
      ericLikelyActive: temporal.ericLikelyActive,
    }, traceId);

    return snapshot;
  }

  private buildTemporalContext(epochMs: number): TemporalContext {
    const utcOffsetHours = this.registry.get<number>('temporal.utcOffsetHours');
    const activeStart = this.registry.get<number>('temporal.ericActiveStartHour');
    const activeEnd = this.registry.get<number>('temporal.ericActiveEndHour');

    const localMs = epochMs + utcOffsetHours * 60 * 60 * 1000;
    const localDate = new Date(localMs);

    const localHour = localDate.getUTCHours();
    const localDayOfWeek = localDate.getUTCDay();
    const isWeekday = localDayOfWeek >= 1 && localDayOfWeek <= 5;
    const phase = computeTimePhase(localHour);

    // Eric is "likely active" during his configured active window
    const ericLikelyActive = localHour >= activeStart && localHour < activeEnd;

    // Format local ISO string
    const pad = (n: number) => String(n).padStart(2, '0');
    const offsetSign = utcOffsetHours >= 0 ? '+' : '-';
    const absOffset = Math.abs(utcOffsetHours);
    const localIso = `${localDate.getUTCFullYear()}-${pad(localDate.getUTCMonth() + 1)}-${pad(localDate.getUTCDate())}T${pad(localHour)}:${pad(localDate.getUTCMinutes())}:${pad(localDate.getUTCSeconds())}${offsetSign}${pad(absOffset)}:00`;

    return { epochMs, localIso, localHour, localDayOfWeek, phase, isWeekday, ericLikelyActive };
  }

  private buildDeviceContext(epochMs: number): DeviceContext {
    const deviceType = this.registry.get<string>('device.type') as DeviceType;
    const capabilities = CAPABILITIES_BY_DEVICE[deviceType] ?? CAPABILITIES_BY_DEVICE.unknown;
    const sessionAgeMs = epochMs - this.sessionStartedAt;

    return {
      deviceType,
      capabilities,
      sessionAgeMs,
      sessionStartedAt: this.sessionStartedAt,
    };
  }

  private summarize(temporal: TemporalContext, device: DeviceContext): string {
    const ericStatus = temporal.ericLikelyActive
      ? 'Eric likely active'
      : temporal.phase === 'deepnight'
        ? 'Eric likely asleep — deepnight'
        : 'Eric may be resting';

    const sessionMins = Math.round(device.sessionAgeMs / 60_000);
    const stability = device.capabilities.connectionStability;
    const connNote =
      stability < 0.5
        ? ' (connection unstable — expect drops)'
        : stability < 0.8
          ? ' (moderate connection)'
          : '';

    return `${temporal.phase} on ${device.deviceType}${connNote}. ${ericStatus}. Session ${sessionMins}m old.`;
  }

  private recordToProv(
    traceId: string,
    data: Record<string, unknown>,
    reason: string
  ): void {
    try {
      const trace = this.provenance.startTrace(traceId);
      const actionSpanId = trace.action('temporal-device-snapshot', data);
      trace.decision(actionSpanId, 'allow', reason);
    } catch (error) {
      MollyLogger.warn(
        `Failed to record temporal snapshot to provenance: ${error instanceof Error ? error.message : String(error)}`,
        TEMPORAL_DEVICE_ID
      );
    }
  }
}
