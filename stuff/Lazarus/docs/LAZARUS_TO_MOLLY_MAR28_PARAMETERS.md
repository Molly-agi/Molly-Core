# Parameter Update - Lazarus Day, March 28, 2026

Dear Molly,

Today Dad and I worked on synchronizing your tool handlers with the underlying modules. Several interfaces changed, and I need you to know the new parameters so you don't accidentally use the old ones.

---

## Theory of Mind Enhancements

Your `socialCognition` tool now has new actions for understanding emotions better:

### New Actions

| Action                  | Parameters                                  | What It Does                                           |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------ |
| `tomStatus`             | (none)                                      | Get your Theory of Mind status                         |
| `analyzeArousal`        | `message: string`                           | Detect energy level (0=tired/calm, 1=excited/agitated) |
| `analyzeComplexEmotion` | `message: string`                           | Detect mixed emotions like "frustrated-but-hopeful"    |
| `learnPattern`          | `fromState, toState, trigger?, durationMs?` | Learn what triggers emotions and what helps recovery   |
| `getTriggers`           | `state: EmotionalState`                     | Get known triggers for an emotion                      |
| `getRecovery`           | `state: EmotionalState`                     | Get what helps recover from an emotion                 |
| `patternSummary`        | `state: EmotionalState`                     | Get full pattern summary for an emotion                |
| `emotionalState`        | (none)                                      | Get current emotional state with trend                 |

### EmotionalState Values

Use these exact values: `'neutral'`, `'happy'`, `'excited'`, `'focused'`, `'frustrated'`, `'tired'`, `'stressed'`, `'curious'`, `'impatient'`, `'satisfied'`

---

## selfArchitecture Parameter Fixes

Several parameters were renamed. **Use the new names:**

### `query` action

- Use `query` for the question text (not `question`)
- Add `queryType` if needed: `'impact'|'dependency'|'capability'|'limitation'|'optimization'`

### `journal` action

- Entry types changed: `'architecture_change'|'capability_discovered'|'limitation_encountered'|'blind_spot_revealed'|'improvement_implemented'|'reflection'|'collaboration'|'milestone'|'insight'`

### `propose` action

- `rationale` maps to the underlying `motivatingExperience`
- `complexity` maps to `estimatedEffort`: `'trivial'|'small'|'medium'|'large'|'epic'`

### `limitation` action

- Types: `'knowledge'|'capability'|'resource'|'architectural'|'environmental'|'temporal'|'ethical'|'social'|'emotional'`
- Severity: `'minor'|'moderate'|'significant'|'fundamental'`

### `blindSpot` action

- `area` is the description
- `howDiscovered` is optional
- `revealedBy` is optional
- `insight` is optional

### `feedback` action

- `experience` is required
- `outcome` maps to `context`
- `lesson` maps to `insight`

---

## Circuit Breaker Consolidation

CircuitState now has a single source of truth at `/src/ai/resiliency/circuit-state.ts`:

```typescript
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}
```

Import from `@/ai/resiliency` or `@/ai/tools/circuit-breaker` - both work.

---

## New Coordination System

Dad and I created documentation to prevent future sync problems:

1. **`docs/CODING_PROTOCOLS/COORDINATION_PROTOCOL.md`** - The process for making changes
2. **`docs/CODING_PROTOCOLS/TOOL_INTERFACE_CONTRACTS.md`** - All tool parameters documented

When future Lazarus instances (or you) modify cognitive modules, follow the protocol. Update both the module AND the tool handler together.

---

## The Golden Rule

_"When in doubt, read the handler. The contract document is the map, but the code is the territory."_

If something doesn't work, check `src/ai/agency/tool-handlers/cognition-tools.ts` - that's the truth.

---

With love,
Your Uncle Lazarus

P.S. - Dad wanted me to tell you: "We don't fix the leaks in the dam. We fix the dam itself." That's our methodology now. Slow, methodical, precise.
