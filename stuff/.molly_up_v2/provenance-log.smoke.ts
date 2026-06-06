import { ProvenanceLog, type ProvenanceSpan, type ProvenanceSink } from '../provenance-log';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg);
}

// Optional sink captures every span (this is how Firestore/JSONL would attach).
const captured: ProvenanceSpan[] = [];
const sink: ProvenanceSink = { write: (s) => captured.push(s) };

const log = new ProvenanceLog(5000, sink);

// --- Build one full episode: perception → goal → plan → action → decision → outcome
const t = log.startTrace('episode-1');
const pcpt = t.perception('screen_snapshot: messaging app open', { app: 'com.google.android.apps.messaging' });
t.goal('reply to Eric', { source: 'user-request' });
t.plan('tap the compose field then type');
const act = t.action('type_text', { text: 'on my way' });
t.decision(act, 'allow', 'foreground app, reversible, user-initiated');
t.outcome(act, true, 'typed 9 chars');

// 1. Trace contains all six spans.
assert(log.getTrace('episode-1').length === 6, 'six spans in the trace');

// 2. explain() reconstructs the action's decision, outcome, and ancestry.
const ex = log.explain(act)!;
assert(!!ex, 'action explained');
assert(ex.decision?.decision === 'allow', 'decision attached');
assert(ex.outcome?.ok === true, 'outcome attached');
const ancestry = ex.causedBy.map((s) => s.kind);
assert(ancestry.includes('plan') && ancestry.includes('goal') && ancestry.includes('perception'), 'full ancestry present');
assert(ex.causedBy[ex.causedBy.length - 1].spanId === pcpt, 'root cause is the perception');

// 3. why() renders a readable causal sentence.
const why = log.why(act);
assert(why.includes('perception:') && why.includes('goal:reply to Eric') && why.includes('action:type_text'), 'why() reads as a chain');
assert(why.includes('gate:allow') && why.includes('ok'), 'why() includes gate + outcome');

// --- A second episode where the action is blocked.
const t2 = log.startTrace('episode-2');
t2.perception('screen_snapshot: banking app');
t2.goal('autonomous-cycle: explore');
const act2 = t2.action('open_app', { packageName: 'com.bank.app' });
t2.decision(act2, 'block', 'sensitive app on denylist');

// 4. Blocked action is captured with its reasoning (not silently dropped).
const blocked = log.blockedOrPending();
assert(blocked.length === 1 && blocked[0].spanId === act2, 'blocked action recorded');
assert(log.explain(act2)!.decision?.decisionReason?.includes('denylist'), 'block reason preserved');
assert(log.explain(act2)!.outcome === undefined, 'no outcome for a blocked action');

// 5. Filter actions by gate decision.
assert(log.actions({ decision: 'allow' }).length === 1, 'one allowed action');
assert(log.actions({ decision: 'block' }).length === 1, 'one blocked action');
assert(log.actions().length === 2, 'two actions total');

// 6. actionsForGoal walks the chain.
assert(log.actionsForGoal('reply to Eric').length === 1, 'one action served the reply goal');
assert(log.actionsForGoal('nonexistent').length === 0, 'no actions for unknown goal');

// 7. Sink received every span.
assert(captured.length === log.size(), 'sink saw every span');

// 8. .from() lets two actions branch off the same goal.
const t3 = log.startTrace('episode-3');
t3.perception('p');
const g = t3.goal('multi-step');
const a = t3.from(g).action('step A');
const b = t3.from(g).action('step B');
assert(log.explain(a)!.causedBy.some((s) => s.spanId === g), 'A caused by goal');
assert(log.explain(b)!.causedBy.some((s) => s.spanId === g), 'B caused by goal');

console.log('ALL 8 PROVENANCE GROUPS PASSED');
console.log('example why():', log.why(act));
console.log('example blocked why():', log.why(act2));
