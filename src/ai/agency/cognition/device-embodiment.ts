/**
 * Device Embodiment (D.7b)
 * ------------------------------------------------------------------
 * Tracks Molly's awareness of the physical device she's running on.
 * Translates raw device state (screen, audio, network, power, touch)
 * into affordances that goal arbitration and conversational flows can use.
 *
 * Architectural invariants:
 *   - Pure state tracker. No side effects, no writes to registry beyond
 *     construction-time ensureTunables().
 *   - updateFromDeviceSnapshot() updates internal state only.
 *   - getDeviceAffordances() is safe to call at any time; always fresh.
 *   - Provenance is written on state transitions only, not every read.
 *   - Affordance thresholds are registry-tunable.
 *
 * Path: src/ai/agency/cognition/device-embodiment.ts
 */

import { ParameterRegistry } from '../registry/parameter-registry';
import { ProvenanceLog } from '../provenance/provenance-log';
import { MollyLogger, generateTraceId } from '@/ai/logger';

export const DEVICE_EMBODIMENT_ID = 'device-embodiment';

// ============================================================================
// TYPES & CONTRACTS
// ============================================================================

export type ScreenState = 'on' | 'dimmed' | 'off';
export type AudioState = 'playing' | 'ambient' | 'silent';
export type NetworkState = 'online' | 'degraded' | 'offline';
export type PowerState = 'charging' | 'battery' | 'low';

export interface DeviceSnapshot {
  screenState: ScreenState;
  audioState: AudioState;
  networkState: NetworkState;
  powerState: PowerState;
  /** Whether a touch surface is currently active */
  touchActive: boolean;
  /** ISO timestamp of when this snapshot was taken */
  snapshotAt: string;
}

export interface DeviceAffordances {
  /** Screen is on or dimmed — content can be shown */
  canDisplay: boolean;
  /** Audio output is available */
  canPlayAudio: boolean;
  /** Network is available for API calls */
  canNetwork: boolean;
  /** Device can receive touch input */
  canInteract: boolean;
  /** Battery is not in critical state */
  hasPower: boolean;
  /** Derived overall readiness level (0–1) */
  readiness: number;
  /** Current device snapshot */
  snapshot: DeviceSnapshot;
  /** ISO timestamp of when affordances were computed */
  computedAt: string;
}

// ============================================================================
// VALID STATE SETS — for input validation
// ============================================================================

const VALID_SCREEN: readonly ScreenState[] = ['on', 'dimmed', 'off'];
const VALID_AUDIO: readonly AudioState[] = ['playing', 'ambient', 'silent'];
const VALID_NETWORK: readonly NetworkState[] = [
  'online',
  'degraded',
  'offline',
];
const VALID_POWER: readonly PowerState[] = ['charging', 'battery', 'low'];

// ============================================================================
// DEFAULTS
// ============================================================================

const DEFAULT_SNAPSHOT: DeviceSnapshot = {
  screenState: 'on',
  audioState: 'silent',
  networkState: 'online',
  powerState: 'battery',
  touchActive: false,
  snapshotAt: new Date().toISOString(),
};

// ============================================================================
// DEVICE EMBODIMENT CLASS
// ============================================================================

export class DeviceEmbodiment {
  private current: DeviceSnapshot = { ...DEFAULT_SNAPSHOT };
  private lastSnapshot: DeviceSnapshot | null = null;

  constructor(
    private readonly registry: ParameterRegistry,
    private readonly provenance: ProvenanceLog
  ) {
    this.ensureTunables();
  }

  private ensureTunables(): void {
    const defs = [
      {
        key: 'device.degradedNetworkPenalty',
        default: 0.3,
        min: 0,
        max: 0.7,
        description: 'Readiness penalty applied when network is degraded (0–1)',
      },
      {
        key: 'device.lowPowerPenalty',
        default: 0.4,
        min: 0,
        max: 0.8,
        description: 'Readiness penalty applied when power is low (0–1)',
      },
      {
        key: 'device.screenOffPenalty',
        default: 0.2,
        min: 0,
        max: 0.5,
        description: 'Readiness penalty applied when screen is off (0–1)',
      },
    ];

    for (const d of defs) {
      const { min, max } = d;
      try {
        this.registry.define<number>({
          key: d.key,
          owner: DEVICE_EMBODIMENT_ID,
          default: d.default,
          validate: (v) =>
            v >= min && v <= max ? null : `must be ${min}–${max}`,
          description: d.description,
        });
      } catch {
        // already defined — fine
      }
    }
  }

  /**
   * Update the tracked device state from an external snapshot.
   * Silently ignores invalid state values to avoid crashing on bad input.
   * Records transitions to provenance.
   */
  updateFromDeviceSnapshot(snapshot: DeviceSnapshot): void {
    // Validate incoming state values — reject unknowns rather than storing bad state
    if (!VALID_SCREEN.includes(snapshot.screenState)) return;
    if (!VALID_AUDIO.includes(snapshot.audioState)) return;
    if (!VALID_NETWORK.includes(snapshot.networkState)) return;
    if (!VALID_POWER.includes(snapshot.powerState)) return;

    const prev = this.current;
    this.current = { ...snapshot };

    const changed =
      !this.lastSnapshot ||
      prev.screenState !== snapshot.screenState ||
      prev.audioState !== snapshot.audioState ||
      prev.networkState !== snapshot.networkState ||
      prev.powerState !== snapshot.powerState ||
      prev.touchActive !== snapshot.touchActive;

    if (changed) {
      this.recordTransition(prev, snapshot);
      this.lastSnapshot = { ...snapshot };
    }
  }

  /**
   * Compute affordances from current device state.
   * Safe to call at any time — derives from live state, no side effects.
   */
  getDeviceAffordances(): DeviceAffordances {
    const s = this.current;
    const degradedPenalty = this.registry.get<number>(
      'device.degradedNetworkPenalty'
    );
    const lowPowerPenalty = this.registry.get<number>('device.lowPowerPenalty');
    const screenOffPenalty = this.registry.get<number>(
      'device.screenOffPenalty'
    );

    const canDisplay = s.screenState !== 'off';
    const canPlayAudio = s.audioState !== 'silent';
    const canNetwork = s.networkState !== 'offline';
    const canInteract = s.touchActive && canDisplay;
    const hasPower = s.powerState !== 'low';

    // Readiness: start at 1.0, subtract penalties for degraded states
    let readiness = 1.0;
    if (s.networkState === 'offline') readiness -= 0.5;
    else if (s.networkState === 'degraded') readiness -= degradedPenalty;
    if (s.powerState === 'low') readiness -= lowPowerPenalty;
    if (s.screenState === 'off') readiness -= screenOffPenalty;
    readiness = Math.max(0, Math.min(1, readiness));

    return {
      canDisplay,
      canPlayAudio,
      canNetwork,
      canInteract,
      hasPower,
      readiness,
      snapshot: { ...s },
      computedAt: new Date().toISOString(),
    };
  }

  /** Return the current raw device snapshot. */
  getSnapshot(): DeviceSnapshot {
    return { ...this.current };
  }

  private recordTransition(prev: DeviceSnapshot, next: DeviceSnapshot): void {
    const traceId = generateTraceId();
    try {
      const trace = this.provenance.startTrace(traceId);
      trace.perception('device-state-transition', {
        prev: {
          screenState: prev.screenState,
          audioState: prev.audioState,
          networkState: prev.networkState,
          powerState: prev.powerState,
          touchActive: prev.touchActive,
        },
        next: {
          screenState: next.screenState,
          audioState: next.audioState,
          networkState: next.networkState,
          powerState: next.powerState,
          touchActive: next.touchActive,
        },
      });
      MollyLogger.info(
        'Device state transition',
        DEVICE_EMBODIMENT_ID,
        {
          screen: `${prev.screenState} → ${next.screenState}`,
          audio: `${prev.audioState} → ${next.audioState}`,
          network: `${prev.networkState} → ${next.networkState}`,
          power: `${prev.powerState} → ${next.powerState}`,
        },
        traceId
      );
    } catch {
      // provenance failure is non-fatal
    }
  }
}
