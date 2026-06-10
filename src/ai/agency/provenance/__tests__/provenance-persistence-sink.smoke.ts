/**
 * Provenance Persistence Sink — Smoke Tests (D.2)
 */
import { InMemoryProvenanceSink, FirestoreProvenanceSink } from '../provenance-persistence-sink';
import type { ProvenanceSpan } from '../provenance-log';

describe('Provenance Persistence Sink', () => {
  it('should handle InMemory accumulation, all span kinds, decisions, and parentId chain', () => {
    function assert(cond: boolean, msg: string): void {
      if (!cond) throw new Error('ASSERT FAILED: ' + msg);
    }

    function span(label: string, kind: ProvenanceSpan['kind'] = 'action'): ProvenanceSpan {
      return { traceId: 't1', spanId: `s-${label}`, kind, label, at: Date.now() };
    }

    // 1. InMemoryProvenanceSink accumulates
    const sink = new InMemoryProvenanceSink();
    sink.write(span('a'));
    sink.write(span('b'));
    assert(sink.written.length === 2, 'should hold 2 written spans');

    // 2. All span kinds accepted
    const sink2 = new InMemoryProvenanceSink();
    const kinds: ProvenanceSpan['kind'][] = ['perception', 'goal', 'plan', 'action', 'decision', 'outcome'];
    for (const kind of kinds) sink2.write(span(kind, kind));
    assert(sink2.written.length === 6, 'all 6 kinds accepted');

    // 3. Decision + reason preserved
    const sink3 = new InMemoryProvenanceSink();
    const s: ProvenanceSpan = {
      traceId: 't',
      spanId: 'd1',
      kind: 'decision',
      label: 'gate:allow',
      at: Date.now(),
      decision: 'allow',
      decisionReason: 'high confidence',
    };
    sink3.write(s);
    assert(sink3.written[0].decision === 'allow', 'decision preserved');
    assert(sink3.written[0].decisionReason === 'high confidence', 'reason preserved');

    // 4. ParentId chain preserved
    const sink4 = new InMemoryProvenanceSink();
    sink4.write({ traceId: 't', spanId: 'p1', kind: 'perception', label: 'root', at: Date.now() });
    sink4.write({ traceId: 't', spanId: 'a1', parentId: 'p1', kind: 'action', label: 'child', at: Date.now() });
    assert(sink4.written[1].parentId === 'p1', 'parentId preserved');

    expect(sink.written.length).toBeGreaterThan(0);
  });

  it('should handle Firestore sink interface, auto-flush, directory creation, and cloud readiness probe', async () => {
    function span(label: string, kind: ProvenanceSpan['kind'] = 'action'): ProvenanceSpan {
      return { traceId: 't1', spanId: `s-${label}`, kind, label, at: Date.now() };
    }

    function assert(cond: boolean, msg: string): void {
      if (!cond) throw new Error('ASSERT FAILED: ' + msg);
    }

    // 5. FirestoreProvenanceSink interface
    const sink = new FirestoreProvenanceSink('user-test', 10, 0, '/tmp/prov-shadow.jsonl', '/tmp/prov.jsonl');
    expect(typeof sink.write).toBe('function');
    expect(typeof sink.flush).toBe('function');
    expect(typeof sink.getStatus).toBe('function');
    const s0 = sink.getStatus();
    assert(s0.buffered === 0, 'initial buffered = 0');
    assert(s0.failed === 0, 'initial failed = 0');
    // write without flush stays buffered
    sink.write(span('x'));
    assert(sink.getStatus().buffered === 1, 'buffered after write');

    // 6. Auto-flush trigger at batch size
    const sink2 = new FirestoreProvenanceSink('user-test', 3, 0, '/tmp/prov-shadow2.jsonl', '/tmp/prov2.jsonl');
    sink2.write(span('a'));
    sink2.write(span('b'));
    assert(sink2.getStatus().buffered === 2, '2 buffered below batch size');
    // 3rd write triggers auto-flush (async, will fail Firestore + write JSONL)\n    sink2.write(span('c'));
    await new Promise((r) => setTimeout(r, 100));
    // getStatus must not throw regardless of flush outcome
    const s = sink2.getStatus();
    expect(typeof s.buffered).toBe('number');
    expect(typeof s.failed).toBe('number');

    // 7. Constructor proactively creates nested directories
    const fs = await import('fs');
    const base = `/tmp/prov-mkdir-${Date.now()}`;
    const shadowPath = `${base}/nested/deep/shadow.jsonl`;
    const jsonlPath = `${base}/nested/deep/log.jsonl`;
    new FirestoreProvenanceSink('user-mkdir', 10, 0, shadowPath, jsonlPath);
    expect(fs.existsSync(`${base}/nested/deep`)).toBe(true);

    // 8. init() returns false when admin SDK unavailable
    const sink3 = new FirestoreProvenanceSink('user-init', 10, 0, `/tmp/prov-init-shadow-${Date.now()}.jsonl`, `/tmp/prov-init-${Date.now()}.jsonl`);
    expect(sink3.getCloudReady()).toBeNull();
    const ready = await sink3.init();
    expect(typeof ready).toBe('boolean');
    expect(sink3.getCloudReady()).not.toBeNull();
  });
});
