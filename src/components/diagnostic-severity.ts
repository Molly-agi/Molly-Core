/**
 * @fileOverview Severity computation for Molly's runtime diagnostics.
 *
 * Pure function that evaluates a RuntimeSnapshot and returns
 * per-subsystem and overall severity levels.
 */

import type { RuntimeSnapshot } from '@/ai/tools/runtime-snapshot';

export type Severity = 'ok' | 'degraded' | 'critical';

export interface SeverityResult {
  overall: Severity;
  circuit: Severity;
  memory: Severity;
  cpu: Severity;
  rateLimiter: Severity;
}

/** Compute overall severity from snapshot subsystems. */
export function computeSeverity(snap: RuntimeSnapshot): SeverityResult {
  // Circuit breaker severity
  const circuitState = snap.circuitBreaker?.globalState;
  const openOps = snap.circuitBreaker?.openOperations?.length ?? 0;
  const circuit: Severity =
    circuitState === 'OPEN' || openOps >= 3
      ? 'critical'
      : circuitState === 'HALF_OPEN' || openOps > 0
        ? 'degraded'
        : 'ok';

  // Memory health severity
  const memStatus = snap.memoryHealth?.status;
  const memory: Severity =
    memStatus === 'unavailable' ||
    (snap.memoryHealth?.invalidChecksums ?? 0) > 2
      ? 'critical'
      : memStatus === 'degraded' ||
          (snap.memoryHealth?.invalidChecksums ?? 0) > 0
        ? 'degraded'
        : 'ok';

  // CPU severity
  const cpuUsage = snap.systemHealth?.cpuUsage;
  const sysStatus = snap.systemHealth?.status;
  const cpu: Severity =
    sysStatus === 'degraded' || (cpuUsage != null && cpuUsage > 90)
      ? 'critical'
      : cpuUsage != null && cpuUsage > 70
        ? 'degraded'
        : 'ok';

  // Rate limiter severity
  const pctUsed = snap.rateLimiter?.percentageUsed ?? 0;
  const rateLimiter: Severity =
    pctUsed > 90 ? 'critical' : pctUsed > 70 ? 'degraded' : 'ok';

  // Overall: worst of all subsystems
  const all = [circuit, memory, cpu, rateLimiter];
  const overall: Severity = all.includes('critical')
    ? 'critical'
    : all.includes('degraded')
      ? 'degraded'
      : 'ok';

  return { overall, circuit, memory, cpu, rateLimiter };
}
