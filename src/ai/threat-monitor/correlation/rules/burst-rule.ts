import type { CorrelationRule } from '../correlation-engine';
import type { ThreatSignal } from '../../signal-bus';

const DEFAULT_THRESHOLD = 8;

export function createBurstRule(
  threshold: number = DEFAULT_THRESHOLD
): CorrelationRule {
  return {
    name: 'burst',
    cooldownMs: 30_000,
    evaluate(window: ThreatSignal[]) {
      const counts = new Map<string, number>();
      for (const s of window)
        counts.set(s.source, (counts.get(s.source) ?? 0) + 1);

      let topSource: string | null = null;
      let topCount = 0;
      for (const [src, count] of counts) {
        if (count > topCount) {
          topSource = src;
          topCount = count;
        }
      }

      if (!topSource || topCount < threshold) return null;

      return {
        severity: 'warn',
        timestamp: new Date().toISOString(),
        summary: `burst: ${topCount} signals from ${topSource} in window`,
        evidence: { source: topSource, count: topCount, threshold },
      };
    },
  };
}
