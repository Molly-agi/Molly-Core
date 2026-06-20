import type { AttackerProfile } from '../profile';
import type { ThreatSeverity } from '../../threat-monitor/signal-bus';

export interface RuleVerdict {
  severity: ThreatSeverity;
  summary: string;
  evidence: {
    ruleId: string;
    profileKey: string;
    counters: Record<string, number>;
  };
}

export type HuntRuleMode = 'on-mutation' | 'sweep' | 'both';

export interface HuntRule {
  readonly id: string;
  readonly cooldownMs: number;
  readonly mode: HuntRuleMode;
  evaluate(
    curr: AttackerProfile,
    prev: AttackerProfile | null
  ): RuleVerdict | null;
}
