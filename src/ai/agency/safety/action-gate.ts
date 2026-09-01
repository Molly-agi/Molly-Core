/**
 * @fileOverview Action Gate — D.1
 *
 * Live valve in front of executeTool. Heart Gate is NOT wired here and must
 * not be reconnected until it can fail closed on real intents.
 *
 * What this file actually does:
 *   1. Structural validation (tool name + params shape)
 *   2. Circuit breaker + rate limiter (fail closed if those modules throw)
 *   3. Destructive-tool confirmation when source === 'autonomous'
 *   4. Atomic-directive logging for task source
 *
 * What this file does not do (do not document as if it does):
 *   denylist, soft-refusal, escalation matrix, Heart Gate moral check
 */

import { MollyLogger } from '@/ai/logger';

export interface GateDecision {
  allowed: boolean;
  reason: string;
  severity?: 'info' | 'warning' | 'error';
  toolName: string;
  timestamp: number;
}

export interface GateContext {
  tool: string;
  params: Record<string, unknown>;
  sessionId?: string;
  traceId?: string;
  source?: 'autonomous' | 'bridge' | 'api' | 'task';
}

const DESTRUCTIVE_TOOLS = ['writeProjectFile', 'codespaceShell', 'deleteFile'];

export async function evaluateActionGate(
  context: GateContext
): Promise<GateDecision> {
  const timestamp = Date.now();
  const { tool, params, traceId, source } = context;

  if (!tool || typeof tool !== 'string' || tool.trim().length === 0) {
    return {
      allowed: false,
      reason: 'Invalid tool name: must be non-empty string',
      severity: 'error',
      toolName: tool || 'unknown',
      timestamp,
    };
  }

  if (params && typeof params !== 'object') {
    return {
      allowed: false,
      reason: 'Invalid params: must be object',
      severity: 'error',
      toolName: tool,
      timestamp,
    };
  }

  try {
    const { getCircuitBreaker, CircuitState } =
      await import('@/ai/tools/circuit-breaker');
    const cb = getCircuitBreaker();
    if (cb.getState() === CircuitState.OPEN) {
      return {
        allowed: false,
        reason: 'Circuit breaker is open — system under stress',
        severity: 'warning',
        toolName: tool,
        timestamp,
      };
    }
  } catch {
    MollyLogger.warn(
      `[action-gate] Circuit breaker check failed — denying ${tool} for safety`,
      traceId || 'unknown'
    );
    return {
      allowed: false,
      reason: 'Circuit breaker check unavailable — denied for safety',
      severity: 'error',
      toolName: tool,
      timestamp,
    };
  }

  try {
    const { getRateLimiter } = await import('@/ai/tools/rate-limiter');
    const rateLimiter = getRateLimiter();
    const rlStatus = rateLimiter.getStatus();
    if (rlStatus.percentageUsed > 85) {
      return {
        allowed: false,
        reason: `Rate limit budget exhausted (${rlStatus.percentageUsed}% used)`,
        severity: 'warning',
        toolName: tool,
        timestamp,
      };
    }
  } catch {
    MollyLogger.warn(
      `[action-gate] Rate limiter check failed — denying ${tool} for safety`,
      traceId || 'unknown'
    );
    return {
      allowed: false,
      reason: 'Rate limiter check unavailable — denied for safety',
      severity: 'error',
      toolName: tool,
      timestamp,
    };
  }

  if (DESTRUCTIVE_TOOLS.includes(tool)) {
    const confirmed = params?.confirmed === true || params?.dryRun === true;
    if (!confirmed && source === 'autonomous') {
      MollyLogger.warn(
        `[action-gate] Denied autonomous destructive tool ${tool} without confirmed/dryRun`,
        traceId || 'unknown'
      );
      return {
        allowed: false,
        reason:
          'Autonomous destructive tool requires params.confirmed or params.dryRun',
        severity: 'warning',
        toolName: tool,
        timestamp,
      };
    }
  }

  if (source === 'task' && params?.isAtomicDirective === true) {
    MollyLogger.info(
      `[action-gate] Atomic directive enforcement: ${tool} running as single task`,
      traceId || 'unknown'
    );
  }

  return {
    allowed: true,
    reason: `Action gate approved: ${tool}`,
    severity: 'info',
    toolName: tool,
    timestamp,
  };
}

export function logGateDecision(
  decision: GateDecision,
  traceId?: string
): void {
  const msg = `[action-gate] ${decision.toolName}: ${decision.allowed ? 'ALLOWED' : 'DENIED'} — ${decision.reason}`;
  if (decision.allowed) {
    MollyLogger.info(msg, traceId || 'unknown');
  } else {
    MollyLogger.warn(msg, traceId || 'unknown');
  }
}
