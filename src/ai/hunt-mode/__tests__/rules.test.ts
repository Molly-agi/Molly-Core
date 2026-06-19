import { createBurstRateRule } from '../rules/burst-rate';
import { createSeverityEscalationRule } from '../rules/severity-escalation';
import { createMultiSourceRule } from '../rules/multi-source';
import { createRepeatOffenderRule } from '../rules/repeat-offender';
import type { AttackerProfile, ProfileEventRef } from '../profile';

function ev(
  t: string,
  severity: ProfileEventRef['severity'] = 'info'
): ProfileEventRef {
  return { timestamp: t, source: 'test', severity, summary: 's' };
}

function profile(overrides: Partial<AttackerProfile> = {}): AttackerProfile {
  return {
    key: 'ip:1.2.3.4',
    firstSeen: '2026-06-19T00:00:00.000Z',
    lastSeen: '2026-06-19T00:00:00.000Z',
    confidence: 0.5,
    signalCount: 1,
    severityCounts: { info: 1, warn: 0, critical: 0 },
    sources: { 'admin-audit': 1 },
    routes: {},
    fields: { ip: '1.2.3.4' },
    recent: [ev('2026-06-19T00:00:00.000Z')],
    ...overrides,
  };
}

describe('burst-rate rule', () => {
  it('returns null when recent[] is shorter than threshold', () => {
    const rule = createBurstRateRule({ threshold: 5 });
    expect(rule.evaluate(profile(), null)).toBeNull();
  });

  it('fires when threshold events fall within window', () => {
    const rule = createBurstRateRule({
      threshold: 5,
      windowMs: 60_000,
      now: () => Date.parse('2026-06-19T00:01:00.000Z'),
    });
    const recent = [
      ev('2026-06-19T00:00:50.000Z'),
      ev('2026-06-19T00:00:40.000Z'),
      ev('2026-06-19T00:00:30.000Z'),
      ev('2026-06-19T00:00:20.000Z'),
      ev('2026-06-19T00:00:10.000Z'),
    ];
    const p = profile({ recent });
    const v = rule.evaluate(p, null);
    expect(v).not.toBeNull();
    expect(v!.severity).toBe('warn');
    expect(v!.evidence.ruleId).toBe('burst-rate');
    expect(v!.evidence.counters.spanMs).toBe(40_000);
  });

  it('returns null when events span longer than window', () => {
    const rule = createBurstRateRule({ threshold: 3, windowMs: 10_000 });
    const recent = [
      ev('2026-06-19T00:01:00.000Z'),
      ev('2026-06-19T00:00:30.000Z'),
      ev('2026-06-19T00:00:00.000Z'),
    ];
    expect(rule.evaluate(profile({ recent }), null)).toBeNull();
  });

  it('rule is on-mutation mode', () => {
    expect(createBurstRateRule().mode).toBe('on-mutation');
  });
});

describe('severity-escalation rule', () => {
  it('fires critical when prev had no critical and curr does', () => {
    const rule = createSeverityEscalationRule();
    const prev = profile({
      severityCounts: { info: 5, warn: 1, critical: 0 },
    });
    const curr = profile({
      severityCounts: { info: 5, warn: 1, critical: 1 },
    });
    const v = rule.evaluate(curr, prev);
    expect(v?.severity).toBe('critical');
    expect(v?.evidence.ruleId).toBe('severity-escalation');
  });

  it('fires warn when prev had no warn and curr does (no critical)', () => {
    const rule = createSeverityEscalationRule();
    const prev = profile({
      severityCounts: { info: 5, warn: 0, critical: 0 },
    });
    const curr = profile({
      severityCounts: { info: 5, warn: 1, critical: 0 },
    });
    expect(rule.evaluate(curr, prev)?.severity).toBe('warn');
  });

  it('returns null when severity unchanged', () => {
    const rule = createSeverityEscalationRule();
    const p = profile({
      severityCounts: { info: 5, warn: 1, critical: 0 },
    });
    expect(rule.evaluate(p, p)).toBeNull();
  });

  it('treats null prev as zero severity counts', () => {
    const rule = createSeverityEscalationRule();
    const curr = profile({
      severityCounts: { info: 0, warn: 0, critical: 1 },
    });
    expect(rule.evaluate(curr, null)?.severity).toBe('critical');
  });
});

describe('multi-source rule', () => {
  it('returns null below threshold', () => {
    const rule = createMultiSourceRule({ threshold: 3 });
    const p = profile({ sources: { a: 1, b: 1 } });
    expect(rule.evaluate(p, null)).toBeNull();
  });

  it('fires at threshold with distinct sources', () => {
    const rule = createMultiSourceRule({ threshold: 3 });
    const p = profile({ sources: { a: 1, b: 2, c: 1 } });
    const v = rule.evaluate(p, null);
    expect(v?.severity).toBe('warn');
    expect(v?.evidence.counters.distinctSources).toBe(3);
  });

  it('ignores zero-count sources', () => {
    const rule = createMultiSourceRule({ threshold: 3 });
    const p = profile({ sources: { a: 1, b: 0, c: 1 } });
    expect(rule.evaluate(p, null)).toBeNull();
  });

  it('runs in both on-mutation and sweep mode', () => {
    expect(createMultiSourceRule().mode).toBe('both');
  });
});

describe('repeat-offender rule', () => {
  it('returns null when span shorter than minSpanMs', () => {
    const rule = createRepeatOffenderRule({
      minSpanMs: 24 * 60 * 60_000,
      minSignalCount: 1,
    });
    const p = profile({
      firstSeen: '2026-06-19T00:00:00.000Z',
      lastSeen: '2026-06-19T01:00:00.000Z',
      signalCount: 50,
    });
    expect(rule.evaluate(p, null)).toBeNull();
  });

  it('returns null when signalCount below minSignalCount', () => {
    const rule = createRepeatOffenderRule({
      minSpanMs: 60_000,
      minSignalCount: 10,
    });
    const p = profile({
      firstSeen: '2026-06-19T00:00:00.000Z',
      lastSeen: '2026-06-19T01:00:00.000Z',
      signalCount: 3,
    });
    expect(rule.evaluate(p, null)).toBeNull();
  });

  it('fires when both span and signalCount thresholds met', () => {
    const rule = createRepeatOffenderRule({
      minSpanMs: 60_000,
      minSignalCount: 10,
    });
    const p = profile({
      firstSeen: '2026-06-19T00:00:00.000Z',
      lastSeen: '2026-06-19T02:00:00.000Z',
      signalCount: 25,
    });
    const v = rule.evaluate(p, null);
    expect(v?.severity).toBe('warn');
    expect(v?.evidence.ruleId).toBe('repeat-offender');
  });

  it('runs in sweep mode', () => {
    expect(createRepeatOffenderRule().mode).toBe('sweep');
  });
});
