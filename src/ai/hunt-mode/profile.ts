import type { ThreatSeverity } from '../threat-monitor/signal-bus';
import type { IdentifierFields } from './identity';

export interface AttackerProfile {
  key: string;
  firstSeen: string;
  lastSeen: string;
  confidence: number;
  signalCount: number;
  severityCounts: Record<ThreatSeverity, number>;
  sources: Record<string, number>;
  routes: Record<string, number>;
  fields: IdentifierFields;
  recent: ProfileEventRef[];
}

export interface ProfileEventRef {
  timestamp: string;
  source: string;
  severity: ThreatSeverity;
  summary: string;
}

export type ProfileMutation =
  | { kind: 'create'; profile: AttackerProfile }
  | {
      kind: 'update';
      key: string;
      patch: Partial<AttackerProfile> & { lastSeen: string };
      event: ProfileEventRef;
    };

export const MAX_RECENT_EVENTS = 20;

export function emptySeverityCounts(): Record<ThreatSeverity, number> {
  return { info: 0, warn: 0, critical: 0 };
}
