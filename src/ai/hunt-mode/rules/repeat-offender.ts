import type { AttackerProfile } from '../profile';
import type { HuntRule, RuleVerdict } from './types';

export interface RepeatOffenderOptions {
  minSpanMs?: number;
  minSignalCount?: number;
  cooldownMs?: number;
}

const DEFAULTS = {
  minSpanMs: 24 * 60 * 60_000,
  minSignalCount: 10,
  cooldownMs: 60 * 60_000,
};

export function createRepeatOffenderRule(
  opts: RepeatOffenderOptions = {}
): HuntRule {
  const minSpanMs = opts.minSpanMs ?? DEFAULTS.minSpanMs;
  const minSignalCount = opts.minSignalCount ?? DEFAULTS.minSignalCount;
  const cooldownMs = opts.cooldownMs ?? DEFAULTS.cooldownMs;

  return {
    id: 'repeat-offender',
    cooldownMs,
    mode: 'sweep',
    evaluate(curr: AttackerProfile): RuleVerdict | null {
      const first = Date.parse(curr.firstSeen);
      const last = Date.parse(curr.lastSeen);
      if (Number.isNaN(first) || Number.isNaN(last)) return null;
      const span = last - first;
      if (span < minSpanMs) return null;
      if (curr.signalCount < minSignalCount) return null;
      return {
        severity: 'warn',
        summary: `repeat offender: ${curr.signalCount} signals over ${Math.floor(span / 60_000)}min`,
        evidence: {
          ruleId: 'repeat-offender',
          profileKey: curr.key,
          counters: {
            spanMs: span,
            minSpanMs,
            signalCount: curr.signalCount,
            minSignalCount,
          },
        },
      };
    },
  };
}
