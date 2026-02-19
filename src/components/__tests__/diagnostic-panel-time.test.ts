import { formatRelativeTime } from '../diagnostic-time';

describe('DiagnosticPanel relative time formatter', () => {
  const now = Date.parse('2026-02-18T12:00:00.000Z');

  it('handles empty and invalid timestamps', () => {
    expect(formatRelativeTime(null, now)).toBe('not yet loaded');
    expect(formatRelativeTime('not-a-date', now)).toBe('not-a-date');
  });

  it('formats short durations as just now or seconds', () => {
    expect(formatRelativeTime('2026-02-18T11:59:58.000Z', now)).toBe(
      'just now'
    );
    expect(formatRelativeTime('2026-02-18T11:59:40.000Z', now)).toBe('20s ago');
  });

  it('formats longer durations as minutes, hours, and days', () => {
    expect(formatRelativeTime('2026-02-18T11:50:00.000Z', now)).toBe('10m ago');
    expect(formatRelativeTime('2026-02-18T09:00:00.000Z', now)).toBe('3h ago');
    expect(formatRelativeTime('2026-02-16T12:00:00.000Z', now)).toBe('2d ago');
  });
});
