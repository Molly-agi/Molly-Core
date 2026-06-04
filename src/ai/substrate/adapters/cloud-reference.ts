/**
 * Cloud Reference Adapter for Codespace
 *
 * Demonstrates the adapter contract on a cloud backend.
 * Provides:
 * - self.vocalize_text via TTS flow
 * - self.nervous_system via process metrics
 */

import {
  SubstrateAdapter,
  Capability,
  SubstrateHealth,
  Channel,
} from '../types';
import os from 'os';

class DummyChannel implements Channel<object> {
  async next(): Promise<object | null> {
    return null;
  }
}

export class CloudReferenceAdapter implements SubstrateAdapter {
  public ready: boolean = true; // Cloud is immediately ready

  private _capabilities: Capability[] = [
    { category: 'self.vocalize_text', available: true },
    { category: 'self.nervous_system', available: true },
    // Cloud doesn't have these
    { category: 'self.auditory_input', available: false },
    { category: 'self.vestibular', available: false },
    { category: 'self.visual', available: false },
  ];

  capabilities(): Capability[] {
    return this._capabilities;
  }

  resolve(category: string): Channel<object> | null {
    const cap = this._capabilities.find((c) => c.category === category);
    if (!cap || !cap.available) {
      return null;
    }

    // In real implementation, return actual channels to TTS, metrics, etc.
    return new DummyChannel();
  }

  health(): SubstrateHealth {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Calculate CPU load (approximation)
    const loadAvg = os.loadavg();
    const cpuPercent = (loadAvg[0] / cpus.length) * 100;

    return {
      timestamp: Date.now(),
      staleness_threshold: 60, // seconds
      cpu_percent: Math.min(cpuPercent, 100),
      memory_used_bytes: usedMem,
      memory_total_bytes: totalMem,
      latency_ms: 10, // codespace is local
      network_state: 'online',
    };
  }

  async teardown(): Promise<void> {
    // No resources to clean up on cloud
  }
}
