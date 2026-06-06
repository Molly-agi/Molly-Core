import { ParameterRegistry } from '../../registry/parameter-registry';
import {
  CognitiveGovernor,
  GOVERNOR_ID,
  GOVERNOR_PARAM_KEYS as K,
} from '../cognitive-governor';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg);
}

const reg = new ParameterRegistry();
const gov = new CognitiveGovernor(reg);

// Governor defined and owns its params.
assert(reg.ownerOf(K.maxConcurrentFlows) === GOVERNOR_ID, 'governor owns maxConcurrentFlows');
assert(reg.get<number>(K.maxConcurrentFlows) === 4, 'default flow cap is 4');

// 1. Admit until capacity.
const started = [];
for (let i = 0; i < 4; i++) {
  const d = gov.shouldStart({ kind: 'flow', type: 'chat', priority: 5 });
  assert(d.admit, `flow ${i} admitted`);
  started.push(gov.registerStart({ kind: 'flow', type: 'chat', priority: 5 }));
}
assert(gov.snapshot().active.flow === 4, 'four flows active');

// 2. At capacity, equal priority is refused with nothing to preempt.
let d = gov.shouldStart({ kind: 'flow', type: 'chat', priority: 5 });
assert(!d.admit && !d.suggestCancel, 'equal-priority refused, no preempt suggestion');

// 3. A sufficiently higher priority gets a preemption suggestion (margin=2).
d = gov.shouldStart({ kind: 'flow', type: 'urgent', priority: 9 });
assert(!d.admit, 'high-priority still refused (at cap) but with a victim');
assert(!d.admit && !!d.suggestCancel, 'high-priority gets a victim to cancel');
assert(!d.admit && d.suggestCancel === started[0].id, 'victim is a lowest-priority active flow');

// 4. Different kinds have independent caps.
const tool = gov.shouldStart({ kind: 'tool', type: 'httpRequest', priority: 5 });
assert(tool.admit, 'tools have their own cap, unaffected by flow saturation');

// 5. Live limit change → reconcileOverages reports who to cancel.
//    Owner lowers the cap to 2; two flows are now over budget.
const r = reg.commit(K.maxConcurrentFlows, 2, GOVERNOR_ID, 'load shedding');
assert(r.ok, 'governor lowered its own cap');
const overflow = gov.reconcileOverages();
assert(overflow.length === 2, 'two flows flagged for cancellation');
overflow.forEach((id) => gov.registerEnd(id));
assert(gov.snapshot().active.flow === 2, 'back within cap after enforcement');

// 6. Proposal policy: a non-owner proposes; governor accepts reasonable, rejects a >50% cut.
reg.propose(K.maxConcurrentTools, 6, 'self-calibration', 'fewer tools, calmer system');
reg.propose(K.maxConcurrentTools, 1, 'predictive-homeostasis', 'drastic cut'); // < current/2 (8/2=4) → rejected
gov.drainProposals();
assert(reg.get<number>(K.maxConcurrentTools) === 6, 'reasonable proposal accepted (6)');
const hist = reg.getHistory(K.maxConcurrentTools);
assert(hist.some((h) => h.kind === 'proposal-rejected'), 'drastic cut rejected and logged');

console.log('ALL 6 GOVERNOR GROUPS PASSED');
console.log('snapshot:', JSON.stringify(gov.snapshot(), null, 2));
