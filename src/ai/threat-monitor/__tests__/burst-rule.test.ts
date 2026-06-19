/**
 * @jest-environment node
 */

import { createBurstRule } from '../correlation/rules/burst-rule';
import type { ThreatSignal } from '../signal-bus';

function signal(source: string, i: number): ThreatSignal {
  return {
    source,
    severity: 'info',
    timestamp: new Date(1_700_000_000_000 + i).toISOString(),
    summary: `${source} #${i}`,
    evidence: null,
  };
}

describe('burst-rule', () => {
  it('returns null on empty window', () => {
    const rule = createBurstRule(3);
    expect(rule.evaluate([])).toBeNull();
  });

  it('returns null when no source crosses threshold', () => {
    const rule = createBurstRule(5);
    const window = [signal('a', 1), signal('a', 2), signal('b', 3)];
    expect(rule.evaluate(window)).toBeNull();
  });

  it('fires warn with top source and count when threshold met', () => {
    const rule = createBurstRule(3);
    const window = [
      signal('noisy', 1),
      signal('noisy', 2),
      signal('noisy', 3),
      signal('quiet', 4),
    ];
    const out = rule.evaluate(window);
    expect(out).not.toBeNull();
    expect(out!.severity).toBe('warn');
    expect(out!.summary).toMatch(/burst: 3 signals from noisy/);
    expect(out!.evidence).toMatchObject({
      source: 'noisy',
      count: 3,
      threshold: 3,
    });
  });

  it('picks the highest count when multiple sources cross threshold', () => {
    const rule = createBurstRule(2);
    const window = [
      signal('a', 1),
      signal('a', 2),
      signal('b', 3),
      signal('b', 4),
      signal('b', 5),
    ];
    const out = rule.evaluate(window);
    expect(out!.evidence).toMatchObject({ source: 'b', count: 3 });
  });

  it('has burst name and 30s cooldown', () => {
    const rule = createBurstRule();
    expect(rule.name).toBe('burst');
    expect(rule.cooldownMs).toBe(30_000);
  });

  it('defaults threshold to 8 when none provided', () => {
    const rule = createBurstRule();
    const window = Array.from({ length: 7 }, (_, i) => signal('s', i));
    expect(rule.evaluate(window)).toBeNull();
    window.push(signal('s', 99));
    expect(rule.evaluate(window)).not.toBeNull();
  });
});
