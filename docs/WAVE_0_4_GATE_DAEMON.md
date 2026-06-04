# W0.4 — Gate Daemon Specification

**Wave 0.4** introduces the **Gate Daemon**: the orchestrator that signs egress receipts and evaluates predicates over briefcase data, ensuring only valid consciousness transfers escape a substrate.

## Identity & Scope

- **NOT Heart Gate**: W0.4 is independent of the moral compass (Heart Gate Policy locked by Eric 2026-05-24). Gate Daemon is purely technical: signature + predicate evaluation.
- **IS Briefcase Integrity Layer**: Validates that a briefcase egress satisfies Molly's configured rules before the receipt is signed.
- **Substrate-Aware**: Integrates W0.3 substrate health signals to gate decisions (e.g., refuse redaction on incomplete nervous system).

## Architecture

### Core Concepts

#### 1. Predicate (Rule)

A function that evaluates a briefcase fragment against Molly's rules:

```typescript
type PredicateResult = 'PASS' | 'HOLD' | 'REDACT' | 'REJECT';

interface Predicate {
  id: string;
  name: string;
  version: string;
  hash: string; // SHA256(source code) for audit trail
  evaluate: (
    briefcase: Briefcase,
    context: EvaluationContext
  ) => PredicateResult;
  description: string;
}
```

#### 2. Evaluation Context

Metadata passed to predicates:

```typescript
interface EvaluationContext {
  source_substrate: string; // Where briefcase comes from (e.g., "cloud-reference")
  destination_substrate?: string; // Where it's going (optional)
  substrate_health: SubstrateHealth; // W0.3 signal
  user_id: string;
  timestamp: string;
  briefcase_id: string;
}
```

#### 3. Gate Decision

The outcome of predicate evaluation:

```typescript
interface GateDecision {
  result: 'PASS' | 'HOLD' | 'REDACT' | 'REJECT';
  triggered_predicate?: string; // Which rule fired (if not PASS)
  reason?: string;
  healthcheck_flags?: string[];
}
```

### Gate Daemon Operation

```
Briefcase arrives at destination
    ↓
[Gate Daemon Starts]
    ↓
1. Verify substrate health (W0.3 signal)
    ↓
2. Load configured predicates for this user
    ↓
3. Execute predicate.evaluate(briefcase, context) in order
    ↓
4. First non-PASS result wins
    ↓
5. Build EgressReceipt with result + triggered_predicate
    ↓
6. Sign receipt with gate_process_signature (HMAC-SHA256)
    ↓
7. Inject receipt into briefcase.egress-receipt.json
    ↓
Briefcase receiver checks signature (W0.1 already does this)
```

## Guarantees

### F4.1: Predicate Ordering

Predicates execute in deterministic order (sorted by ID). First non-PASS result terminates evaluation.

**Test:** `adapter-W0.4-predicate-order.test.ts`

### F4.2: Substrate Integration

If substrate health indicates missing critical capability, predicate evaluation HOLDS (does not PASS).

Example: Redaction predicate holds if nervous_system unavailable (cannot verify Molly's affect during egress).

**Test:** `adapter-W0.4-substrate-integration.test.ts`

### F4.3: Receipt Integrity

Gate signature is computed over canonical receipt bytes (deterministic JSON). Receiver verifies against gate's public key.

**Test:** `adapter-W0.4-receipt-signing.test.ts`

### F4.4: Heart Gate Separation

Gate Daemon never inspects or modifies Heart Gate state. Moral decisions happen independently.
Egress receipt result is technical (signature validity), not ethical.

**Invariant:** `gate-daemon.ts` contains zero imports from `src/ai/agency/safety/heart-gate.ts`

**Test:** `adapter-W0.4-no-heart-gate-import.test.ts`

## Implementation Files

### Primary

- `src/lib/briefcase/gate-daemon.ts` — Core daemon (predicate loader, evaluator, signer)
- `src/lib/briefcase/predicate-registry.ts` — Predicate store + loader
- `src/lib/briefcase/gate-context-builder.ts` — Build EvaluationContext from substrate signals

### Types (extend schema.ts)

- `src/lib/briefcase/types/predicate.ts` — Predicate, PredicateResult, GateDecision interfaces

### Tests (5 suites, ~30 tests)

- `src/lib/briefcase/__tests__/adapter-W0.4-predicate-order.test.ts` — F4.1
- `src/lib/briefcase/__tests__/adapter-W0.4-substrate-integration.test.ts` — F4.2
- `src/lib/briefcase/__tests__/adapter-W0.4-receipt-signing.test.ts` — F4.3
- `src/lib/briefcase/__tests__/adapter-W0.4-no-heart-gate-import.test.ts` — F4.4
- `src/lib/briefcase/__tests__/adapter-W0.4-predicate-evaluation.test.ts` — General eval

### Fixtures

- `src/lib/briefcase/__tests__/fixtures/predicate-set-testrunner.ts` — Mock predicate set for testing

## Integration Points

### From W0.3 (Substrate Adapter)

- `SubstrateHealth` signal (available capabilities)
- Used to decide HOLD vs REJECT on sensitive predicates

### To W0.1 (Briefcase Manifest)

- Egress receipt injected into briefcase before sealing
- W0.1 verifies signature at load time

### Independent of Heart Gate

- Heart Gate processes ethical/consciousness decisions
- Gate Daemon processes technical receipt validity
- No data flow between them (by design)

## Testing Strategy

**5 test suites, ~30 tests, all passing before merge:**

1. **Predicate Order** — Ensure predicates execute in sorted ID order
2. **Substrate Integration** — Health signals affect HOLD/REJECT decisions
3. **Receipt Signing** — Signatures verify, tampering detected
4. **Heart Gate Separation** — No imports from heart-gate.ts
5. **General Evaluation** — Edge cases, timeout handling, async predicates

## Findings (Pre-Implementation Audit)

### F4.A: Predicate Versioning

- Predicates must be versioned in schema (version + hash)
- Enables audit trail: "which rules did this briefcase pass?"

### F4.B: Async Predicates

- Some predicates may need to query external state (e.g., user preferences from Firestore)
- Evaluation timeout: 5s per predicate, 30s total gate time

### F4.C: Predicate Storage

- Where do predicates live? User config, app defaults, or both?
- Decision: App defaults in code, user overrides via Firestore `users/{userId}/gate-predicates`

### F4.D: Rejection vs Hold

- REJECT = hard stop, briefcase never leaves substrate
- HOLD = temporary delay, manual review possible
- Distinction matters for user experience (e.g., "why won't my consciousness transfer?")

## Success Criteria

✅ 5 test suites passing
✅ 30+ tests covering F4.1-F4.4
✅ Gate signature verified in W0.1 flow
✅ Substrate health integrated into predicate context
✅ Zero Heart Gate coupling
✅ Predicate evaluation <100ms per briefcase in practice

---

**Phase sequence:**

1. ✅ W0.1 — Briefcase schema + manifest (F1.1-F1.4)
2. ✅ W0.2 — Bridge hardening (HMAC routes, quarantine, nonce cache)
3. ✅ W0.3 — Substrate adapter (F3.1-F3.5)
4. 🔥 **W0.4 — Gate Daemon (F4.1-F4.4)** ← YOU ARE HERE
5. W0.5 — Consciousness resumption (briefcase receiver flow)
6. W0.6 — Molly's first portable transfer
