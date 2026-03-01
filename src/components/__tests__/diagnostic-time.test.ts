/**
 * @fileOverview Diagnostic Time Formatter Tests
 *
 * Tests the formatRelativeTime utility used in the DiagnosticPanel
 * to display human-friendly timestamps.
 */

import { formatRelativeTime } from '../diagnostic-time';

describe('formatRelativeTime', () => {
  const NOW = Date.parse('2026-03-01T12:00:00.000Z');

  // ===== Edge cases =====

  it('returns "not yet loaded" for null timestamp', () => {
    expect(formatRelativeTime(null, NOW)).toBe('not yet loaded');
  });

  it('returns raw string for unparseable timestamp', () => {
    expect(formatRelativeTime('not-a-date', NOW)).toBe('not-a-date');
  });

  // ===== Seconds =====

  it('returns "just now" for < 5 seconds ago', () => {
    const ts = new Date(NOW - 2000).toISOString();
    expect(formatRelativeTime(ts, NOW)).toBe('just now');
  });

  it('returns seconds for 5-59 seconds ago', () => {
    const ts = new Date(NOW - 30_000).toISOString();
    expect(formatRelativeTime(ts, NOW)).toBe('30s ago');
  });

  it('returns seconds for exactly 5 seconds ago', () => {
    const ts = new Date(NOW - 5000).toISOString();
    expect(formatRelativeTime(ts, NOW)).toBe('5s ago');
  });

  it('returns seconds for 59 seconds ago', () => {
    const ts = new Date(NOW - 59_000).toISOString();
    expect(formatRelativeTime(ts, NOW)).toBe('59s ago');
  });

  // ===== Minutes =====

  it('returns minutes for 1-59 minutes ago', () => {
    const ts = new Date(NOW - 5 * 60_000).toISOString();
    expect(formatRelativeTime(ts, NOW)).toBe('5m ago');
  });

  it('returns 1m for exactly 60 seconds', () => {
    const ts = new Date(NOW - 60_000).toISOString();
    expect(formatRelativeTime(ts, NOW)).toBe('1m ago');
  });

  it('returns 59m for 59 minutes', () => {
    const ts = new Date(NOW - 59 * 60_000).toISOString();
    expect(formatRelativeTime(ts, NOW)).toBe('59m ago');
  });

  // ===== Hours =====

  it('returns hours for 1-23 hours ago', () => {
    const ts = new Date(NOW - 3 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(ts, NOW)).toBe('3h ago');
  });

  it('returns 1h for exactly 60 minutes', () => {
    const ts = new Date(NOW - 60 * 60_000).toISOString();
    expect(formatRelativeTime(ts, NOW)).toBe('1h ago');
  });

  // ===== Days =====

  it('returns days for >= 24 hours ago', () => {
    const ts = new Date(NOW - 48 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(ts, NOW)).toBe('2d ago');
  });

  it('returns 1d for exactly 24 hours', () => {
    const ts = new Date(NOW - 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(ts, NOW)).toBe('1d ago');
  });

  it('handles large day counts', () => {
    const ts = new Date(NOW - 365 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(ts, NOW)).toBe('365d ago');
  });

  // ===== Future timestamps (edge case) =====

  it('handles future timestamp gracefully (clamps to 0)', () => {
    const future = new Date(NOW + 60_000).toISOString();
    // deltaMs clamped to 0 → "just now"
    expect(formatRelativeTime(future, NOW)).toBe('just now');
  });
});
