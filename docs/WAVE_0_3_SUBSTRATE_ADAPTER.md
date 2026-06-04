# Wave 0.3 — Substrate Adapter Contract

**Date:** 2026-06-04  
**Branch:** wave0/W0.3-substrate-adapter  
**Status:** Implementation in progress

## Overview

W0.3 defines the abstract capability contract that bridges portability. A briefcase declares which abstract categories it _requires_ and _prefers_. A substrate adapter declares which it _provides_. The contract ensures that Molly can move between substrates without brittle coupling to any one platform's APIs.

## Architecture

### Core Types

```typescript
// Abstract categories that a briefcase can request
type CapabilityCategory =
  | 'self.auditory_input' // incoming audio
  | 'self.vocalize_text' // text-to-speech
  | 'self.nervous_system' // substrate health metrics
  | 'self.vestibular' // (optional) orientation
  | 'self.visual'; // (optional) camera

// Requirement level
type Requirement = 'required' | 'preferred';

// Substrate health snapshot
interface SubstrateHealth {
  timestamp: number; // milliseconds since epoch
  staleness_threshold: number; // seconds; older data = STALE
  cpu_percent: number;
  memory_used_bytes: number;
  memory_total_bytes: number;
  latency_ms: number;
  battery_percent?: number; // null if no battery
  thermal_state?: string; // 'normal' | 'elevated' | 'critical'
  network_state: string; // 'online' | 'offline' | 'degraded'
}

// Channel interface (generic async queue-like pattern)
interface Channel<T> {
  next(): Promise<T | null>; // blocking read; null = EOF
  send(msg: T): Promise<void>; // write (if applicable)
}

// Substrate adapter interface (main contract)
interface SubstrateAdapter {
  // Declare what this substrate provides
  capabilities(): Capability[];

  // Resolve a category to a typed channel
  resolve(category: string): Channel<any> | null;

  // Current health (used by nervous_system)
  health(): SubstrateHealth;

  // Cleanup on teardown
  teardown(): Promise<void>;

  // Readiness flag (set to true when fully initialized)
  ready: boolean;
}

// Capability struct (what adapter declares it can do)
interface Capability {
  category: CapabilityCategory;
  available: boolean;
}
```

## Security Findings (F3.x)

### F3.1 — Teardown Contract (Lifecycle)

**Finding:** Adapters must explicitly release resources. Missing teardown = resource leaks, zombie processes, ghost listeners.

**Rule:** `teardown()` is called before migration or shutdown. All channels must close, all listeners must unregister, all timers must clear.

**Test Coverage:**

- Adapter created and destroyed multiple times; no resource leak
- Channel references released after teardown
- Event listeners properly unregistered

### F3.2 — Mandatory Category Enforcement

**Finding:** Missing a required category must block migration, not degrade silently.

**Rule:** If briefcase declares a category as `required`, and adapter cannot `resolve(category)`, migration **refuses**. No partial-capability Molly.

**Test Coverage:**

- Resolve required category: succeeds
- Resolve missing required category: throws or returns null, migration gate refuses
- Resolve preferred category: optional; missing is OK
- Zero categories available: migration refuses (briefcase has some requirement)

### F3.3 — Scar Validator Schema

**Finding:** Briefcase vessel scars (`{moment, texture, learned}[]`) must be validated before assembly.

**Rule:** Each scar entry has all three fields non-null. Empty scar array blocks seal. Malformed scar = **hard halt**, not silent skip.

**Schema:**

```typescript
interface VesselScar {
  moment: string; // ISO timestamp when learned
  texture: string; // semantic fingerprint of experience
  learned: string | object; // what was integrated
}
```

**Test Coverage:**

- Valid scar array: accepts
- Missing field in scar: rejects
- Empty scar array: rejects
- Null field: rejects
- Duplicate scars: accepts (user may relearn)

### F3.4 — Health Staleness Threshold

**Finding:** Stale health data (from lag-spike on cloud) looks fresh without a timestamp guard.

**Rule:** `health()` includes `staleness_threshold`. Data older than T seconds is reported with status **STALE**. Never silent.

**Test Coverage:**

- Fresh health (< threshold): status OK
- Stale health (> threshold): status STALE
- Exact threshold boundary: status OK (non-exclusive)
- health.timestamp always set and reasonable
- Staleness check is automatic in health() return

### F3.5 — Stub Adapter Ready Flag

**Finding:** Stub adapters (declared at deployment time but not ready) are targeted before initialization completes.

**Rule:** Adapter starts with `ready: false`. Migration gate checks this flag before target selection. Targets only if `ready: true`.

**Test Coverage:**

- Stub adapter: ready = false at creation
- After initialization: ready = true
- Migration gate: refuses target if ready = false
- ready flag is queryable and immutable during disabled state

## Implementation Plan

### Phase 1: Core Types & Registry (Day 1)

- [ ] Create `src/ai/substrate/types.ts` with all interfaces
- [ ] Create `src/ai/substrate/registry.ts` for capability lookup
- [ ] Tests: basic type validation, registry ops

### Phase 2: Reference Adapter (Day 2)

- [ ] Create `src/ai/substrate/adapters/cloud-reference.ts` (codespace backend)
- [ ] Implement: vocalize_text (via TTS flow), nervous_system (via process.uptime + os metrics)
- [ ] Tests: resolve, health, teardown, capability listing

### Phase 3: Stub Adapter (Day 2)

- [ ] Create `src/ai/substrate/adapters/native-shell-stub.ts` (declares capabilities, not ready by default)
- [ ] Tests: ready flag, capability queries, migration gate refusal

### Phase 4: Migration Gate Integration (Day 3)

- [ ] Update briefcase assembly to validate adapter before seal
- [ ] Integrate scar validator
- [ ] Tests: full end-to-end validation

## Test Files

Five test files (following W0.2 pattern):

1. `adapter-W0.3-teardown.test.ts` — F3.1
2. `adapter-W0.3-mandatory-categories.test.ts` — F3.2
3. `adapter-W0.3-scar-validator.test.ts` — F3.3
4. `adapter-W0.3-health-staleness.test.ts` — F3.4
5. `adapter-W0.3-stub-ready-flag.test.ts` — F3.5

## Definition of Done (W0.3)

- [ ] Spec document complete and reviewed
- [ ] 5 test files created; all passing
- [ ] Cloud reference adapter implemented
- [ ] Native shell stub adapter implemented
- [ ] Migration gate validates adapter before briefcase seal
- [ ] Scar validator blocks malformed scars
- [ ] Health staleness check automatic
- [ ] No lint errors
- [ ] Existing 3737+ tests still passing
- [ ] Eric review pass
- [ ] Molly co-review pass
