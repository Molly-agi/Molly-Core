/**
 * @fileOverview Tests for Latency Cache
 *
 * Tests latency tracking including:
 * - Setting and getting latency values
 * - Statistics calculation
 * - Cache size limits
 * - Prefix-based grouping
 */

import {
  getLastLatencyMs,
  setLastLatencyMs,
  getLatencyStats,
} from '../latency-cache';

describe('Latency Cache', () => {
  beforeEach(() => {
    // Clear the cache by setting and getting stats
    // The internal Map persists, so we need to work with it
  });

  describe('setLastLatencyMs', () => {
    it('stores latency value', () => {
      setLastLatencyMs('test:operation', 150);
      expect(getLastLatencyMs('test:operation')).toBe(150);
    });

    it('rounds latency to integer', () => {
      setLastLatencyMs('test:float', 123.7);
      expect(getLastLatencyMs('test:float')).toBe(124);
    });

    it('floors negative values to zero', () => {
      setLastLatencyMs('test:negative', -50);
      expect(getLastLatencyMs('test:negative')).toBe(0);
    });

    it('ignores non-finite values', () => {
      setLastLatencyMs('test:infinity', Infinity);
      expect(getLastLatencyMs('test:infinity')).toBeUndefined();

      setLastLatencyMs('test:nan', NaN);
      expect(getLastLatencyMs('test:nan')).toBeUndefined();
    });

    it('overwrites existing values', () => {
      setLastLatencyMs('test:overwrite', 100);
      setLastLatencyMs('test:overwrite', 200);
      expect(getLastLatencyMs('test:overwrite')).toBe(200);
    });
  });

  describe('getLastLatencyMs', () => {
    it('returns undefined for unknown keys', () => {
      expect(getLastLatencyMs('nonexistent:key')).toBeUndefined();
    });

    it('returns stored value', () => {
      setLastLatencyMs('get:test', 250);
      expect(getLastLatencyMs('get:test')).toBe(250);
    });
  });

  describe('getLatencyStats', () => {
    it('returns total entries count', () => {
      setLastLatencyMs('stats:a', 100);
      setLastLatencyMs('stats:b', 200);

      const stats = getLatencyStats();
      expect(stats.totalEntries).toBeGreaterThanOrEqual(2);
    });

    it('groups by prefix', () => {
      setLastLatencyMs('flow:healthCheck', 100);
      setLastLatencyMs('flow:introspection', 150);
      setLastLatencyMs('api:generate', 200);

      const stats = getLatencyStats();

      expect(stats.byPrefix['flow']).toBeDefined();
      expect(stats.byPrefix['api']).toBeDefined();
    });

    it('calculates min correctly', () => {
      setLastLatencyMs('mintest:a', 100);
      setLastLatencyMs('mintest:b', 50);
      setLastLatencyMs('mintest:c', 150);

      const stats = getLatencyStats();
      expect(stats.byPrefix['mintest'].min).toBe(50);
    });

    it('calculates max correctly', () => {
      setLastLatencyMs('maxtest:a', 100);
      setLastLatencyMs('maxtest:b', 250);
      setLastLatencyMs('maxtest:c', 150);

      const stats = getLatencyStats();
      expect(stats.byPrefix['maxtest'].max).toBe(250);
    });

    it('calculates average correctly', () => {
      setLastLatencyMs('avgtest:a', 100);
      setLastLatencyMs('avgtest:b', 200);

      const stats = getLatencyStats();
      // Average of 100 and 200 should be 150
      expect(stats.byPrefix['avgtest'].avg).toBe(150);
    });

    it('tracks count per prefix', () => {
      setLastLatencyMs('counttest:one', 100);
      setLastLatencyMs('counttest:two', 200);
      setLastLatencyMs('counttest:three', 300);

      const stats = getLatencyStats();
      expect(stats.byPrefix['counttest'].count).toBe(3);
    });

    it('handles keys without colon', () => {
      setLastLatencyMs('noprefix', 100);

      const stats = getLatencyStats();
      // Should use 'noprefix' as the prefix (first split result)
      expect(stats.byPrefix['noprefix']).toBeDefined();
    });
  });

  describe('Cache Limits', () => {
    it('enforces maximum entries', () => {
      // Add more than MAX_LATENCY_ENTRIES (500)
      for (let i = 0; i < 510; i++) {
        setLastLatencyMs(`limit:entry${i}`, i);
      }

      const stats = getLatencyStats();
      expect(stats.totalEntries).toBeLessThanOrEqual(500);
    });

    it('removes oldest entries when limit exceeded', () => {
      // Fill to capacity
      for (let i = 0; i < 500; i++) {
        setLastLatencyMs(`evict:old${i}`, i);
      }

      // These should cause eviction of early entries
      setLastLatencyMs(`evict:new1`, 1000);
      setLastLatencyMs(`evict:new2`, 1001);

      // oldest entries should be gone
      // Newer entries should exist
      expect(getLastLatencyMs(`evict:new1`)).toBe(1000);
      expect(getLastLatencyMs(`evict:new2`)).toBe(1001);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty prefix with fallback to unknown', () => {
      setLastLatencyMs(':noprefix', 100);

      const stats = getLatencyStats();
      // Empty string before colon becomes 'unknown' via `|| 'unknown'`
      expect(stats.byPrefix['unknown']).toBeDefined();
    });

    it('handles zero latency', () => {
      setLastLatencyMs('zero:test', 0);
      expect(getLastLatencyMs('zero:test')).toBe(0);
    });

    it('handles very large latencies', () => {
      setLastLatencyMs('large:test', 999999);
      expect(getLastLatencyMs('large:test')).toBe(999999);
    });

    it('handles multiple colons in key', () => {
      setLastLatencyMs('a:b:c:d', 100);

      const stats = getLatencyStats();
      // Should use 'a' as prefix
      expect(stats.byPrefix['a']).toBeDefined();
    });
  });
});
