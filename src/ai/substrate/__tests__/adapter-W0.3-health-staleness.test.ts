import { describe, it, expect, beforeEach } from '@jest/globals';
import { SubstrateAdapter, SubstrateHealth } from '../types';
import { MockAdapter } from './fixtures/mock-adapter';

describe('W0.3-F3.4: Health Staleness Threshold', () => {
  let adapter: SubstrateAdapter;
  const THRESHOLD_SECONDS = 60;

  beforeEach(() => {
    adapter = new MockAdapter({
      health: {
        timestamp: Date.now(),
        staleness_threshold: THRESHOLD_SECONDS,
        cpu_percent: 25,
        memory_used_bytes: 1024 * 1024 * 512, // 512 MB
        memory_total_bytes: 1024 * 1024 * 1024 * 4, // 4 GB
        latency_ms: 15,
        network_state: 'online',
      },
    });
  });

  it('should return health with timestamp', () => {
    const health: SubstrateHealth = adapter.health();
    expect(health.timestamp).toBeDefined();
    expect(typeof health.timestamp).toBe('number');
    expect(health.timestamp).toBeGreaterThan(0);
  });

  it('should include staleness_threshold in health', () => {
    const health = adapter.health();
    expect(health.staleness_threshold).toBeDefined();
    expect(health.staleness_threshold).toBe(THRESHOLD_SECONDS);
  });

  it('should report fresh health as OK', () => {
    const health = adapter.health();
    const age = (Date.now() - health.timestamp) / 1000;
    expect(age).toBeLessThan(health.staleness_threshold);
  });

  it('should report stale health correctly', () => {
    // Create adapter with old timestamp
    const staleMockAdapter = new MockAdapter({
      health: {
        timestamp: Date.now() - 120 * 1000, // 120 seconds ago
        staleness_threshold: THRESHOLD_SECONDS,
        cpu_percent: 25,
        memory_used_bytes: 1024 * 1024 * 512,
        memory_total_bytes: 1024 * 1024 * 1024 * 4,
        latency_ms: 15,
        network_state: 'online',
      },
    });

    const health = staleMockAdapter.health();
    const age = (Date.now() - health.timestamp) / 1000;
    expect(age).toBeGreaterThan(health.staleness_threshold);
  });

  it('should include required health metrics', () => {
    const health = adapter.health();
    expect(health.cpu_percent).toBeDefined();
    expect(health.memory_used_bytes).toBeDefined();
    expect(health.memory_total_bytes).toBeDefined();
    expect(health.latency_ms).toBeDefined();
    expect(health.network_state).toBeDefined();
  });

  it('should allow optional battery_percent field', () => {
    const health = adapter.health();
    // battery_percent may be undefined (no battery on cloud)
    expect(
      health.battery_percent === undefined ||
        typeof health.battery_percent === 'number'
    ).toBe(true);
  });

  it('should allow optional thermal_state field', () => {
    const health = adapter.health();
    // thermal_state may be undefined
    expect(
      health.thermal_state === undefined ||
        typeof health.thermal_state === 'string'
    ).toBe(true);
  });

  it('should maintain valid state values', () => {
    const health = adapter.health();
    expect(['online', 'offline', 'degraded']).toContain(health.network_state);
  });

  it('should report health at boundary of staleness', () => {
    // Exactly at threshold
    const boundaryMockAdapter = new MockAdapter({
      health: {
        timestamp: Date.now() - THRESHOLD_SECONDS * 1000,
        staleness_threshold: THRESHOLD_SECONDS,
        cpu_percent: 25,
        memory_used_bytes: 1024 * 1024 * 512,
        memory_total_bytes: 1024 * 1024 * 1024 * 4,
        latency_ms: 15,
        network_state: 'online',
      },
    });

    const health = boundaryMockAdapter.health();
    const age = (Date.now() - health.timestamp) / 1000;
    // At threshold is OK (non-exclusive)
    expect(age).toBeLessThanOrEqual(health.staleness_threshold + 1); // +1 for timing variance
  });
});
