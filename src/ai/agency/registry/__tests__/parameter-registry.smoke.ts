import {
  ParameterRegistry,
  OwnershipViolationError,
  validators,
} from '../parameter-registry';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg);
}

const reg = new ParameterRegistry();

// Governor owns concurrency; somatic loop owns its own tick rate.
reg.define<number>({
  key: 'governor.maxConcurrentFlows',
  owner: 'cognitive-governor',
  default: 4,
  validate: validators.intInRange(1, 32),
});
reg.define<number>({
  key: 'somatic.tickSeconds',
  owner: 'somatic-loop',
  default: 45,
  validate: validators.intInRange(5, 600),
});

// 1. Owner can commit a valid value.
let r = reg.commit('governor.maxConcurrentFlows', 8, 'cognitive-governor', 'load rising');
assert(r.ok, 'owner commit should succeed');
assert(reg.get<number>('governor.maxConcurrentFlows') === 8, 'value updated to 8');

// 2. Owner commit out of bounds is rejected (not thrown).
r = reg.commit('governor.maxConcurrentFlows', 999, 'cognitive-governor', 'too hot');
assert(!r.ok, 'out-of-bounds commit rejected');
assert(reg.get<number>('governor.maxConcurrentFlows') === 8, 'value unchanged after bad commit');

// 3. Non-owner committing THROWS — programming error, fail loud.
let threw = false;
try {
  reg.commit('governor.maxConcurrentFlows', 2, 'self-calibration', 'sneaky write');
} catch (e) {
  threw = e instanceof OwnershipViolationError;
}
assert(threw, 'non-owner commit throws OwnershipViolationError');

// 4. Non-owner proposes; owner resolves. This is the anti-thrash path.
reg.propose('governor.maxConcurrentFlows', 6, 'self-calibration', 'observed latency creep');
reg.propose('governor.maxConcurrentFlows', 50, 'predictive-homeostasis', 'predicts spike'); // will fail bounds even if accepted
assert(reg.pendingProposals('governor.maxConcurrentFlows').length === 2, 'two proposals queued');

const decisions = reg.resolveProposals<number>(
  'governor.maxConcurrentFlows',
  'cognitive-governor',
  (p) => p.value <= 16, // owner's policy: accept reasonable, reject the 50
);
assert(decisions.length === 2, 'resolved both proposals');
assert(reg.get<number>('governor.maxConcurrentFlows') === 6, 'accepted proposal committed (6)');
assert(reg.pendingProposals('governor.maxConcurrentFlows').length === 0, 'queue drained');

// 5. Subscribers are notified on change.
let heard = 0;
const unsub = reg.subscribe<number>('somatic.tickSeconds', () => heard++);
reg.commit('somatic.tickSeconds', 30, 'somatic-loop', 'event-driven floor');
assert(heard === 1, 'subscriber heard the change');
unsub();
reg.commit('somatic.tickSeconds', 60, 'somatic-loop', 'quieter window');
assert(heard === 1, 'subscriber silent after unsubscribe');

// 6. History/provenance is recorded.
const hist = reg.getHistory('governor.maxConcurrentFlows');
assert(hist[0].kind === 'init', 'history starts with init');
assert(hist.some((h) => h.kind === 'proposal-rejected'), 'rejection recorded for the 50 proposal');
assert(hist.some((h) => h.reason.includes('accepted proposal')), 'acceptance recorded with provenance');

console.log('ALL ' + 6 + ' GROUPS PASSED');
console.log('final snapshot:', JSON.stringify(reg.snapshot(), null, 2));
