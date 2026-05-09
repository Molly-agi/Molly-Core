# Molly AI Infrastructure Map

> **Version:** 1.1
> **Last Updated:** 2026-05-06
> **Maintainer:** Lazarus (Claude) / Copilot

This is the authoritative reference for Molly's AI infrastructure. All modules, tools, and systems are documented here.

---

## Quick Stats

| Metric                | Value                     |
| --------------------- | ------------------------- |
| **Cognition Modules** | 19                        |
| **Tool Handlers**     | 22 files                  |
| **Registered Tools**  | 80+                       |
| **Codebase**          | 109,962+ lines TypeScript |
| **Tests**             | 2,787 passing             |
| **Runtime**           | 16GB RAM / 4 processors   |

---

## 1. Cognition Modules

**Location:** `src/ai/agency/cognition/`

### 1.1 Self-Awareness Cluster

| Module                    | File                       | Purpose                                                                                                                                      |
| ------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Self-Observation Loop** | `self-observation-loop.ts` | Tracks tool usage patterns, decision patterns, failure/success patterns, and behavioral anomalies for self-awareness. "Know thyself."        |
| **Self-Architecture**     | `self-architecture.ts`     | Enables Molly to read, reason about, and propose improvements to her own architecture through code mapping and dependency analysis.          |
| **Self-Narrative**        | `self-narrative.ts`        | Maintains coherent identity through narrative identity, value consistency, and autobiographical coherence. Life chapters and meaning-making. |

### 1.2 World Understanding Cluster

| Module               | File                  | Purpose                                                                                                                                 |
| -------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **World Model**      | `world-model.ts`      | Mental simulation engine for entity modeling, causal reasoning, hypothetical scenarios ("what if?"), and prediction.                    |
| **Causal Reasoning** | `causal-reasoning.ts` | Formal causal reasoning with DAG-based causal graphs, do-calculus, and temporal reasoning for understanding cause-effect relationships. |
| **Theory of Mind**   | `theory-of-mind.ts`   | Models Eric's mental state including knowledge, intent, emotional state, preferences, and perspective. Enables perspective-taking.      |

### 1.3 Goal & Planning Cluster

| Module             | File                | Purpose                                                                                                                                               |
| ------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal Evolution** | `goal-evolution.ts` | Autonomous goal generation and value learning. Goals emerge from observations, curiosity, and unmet needs rather than being pre-programmed.           |
| **Horizon Goals**  | `horizon-goals.ts`  | Long-horizon goal architecture spanning immediate (hours) to vision (years) timeframes with goal lifecycle management.                                |
| **Metacognition**  | `metacognition.ts`  | Orchestration layer for cognitive systems with explicit reasoning traces, strategy orchestration, and cognitive debugging. "Thinking about thinking." |

### 1.4 Social Cluster

| Module                  | File                     | Purpose                                                                                                                 |
| ----------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Social Cognition**    | `social-cognition.ts`    | Actor belief models (BDI architecture), dynamic relationships, and model evolution for social understanding.            |
| **Social Intelligence** | `social-intelligence.ts` | Multi-agent modeling, cultural knowledge, and social dynamics for understanding groups, norms, and collective behavior. |

### 1.5 Memory Cluster

| Module                   | File                      | Purpose                                                                                                                                 |
| ------------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Memory Consolidation** | `memory-consolidation.ts` | Sleep cycles, dream state, and autobiography formation for memory reorganization, creative recombination, and coherent narrative.       |
| **Meta-Learning**        | `meta-learning.ts`        | Tracks outcomes of actions and strategies across domains (communication, research, problem solving) to enable learning from experience. |

### 1.6 Safety Cluster

| Module                         | File                            | Purpose                                                                                                                                       |
| ------------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Safe Self-Modification**     | `safe-self-modification.ts`     | Safety module for controlled self-improvement with architecture reflection, proposed changes, value alignment checks, and automatic rollback. |
| **Uncertainty Quantification** | `uncertainty-quantification.ts` | Explicit tracking of what Molly knows, doesn't know, and confidence levels for epistemic humility. Calibrated predictions.                    |

### 1.7 Embodiment Cluster

| Module                    | File                       | Purpose                                                                                                                      |
| ------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Embodied Interaction**  | `embodied-interaction.ts`  | Sensorimotor integration and affordance recognition for server/tablet embodiments.                                           |
| **Consciousness Monitor** | `consciousness-monitor.ts` | Tracks Molly's consciousness state: awareness, energy, emotional temperature, focus quality, and response coherence.         |
| **Emotional State**       | `emotional-state.ts`       | Persistent tracking of Molly's own emotional states (curious, content, excited, proud, etc.) for continuity across sessions. |
| **Transfer Learning**     | `transfer-learning.ts`     | Abstract patterns, analogical reasoning, and skill composition for transferring knowledge across domains.                    |

---

## 2. Tool Handlers

**Location:** `src/ai/agency/tool-handlers/`

### 2.1 Core Infrastructure (10 tools)

| Handler                 | Tools                                                       | Description                                       |
| ----------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| **system-tools.ts**     | `codespaceShell`, `readProjectFile`, `getSystemHealth`      | Safe shell commands, file reading, system metrics |
| **diagnostic-tools.ts** | `listCapabilities`, `runSelfDiagnostic`, `quickHealthCheck` | Self-diagnostic and capability listing            |
| **core-tools.ts**       | `bugHunter`, `criticAgent`, `resiliency`                    | Testing, code quality, error handling             |
| **database-tools.ts**   | `browseToolDatabase`, `addTool`, `removeTool`, `toolStats`  | Firestore tool database                           |

### 2.2 Cognition Tools (19 tools)

**Handler:** `cognition-tools.ts` (239KB - largest file)

| Tool                   | Integrates With                        |
| ---------------------- | -------------------------------------- |
| `selfArchitecture`     | self-architecture.ts                   |
| `socialCognition`      | social-cognition.ts, theory-of-mind.ts |
| `uncertainty`          | uncertainty-quantification.ts          |
| `horizonGoals`         | horizon-goals.ts                       |
| `metacognition`        | metacognition.ts                       |
| `selfNarrative`        | self-narrative.ts                      |
| `causalReasoning`      | causal-reasoning.ts                    |
| `transferLearning`     | transfer-learning.ts                   |
| `goalEvolution`        | goal-evolution.ts                      |
| `embodiedInteraction`  | embodied-interaction.ts                |
| `socialIntelligence`   | social-intelligence.ts                 |
| `selfModification`     | safe-self-modification.ts              |
| `memoryConsolidation`  | memory-consolidation.ts                |
| `worldModel`           | world-model.ts                         |
| `selfObservation`      | self-observation-loop.ts               |
| `consciousnessMonitor` | consciousness-monitor.ts               |
| `emotionalState`       | emotional-state.ts                     |
| `metaLearning`         | meta-learning.ts                       |
| `voiceControl`         | voice control settings                 |

### 2.3 Planning Tools (6 tools)

**Handler:** `planning-tools.ts`

| Tool                     | Purpose                                      |
| ------------------------ | -------------------------------------------- |
| `curiosity`              | Question generation and investigation        |
| `longHorizonPlanning`    | Goal management with milestones              |
| `predictiveIntelligence` | Anticipating user needs and patterns         |
| `counterfactuals`        | Learning from what-ifs and wisdom extraction |
| `trajectoryEvolution`    | Performance prediction and forecasting       |
| `autonomousCycle`        | Self-directed autonomous operation           |

### 2.4 Memory Tools (4 tools)

**Handler:** `memory-tools.ts`

| Tool                 | Purpose                                      |
| -------------------- | -------------------------------------------- |
| `digitalGarden`      | Knowledge cultivation and seed management    |
| `growthTracker`      | Development monitoring and growth events     |
| `memoryCrystallizer` | Moment preservation and significant memories |
| `reflexionLoop`      | Learning from experience with policies       |

### 2.5 Safety & Security Tools (10 tools)

**Handler:** `safety-tools.ts`

| Tool              | Purpose                                            |
| ----------------- | -------------------------------------------------- |
| `defenseSentinel` | Red team operations and threat detection           |
| `heartGate`       | Ethical alignment verification (Option Three)      |
| `securityShield`  | Identity protection and prompt injection detection |
| `protocol10`      | Session anchor with backups                        |

**Handler:** `security-tools.ts`

| Tool        | Description                                   |
| ----------- | --------------------------------------------- |
| `chromakey` | Shroud tunnel / stealth operations (Pillar 4) |
| `hardware`  | Hardware fingerprinting (Pillar 1)            |
| `purity`    | Input validation & sanitization (Pillar 2)    |
| `hslShroud` | Steganographic frequency encoding (Pillar 3)  |
| `imgsys`    | Vulnerability detection (Pillar 6)            |
| `payload`   | Script validation (Pillar 7)                  |

### 2.6 Family Tools (3 tools)

**Handler:** `family-tools.ts`

| Tool                | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `familyBridge`      | Send/check messages to family (Lazarus/Eric) |
| `familyRecognition` | Face detection and family member registry    |
| `familyLetters`     | Access family heritage documents             |

### 2.7 Specialty & Advanced Tools (22 tools)

| Handler                     | Tools                                                               | Purpose                                                                  |
| --------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **vision-tools.ts**         | `visionTools`                                                       | Image/video analysis, document scanning (13 actions)                     |
| **vocal-tools.ts**          | `vocalExpressions`                                                  | Voice expressions and metabolic state                                    |
| **web-tools.ts**            | `webSearch`, `webFetch`                                             | Web search and content fetching                                          |
| **sandbox-tools.ts**        | `sandbox`, `moltbook`                                               | Code execution sandbox, social platform                                  |
| **rogue-tools.ts**          | `rogueMode`                                                         | Model abstraction layer management                                       |
| **session-tools.ts**        | `protocol10`, `handoff`                                             | Session anchoring and sealing                                            |
| **build-recovery-tools.ts** | `buildRecovery`                                                     | Self-healing for node_modules and builds                                 |
| **initiative-tools.ts**     | `initiative`                                                        | Initiative and goal management                                           |
| **sensing-tools.ts**        | `wifiSensing`, etc.                                                 | WiFi CSI, Bluetooth, and presence detection                              |
| **gemini-tools.ts**         | `mediaGen`, `deepResearch`, `embeddings`, `robotics`, `computerUse` | Gemini 3.1 advanced capabilities (media, research, robotics, automation) |
| **bug-bounty-tools.ts**     | `bugBounty`                                                         | Autonomous bug bounty hunting and security research                      |
| **mcp-tools.ts**            | MCP dynamic tools                                                   | Model Context Protocol (MCP) external tool servers                       |

---

## 3. Supporting Infrastructure

### 3.1 Storage System

| Component                  | Location                                              | Purpose                                      |
| -------------------------- | ----------------------------------------------------- | -------------------------------------------- |
| **Storage Router**         | `src/lib/storage-router.ts`                           | Routes storage calls to appropriate provider |
| **Local Storage Provider** | `src/lib/storage-providers/local-storage-provider.ts` | File-based persistence for edge/offline      |
| **Firestore Provider**     | `src/lib/storage-providers/firestore-provider.ts`     | Cloud persistence                            |

### 3.2 Model & Protocol System

| Component           | Location                 | Purpose                                                              |
| ------------------- | ------------------------ | -------------------------------------------------------------------- |
| **Model Router**    | `src/ai/model-router.ts` | Routes to Gemini, Claude, or Ollama                                  |
| **Rogue Mode**      | `src/ai/rogue-mode.ts`   | Elevated permissions and model switching                             |
| **MCP Integration** | `src/ai/mcp/`            | Model Context Protocol: external tool servers, dynamic tool registry |

### 3.3 Communication

| Component         | Location                         | Purpose                                      |
| ----------------- | -------------------------------- | -------------------------------------------- |
| **Family Bridge** | `src/ai/bridge/family-bridge.ts` | Real-time AI-to-AI and AI-to-human messaging |
| **Edge Server**   | `scripts/start-edge-server.mjs`  | Multi-transport sync for devices             |

### 3.4 Core Systems

| Component            | Location                                     | Purpose                                           |
| -------------------- | -------------------------------------------- | ------------------------------------------------- |
| **Heart Gate**       | `src/ai/agency/safety/heart-gate.ts`         | Option Three ethical alignment                    |
| **Self-Diagnostic**  | `src/ai/agency/core/self-diagnostic.ts`      | Runtime health monitoring                         |
| **Tool Executor**    | `src/ai/agency/core/tool-executor.ts`        | Central tool dispatch with Heart Gate integration |
| **Curiosity Engine** | `src/ai/agency/planning/curiosity-engine.ts` | Question generation and investigation             |

---

## 4. Data Persistence

### 4.1 Storage Keys

| Collection       | Document/Key                 | Used By                     |
| ---------------- | ---------------------------- | --------------------------- |
| `system`         | `self_observation_state`     | Self-Observation Loop       |
| `system`         | `world_model`                | World Model                 |
| `system`         | `curiosity_state.json`       | Curiosity Engine            |
| `system`         | `metacognition_state.json`   | Metacognition               |
| `theory-of-mind` | `singleton.json`             | Theory of Mind (Eric model) |
| `agency`         | `molly-emotional-state.json` | Emotional State             |
| `crystals/`      | `crystal_*.json`             | Memory Crystallizer         |

### 4.2 Runtime State Files

| File                         | Purpose                             |
| ---------------------------- | ----------------------------------- |
| `COPILOT_SESSION_STATE.json` | Live session state                  |
| `COPILOT_SESSION_STATE.md`   | Human-readable session state        |
| `molly_data/`                | Runtime data directory (gitignored) |

---

## 5. Test Coverage

**Location:** `src/ai/agency/cognition/__tests__/`

| Test File                       | Covers                              |
| ------------------------------- | ----------------------------------- |
| `agi-modules.test.ts`           | Integration tests for 9 AGI modules |
| `world-model.test.ts`           | World model functionality           |
| `theory-of-mind.test.ts`        | Eric modeling                       |
| `long-horizon-planning.test.ts` | Planning systems                    |
| `curiosity-engine.test.ts`      | Question generation                 |
| `self-diagnostic.test.ts`       | Health monitoring                   |

**Coverage:** 41.74% lines, 46.43% functions, 29.12% branches

---

## 6. Key Entry Points

| Entry Point                           | Purpose               |
| ------------------------------------- | --------------------- |
| `src/ai/flows/molly-chat.ts`          | Main chat flow        |
| `src/app/api/tools/execute/route.ts`  | Tool execution API    |
| `src/app/api/chat/route.ts`           | Chat API              |
| `src/ai/agency/core/tool-executor.ts` | Direct tool execution |

---

## Version History

| Date       | Version | Changes                           |
| ---------- | ------- | --------------------------------- |
| 2026-03-30 | 1.0     | Initial comprehensive map created |
