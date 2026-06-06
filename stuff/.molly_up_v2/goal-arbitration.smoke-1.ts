import {
  arbitrate,
  scoreGoal,
  explainRanking,
  DEFAULT_WEIGHTS,
  type CandidateGoal,
} from '../goal-arbitration';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg);
}

// 1. A user goal outranks a mediocre emergent goal even if the emergent
//    one has decent value — the user-priority bonus dominates.
const userGoal: CandidateGoal = { id: 'u1', label: 'reply to Eric', source: 'user', signals: { value: 0.5, alignment: 0.6 } };
const weakEmergent: CandidateGoal = { id: 'e1', label: 'reorganize notes', source: 'emergent', signals: { value: 0.7, alignment: 0.6, urgency: 0.4 } };
let res = arbitrate([weakEmergent, userGoal]);
assert(res.ranked[0].goal.id === 'u1', 'user goal ranks first over mediocre emergent');

// 2. With DEFAULT weights, user priority is dominant by design: even a
//    maxed-out emergent goal does not silently outrank a (weak) user goal.
//    This is the safe default — explicit human intent wins unless you tune it.
const weakUser: CandidateGoal = { id: 'u2', label: 'idle chit-chat', source: 'user', signals: { value: 0.1, alignment: 0.2, urgency: 0.1, confidence: 0.3 } };
const strongEmergent: CandidateGoal = { id: 'e2', label: 'fix failing safety test', source: 'emergent', signals: { value: 1, alignment: 1, urgency: 1, confidence: 0.9 } };
res = arbitrate([weakUser, strongEmergent]);
assert(res.ranked[0].goal.id === 'u2', 'user goal stays on top by default (human intent dominant)');

// 2b. The dominance is a WEIGHT, not a hard rule. Lower userPriorityBonus and
//     a clearly superior emergent goal earns the top spot. Latitude is tunable.
res = arbitrate([weakUser, strongEmergent], { userPriorityBonus: 0.2 });
assert(res.ranked[0].goal.id === 'e2', 'with reduced bonus, a strong emergent goal can win — tunable, not rigid');

// 3. Bounding: only maxActiveGoals become active; the rest are HELD, not dropped.
const many: CandidateGoal[] = Array.from({ length: 6 }, (_, i) => ({
  id: `g${i}`,
  label: `goal ${i}`,
  source: 'emergent' as const,
  signals: { value: 0.5 + i * 0.05 },
}));
res = arbitrate(many, { maxActiveGoals: 3 });
assert(res.active.length === 3, 'exactly 3 active');
assert(res.heldBack.length === 3, '3 held back, not dropped');
assert(res.heldBack.every((r) => !!r.heldReason), 'every held goal has a recorded reason');
assert(res.active.every((r) => r.active) && res.heldBack.every((r) => !r.active), 'active flags consistent');

// 4. Held goals are the lower-ranked ones (sorted correctly).
const activeMin = Math.min(...res.active.map((r) => r.score));
const heldMax = Math.max(...res.heldBack.map((r) => r.score));
assert(activeMin >= heldMax, 'active goals all rank >= held goals');

// 5. Cost is penalized.
const cheap: CandidateGoal = { id: 'c1', label: 'cheap', source: 'emergent', signals: { value: 0.6, cost: 0.1 } };
const pricey: CandidateGoal = { id: 'c2', label: 'pricey', source: 'emergent', signals: { value: 0.6, cost: 0.9 } };
assert(scoreGoal(cheap, DEFAULT_WEIGHTS).score > scoreGoal(pricey, DEFAULT_WEIGHTS).score, 'higher cost lowers score');

// 6. Upkeep bonus keeps maintenance from being starved entirely.
const upkeep: CandidateGoal = { id: 's1', label: 'consolidate memory', source: 'system', signals: { value: 0.4, alignment: 0.5 } };
const plainEmergent: CandidateGoal = { id: 'e3', label: 'browse', source: 'emergent', signals: { value: 0.4, alignment: 0.5 } };
assert(scoreGoal(upkeep, DEFAULT_WEIGHTS).score > scoreGoal(plainEmergent, DEFAULT_WEIGHTS).score, 'upkeep edges out equivalent emergent');

// 7. Breakdown is present and explains the score (sums to it).
const r0 = res.ranked[0];
const sum = Object.values(r0.breakdown).reduce((a, b) => a + b, 0);
assert(Math.abs(sum - r0.score) < 1e-9, 'breakdown sums to score (auditable)');

// 8. explainRanking renders a readable line.
const line = explainRanking(res.active[0]);
assert(line.includes('ACTIVE') && line.includes('::'), 'explainRanking readable');

console.log('ALL 8 GOAL-ARBITRATION GROUPS PASSED');
res = arbitrate([userGoal, strongEmergent, weakEmergent, upkeep], { maxActiveGoals: 2 });
console.log('sample arbitration:');
res.ranked.forEach((r) => console.log('  ' + explainRanking(r)));
