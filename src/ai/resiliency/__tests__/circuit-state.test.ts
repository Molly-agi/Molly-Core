/**
 * Tests for shared circuit breaker state types.
 *
 * Validates that the CircuitState enum has the expected values
 * and that the interfaces are correctly defined.
 */

import {
  CircuitState,
  type BaseCircuitBreakerConfig,
  type BaseCircuitStats,
} from '../circuit-state';

describe('CircuitState enum', () => {
  it('has exactly 3 states', () => {
    const values = Object.values(CircuitState);
    expect(values).toHaveLength(3);
  });

  it('defines CLOSED state', () => {
    expect(CircuitState.CLOSED).toBe('CLOSED');
  });

  it('defines OPEN state', () => {
    expect(CircuitState.OPEN).toBe('OPEN');
  });

  it('defines HALF_OPEN state', () => {
    expect(CircuitState.HALF_OPEN).toBe('HALF_OPEN');
  });
});

describe('BaseCircuitBreakerConfig interface', () => {
  it('can create a valid config object', () => {
    const config: BaseCircuitBreakerConfig = {
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
    };
    expect(config.failureThreshold).toBe(5);
    expect(config.resetTimeoutMs).toBe(30_000);
  });
});

describe('BaseCircuitStats interface', () => {
  it('can represent a closed circuit with no failures', () => {
    const stats: BaseCircuitStats = {
      state: CircuitState.CLOSED,
      failureCount: 0,
      lastFailureTime: null,
    };
    expect(stats.state).toBe(CircuitState.CLOSED);
    expect(stats.failureCount).toBe(0);
    expect(stats.lastFailureTime).toBeNull();
  });

  it('can represent an open circuit with failures', () => {
    const stats: BaseCircuitStats = {
      state: CircuitState.OPEN,
      failureCount: 5,
      lastFailureTime: Date.now(),
    };
    expect(stats.state).toBe(CircuitState.OPEN);
    expect(stats.failureCount).toBe(5);
    expect(stats.lastFailureTime).toBeGreaterThan(0);
  });

  it('can represent a half-open circuit', () => {
    const stats: BaseCircuitStats = {
      state: CircuitState.HALF_OPEN,
      failureCount: 3,
      lastFailureTime: Date.now() - 30_000,
    };
    expect(stats.state).toBe(CircuitState.HALF_OPEN);
  });
});
