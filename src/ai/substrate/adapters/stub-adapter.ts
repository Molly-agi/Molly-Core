/**
 * Stub Adapter for native shell
 *
 * Declares abstract capabilities without implementing them.
 * Starts in ready=false state; becomes ready when MollyService Step 0 initializes.
 * This ensures no briefcase targets an uninitialized substrate.
 */

import {
  SubstrateAdapter,
  Capability,
  SubstrateHealth,
  Channel,
} from '../types';

class StubChannel implements Channel<object> {
  async next(): Promise<object | null> {
    throw new Error('Stub channel: not implemented');
  }

  async send(_msg: object): Promise<void> {
    throw new Error('Stub channel: not implemented');
  }
}

export class StubAdapter implements SubstrateAdapter {
  public ready: boolean = false;

  private _capabilities: Capability[] = [
    { category: 'self.auditory_input', available: true },
    { category: 'self.vocalize_text', available: true },
    { category: 'self.nervous_system', available: true },
    { category: 'self.vestibular', available: true },
    { category: 'self.visual', available: true },
  ];

  capabilities(): Capability[] {
    return this._capabilities;
  }

  resolve(category: string): Channel<object> | null {
    if (!this.ready) {
      // Adapter not initialized; refuse resolution
      return null;
    }

    const cap = this._capabilities.find((c) => c.category === category);
    if (!cap || !cap.available) {
      return null;
    }

    return new StubChannel();
  }

  health(): SubstrateHealth {
    return {
      timestamp: Date.now(),
      staleness_threshold: 60,
      cpu_percent: 0,
      memory_used_bytes: 0,
      memory_total_bytes: 0,
      latency_ms: 0,
      network_state: 'online',
    };
  }

  async teardown(): Promise<void> {
    // Cleanup stub resources (there are none, but method is present for contract)
    this.ready = false;
  }

  /**
   * Initialize the adapter (MollyService Step 0)
   * Sets ready=true after all capabilities are wired up
   */
  async initialize(): Promise<void> {
    // In real implementation, this wires up to Android APIs, etc.
    // For now, just mark ready
    this.ready = true;
  }
}
