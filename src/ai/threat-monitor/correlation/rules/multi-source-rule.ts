import type { CorrelationRule } from '../correlation-engine';
import type { ThreatSignal } from '../../signal-bus';

const DEFAULT_DISTINCT_SOURCES = 4;

export function createMultiSourceRule(
  distinctSources: number = DEFAULT_DISTINCT_SOURCES
): CorrelationRule {
  return {
    name: 'multi-source',
    cooldownMs: 30_000,
    evaluate(window: ThreatSignal[]) {
      const sources = new Set(window.map((s) => s.source));
      if (sources.size < distinctSources) return null;

      const elevated = window.some(
        (s) => s.severity === 'warn' || s.severity === 'critical'
      );

      return {
        severity: elevated ? 'critical' : 'warn',
        timestamp: new Date().toISOString(),
        summary: `multi-source: ${sources.size} distinct sources active in window`,
        evidence: {
          sources: Array.from(sources),
          windowSize: window.length,
          elevated,
        },
      };
    },
  };
}
