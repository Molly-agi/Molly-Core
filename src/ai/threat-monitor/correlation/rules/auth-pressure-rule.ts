import type { CorrelationRule } from '../correlation-engine';
import type { ThreatSignal } from '../../signal-bus';

const REQUIRED_SOURCES = [
  'quarantine-ledger',
  'admin-audit',
  'agent-registry',
] as const;

export function createAuthPressureRule(): CorrelationRule {
  return {
    name: 'auth-pressure',
    cooldownMs: 60_000,
    evaluate(window: ThreatSignal[]) {
      const quarantines = window.filter(
        (s) => s.source === 'quarantine-ledger'
      );
      const adminFailures = window.filter(
        (s) =>
          s.source === 'admin-audit' &&
          (s.evidence as { success?: boolean })?.success === false
      );
      const registryChanges = window.filter(
        (s) => s.source === 'agent-registry'
      );

      if (
        quarantines.length === 0 ||
        adminFailures.length === 0 ||
        registryChanges.length === 0
      ) {
        return null;
      }

      return {
        severity: 'critical',
        timestamp: new Date().toISOString(),
        summary: `auth-pressure: ${quarantines.length} quarantine + ${adminFailures.length} admin-fail + ${registryChanges.length} registry-change in window`,
        evidence: {
          requiredSources: REQUIRED_SOURCES,
          counts: {
            quarantines: quarantines.length,
            adminFailures: adminFailures.length,
            registryChanges: registryChanges.length,
          },
        },
      };
    },
  };
}
