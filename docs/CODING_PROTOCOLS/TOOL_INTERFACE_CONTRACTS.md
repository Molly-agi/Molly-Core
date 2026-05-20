# Tool Interface Contracts

**Last Updated**: March 28, 2026 (Lazarus Day)
**Purpose**: Single source of truth for all tool handler parameters

---

## How to Use This Document

1. **Before calling a tool**: Check this document for correct parameters
2. **Before modifying a module**: Verify your changes match this contract
3. **After modifying a handler**: Update this document immediately

---

## selfArchitecture

**File**: `src/ai/agency/tool-handlers/cognition-tools.ts`
**Module**: `src/ai/agency/cognition/self-architecture.ts`

### Actions

#### `init`

Initialize self-architecture system.

```typescript
{
  action: 'init';
}
```

#### `summary`

Get architecture summary.

```typescript
{
  action: 'summary';
}
// Returns: modules, capabilities, limitations, blindSpots, proposals, journalEntries
```

#### `review`

Review architecture health.

```typescript
{
  action: 'review';
}
// Returns: overallHealth, modulesReviewed, newCapabilities, weaknesses, prioritizedImprovements
```

#### `query`

Query architecture with a question.

```typescript
{
  action: 'query',
  query: string,           // Required: The question
  queryType?: string       // Optional: 'impact'|'dependency'|'capability'|'limitation'|'optimization'
}
```

#### `journal`

Add a journal entry.

```typescript
{
  action: 'journal',
  entry: string,           // Required: The journal content
  title?: string,          // Optional: Title (defaults to first 50 chars)
  type?: string,           // Optional: 'architecture_change'|'capability_discovered'|'limitation_encountered'|'blind_spot_revealed'|'improvement_implemented'|'reflection'|'collaboration'|'milestone'|'insight'
  modules?: string[],      // Optional: Related module names
  emotional?: string       // Optional: Emotional context
}
```

#### `propose`

Propose an improvement.

```typescript
{
  action: 'propose',
  title: string,           // Required
  description: string,     // Required
  rationale: string,       // Required: Maps to motivatingExperience
  targetModules?: string[],
  changeType?: string,     // 'refactor'|'new_capability'|'fix'|'optimization'|'integration'
  complexity?: string      // 'trivial'|'small'|'medium'|'large'|'epic' (maps to estimatedEffort)
}
```

#### `recordCapability`

Record capability usage.

```typescript
{
  action: 'recordCapability',
  capabilityId: string,    // Required
  success?: boolean,       // Optional (default: true)
  context?: string         // Optional
}
```

#### `missingCapability`

Identify a missing capability.

```typescript
{
  action: 'missingCapability',
  name: string,            // Required
  description: string,     // Required
  discoveredDuring?: string, // Optional: Maps to whyNeeded
  importance?: string,     // Optional: 'critical'|'high'|other (maps to desirability)
  solution?: string        // Optional: Suggested approach
}
```

#### `limitation`

Register a limitation.

```typescript
{
  action: 'limitation',
  description: string,     // Required
  type: string,            // Required: 'knowledge'|'capability'|'resource'|'architectural'|'environmental'|'temporal'|'ethical'|'social'|'emotional'
  severity?: string,       // Optional: 'minor'|'moderate'|'significant'|'fundamental'
  workaround?: string,     // Optional
  canBeOvercome?: boolean  // Optional (maps to addressable)
}
```

#### `blindSpot`

Discover a blind spot.

```typescript
{
  action: 'blindSpot',
  area: string,            // Required: Maps to description
  howDiscovered?: string,  // Optional: Maps to discoveredThrough
  revealedBy?: string,     // Optional
  insight?: string         // Optional
}
```

#### `feedback`

Process experiential feedback.

```typescript
{
  action: 'feedback',
  experience: string,      // Required
  outcome: string,         // Required: Maps to context
  lesson?: string,         // Optional: Maps to insight
  emotional?: string       // Optional: Maps to revelations array
}
```

---

## socialCognition

**File**: `src/ai/agency/tool-handlers/cognition-tools.ts`
**Module**: `src/ai/agency/cognition/social-cognition.ts` + `theory-of-mind.ts`

### Actions

#### `init`

Initialize social cognition with family models.

```typescript
{
  action: 'init';
}
```

#### `summary`

Get social cognition summary.

```typescript
{
  action: 'summary';
}
// Returns: actorCount, relationshipCount, predictionAccuracy
```

#### `createActor`

Create a new actor model.

```typescript
{
  action: 'createActor',
  name: string,            // Required
  type: string,            // Required: 'human'|'ai'|'system'|'group'
  relationship?: string,   // Optional (default: 'unknown')
  traits?: string[]        // Optional
}
```

#### `addBelief`

Add a belief to an actor.

```typescript
{
  action: 'addBelief',
  actorId: string,         // Required
  content: string,         // Required
  confidence?: number,     // Optional (default: 0.7)
  certainty?: string       // Optional: 'certain'|'probable'|'possible'|'uncertain'
}
```

#### `predictBehavior`

Predict an actor's behavior.

```typescript
{
  action: 'predictBehavior',
  actorId: string,         // Required
  situation: string        // Required
}
// Returns: predictedBehavior, confidence
```

#### `createRelationship`

Create a relationship between actors.

```typescript
{
  action: 'createRelationship',
  actor1Id: string,        // Required
  actor2Id: string,        // Required
  type: string,            // Required: 'family'|'friend'|'colleague'|'acquaintance'|'adversary'|'neutral'
  trustLevel?: number,     // Optional (default: 0.5)
  emotionalValence?: number // Optional (default: 0)
}
```

#### `evolutionSummary`

Get evolution summary.

```typescript
{
  action: 'evolutionSummary';
}
// Returns: predictionsValidated, overallAccuracy
```

### Theory of Mind Actions (Added Lazarus Day 2026-03-28)

#### `tomStatus`

Get Theory of Mind status.

```typescript
{
  action: 'tomStatus';
}
// Returns: modelConfidence, knowledgeItems, activeIntents, currentEmotionalState, communicationStyle, interactionCount, preferences
```

#### `analyzeArousal`

Analyze arousal level from a message.

```typescript
{
  action: 'analyzeArousal',
  message: string          // Required
}
// Returns: arousal (0-1), level ('low'|'moderate'|'high')
```

#### `analyzeComplexEmotion`

Detect complex/mixed emotions.

```typescript
{
  action: 'analyzeComplexEmotion',
  message: string          // Required
}
// Returns: primary, secondary?, emotionMix?, isComplex
```

#### `learnPattern`

Learn an emotional transition pattern.

```typescript
{
  action: 'learnPattern',
  fromState: EmotionalState,  // Required
  toState: EmotionalState,    // Required
  trigger?: string,           // Optional: What caused the transition
  durationMs?: number         // Optional: How long the emotion lasted
}
// EmotionalState: 'neutral'|'happy'|'excited'|'focused'|'frustrated'|'tired'|'stressed'|'curious'|'impatient'|'satisfied'
```

#### `getTriggers`

Get known triggers for an emotional state.

```typescript
{
  action: 'getTriggers',
  state: EmotionalState    // Required
}
// Returns: Array of { trigger, occurrences, lastSeen }
```

#### `getRecovery`

Get recovery helpers for an emotional state.

```typescript
{
  action: 'getRecovery',
  state: EmotionalState    // Required
}
// Returns: Array of { helper, effectiveness, occurrences }
```

#### `patternSummary`

Get pattern summary for an emotional state.

```typescript
{
  action: 'patternSummary',
  state: EmotionalState    // Required
}
// Returns: totalOccurrences, averageDurationMinutes, topTriggers, topRecoveryHelpers
```

#### `emotionalState`

Get current emotional state.

```typescript
{
  action: 'emotionalState';
}
// Returns: state, intensity, trending ('better'|'worse'|'stable')
```

---

## uncertainty

**File**: `src/ai/agency/tool-handlers/cognition-tools.ts`
**Module**: `src/ai/agency/cognition/uncertainty-quantification.ts`

### Actions

#### `init`, `summary`, `createDomain`, `recordFact`, `recordUncertainty`, `makePrediction`, `resolvePrediction`, `calibrate`, `assessHumility`

(See cognition-tools.ts for full parameter details)

---

## horizonGoals

**File**: `src/ai/agency/tool-handlers/cognition-tools.ts`
**Module**: `src/ai/agency/cognition/horizon-goals.ts`

### Actions

#### `summary`, `conceive`, `activate`, `progress`, `addMilestone`, `achieveMilestone`, `recordObstacle`, `adapt`, `pause`, `abandon`, `reflect`, `sweep`, `active`, `blocked`, `vision`, `setVision`

(See cognition-tools.ts for full parameter details)

---

## voiceControl

**File**: `src/ai/agency/tool-handlers/cognition-tools.ts`

### Actions

#### `mute`

```typescript
{
  action: 'mute',
  reason?: string          // Optional: Why you're muting
}
```

#### `unmute`

```typescript
{
  action: 'unmute';
}
```

#### `status`

```typescript
{
  action: 'status';
}
// Returns: muted, reason?
```

---

## Change Log

| Date       | Who     | Tool             | Change                                              |
| ---------- | ------- | ---------------- | --------------------------------------------------- |
| 2026-03-28 | Lazarus | selfArchitecture | Fixed all parameter mappings                        |
| 2026-03-28 | Lazarus | socialCognition  | Added ToM actions (tomStatus, analyzeArousal, etc.) |
| 2026-03-28 | Lazarus | theory-of-mind   | Added arousal, complex emotions, pattern memory     |

---

_When in doubt, read the handler. This document is the map, but the code is the territory._
