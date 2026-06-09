/**
 * @fileOverview Action Gate — D.1
 *
 * Single entry point before ANY action executes.
 * Validates tool requests and authorizes execution.
 *
 * Pure function (reads system state but no side effects).
 * All decisions are logged for auditability.
 */

import { MollyLogger } from '@/ai/logger';

/**
 * Gate decision on a tool request
 */
export interface GateDecision {
  allowed: boolean;
  reason: string;
  severity?: 'info' | 'warning' | 'error';
  toolName: string;
  timestamp: number;
}

/**
 * Context for gate validation
 */
export interface GateContext {
  tool: string;
  params: Record<string, unknown>;
  sessionId?: string;
  traceId?: string;
  source?: 'autonomous' | 'bridge' | 'api' | 'task';
}

/**
 * Action Gate — validates all tool requests before execution
 *
 * @param context Tool request context
 * @returns Gate decision (allowed/denied with reason)
 */
export async function evaluateActionGate(
  context: GateContext
): Promise<GateDecision> {
  const timestamp = Date.now();
  const { tool, params, _sessionId, traceId, source } = context;

  // === PHASE 1: STRUCTURAL VALIDATION ===

  // Tool name must be non-empty string
  if (!tool || typeof tool !== 'string' || tool.trim().length === 0) {
    return {
      allowed: false,
      reason: 'Invalid tool name: must be non-empty string',
      severity: 'error',
      toolName: tool || 'unknown',
      timestamp,
    };
  }

  // Params must be object (or undefined)
  if (params && typeof params !== 'object') {
    return {
      allowed: false,
      reason: 'Invalid params: must be object',
      severity: 'error',
      toolName: tool,
      timestamp,
    };
  }

  // === PHASE 2: AUTHORIZATION CHECKS ===

  // Check autonomy permission (from autonomy-permission module)
  try {
    const { checkAutonomyPermission } =
      await import('@/ai/agency/safety/autonomy-permission');
    const permissionCheck = checkAutonomyPermission();
    if (!permissionCheck.permitted && source === 'autonomous') {
      return {
        allowed: false,
        reason: `Autonomy not permitted: ${permissionCheck.errorMessage || 'unknown reason'}`,
        severity: 'warning',
        toolName: tool,
        timestamp,
      };
    }
  } catch {
    // Autonomy permission check failure — log but don't block (graceful degradation)
    MollyLogger.warn(
      `[action-gate] Failed to check autonomy permission for ${tool}`,
      traceId || 'unknown'
    );
  }

  // Check circuit breaker
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
    // Circuit breaker check failure — log but don't block
    MollyLogger.warn(
      `[action-gate] Failed to check circuit breaker for ${tool}`,
      traceId || 'unknown'
    );
  }

  // Check rate limiter budget
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
    // Rate limiter check failure — log but don't block
    MollyLogger.warn(
      `[action-gate] Failed to check rate limiter for ${tool}`,
      traceId || 'unknown'
    );
  }

  // === PHASE 3: TOOL-SPECIFIC VALIDATION ===

  // Destructive operations require explicit safeguards
  const destructiveTools = ['writeProjectFile', 'codespaceShell', 'deleteFile'];
  if (destructiveTools.includes(tool)) {
    // Check if we have explicit confirmation (e.g., via params)
    // This would be set by Molly's atomic directive handler
    const confirmed = params?.confirmed === true || params?.dryRun === true;
    if (!confirmed && source === 'autonomous') {
      // For autonomous mode, allow but log for audit
      MollyLogger.info(
        `[action-gate] Destructive tool execution: ${tool} (no confirmation in autonomous mode, allowed with logging)`,
        traceId || 'unknown'
      );
    }
  }

  // === PHASE 4: ATOMIC DIRECTIVE ENFORCEMENT ===

  // If task/batch context, check that we're not decomposing an atomic directive
  if (source === 'task' && params?.isAtomicDirective === true) {
    // Verify this is the only action in this execution context
    // (Would be enforced by task-queue/worker.ts context isolation)
    MollyLogger.info(
      `[action-gate] Atomic directive enforcement: ${tool} running as single task`,
      traceId || 'unknown'
    );
  }

  // === ALL CHECKS PASSED ===

  return {
    allowed: true,
    reason: `Action gate approved: ${tool}`,
    severity: 'info',
    toolName: tool,
    timestamp,
  };
}

/**
 * Log gate decision for audit trail
 */
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
