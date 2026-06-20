import type { AttackerProfile } from '../profile';
import type { HuntRule, RuleVerdict } from './types';

export interface SeverityEscalationOptions {
  cooldownMs?: number;
}

const DEFAULTS = {
  cooldownMs: 0,
};

export function createSeverityEscalationRule(
  opts: SeverityEscalationOptions = {}
): HuntRule {
  const cooldownMs = opts.cooldownMs ?? DEFAULTS.cooldownMs;

  return {
    id: 'severity-escalation',
    cooldownMs,
    mode: 'on-mutation',
    evaluate(
      curr: AttackerProfile,
      prev: AttackerProfile | null
    ): RuleVerdict | null {
      const prevCrit = prev?.severityCounts.critical ?? 0;
      const prevWarn = prev?.severityCounts.warn ?? 0;
      const currCrit = curr.severityCounts.critical;
      const currWarn = curr.severityCounts.warn;

      if (prevCrit === 0 && currCrit > 0) {
        return {
          severity: 'critical',
          summary: 'severity escalated to critical',
          evidence: {
            ruleId: 'severity-escalation',
            profileKey: curr.key,
            counters: {
              prevCritical: prevCrit,
              currCritical: currCrit,
              prevWarn,
              currWarn,
            },
          },
        };
      }

      if (prevWarn === 0 && currWarn > 0) {
        return {
          severity: 'warn',
          summary: 'severity escalated to warn',
          evidence: {
            ruleId: 'severity-escalation',
            profileKey: curr.key,
            counters: {
              prevWarn,
              currWarn,
              prevCritical: prevCrit,
              currCritical: currCrit,
            },
          },
        };
      }

      return null;
    },
  };
}
