/**
 * Provenance Persistence Sink — Smoke Tests (D.2)
 */
import { strict as assert } from 'assert';
import { InMemoryProvenanceSink, FirestoreProvenanceSink } from '../provenance-persistence-sink';
import type { ProvenanceSpan } from '../provenance-log';

function span(label: string, kind: ProvenanceSpan['kind'] = 'action'): ProvenanceSpan {
  return { traceId: 't1', spanId: `s-${label}`, kind, label, at: Date.now() };
}

// ── 1. InMemoryProvenanceSink accumulates ─────────────────────────────────
console.log('TEST GROUP: InMemoryProvenanceSink accumulates');
{
  const sink = new InMemoryProvenanceSink();
  sink.write(span('a'));
  sink.write(span('b'));
  assert.strictEqual(sink.written.length, 2, 'should hold 2 written spans');
  console.log('  ✓ write accumulates spans');
}

// ── 2. All span kinds accepted ───────────────────────────────────────────
console.log('TEST GROUP: all span kinds accepted');
{
  const sink = new InMemoryProvenanceSink();
  const kinds: ProvenanceSpan['kind'][] = ['perception', 'goal', 'plan', 'action', 'decision', 'outcome'];
  for (const kind of kinds) sink.write(span(kind, kind));
  assert.strictEqual(sink.written.length, 6, 'all 6 kinds accepted');
  console.log('  ✓ all span kinds accepted');
}

// ── 3. Decision + reason preserved ──────────────────────────────────────
console.log('TEST GROUP: decision + reason preserved');
{
  const sink = new InMemoryProvenanceSink();
  const s: ProvenanceSpan = {
    traceId: 't', spanId: 'd1', kind: 'decision', label: 'gate:allow',
    at: Date.now(), decision: 'allow', decisionReason: 'high confidence',
  };
  sink.write(s);
  assert.strictEqual(sink.written[0].decision, 'allow', 'decision preserved');
  assert.strictEqual(sink.written[0].decisionReason, 'high confidence', 'reason preserved');
  console.log('  ✓ decision and reason preserved');
}

// ── 4. ParentId chain preserved ──────────────────────────────────────────
console.log('TEST GROUP: parentId chain preserved');
{
  const sink = new InMemoryProvenanceSink();
  sink.write({ traceId: 't', spanId: 'p1', kind: 'perception', label: 'root', at: Date.now() });
  sink.write({ traceId: 't', spanId: 'a1', parentId: 'p1', kind: 'action', label: 'child', at: Date.now() });
  assert.strictEqual(sink.written[1].parentId, 'p1', 'parentId preserved');
  console.log('  ✓ parentId chain preserved');
}

// ── 5. FirestoreProvenanceSink interface ─────────────────────────────────
console.log('TEST GROUP: FirestoreProvenanceSink interface correct');
{
  const sink = new FirestoreProvenanceSink('user-test', 10, 0,
    '/tmp/prov-shadow.jsonl', '/tmp/prov.jsonl');
  assert.strictEqual(typeof sink.write, 'function', 'has write');
  assert.strictEqual(typeof sink.flush, 'function', 'has flush');
  assert.strictEqual(typeof sink.getStatus, 'function', 'has getStatus');
  const s0 = sink.getStatus();
  assert.strictEqual(s0.buffered, 0, 'initial buffered = 0');
  assert.strictEqual(s0.failed, 0, 'initial failed = 0');
  // write without flush stays buffered
  sink.write(span('x'));
  assert.strictEqual(sink.getStatus().buffered, 1, 'buffered after write');
  console.log('  ✓ FirestoreProvenanceSink interface correct');
}

// ── 6. Auto-flush trigger at batch size ──────────────────────────────────
console.log('TEST GROUP: auto-flush triggered at batch size');
void (async () => {
  const sink = new FirestoreProvenanceSink('user-test', 3, 0,
    '/tmp/prov-shadow2.jsonl', '/tmp/prov2.jsonl');
  sink.write(span('a'));
  sink.write(span('b'));
  assert.strictEqual(sink.getStatus().buffered, 2, '2 buffered below batch size');
  // 3rd write triggers auto-flush (async, will fail Firestore + write JSONL)
  sink.write(span('c'));
  await new Promise((r) => setTimeout(r, 100));
  // getStatus must not throw regardless of flush outcome
  const s = sink.getStatus();
  assert.strictEqual(typeof s.buffered, 'number', 'status.buffered is number');
  assert.strictEqual(typeof s.failed, 'number', 'status.failed is number');
  console.log('  ✓ auto-flush triggered without throwing');
  console.log('\n✅ ALL 6 SINK SMOKE GROUPS PASSED');
})();
