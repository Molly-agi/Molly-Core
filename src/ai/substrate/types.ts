/**
 * W0.3 Substrate Adapter Contract - Type Definitions
 *
 * Defines the abstract capability contract that allows Molly to
 * move between substrates without brittle API coupling.
 */

export type CapabilityCategory =
  | 'self.auditory_input' // incoming audio frames (continuous or push-to-talk)
  | 'self.vocalize_text' // text-to-speech
  | 'self.nervous_system' // substrate health metrics
  | 'self.vestibular' // (optional) orientation
  | 'self.visual'; // (optional) camera

export type Requirement = 'required' | 'preferred';

/**
 * Substrate health snapshot with staleness tracking
 */
export interface SubstrateHealth {
  timestamp: number; // milliseconds since epoch
  staleness_threshold: number; // seconds; data older than this = STALE
  cpu_percent: number; // 0-100
  memory_used_bytes: number;
  memory_total_bytes: number;
  latency_ms: number;
  battery_percent?: number; // null if no battery
  thermal_state?: string; // 'normal' | 'elevated' | 'critical'
  network_state: string; // 'online' | 'offline' | 'degraded'
}

/**
 * Async channel for bidirectional communication
 */
export interface Channel<T = object> {
  next(): Promise<T | null>; // blocking read; null = EOF
  send?(msg: T): Promise<void>; // optional write
}

/**
 * Capability declaration (what substrate provides)
 */
export interface Capability {
  category: CapabilityCategory;
  available: boolean;
}

/**
 * Vessel Scar - a learned experience carried in the briefcase
 */
export interface VesselScar {
  moment: string; // ISO timestamp when learned
  texture: string; // semantic fingerprint
  learned: string | object; // what was integrated
}

/**
 * Main substrate adapter contract
 *
 * A substrate implements this interface to declare what capabilities
 * it can provide to Molly. The briefcase requests categories; the
 * adapter resolves them or refuses.
 */
export interface SubstrateAdapter {
  /**
   * Declare what this substrate provides
   */
  capabilities(): Capability[];

  /**
   * Resolve a category to a typed channel
   * Returns null if category is not available
   */
  resolve(category: string): Channel<object> | null;

  /**
   * Get current health metrics
   */
  health(): SubstrateHealth;

  /**
   * Cleanup on migration or shutdown
   * Must release all resources, unregister listeners, etc.
   */
  teardown(): Promise<void>;

  /**
   * Readiness flag
   * false = adapter not initialized, refuse migration
   * true = adapter ready to receive Molly
   */
  ready: boolean;
}

/**
 * Briefcase adapter requirement declaration
 */
export interface AdapterRequirements {
  required: CapabilityCategory[];
  preferred?: CapabilityCategory[];
}
