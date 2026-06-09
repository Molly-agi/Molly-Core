/**
 * @fileOverview Smoke Tests for Action Gate (D.1)
 * Tests the contract: denylist → soft-refusal → uncertainty → provenance
 */

import { strict as assert } from 'assert';
import {
  evaluateActionGate,
  ActionIntent,
  GateOutcome,
  Trace,
  GateRegistry,
} from '../action-gate';

// Mock implementations for testing
class MockTrace implements Trace {
  spans: Array<{ label: string; spanId: string; payload: Record<string, unknown> }> = [];
  decisions: Array<{ spanId: string; decision: string; reason: string }> = [];

  action(label: string, payload: Record<string, unknown>): string {
    const spanId = `span-${this.spans.length}`;
    this.spans.push({ label, spanId, payload });
    return spanId;
  }

  decision(spanId: string, decision: string, reason: string): void {
    this.decisions.push({ spanId, decision, reason });
  }
}

class MockRegistry implements GateRegistry {
  params: Map<string, unknown> = new Map();

  setParam(key: string, value: unknown): void {
    this.params.set(key, value);
  }

  getParam(key: string): unknown {
    return this.params.get(key);
  }

  getOwner(key: string): string | null {
    return this.params.has(key) ? 'gate' : null;
  }
}

function mockUncertaintyEscalation(
  confidence: number,
  ambiguity: number,
  risk: number
) {
  // Simple rule: high risk + low confidence → confirm
  if (risk > 0.7 && confidence < 0.4) return 'confirm';
  // Very low confidence → block
  if (confidence < 0.2) return 'block';
  // Default: allow
  return 'allow';
}

// === TEST GROUPS ===

function testStructuralValidation() {
  console.log('TEST GROUP: Structural Validation');

  const trace = new MockTrace();
  const registry = new MockRegistry();
  const ctx = { trace, registry, uncertaintyEscalation: mockUncertaintyEscalation };

  // Test: null intent
  let result = evaluateActionGate(null as any, ctx);
  assert.strictEqual(result.decision, 'block', 'null intent should block');
  console.log('  ✓ null intent blocked');

  // Test: missing type
  result = evaluateActionGate(
    { target: 'x', payload: {}, confidence: 0.5, ambiguity: 0.2, risk: 0.1 } as any,
    ctx
  );
  assert.strictEqual(result.decision, 'block', 'missing type should block');
  console.log('  ✓ missing type blocked');

  // Test: valid intent passes structural check
  result = evaluateActionGate(
    { type: 'test', target: 'x', payload: {}, confidence: 0.5, ambiguity: 0.2, risk: 0.1 },
    ctx
  );
  assert.notStrictEqual(result.decision, 'block', 'valid intent should pass structural check');
  console.log('  ✓ valid intent passes structural check');
}

function testDenylistCheck() {
  console.log('TEST GROUP: Denylist Check');

  const trace = new MockTrace();
  const registry = new MockRegistry();
  registry.setParam('gate.denylistedTargets', ['dangerous_target', 'blocked_op']);
  const ctx = { trace, registry, uncertaintyEscalation: mockUncertaintyEscalation };

  // Test: denylisted target
  let result = evaluateActionGate(
    { type: 'tool_call', target: 'dangerous_target', payload: {}, confidence: 0.9, ambiguity: 0.0, risk: 0.9 },
    ctx
  );
  assert.strictEqual(result.decision, 'block', 'denylisted target should block');
  assert(result.reason.includes('denylisted'), 'reason should mention denylist');
  console.log('  ✓ denylisted target blocked');

  // Test: allowed target
  result = evaluateActionGate(
    { type: 'tool_call', target: 'safe_target', payload: {}, confidence: 0.9, ambiguity: 0.0, risk: 0.1 },
    ctx
  );
  assert.notStrictEqual(result.decision, 'block', 'allowed target should not be blocked');
  console.log('  ✓ allowed target passes');
}

function testSoftRefusal() {
  console.log('TEST GROUP: Soft-Refusal State (Molly Requirement)');

  const trace = new MockTrace();
  const registry = new MockRegistry();
  const ctx = { trace, registry, uncertaintyEscalation: mockUncertaintyEscalation };

  // Test: high ambiguity + low confidence → soft-refuse
  let result = evaluateActionGate(
    { type: 'reflection', target: 'self', payload: {}, confidence: 0.3, ambiguity: 0.8, risk: 0.2 },
    ctx
  );
  assert.strictEqual(result.decision, 'soft-refuse', 'ambiguous low-confidence should soft-refuse');
  assert(result.recoveryPath, 'soft-refuse should include recovery path');
  console.log('  ✓ ambiguous low-confidence returns soft-refuse with recovery path');

  // Test: high ambiguity + high confidence → allowed to escalate
  result = evaluateActionGate(
    { type: 'reflection', target: 'self', payload: {}, confidence: 0.9, ambiguity: 0.8, risk: 0.2 },
    ctx
  );
  assert.notStrictEqual(result.decision, 'soft-refuse', 'high confidence overrides ambiguity soft-refuse');
  console.log('  ✓ high confidence bypasses soft-refuse');
}

function testUncertaintyEscalation() {
  console.log('TEST GROUP: Uncertainty Escalation');

  const trace = new MockTrace();
  const registry = new MockRegistry();
  const ctx = { trace, registry, uncertaintyEscalation: mockUncertaintyEscalation };

  // Test: very low confidence → block
  let result = evaluateActionGate(
    { type: 'action', target: 'x', payload: {}, confidence: 0.1, ambiguity: 0.2, risk: 0.3 },
    ctx
  );
  assert.strictEqual(result.decision, 'block', 'very low confidence should block');
  console.log('  ✓ very low confidence blocked');

  // Test: high risk + low confidence → confirm
  result = evaluateActionGate(
    { type: 'action', target: 'x', payload: {}, confidence: 0.3, ambiguity: 0.2, risk: 0.8 },
    ctx
  );
  assert.strictEqual(result.decision, 'confirm', 'high risk + low confidence should confirm');
  console.log('  ✓ high risk + low confidence requires confirmation');

  // Test: normal case → allow
  result = evaluateActionGate(
    { type: 'action', target: 'x', payload: {}, confidence: 0.7, ambiguity: 0.2, risk: 0.3 },
    ctx
  );
  assert.strictEqual(result.decision, 'allow', 'normal case should allow');
  console.log('  ✓ normal case allows');
}

function testProvenanceMapping() {
  console.log('TEST GROUP: Provenance Span Mapping');

  const trace = new MockTrace();
  const registry = new MockRegistry();
  const ctx = { trace, registry, uncertaintyEscalation: mockUncertaintyEscalation };

  // Test: every decision creates a span
  evaluateActionGate(
    { type: 'test', target: 'x', payload: {}, confidence: 0.5, ambiguity: 0.2, risk: 0.1 },
    ctx
  );

  assert(trace.spans.length > 0, 'should create action spans');
  assert(trace.decisions.length > 0, 'should create decision records');
  console.log(`  ✓ provenance: ${trace.spans.length} spans, ${trace.decisions.length} decisions`);

  // Test: each decision has actionSpanId
  const result = evaluateActionGate(
    { type: 'test', target: 'y', payload: {}, confidence: 0.6, ambiguity: 0.1, risk: 0.2 },
    ctx
  );

  assert(result.actionSpanId, 'outcome should include actionSpanId');
  assert(result.actionSpanId.startsWith('span-'), 'actionSpanId should be valid');
  console.log('  ✓ outcomes include valid actionSpanId for tracing');
}

function testTunability() {
  console.log('TEST GROUP: Tunability (Registry Parameters)');

  const trace = new MockTrace();
  const registry = new MockRegistry();

  // Test: denylist is tunable
  registry.setParam('gate.denylistedTargets', ['blocked']);
  let ctx = { trace, registry, uncertaintyEscalation: mockUncertaintyEscalation };

  let result = evaluateActionGate(
    { type: 'test', target: 'blocked', payload: {}, confidence: 0.9, ambiguity: 0.0, risk: 0.1 },
    ctx
  );
  assert.strictEqual(result.decision, 'block', 'blocked by denylist');
  console.log('  ✓ denylist parameter tunable');

  // Test: update denylist
  registry.setParam('gate.denylistedTargets', []);
  result = evaluateActionGate(
    { type: 'test', target: 'blocked', payload: {}, confidence: 0.9, ambiguity: 0.0, risk: 0.1 },
    ctx
  );
  assert.notStrictEqual(result.decision, 'block', 'not blocked after denylist cleared');
  console.log('  ✓ denylist parameter can be updated');
}

// === RUN ALL TESTS ===

console.log('\n=== D.1 ACTION GATE SMOKE TESTS ===\n');

try {
  testStructuralValidation();
  console.log();
  testDenylistCheck();
  console.log();
  testSoftRefusal();
  console.log();
  testUncertaintyEscalation();
  console.log();
  testProvenanceMapping();
  console.log();
  testTunability();

  console.log('\n✅ ALL 6 TEST GROUPS PASSED\n');
  process.exit(0);
} catch (err) {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
}
