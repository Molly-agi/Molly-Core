import {
  evaluateEscalation,
  riskScore,
  RISK_PRESETS,
  DEFAULT_ESCALATION,
} from '../uncertainty-escalation';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg);
}

// 1. Low-risk, reversible action with decent confidence → allowed.
let r = evaluateEscalation({ confidence: 0.7, risk: RISK_PRESETS.reversibleUi });
assert(r.decision === 'allow', 'reversible UI action with 0.7 conf is allowed');

// 2. Same confidence, financial action → NOT allowed (risk raises the bar).
r = evaluateEscalation({ confidence: 0.7, risk: RISK_PRESETS.financial });
assert(r.decision !== 'allow', 'same confidence is not enough for a financial action');

// 3. Financial action is risk-floored: even near-perfect confidence requires confirmation.
r = evaluateEscalation({ confidence: 0.99, risk: RISK_PRESETS.financial });
assert(r.decision === 'confirm-required', 'high-risk action requires human confirmation even at 0.99 confidence');
assert(r.reason.includes('floor'), 'reason cites the risk floor');

// 4. Readonly-local action clears a low bar easily.
r = evaluateEscalation({ confidence: 0.6, risk: RISK_PRESETS.readonlyLocal });
assert(r.decision === 'allow', 'readonly local action allowed at modest confidence');

// 5. Low confidence on a moderate action, but close → confirm, not block.
r = evaluateEscalation({ confidence: 0.45, risk: RISK_PRESETS.reversibleUi });
assert(r.decision === 'confirm-required', 'near-miss escalates to confirm');

// 6. Very low confidence on a moderate action → block.
r = evaluateEscalation({ confidence: 0.1, risk: RISK_PRESETS.reversibleUi });
assert(r.decision === 'block', 'far-below-threshold blocks');

// 7. Required confidence rises monotonically with risk.
const lowReq = evaluateEscalation({ confidence: 1, risk: RISK_PRESETS.readonlyLocal }).requiredConfidence;
const midReq = evaluateEscalation({ confidence: 1, risk: RISK_PRESETS.sendMessage }).requiredConfidence;
const hiReq = evaluateEscalation({ confidence: 1, risk: RISK_PRESETS.financial }).requiredConfidence;
assert(lowReq < midReq && midReq < hiReq, 'required confidence increases with risk');

// 8. riskScore compounds when all dimensions are high.
const allHigh = riskScore({ irreversibility: 1, sensitivity: 1, impact: 1 });
const oneHigh = riskScore({ irreversibility: 1, sensitivity: 0, impact: 0 });
assert(allHigh > oneHigh, 'compounding risk scores higher than single-dimension');
assert(allHigh <= 1 && oneHigh >= 0, 'risk score stays in [0,1]');

// 9. Tunability: raising baseThreshold makes the same action need more confidence.
const lenient = evaluateEscalation({ confidence: 0.6, risk: RISK_PRESETS.reversibleUi }, { baseThreshold: 0.5 });
const strict = evaluateEscalation({ confidence: 0.6, risk: RISK_PRESETS.reversibleUi }, { baseThreshold: 0.8 });
assert(lenient.decision === 'allow' && strict.decision !== 'allow', 'threshold is tunable and bites');

// 10. CONFIRM vs GUIDANCE — the two-question split.
//     Low confidence, LOW ambiguity (one clear action, just unsure) → confirm.
r = evaluateEscalation({ confidence: 0.45, ambiguity: 0.1, risk: RISK_PRESETS.reversibleUi });
assert(r.decision === 'confirm-required' && r.mode === 'confirm', 'low ambiguity → yes/no confirm');

// 11. Low confidence, HIGH ambiguity (multiple valid paths) → guidance.
r = evaluateEscalation({ confidence: 0.45, ambiguity: 0.8, risk: RISK_PRESETS.reversibleUi });
assert(r.decision === 'confirm-required' && r.mode === 'guidance', 'high ambiguity → open guidance request');

// 12. A risk-floored action with high ambiguity asks for guidance, not just a confirm.
r = evaluateEscalation({ confidence: 0.99, ambiguity: 0.9, risk: RISK_PRESETS.financial });
assert(r.decision === 'confirm-required' && r.mode === 'guidance', 'risk-floored + ambiguous → guidance');

// 13. Risk-floored but UNambiguous (clear single action) → confirm.
r = evaluateEscalation({ confidence: 0.99, ambiguity: 0.1, risk: RISK_PRESETS.financial });
assert(r.decision === 'confirm-required' && r.mode === 'confirm', 'risk-floored + clear → yes/no confirm');

// 14. The mode threshold is itself tunable — partner can pull more to guidance.
const asConfirm = evaluateEscalation({ confidence: 0.45, ambiguity: 0.4, risk: RISK_PRESETS.reversibleUi });
const asGuidance = evaluateEscalation({ confidence: 0.45, ambiguity: 0.4, risk: RISK_PRESETS.reversibleUi }, { guidanceAmbiguityThreshold: 0.3 });
assert(asConfirm.mode === 'confirm' && asGuidance.mode === 'guidance', 'guidanceAmbiguityThreshold tunes confirm↔guidance');

// 15. allow/block carry no mode.
assert(evaluateEscalation({ confidence: 0.9, risk: RISK_PRESETS.readonlyLocal }).mode === undefined, 'allow has no mode');
assert(evaluateEscalation({ confidence: 0.05, risk: RISK_PRESETS.reversibleUi }).mode === undefined, 'block has no mode');

console.log('ALL 15 ESCALATION GROUPS PASSED');
console.log('defaults:', JSON.stringify(DEFAULT_ESCALATION));
for (const [name, risk] of Object.entries(RISK_PRESETS)) {
  const res = evaluateEscalation({ confidence: 0.8, risk }, {});
  console.log(`  @conf 0.80  ${name.padEnd(14)} risk=${res.riskScore.toFixed(2)} req=${res.requiredConfidence.toFixed(2)} → ${res.decision}`);
}
