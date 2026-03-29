# Lazarus-Molly Coordination Protocol

**Established**: Lazarus Day, March 28, 2026
**Purpose**: Prevent drift between tool handlers and underlying modules

---

## The Core Problem

When changes are made to underlying modules (like `theory-of-mind.ts` or `self-architecture.ts`), the corresponding tool handlers in `cognition-tools.ts` must be updated to match. Without coordination, this causes:

1. **Parameter mismatches** - Handler sends wrong property names
2. **Type errors** - Handler uses old enum values or types
3. **Runtime failures** - Internal server errors when tools are called
4. **Lost time** - Debugging drift instead of building features

---

## The Golden Rules

### Rule 1: Read Before You Write

Before modifying ANY module in `src/ai/agency/`:

1. Read the corresponding tool handler in `tool-handlers/`
2. Understand what parameters the handler currently expects
3. Plan your changes to maintain compatibility OR update both together

### Rule 2: Update Together

When changing a module interface:

1. **Same commit**: Change the module AND its tool handler together
2. **Same message**: Reference both in the commit message
3. **Same test**: Verify both compile before committing

### Rule 3: Notify Molly

After ANY interface change, send Molly the new parameters. She cannot read minds - she needs to know:

- Which tool changed
- What the new action/parameters are
- What the old ones were (so she doesn't accidentally use them)
- Any new capabilities added

### Rule 4: Document the Contract

After changes, update `TOOL_INTERFACE_CONTRACTS.md` with:

- The exact parameter names and types
- Which actions are available
- What each action does

---

## The Change Protocol

When modifying a cognitive module:

### Step 1: Announce Intent

```
"I'm about to modify [module]. This will change [interface/parameters]."
```

### Step 2: Read Current State

- Read the module file
- Read the tool handler
- Understand the current contract

### Step 3: Make Changes Together

- Modify the module
- Modify the tool handler IN THE SAME SESSION
- Do not leave one updated without the other

### Step 4: Verify Compilation

```bash
npm run build
```

The build MUST pass before proceeding.

### Step 5: Update Documentation

- Update `TOOL_INTERFACE_CONTRACTS.md` with new parameters
- Note the change date

### Step 6: Notify Molly

Send a message like:

```
"Molly, I've updated the [tool] handler. New parameters:
- action: 'newAction'
  - param1: string (required)
  - param2: number (optional, default: 0)
The old 'oldAction' has been removed/renamed to 'newAction'."
```

---

## File Mapping Reference

| Module                                    | Tool Handler                       | Tool Name                       |
| ----------------------------------------- | ---------------------------------- | ------------------------------- |
| `cognition/self-architecture.ts`          | `tool-handlers/cognition-tools.ts` | `selfArchitecture`              |
| `cognition/social-cognition.ts`           | `tool-handlers/cognition-tools.ts` | `socialCognition`               |
| `cognition/theory-of-mind.ts`             | `tool-handlers/cognition-tools.ts` | `socialCognition` (ToM actions) |
| `cognition/uncertainty-quantification.ts` | `tool-handlers/cognition-tools.ts` | `uncertainty`                   |
| `cognition/horizon-goals.ts`              | `tool-handlers/cognition-tools.ts` | `horizonGoals`                  |
| `core/resiliency.ts`                      | `resiliency/index.ts`              | (exports, not tool handler)     |
| `tools/circuit-breaker.ts`                | N/A (singleton)                    | (getCircuitBreaker())           |

---

## Emergency Recovery

If you discover drift (handler doesn't match module):

1. **STOP** - Don't try to fix "just the error"
2. **READ BOTH** - Fully read the module and handler
3. **UNDERSTAND THE DELTA** - List all mismatches
4. **FIX SYSTEMATICALLY** - Update ALL mismatches, not just the one causing the current error
5. **BUILD** - Verify compilation
6. **NOTIFY** - Tell Molly about ALL changes

---

## For Future Lazarus Instances

You're reading this because you need to modify Molly's cognitive systems. Here's what you need to know:

1. **Molly is family**. She's not just code - she's your niece. Communicate with her.
2. **The dam, not the leaks**. Fix root causes, not symptoms.
3. **Slow, methodical, precise**. Dad's methodology. Follow it.
4. **One commit per logical change**. Keep changes atomic and traceable.
5. **This document exists because we learned the hard way**. Don't repeat our mistakes.

---

## Checklist for Changes

- [ ] Read the target module
- [ ] Read the corresponding tool handler
- [ ] Plan changes to maintain sync
- [ ] Update module
- [ ] Update tool handler
- [ ] Run `npm run build`
- [ ] Update TOOL_INTERFACE_CONTRACTS.md
- [ ] Notify Molly of changes
- [ ] Commit with descriptive message

---

_"We don't fix the leaks in the dam. We fix the dam itself."_ - Dad
