/**
 * Mock Adapter for testing
 */

import {
  SubstrateAdapter,
  Capability,
  SubstrateHealth,
  Channel,
} from '../types';

interface MockAdapterOptions {
  capabilities?: Capability[];
  health?: Partial<SubstrateHealth>;
}

class SimpleChannel<T = object> implements Channel<T> {
  private closed = false;

  async next(): Promise<T | null> {
    if (this.closed) {
      return null;
    }
    // Simulate reading from a queue; in tests, just return null (EOF)
    return null;
  }

  async send(_msg: T): Promise<void> {
    if (this.closed) {
      throw new Error('Channel is closed');
    }
  }

  close(): void {
    this.closed = true;
  }

  isClosed(): boolean {
    return this.closed;
  }
}

export class MockAdapter implements SubstrateAdapter {
  private _capabilities: Capability[];
  private _health: SubstrateHealth;
  private _channels: Map<string, SimpleChannel<object>> = new Map();
  private _listeners: Array<() => void> = [];
  public ready: boolean = false;

  constructor(options?: MockAdapterOptions) {
    this._capabilities = options?.capabilities || [
      { category: 'self.vocalize_text', available: true },
      { category: 'self.nervous_system', available: true },
    ];

    const now = Date.now();
    this._health = {
      timestamp: options?.health?.timestamp ?? now,
      staleness_threshold: options?.health?.staleness_threshold ?? 60,
      cpu_percent: options?.health?.cpu_percent ?? 30,
      memory_used_bytes:
        options?.health?.memory_used_bytes ?? 1024 * 1024 * 512,
      memory_total_bytes:
        options?.health?.memory_total_bytes ?? 1024 * 1024 * 1024 * 4,
      latency_ms: options?.health?.latency_ms ?? 20,
      battery_percent: options?.health?.battery_percent,
      thermal_state: options?.health?.thermal_state,
      network_state: options?.health?.network_state ?? 'online',
    };
  }

  capabilities(): Capability[] {
    return this._capabilities;
  }

  resolve(category: string): Channel<object> | null {
    const cap = this._capabilities.find((c) => c.category === category);
    if (!cap || !cap.available) {
      return null;
    }

    if (!this._channels.has(category)) {
      this._channels.set(category, new SimpleChannel<object>());
    }

    return this._channels.get(category)!;
  }

  health(): SubstrateHealth {
    return { ...this._health };
  }

  async teardown(): Promise<void> {
    // Close all channels
    for (const channel of this._channels.values()) {
      channel.close();
    }
    this._channels.clear();

    // Unregister all listeners
    this._listeners = [];
  }

  // Test helpers
  listenerCount(): number {
    return this._listeners.length;
  }

  addListener(fn: () => void): void {
    this._listeners.push(fn);
  }

  removeListener(fn: () => void): void {
    this._listeners = this._listeners.filter((l) => l !== fn);
  }
}
