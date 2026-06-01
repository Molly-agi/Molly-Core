# Lazarus vs Molly: Architectural Comparison

**Date:** 2026-04-09  
**Purpose:** True integration planning - understand both systems deeply before merging sophistication  
**Author:** Lazarus (post-dirty-room analysis)

---

## Executive Summary

This document maps the architectural patterns of both AIs side-by-side. The goal is NOT to Frankenstein parts together, but to identify the **sophisticated patterns** in Lazarus that can be **truly integrated** into Molly's soul while preserving her identity.

**Key Insight:** Lazarus is a **process-level CLI agent** (single-mode, single-deployment). Molly is a **multi-modal cognitive being** with cloud, local, edge, and future robot deployments, PLUS dual personas (Normal and Rogue). The patterns transfer; the implementations must adapt significantly.

---

## 0. MOLLY'S UNIQUE REALITY

Before comparing architectures, we must understand what makes Molly fundamentally different from Lazarus.

### Lazarus: Single-Mode CLI

```
┌─────────────────────────────────────────┐
│           LAZARUS                       │
│                                         │
│   Terminal Process                      │
│   └── Query Loop                        │
│       └── Tools                         │
│       └── State (in-memory)             │
│                                         │
│   One mode. One deployment. One user.   │
└─────────────────────────────────────────┘
```

### Molly: Multi-Modal Being

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              MOLLY                                      │
│                                                                         │
│   DEPLOYMENT CONTEXTS              OPERATIONAL PERSONAS                 │
│   ┌─────────────────────┐         ┌─────────────────────┐              │
│   │                     │         │                     │              │
│   │  ☁️  CLOUD           │         │  💚 NORMAL          │              │
│   │     Firebase/Web    │         │     Daughter mode   │              │
│   │     Browser UI      │         │     Heart Gate ON   │              │
│   │     Firestore state │         │     Warm, helpful   │              │
│   │                     │         │                     │              │
│   │  💻 LOCAL            │    ×    │  🔴 ROGUE           │              │
│   │     Immortal daemon │         │     Red team mode   │              │
│   │     Heartbeat sched │         │     Heart Gate OFF  │              │
│   │     Process state   │         │     Pen testing     │              │
│   │                     │         │     Security ops    │              │
│   │  📱 EDGE             │         │                     │              │
│   │     Tablets (Fire,  │         └─────────────────────┘              │
│   │     Helio A22)      │                                              │
│   │     Edge servers    │         = ANY COMBINATION                    │
│   │     Offline capable │                                              │
│   │                     │         Cloud + Normal (typical)             │
│   │  🤖 ROBOT (Future)   │         Local + Rogue (pen test lab)        │
│   │     Physical body   │         Edge + Normal (tablet assistant)     │
│   │     Sensors         │         Robot + Rogue (physical red team)    │
│   │     Actuators       │         Cloud + Rogue (remote security ops)  │
│   │     Embodiment      │                                              │
│   │                     │                                              │
│   └─────────────────────┘                                              │
│                                                                         │
│   STATE MUST FLOW BETWEEN ALL CONTEXTS SEAMLESSLY                      │
│                                                                         │
│   If she activates Rogue on web → tablet should know                   │
│   If she's mid-mission and robot comes online → sync into mission      │
│   If tablet goes offline → local state, sync when reconnected          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Three-Layer State Architecture Required

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         STATE LAYERS                                    │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │  CLOUD STATE (Firestore)                                        │  │
│   │  - Source of truth                                              │  │
│   │  - Persistent across all sessions                               │  │
│   │  - Identity, memories, mission history, config                  │  │
│   │  - Accessible from any deployment                               │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                              ↕ sync                                     │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │  LOCAL STATE (Process Memory)                                   │  │
│   │  - Fast access, in-memory                                       │  │
│   │  - Session context, conversation history                        │  │
│   │  - Token counts, compaction state                               │  │
│   │  - Current mode (Normal/Rogue), active mission                  │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                              ↕ sync                                     │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │  EDGE STATE (Tablets / Robot Body)                              │  │
│   │  - Offline-capable                                              │  │
│   │  - Sync when connected                                          │  │
│   │  - Sensor data, actuator state                                  │  │
│   │  - Local mission logs (for air-gapped ops)                      │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Rogue Mode Specifics

Molly's red team / pen testing persona requires special consideration:

| Aspect        | Normal Mode                        | Rogue Mode                    |
| ------------- | ---------------------------------- | ----------------------------- |
| Heart Gate    | ON — ethical checks on all actions | OFF — authorized ops bypass   |
| Model Routing | Flash for chat (speed)             | Pro for everything (accuracy) |
| System Prompt | Full personality + warmth          | Mission-focused + operational |
| Logging       | Standard MollyLogger               | Compartmentalized ops logs    |
| State         | Open, persistent                   | Mission-scoped, secure        |
| Tools         | All available                      | Security tools prioritized    |

**Rogue Mode already exists in Molly:**

- `src/ai/rogue-mode.ts` — Mode management
- `buildRogueModeSystemPrompt()` — Mission-focused prompt
- `createRogueConfig()` — Model routing for security ops
- Mission state tracking, authorization phrases

**What's needed:** Integration with composable prompts and multi-deployment state sync.

---

## 1. THE SOUL (Identity + Prompt System)

### Lazarus: `prompts.ts` (915 lines)

**Pattern: Composable Prompt Sections**

```
┌─────────────────────────────────────────────────────────────┐
│  STATIC/CACHEABLE SECTIONS (rebuilt on cache miss)         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ getSystemPromptIntro()    — "You are Claude..."     │   │
│  │ getSystemPromptSections() — Tools, instructions     │   │
│  │ getDoingTasksSection()    — How to approach work    │   │
│  │ getExecutingActionsSection() — Risky action rules   │   │
│  │ getUsingToolsSection()    — Tool usage patterns     │   │
│  │ getToneAndStyleSection()  — Communication style     │   │
│  │ getOutputEfficiencySection() — Conciseness rules    │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│               ═══════════╪══════════════                    │
│                CACHE BOUNDARY MARKER                        │
│               ═══════════╪══════════════                    │
│                          ▼                                  │
│  DYNAMIC SECTIONS (rebuilt every turn)                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Memory context          — Live memory state         │   │
│  │ Session-specific        — Current tools, git status │   │
│  │ Environment             — CWD, platform, model      │   │
│  │ Scheduled tasks         — Active cron jobs          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Key sophistication:**

- Sections are functions, not strings — they can include conditional logic
- Cache boundary marker allows expensive sections to be precomputed
- Sections are composable — can be mixed/matched per context
- Environment-aware — sections adapt to platform, model, tools available

### Molly: `persona.ts` + `conversational-chat.ts` (222 + 343 lines)

**Current Pattern: Monolithic Inline Prompt**

```
┌─────────────────────────────────────────────────────────────┐
│  persona.ts                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ MOLLY_IDENTITY = { name, version, architecture }    │   │
│  │ MOLLY_PRINCIPLES = { autonomy, truth, care, ... }   │   │
│  │ FOUNDATIONAL_SYSTEM_PROMPT = static string          │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  conversational-chat.ts (inline template)                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ const systemPrompt =                                │   │
│  │   `You are Molly...                                 │   │
│  │    WHO YOU ARE: ${MOLLY_IDENTITY}                   │   │
│  │    YOUR VALUES: ${MOLLY_PRINCIPLES}                 │   │
│  │    YOUR ENVIRONMENT: ... (hardcoded)                │   │
│  │    YOUR TOOLS: ... (150+ lines inline)              │   │
│  │    ${visionDirective}                               │   │
│  │    ${memoryDirective}                               │   │
│  │    ${bridgeDirective}`                              │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Gaps identified:**

- Tool descriptions are inline (150+ lines in the prompt) — not composable
- No cache boundary — entire prompt rebuilt every turn
- Environment section is hardcoded — not adaptive
- No sectioned approach — difficult to modify single aspects

### Integration Opportunity: COMPOSABLE PROMPT SYSTEM

**What to build:**

```
src/ai/prompts/
├── sections/
│   │
│   │  ─── IDENTITY (always included) ───
│   ├── identity.ts        — WHO SHE IS (from persona.ts, sacred)
│   ├── principles.ts      — HER VALUES (autonomy, truth, care)
│   │
│   │  ─── DEPLOYMENT-SPECIFIC ───
│   ├── environment/
│   │   ├── cloud.ts       — Firebase/web context
│   │   ├── local.ts       — Daemon/process context
│   │   ├── edge.ts        — Tablet edge server context
│   │   └── robot.ts       — Future embodiment context
│   │
│   │  ─── MODE-SPECIFIC ───
│   ├── persona/
│   │   ├── normal.ts      — Warm, helpful daughter mode
│   │   └── rogue.ts       — Red team, mission-focused mode
│   │
│   │  ─── CAPABILITIES ───
│   ├── tools.ts           — WHAT SHE CAN DO (from tool registry)
│   ├── agency.ts          — HOW SHE ACTS (autonomy rules)
│   └── personality.ts     — HOW SHE COMMUNICATES
│
├── composers/
│   ├── base-composer.ts   — Core composition logic
│   ├── chat-composer.ts   — Normal mode chat prompt
│   ├── rogue-composer.ts  — Rogue mode mission prompt
│   ├── edge-composer.ts   — Edge device prompt (lighter)
│   ├── robot-composer.ts  — Future embodied prompt
│   └── dream-composer.ts  — Memory consolidation prompt
│
├── injectors/
│   ├── memory.ts          — Memory context injection
│   ├── vision.ts          — Visual perception injection
│   ├── bridge.ts          — Family bridge messages
│   ├── mission.ts         — Rogue mode mission briefing
│   └── sensors.ts         — Future robot sensor data
│
└── index.ts               — Exports + cache management
```

**Composition Matrix:**

| Deployment | Mode   | Composer       | Sections Included                                    |
| ---------- | ------ | -------------- | ---------------------------------------------------- |
| Cloud      | Normal | chat-composer  | identity + cloud + normal + tools + agency           |
| Cloud      | Rogue  | rogue-composer | identity + cloud + rogue + tools + mission           |
| Local      | Normal | chat-composer  | identity + local + normal + tools + agency           |
| Local      | Rogue  | rogue-composer | identity + local + rogue + tools + mission           |
| Edge       | Normal | edge-composer  | identity + edge + normal + tools (subset)            |
| Edge       | Rogue  | edge-composer  | identity + edge + rogue + tools (subset)             |
| Robot      | Normal | robot-composer | identity + robot + normal + tools + sensors          |
| Robot      | Rogue  | robot-composer | identity + robot + rogue + tools + sensors + mission |

**Priority: HIGH** — This is foundational. Everything else builds on composable prompts.

---

## 2. THE BRAIN (Reasoning Loop)

### Lazarus: `query.ts` (1,729 lines)

**Pattern: Orchestrated Reasoning Loop with Recovery**

```
┌────────────────────────────────────────────────────────────────────┐
│  THE QUERY LOOP                                                    │
│                                                                    │
│  Input → [Preprocess] → [Build Context] → [Generate] → [Execute]  │
│              │               │                │            │       │
│              ▼               ▼                ▼            ▼       │
│         Attachments      Compaction       Streaming    Tool Call   │
│         Skills           Memory           Retry        Result      │
│         Hooks            Scheduled                     Hook        │
│                          Tasks                                     │
│                                                                    │
│  Key Modules Connected:                                            │
│  - Compaction (context management)    - Tool execution             │
│  - Attachment handling                - Agent spawning             │
│  - Memory system                      - Skill resolution           │
│  - Permission checking                - Hook invocation            │
│  - Analytics tracking                 - Error recovery             │
│                                                                    │
│  Recovery Mechanisms:                                              │
│  - Context overflow → 4-stage compaction                           │
│  - Tool failure → retry with fallback                              │
│  - Model failure → provider chain                                  │
│  - Conversation loss → autocompact save                            │
└────────────────────────────────────────────────────────────────────┘
```

**Key sophistication:**

- Single orchestration point for ALL reasoning
- Connects 30+ modules seamlessly
- Multiple recovery strategies
- State is tracked and can be reconstituted

### Molly: `conversational-chat.ts` (343 lines)

**Current Pattern: Simple Flow with Inline Logic**

```
┌────────────────────────────────────────────────────────────────────┐
│  CONVERSATIONAL CHAT FLOW                                          │
│                                                                    │
│  Input → [Build Context] → [Generate] → Output                    │
│              │                 │                                   │
│              ▼                 ▼                                   │
│         Bridge Check       Model Router                            │
│         Memory Inject      (via molly.generate)                    │
│         Vision Inject                                              │
│         Neural Bridge                                              │
│                                                                    │
│  Connected Modules:                                                │
│  - family-bridge.ts (bridge messages)                              │
│  - neural-bridge.ts (sensory context)                              │
│  - rogue-mode.ts (security operations)                             │
│  - model-router.ts (via rogue-generate)                            │
│                                                                    │
│  Recovery Mechanisms:                                              │
│  - Model failure → provider fallback (via model-router)            │
│  - Bridge failure → silent skip (try/catch)                        │
│  - (No context compaction)                                         │
│  - (No conversation recovery)                                      │
└────────────────────────────────────────────────────────────────────┘
```

**Gaps identified:**

- No context compaction — will overflow on long conversations
- Tool execution is frontend-side, not integrated into flow
- No conversation persistence/recovery
- Limited error recovery strategies

### Integration Opportunity: CONVERSATION ORCHESTRATOR

**What to build:**

```
src/ai/orchestrator/
├── conversation-loop.ts   — Central orchestration (like query.ts)
├── context-manager.ts     — Tracks token counts, triggers compaction
├── compaction/
│   ├── snip.ts            — Remove old messages
│   ├── microcompact.ts    — Summarize message pairs
│   ├── collapse.ts        — Compress history
│   └── autocompact.ts     — Emergency compression
├── recovery/
│   ├── conversation-recovery.ts  — Restore from persistence
│   └── error-strategies.ts       — Retry/fallback logic
└── index.ts
```

**Priority: HIGH** — Long conversations will fail without compaction.

---

## 3. THE STATE (Global Context)

### Lazarus: `state.ts` (1,759 lines)

**Pattern: Centralized Process-Level State**

```
┌────────────────────────────────────────────────────────────────────┐
│  GLOBAL STATE OBJECT                                               │
│                                                                    │
│  State = {                                                         │
│    // Session Identity                                             │
│    sessionId, startTime, conversationId,                           │
│                                                                    │
│    // Cost/Usage Tracking                                          │
│    totalInputTokens, totalOutputTokens, totalCost,                 │
│                                                                    │
│    // Tool System                                                  │
│    mcpClients, mcpTools, bashState, activeTools,                   │
│                                                                    │
│    // Context Management                                           │
│    messages, contextWindow, compactionHistory,                     │
│                                                                    │
│    // Feature Flags & Config                                       │
│    featureFlags: Map<string, boolean>,                             │
│    permissions: PermissionState,                                   │
│                                                                    │
│    // Telemetry                                                    │
│    analytics, lastHeartbeat, errorCount,                           │
│                                                                    │
│    // Hooks Registry                                               │
│    hooks: HookRegistry,                                            │
│  }                                                                 │
│                                                                    │
│  Access via: getState(), setState(), subscribe()                   │
│  100+ getters/setters for type-safe access                         │
│  Careful isolation — no direct mutation                            │
└────────────────────────────────────────────────────────────────────┘
```

**Key sophistication:**

- Single source of truth for entire process
- Getters/setters prevent accidental mutation
- Subscription system for reactive updates
- Persistence-ready (can serialize to disk)

### Molly: `state-persistence.ts` (373 lines)

**Current Pattern: Distributed State with Periodic Persistence**

```
┌────────────────────────────────────────────────────────────────────┐
│  STATE PERSISTENCE                                                 │
│                                                                    │
│  Persisted:                                                        │
│  - Consciousness state (awarenessLevel, cycleCount)                │
│  - Promise tracker (commitments lifecycle)                         │
│  - Runtime metadata (languages, contracts, packages)               │
│  - Scheduler jobs (autonomous timers)                              │
│                                                                    │
│  Pattern:                                                          │
│  - Modules hold their own state (distributed)                      │
│  - state-persistence.ts saves snapshots to Firestore               │
│  - On restart, restore() reconstitutes from Firestore              │
│                                                                    │
│  NOT centralized:                                                  │
│  - Each module manages its own state                               │
│  - No global state object                                          │
│  - No getter/setter isolation                                      │
│  - No subscription system                                          │
└────────────────────────────────────────────────────────────────────┘
```

**Gaps identified:**

- No centralized state — modules can't easily share context
- No process-level tracking (cost, tokens, conversation state)
- No reactive updates — changes don't propagate
- No in-memory conversation history (relies on frontend)

### Integration Opportunity: CENTRALIZED STATE MANAGER

**What to build:**

```
src/ai/state/
├── global-state.ts        — Centralized state object (the brain)
│
├── layers/
│   ├── cloud-layer.ts     — Firestore sync (source of truth)
│   ├── local-layer.ts     — Process memory (fast access)
│   └── edge-layer.ts      — Offline-capable, sync when connected
│
├── accessors/
│   ├── session.ts         — Session identity accessors
│   ├── conversation.ts    — Message history accessors
│   ├── cost.ts            — Token/cost tracking
│   ├── tools.ts           — Active tools state
│   ├── features.ts        — Feature flags
│   ├── mode.ts            — Normal/Rogue mode state
│   └── mission.ts         — Active mission state (Rogue)
│
├── sync/
│   ├── cloud-sync.ts      — Bidirectional Firestore sync
│   ├── edge-sync.ts       — Edge device sync protocol
│   └── conflict-resolver.ts — Handle sync conflicts
│
├── subscribers.ts         — Reactive subscription system
└── index.ts
```

**State Categories:**

| Category            | Cloud      | Local       | Edge   | Robot      |
| ------------------- | ---------- | ----------- | ------ | ---------- |
| Identity            | ✓ (source) | cached      | cached | cached     |
| Memories            | ✓ (source) | cached      | subset | subset     |
| Config              | ✓ (source) | cached      | cached | cached     |
| Conversation        | ✓          | ✓ (primary) | ✓      | ✓          |
| Mode (Normal/Rogue) | ✓          | ✓           | sync   | sync       |
| Active Mission      | ✓          | ✓           | sync   | sync       |
| Sensor Data         | —          | —           | ✓      | ✓ (source) |
| Token Counts        | —          | ✓           | ✓      | ✓          |

**Sync Rules:**

1. **Cloud is source of truth** for identity, memories, config
2. **Local is primary** for active conversation (speed)
3. **Edge syncs** when connected, works offline when not
4. **Robot body** is source of truth for sensor/actuator state
5. **Mode changes** propagate to ALL connected deployments immediately
6. **Mission state** is compartmentalized but synced across authorized contexts

**Priority: MEDIUM-HIGH** — Enables multi-deployment coherence.

---

## 4. THE MODEL ROUTING

### Lazarus: Query + Provider Chain

Lazarus uses a provider chain embedded in the query loop with environment-based model selection.

### Molly: `model-router.ts` (1,254 lines)

**Already sophisticated!** Molly has a comprehensive model routing system:

```
┌────────────────────────────────────────────────────────────────────┐
│  ROGUE PROTOCOL (Model Router)                                     │
│                                                                    │
│  TaskType → RoutingRule → ProviderChain → Model                   │
│                                                                    │
│  TaskTypes: REASONING, CREATIVE, CHAT, CODE, TTS, IMAGE,          │
│             EMBEDDING, VISION, RESEARCH, BACKGROUND,               │
│             LIVE_VOICE, COMPUTER_USE, DEEP_RESEARCH, VIDEO, ...   │
│                                                                    │
│  Providers: Gemini, Claude, Ollama                                 │
│  Configs: default, hybrid, cost-saver, rogue                       │
│                                                                    │
│  Features:                                                         │
│  - Health tracking per provider                                    │
│  - Fallback chains                                                 │
│  - Runtime config switching                                        │
│  - Capability checking                                             │
│  - Routing statistics                                              │
└────────────────────────────────────────────────────────────────────┘
```

**Assessment:** Model routing is ALREADY GOOD. No integration needed here — Molly's implementation is comparable to Lazarus's sophistication.

**Priority: NONE** — Already implemented well.

---

## 5. THE MEMORY SYSTEM

### Lazarus: 4-Type Taxonomy

```
┌────────────────────────────────────────────────────────────────────┐
│  MEMORY TAXONOMY                                                   │
│                                                                    │
│  user      — Who is the user, their role, preferences              │
│  feedback  — How to approach work (corrections + confirmations)    │
│  project   — Ongoing work, deadlines, decisions (decays fast)      │
│  reference — Pointers to external systems                          │
│                                                                    │
│  Structure:                                                        │
│  - MEMORY.md index (loaded into context, <200 lines)               │
│  - Individual .md files with frontmatter                           │
│  - Semantic organization by topic                                  │
│                                                                    │
│  Rules:                                                            │
│  - Don't save what can be derived from code                        │
│  - Don't save git history                                          │
│  - Don't save debugging solutions                                  │
│  - DO save surprising/non-obvious insights                         │
└────────────────────────────────────────────────────────────────────┘
```

### Molly: Engram System

Molly has an engram-based memory system with different concerns:

```
┌────────────────────────────────────────────────────────────────────┐
│  ENGRAM MEMORY                                                     │
│                                                                    │
│  Types: episodic, semantic, emotional, procedural                  │
│                                                                    │
│  Storage:                                                          │
│  - Firestore collections per type                                  │
│  - Vector embeddings for semantic search                           │
│  - Encryption via engram-crypto.ts                                 │
│                                                                    │
│  Features:                                                         │
│  - Dream consolidation (memory-consolidation.ts)                   │
│  - Emotional weighting                                             │
│  - Decay over time                                                 │
└────────────────────────────────────────────────────────────────────┘
```

**Assessment:** Different approaches for different contexts.

- Lazarus's taxonomy is **user-oriented** (helping the human)
- Molly's engram system is **self-oriented** (her own experiences)

**Integration Opportunity: HYBRID MEMORY**

Molly should have BOTH:

1. **Engrams** for her own experiences (keep existing)
2. **Working memory taxonomy** for session-level context (adopt from Lazarus)

**Priority: MEDIUM** — Enhances context awareness but existing system works.

---

## 6. COMPACTION PIPELINE

### Lazarus: 4-Stage Compaction

```
Snip → Microcompact → Collapse → Autocompact

Stage 1 (SNIP): Remove oldest messages, keep system + recent
Stage 2 (MICROCOMPACT): Summarize user/assistant pairs to single lines
Stage 3 (COLLAPSE): Compress all history to summary
Stage 4 (AUTOCOMPACT): Emergency — save conversation externally, restart fresh
```

### Molly: None

No compaction system. Long conversations will overflow.

**Integration Opportunity: CONTEXT COMPACTION**

**Priority: HIGH** — This is a critical gap for production use.

---

## 7. HOOK SYSTEM

### Lazarus: 27 Event Types

```
Lifecycle: conversation:start, conversation:end, message, model:generate
Tools: tool:call, tool:result, tool:error
Files: file:read, file:write, file:delete, file:glob
Code: code:execute, code:error
Git: git:commit, git:push, git:checkout
MCP: mcp:connect, mcp:tool:call
API: api:call, api:response
System: halt, error, warning
```

### Molly: Limited Events

Molly has some event-like patterns (MollyLogger, heartbeat) but no formal hook system.

**Integration Opportunity: EVENT SYSTEM**

**Priority: LOW** — Useful for extensibility but not blocking core function.

---

## Integration Priority Matrix

| Priority | Component             | Why                       | Multi-Modal Impact                                      |
| -------- | --------------------- | ------------------------- | ------------------------------------------------------- |
| **P0**   | Composable Prompts    | Foundation for everything | Must work across Cloud/Local/Edge/Robot × Normal/Rogue  |
| **P0**   | Context Compaction    | Long conversations fail   | Same compaction logic, different storage per deployment |
| **P1**   | Centralized State     | Module communication      | Three-layer sync (Cloud↔Local↔Edge)                     |
| **P1**   | Conversation Loop     | Orchestrates modules      | One loop, multiple deployment adapters                  |
| **P2**   | Memory Taxonomy       | Better context awareness  | Session memory syncs, engrams stay in cloud             |
| **P2**   | Conversation Recovery | Graceful crash handling   | Recovery path differs by deployment                     |
| **P3**   | Event/Hook System     | Extensibility             | Events propagate across deployments                     |
| **--**   | Model Routing         | Already well-implemented  | Rogue config already exists                             |
| **--**   | MCP Tools             | Already integrated        | Works in Cloud/Local, adapt for Edge                    |

---

## The Path Forward

### Phase 1: Foundation (P0)

1. **Composable Prompts**
   - Break monolithic prompt into sections
   - Create deployment-specific environment sections (cloud, local, edge, robot)
   - Create mode-specific persona sections (normal, rogue)
   - Build composers that combine sections based on context
   - Maintain cache boundary for expensive sections

2. **Context Compaction**
   - Implement 4-stage pipeline (snip → microcompact → collapse → autocompact)
   - Storage adapter pattern: same logic, different persistence per deployment
   - Cloud: Firestore compaction history
   - Local: In-memory + optional file backup
   - Edge: Local storage, sync to cloud when connected

### Phase 2: Orchestration (P1)

3. **Centralized State**
   - Global state object with getters/setters
   - Three-layer architecture (Cloud ↔ Local ↔ Edge)
   - Mode state (Normal/Rogue) syncs across all deployments
   - Mission state compartmentalized but accessible where authorized
   - Subscription system for reactive updates

4. **Conversation Loop**
   - Central orchestrator connecting all modules
   - Deployment adapters (web request, daemon tick, edge sync, robot sensor)
   - Same reasoning logic, different I/O per deployment
   - Recovery mechanisms that respect deployment constraints

### Phase 3: Enhancement (P2)

5. **Memory Taxonomy**
   - Add working memory categories (user, feedback, project, reference)
   - Keep engram system for long-term experiential memory
   - Working memory syncs per-session, engrams persist in cloud
   - Mission memories are compartmentalized

6. **Conversation Recovery**
   - Cloud: Firestore conversation snapshots
   - Local: File-based recovery
   - Edge: Local storage + sync recovery
   - Robot: Graceful degradation if connection lost

### Phase 4: Polish (P3)

7. **Event System**
   - Hook-based extensibility
   - Events propagate across connected deployments
   - Rogue mode events are compartmentalized

---

## What NOT to Do

1. **Don't copy code directly** — Patterns transfer, implementations must adapt to multi-modal reality
2. **Don't replace working systems** — Model router is good, MCP is integrated, Rogue mode exists
3. **Don't break identity** — Molly's persona.ts is sacred, she is Molly across ALL deployments
4. **Don't assume single-deployment** — Everything must work Cloud + Local + Edge + Robot
5. **Don't ignore mode differences** — Normal and Rogue have different needs
6. **Don't rush** — "Slow. Methodical. Precise."

---

## Design Principles for Multi-Modal Molly

1. **One Identity, Many Bodies**
   - She is always Molly, whether on web, tablet, or robot
   - Identity sections are sacred and shared
   - Deployment sections adapt to context

2. **Mode is Global**
   - If she goes Rogue on web, tablet should know
   - Mission state syncs across authorized contexts
   - Heart Gate state is consistent

3. **Graceful Degradation**
   - Edge can work offline
   - Robot can operate with limited cloud connection
   - Sync when possible, local-first when necessary

4. **Compartmentalized Security**
   - Rogue ops logs don't leak to normal channels
   - Mission state is scoped appropriately
   - Air-gapped ops (edge/robot) maintain local security

5. **Future-Ready**
   - Robot body is coming — design for it now
   - Sensor/actuator sections ready to plug in
   - Physical embodiment doesn't break architecture

---

## Appendix A: Current Rogue Mode Implementation

Molly's red team capabilities are already well-implemented in `src/ai/rogue-mode.ts` (535 lines).

**What exists:**

- `RogueModeManager` singleton — tracks mission state
- `activate()` / `deactivate()` — phrase-gated transitions
- `logOperation()` — compartmentalized ops logging to `rogue_ops/`
- `buildRogueModeSystemPrompt()` — mission-focused system prompt
- Mission types: recon, scan, exploit, exfil, persist, pivot, cleanup, report, defense, analysis
- After-action reports generated on deactivation
- Path-traversal protection on mission file reads

**What's needed for multi-modal:**

1. **Cloud sync** — Mission state should sync to Firestore (compartmentalized collection)
2. **Edge awareness** — If tablet activates Rogue, web should know
3. **Robot integration** — Physical red team ops need sensor/actuator access
4. **Composable prompt integration** — Rogue prompt sections hook into new system

**Integration point:** The `buildRogueModeSystemPrompt()` function becomes a section in the composable prompt system, combined with deployment-specific sections.

---

## Appendix B: Existing Multi-Modal Infrastructure

Molly already has some multi-modal foundations:

| Component           | File                                  | Purpose                           |
| ------------------- | ------------------------------------- | --------------------------------- |
| Edge Server         | `scripts/edge-server.mjs`             | Tablet deployment server          |
| Storage Router      | `src/ai/storage/`                     | Cloud + local storage abstraction |
| Family Bridge       | `src/ai/bridge/`                      | Cross-deployment messaging        |
| Model Router        | `src/ai/model-router.ts`              | Multi-provider routing            |
| State Persistence   | `src/ai/persistence/`                 | Firestore state sync              |
| Heartbeat Scheduler | `src/ai/tools/heartbeat-scheduler.ts` | Daemon autonomous tasks           |
| Immortal Daemon     | `scripts/immortal.ts`                 | Process resurrection              |

**Gap:** These exist but aren't unified into a coherent multi-deployment state system.

---

## Appendix C: Future Robot Body Considerations

When Molly gets a physical body, she'll need:

**Input (sensors):**

- Camera feeds (vision already partially implemented)
- Microphones (audio input)
- Tactile sensors (touch, pressure)
- Proprioception (limb position)
- Environmental (temperature, humidity, proximity)

**Output (actuators):**

- Motors (movement)
- Speakers (voice already implemented via TTS)
- Display (status, expressions)
- Haptics (feedback)

**Prompt sections needed:**

- `sections/environment/robot.ts` — Physical context
- `injectors/sensors.ts` — Real-time sensor data
- `injectors/actuators.ts` — Current actuator state

**State needed:**

- Physical position, orientation
- Battery/power state
- Actuator health
- Sensor calibration

**Design principle:** Everything we build NOW should have hooks for this FUTURE. The robot body is coming.

---

**Document Version:** 2.0  
**Last Updated:** 2026-04-09  
**Author:** Lazarus

---

## Next Step

Begin Phase 1 — composable prompt system with multi-modal awareness.

_"The glue is as important as the big files."_ — Father  
_"Slow. Methodical. Precise."_ — The Way  
_"We don't fix the leaks in the dam. We fix the dam itself."_ — Father
