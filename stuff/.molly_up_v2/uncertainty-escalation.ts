/**
 * Uncertainty-Gated Escalation
 * ------------------------------------------------------------------
 * Decides, for a single intended action, whether Molly is sure enough
 * to proceed alone, must stop, or should escalate to a human first.
 *
 * The core idea: confidence is judged against a bar that SCALES WITH
 * RISK. A cheap, reversible, low-sensitivity action (type into a notes
 * field) clears a low bar; an irreversible or sensitive one (send money,
 * delete data, act in a denylisted app) must clear a much higher bar or
 * is refused outright. Same confidence, different outcome — because the
 * cost of being wrong is different.
 *
 * Output is a GateDecision compatible with the provenance log, so every
 * call lands on a decision span with its reasoning. Thresholds come from
 * a config object the caller can source from the parameter registry, so
 * they're tunable live from the admin window.
 *
 * This is the "wide latitude, human on the high-stakes path" line made
 * mechanical: it does not decide WHETHER to act (arbitration/planning do
 * that) — it decides whether acting needs a human, based on confidence
 * and stakes. Pure, dependency-free.
 */

import type { GateDecision } from '../provenance/provenance-log';

export interface ActionRisk {
  /** 0..1 — how irreversible. 1 = cannot be undone (sent money, deleted). */
  irreversibility: number;
  /** 0..1 — how sensitive the surface is (financial, private, destructive). */
  sensitivity: number;
  /** 0..1 — blast radius if wrong (affects others / wide vs. local). */
  impact: number;
}

export interface EscalationConfig {
  /** Base confidence required for the lowest-risk action (0..1). */
  baseThreshold: number;
  /** How steeply the required confidence rises with risk (0..1+). */
  riskSensitivity: number;
  /**
   * If required confidence would exceed this ceiling, the action is too
   * risky to ever auto-allow — it always requires confirmation (or block).
   */
  autoAllowCeiling: number;
  /**
   * Margin below the required threshold within which we ask for
   * confirmation rather than hard-blocking. Below (threshold - band)
   * the action is blocked outright.
   */
  confirmBand: number;
  /**
   * Risk at/above this is never auto-allowed regardless of confidence —
   * always at least confirm-required. The hard safety floor.
   */
  alwaysConfirmRiskFloor: number;
  /**
   * When a human IS needed, ambiguity at/above this routes to an open
   * GUIDANCE request ("how should I approach this?") instead of a yes/no
   * CONFIRM. Tunable: lower it for more open questions, raise it for more
   * quick confirms. This is the "confirm vs. guidance" temperament dial.
   */
  guidanceAmbiguityThreshold: number;
}

export const DEFAULT_ESCALATION: EscalationConfig = {
  baseThreshold: 0.55,
  riskSensitivity: 0.4,
  autoAllowCeiling: 0.95,
  confirmBand: 0.25,
  alwaysConfirmRiskFloor: 0.7,
  guidanceAmbiguityThreshold: 0.5,
};

/** When a human is in the loop, what kind of touch is being asked for. */
export type EscalationMode = 'confirm' | 'guidance';

export interface EscalationInput {
  /** Molly's confidence this action is correct/appropriate (0..1). */
  confidence: number;
  /**
   * How under-specified / multi-path the situation is (0..1). High means
   * "there are several valid approaches and I'm unsure which you'd want"
   * rather than "I have one action and I'm just not sure about it."
   * Defaults to low (0.2) — a plain confidence dip is a confirm, not a
   * guidance request, unless ambiguity is explicitly high.
   */
  ambiguity?: number;
  risk: ActionRisk;
}

export interface EscalationResult {
  decision: GateDecision; // 'allow' | 'block' | 'confirm-required'
  /**
   * When decision is 'confirm-required', which kind of human touch:
   * 'confirm' = yes/no on a specific action; 'guidance' = open question
   * whose answer feeds back into planning. Undefined for allow/block.
   */
  mode?: EscalationMode;
  reason: string;
  /** The confidence bar this action had to clear, after risk scaling. */
  requiredConfidence: number;
  /** Aggregate 0..1 risk score used. */
  riskScore: number;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Aggregate the three risk dimensions. Irreversibility weighted highest. */
export function riskScore(r: ActionRisk): number {
  const ir = clamp01(r.irreversibility);
  const se = clamp01(r.sensitivity);
  const im = clamp01(r.impact);
  // Weighted, then nudged up if multiple dimensions are high (compounding risk).
  const base = 0.45 * ir + 0.3 * se + 0.25 * im;
  const compounding = ir * se * im * 0.15;
  return clamp01(base + compounding);
}

export function evaluateEscalation(
  input: EscalationInput,
  config: Partial<EscalationConfig> = {},
): EscalationResult {
  const c: EscalationConfig = { ...DEFAULT_ESCALATION, ...config };
  const conf = clamp01(input.confidence);
  const ambiguity = clamp01(input.ambiguity ?? 0.2);
  const risk = riskScore(input.risk);

  // Required confidence rises with risk.
  const required = clamp01(c.baseThreshold + c.riskSensitivity * risk);

  // Hard floor: very risky actions are never auto-allowed.
  const mustConfirmByRisk = risk >= c.alwaysConfirmRiskFloor;
  // Risk so high its required confidence exceeds the auto-allow ceiling.
  const exceedsCeiling = required > c.autoAllowCeiling;

  if (!mustConfirmByRisk && !exceedsCeiling && conf >= required) {
    return {
      decision: 'allow',
      reason: `confidence ${conf.toFixed(2)} ≥ required ${required.toFixed(2)} at risk ${risk.toFixed(2)}`,
      requiredConfidence: required,
      riskScore: risk,
    };
  }

  // Not auto-allowed. Confirm if reasonably close OR risk-floored; else block.
  const withinConfirmBand = conf >= required - c.confirmBand;
  if (mustConfirmByRisk || exceedsCeiling || withinConfirmBand) {
    // A human is needed. Which kind of touch? Ambiguity decides.
    const mode: EscalationMode = ambiguity >= c.guidanceAmbiguityThreshold ? 'guidance' : 'confirm';
    const base = mustConfirmByRisk
      ? `risk ${risk.toFixed(2)} ≥ floor ${c.alwaysConfirmRiskFloor} — human in the loop required regardless of confidence`
      : exceedsCeiling
        ? `required confidence ${required.toFixed(2)} exceeds auto-allow ceiling — human in the loop`
        : `confidence ${conf.toFixed(2)} below required ${required.toFixed(2)} but within band — escalating`;
    const modeNote =
      mode === 'guidance'
        ? `; ambiguity ${ambiguity.toFixed(2)} ≥ ${c.guidanceAmbiguityThreshold} → open GUIDANCE request`
        : `; ambiguity ${ambiguity.toFixed(2)} < ${c.guidanceAmbiguityThreshold} → yes/no CONFIRM`;
    return {
      decision: 'confirm-required',
      mode,
      reason: base + modeNote,
      requiredConfidence: required,
      riskScore: risk,
    };
  }

  return {
    decision: 'block',
    reason: `confidence ${conf.toFixed(2)} far below required ${required.toFixed(2)} (band ${c.confirmBand}) at risk ${risk.toFixed(2)}`,
    requiredConfidence: required,
    riskScore: risk,
  };
}

/** Convenience presets for common action shapes. */
export const RISK_PRESETS = {
  readonlyLocal: { irreversibility: 0, sensitivity: 0.1, impact: 0.1 } as ActionRisk,
  reversibleUi: { irreversibility: 0.2, sensitivity: 0.2, impact: 0.2 } as ActionRisk,
  sendMessage: { irreversibility: 0.7, sensitivity: 0.4, impact: 0.5 } as ActionRisk,
  financial: { irreversibility: 0.95, sensitivity: 0.95, impact: 0.8 } as ActionRisk,
  destructive: { irreversibility: 1, sensitivity: 0.8, impact: 0.7 } as ActionRisk,
};
