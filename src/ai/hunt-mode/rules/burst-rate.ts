import type { AttackerProfile } from '../profile';
import type { HuntRule, RuleVerdict } from './types';

export interface BurstRateOptions {
  windowMs?: number;
  threshold?: number;
  cooldownMs?: number;
  now?: () => number;
}

const DEFAULTS = {
  windowMs: 60_000,
  threshold: 5,
  cooldownMs: 60_000,
};

export function createBurstRateRule(opts: BurstRateOptions = {}): HuntRule {
  const windowMs = opts.windowMs ?? DEFAULTS.windowMs;
  const threshold = opts.threshold ?? DEFAULTS.threshold;
  const cooldownMs = opts.cooldownMs ?? DEFAULTS.cooldownMs;
  const now = opts.now ?? (() => Date.now());

  return {
    id: 'burst-rate',
    cooldownMs,
    mode: 'on-mutation',
    evaluate(curr: AttackerProfile): RuleVerdict | null {
      if (curr.recent.length < threshold) return null;
      const head = curr.recent.slice(0, threshold);
      const newest = Date.parse(head[0].timestamp);
      const oldest = Date.parse(head[head.length - 1].timestamp);
      if (Number.isNaN(newest) || Number.isNaN(oldest)) return null;
      const span = newest - oldest;
      if (span < 0 || span > windowMs) return null;
      // sanity: don't fire on events from the future relative to now()
      if (newest - now() > windowMs) return null;
      return {
        severity: 'warn',
        summary: `burst: ${threshold} events within ${span}ms (window ${windowMs}ms)`,
        evidence: {
          ruleId: 'burst-rate',
          profileKey: curr.key,
          counters: {
            windowMs,
            threshold,
            spanMs: span,
            recentLen: curr.recent.length,
          },
        },
      };
    },
  };
}
