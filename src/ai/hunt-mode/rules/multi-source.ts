import type { AttackerProfile } from '../profile';
import type { HuntRule, RuleVerdict } from './types';

export interface MultiSourceOptions {
  threshold?: number;
  cooldownMs?: number;
}

const DEFAULTS = {
  threshold: 3,
  cooldownMs: 5 * 60_000,
};

export function createMultiSourceRule(opts: MultiSourceOptions = {}): HuntRule {
  const threshold = opts.threshold ?? DEFAULTS.threshold;
  const cooldownMs = opts.cooldownMs ?? DEFAULTS.cooldownMs;

  return {
    id: 'multi-source-convergence',
    cooldownMs,
    mode: 'both',
    evaluate(curr: AttackerProfile): RuleVerdict | null {
      const distinctSources = Object.keys(curr.sources).filter(
        (k) => (curr.sources[k] ?? 0) > 0
      ).length;
      if (distinctSources < threshold) return null;
      return {
        severity: 'warn',
        summary: `multi-source convergence: ${distinctSources} sources (threshold ${threshold})`,
        evidence: {
          ruleId: 'multi-source-convergence',
          profileKey: curr.key,
          counters: {
            distinctSources,
            threshold,
            signalCount: curr.signalCount,
          },
        },
      };
    },
  };
}
