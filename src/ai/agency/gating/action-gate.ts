/**
 * @fileOverview Action Gate (D.1)
 *
 * Single entry point before any action executes.
 * Validates intent, checks denylist, evaluates uncertainty, maps to provenance.
 *
 * Pure function. No side effects (except provenance tracing).
 * All decisions logged for audit trail.
 *
 * Molly's requirement: soft-refusal state for ambiguous low-confidence inputs
 * to prevent recursive deadlock in security kernel.
 */

import { MollyLogger } from '@/ai/logger';

/**
 * Intent describing a proposed action
 */
export interface ActionIntent {
  type: string;                    // e.g. "tool_call", "reflection", "memory_write"
  target: string;                  // what/who is affected
  payload: Record<string, unknown>; // action parameters
  confidence: number;              // 0-1, how sure Molly is
  ambiguity: number;               // 0-1, how uncertain about interpretation
  risk: number;                    // 0-1, potential harm if wrong
}

/**
 * Gate decision modes
 */
export type GateMode = 'allow' | 'block' | 'confirm' | 'guidance' | 'soft-refuse';

/**
 * Gate outcome with decision and reasoning
 */
export interface GateOutcome {
  decision: GateMode;
  reason: string;
  actionSpanId: string;            // for provenance tracing
  suggestedConfidence?: number;    // if soft-refuse or guidance
  recoveryPath?: string;           // how to reframe the intent
}

/**
 * Trace interface for provenance logging
 */
export interface Trace {
  action(label: string, payload: Record<string, unknown>): string;
  decision(spanId: string, decision: GateMode, reason: string): void;
}

/**
 * Registry interface (passed in for tunables)
 */
export interface GateRegistry {
  getParam(key: string): unknown;
  getOwner(key: string): string | null;
}

/**
 * Action Gate — single entry point before action execution
 *
 * Contract:
 *   1. Check denylist (registry param 'gate.denylistedTargets')
 *   2. If ambiguous + low-confidence → soft-refuse with recovery path
 *   3. Run uncertainty-escalation evaluation
 *   4. Map to provenance decision span
 *   5. Return { decision, mode?, reason, actionSpanId }
 *
 * Does NOT execute the action; only decides + records.
 */
export function evaluateActionGate(
  intent: ActionIntent,
  ctx: {
    trace: Trace;
    registry: GateRegistry;
    uncertaintyEscalation: (
      confidence: number,
      ambiguity: number,
      risk: number
    ) => GateMode;
  }
): GateOutcome {
  // === PHASE 1: STRUCTURAL VALIDATION ===

  if (!intent || typeof intent !== 'object') {
    const spanId = ctx.trace.action('gate-structural-validation', {});
    const reason = 'Invalid intent: must be an object';
    ctx.trace.decision(spanId, 'block', reason);
    return {
      decision: 'block',
      reason,
      actionSpanId: spanId,
    };
  }

  if (!intent.type || typeof intent.type !== 'string') {
    const spanId = ctx.trace.action('gate-structural-validation', intent);
    const reason = 'Invalid intent.type: must be non-empty string';
    ctx.trace.decision(spanId, 'block', reason);
    return {
      decision: 'block',
      reason,
      actionSpanId: spanId,
    };
  }

  // === PHASE 2: DENYLIST CHECK ===

  const spanId = ctx.trace.action('gate-denylist', {
    target: intent.target,
    type: intent.type,
  });

  let denylist: string[] = [];
  try {
    const raw = ctx.registry.getParam('gate.denylistedTargets');
    if (Array.isArray(raw)) {
      denylist = raw;
    }
  } catch {
    MollyLogger.warn('[action-gate] Failed to fetch denylist', spanId);
  }

  if (denylist.includes(intent.target)) {
    const reason = `Target "${intent.target}" is denylisted`;
    ctx.trace.decision(spanId, 'block', reason);
    return {
      decision: 'block',
      reason,
      actionSpanId: spanId,
    };
  }

  // === PHASE 3: SOFT-REFUSAL FOR AMBIGUOUS LOW-CONFIDENCE ===
  // Molly's requirement: prevent treating ambiguity as bypass attempt

  const ambiguityThreshold = 0.6; // tunable
  const confidenceThreshold = 0.4;

  if (
    intent.ambiguity > ambiguityThreshold &&
    intent.confidence < confidenceThreshold
  ) {
    const reason = `Soft-refuse: ambiguity ${intent.ambiguity.toFixed(2)} too high, confidence ${intent.confidence.toFixed(2)} too low. Reframe intent with more context.`;
    ctx.trace.decision(spanId, 'soft-refuse', reason);

    return {
      decision: 'soft-refuse',
      reason,
      actionSpanId: spanId,
      suggestedConfidence: confidenceThreshold,
      recoveryPath: `Clarify target: ${intent.target}. Provide explicit context.`,
    };
  }

  // === PHASE 4: UNCERTAINTY ESCALATION ===

  const escalationDecision = ctx.uncertaintyEscalation(
    intent.confidence,
    intent.ambiguity,
    intent.risk
  );

  if (escalationDecision === 'block') {
    const reason = `Uncertainty escalation blocked: confidence ${intent.confidence.toFixed(2)}, ambiguity ${intent.ambiguity.toFixed(2)}, risk ${intent.risk.toFixed(2)}`;
    ctx.trace.decision(spanId, 'block', reason);
    return {
      decision: 'block',
      reason,
      actionSpanId: spanId,
    };
  }

  // === PHASE 5: PROVENANCE SPAN MAPPING ===

  let finalDecision = escalationDecision as GateMode;
  let finalReason = `Gate approved: ${escalationDecision} mode. Confidence: ${intent.confidence.toFixed(2)}, Ambiguity: ${intent.ambiguity.toFixed(2)}, Risk: ${intent.risk.toFixed(2)}`;

  ctx.trace.decision(spanId, finalDecision, finalReason);

  return {
    decision: finalDecision,
    reason: finalReason,
    actionSpanId: spanId,
  };
}
