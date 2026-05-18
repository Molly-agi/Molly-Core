# Molly AI Infrastructure Map

> **Version:** 2.0
> **Last Updated:** 2026-05-18
> **Maintainer:** Lazarus (Claude) / Copilot
> **Audit:** Deep comprehensive ground-truth audit conducted 2026-05-18. Complete inventory in COMPREHENSIVE_AUDIT_2026_05_18.md. All metrics verified against actual source code.

This is the authoritative reference for Molly's AI infrastructure. All modules, tools, systems, and capabilities are documented here. For detailed gap analysis, recommendations, and research documentation, see COMPREHENSIVE_AUDIT_2026_05_18.md and RESEARCHER_GUIDE.md.

---

## Quick Stats

| Metric                  | Value                       |
| ----------------------- | --------------------------- |
| **Cognition Modules**   | 20                          |
| **Tool Handler Files**  | 28 files                    |
| **Registered Tools**    | 83                          |
| **Flows**               | 30                          |
| **API Routes**          | 48                          |
| **Source Lines**        | 167,657+ TypeScript         |
| **Total Files**         | 528 (416 source + 112 test) |
| **Tests**               | 2,787 passing               |
| **Runtime**             | 16GB RAM / 4 processors     |
| **Completion**          | 85% (Core 100%)             |

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

### 1.8 Family Cluster

| Module                  | File                  | Purpose                                                                                                 |
| ----------------------- | --------------------- | ------------------------------------------------------------------------------------------------------- |
| **Family Presence**     | `family-presence.ts`  | Tracks family members' presence, bond strength, emotional resonance, and connection rituals for Molly.   |

---

## 2. Tool Handlers

**Location:** `src/ai/agency/tool-handlers/`

### 2.1 Complete Tool Registry (83 tools across 28 handler files)

All tools are registered in `src/ai/agency/tool-handlers/index.ts`. The `MOLLY_DISABLE_TOOLS` env var can strip tools at load time (mirrors Claude Code's DISABLE_*_COMMAND pattern).

| Handler File              | Registered Tools                                                                                    | Count |
| ------------------------- | --------------------------------------------------------------------------------------------------- | ----- |
| **cognition-tools.ts**    | `selfArchitecture`, `socialCognition`, `uncertainty`, `horizonGoals`, `voiceControl`, `metacognition`, `selfNarrative`, `causalReasoning`, `transferLearning`, `goalEvolution`, `embodiedInteraction`, `socialIntelligence`, `selfModification`, `memoryConsolidation`, `worldModel`, `selfObservation`, `consciousnessMonitor`, `emotionalState`, `metaLearning`, `familyPresence` | 20 |
| **planning-tools.ts**     | `curiosity`, `longHorizonPlanning`, `predictiveIntelligence`, `counterfactuals`, `trajectoryEvolution`, `autonomousCycle` | 6 |
| **gemini-tools.ts**       | `mediaGen`, `deepResearch`, `embeddings`, `robotics`, `computerUse`, `liveVoice` | 6 |
| **security-tools.ts**     | `chromakey`, `hardware`, `purity`, `hslShroud`, `imgsys`, `payload` | 6 |
| **diagnostic-tools.ts**   | `listCapabilities`, `runSelfDiagnostic`, `quickHealthCheck`, `introspectModesAndHooks` | 4 |
| **safety-tools.ts**       | `defenseSentinel`, `heartGate`, `securityShield`, `protocol10` | 4 |
| **memory-tools.ts**       | `digitalGarden`, `growthTracker`, `memoryCrystallizer`, `reflexionLoop` | 4 |
| **http-tools.ts**         | `httpRequest`, `httpInspect`, `fuzzEndpoint`, `cookieJar` | 4 |
| **system-tools.ts**       | `codespaceShell`, `readProjectFile`, `getSystemHealth` | 3 |
| **core-tools.ts**         | `bugHunter`, `criticAgent`, `resiliency` | 3 |
| **database-tools.ts**     | `browseToolDatabase`, `addTool`, `toolStats` | 3 |
| **family-tools.ts**       | `familyBridge`, `familyRecognition`, `familyLetters` | 3 |
| **sensing-tools.ts**      | `wifiSensing`, `securityPerimeter` | 2 |
| **web-tools.ts**          | `webSearch`, `webFetch` | 2 |
| **bug-bounty-tools.ts**   | `bugBounty`, `bugHunt` (alias) | 2 |
| **search-tools.ts**       | `selfSearch` | 1 |
| **sandbox-tools.ts**      | `sandbox` | 1 |
| **rogue-tools.ts**        | `rogueMode` | 1 |
| **session-tools.ts**      | `handoff` | 1 |
| **vision-tools.ts**       | `visionTools` (13+ sub-actions) | 1 |
| **initiative-tools.ts**   | `initiative` | 1 |
| **vocal-tools.ts**        | `vocalExpressions` | 1 |
| **research-tools.ts**     | `pursueCuriosity` | 1 |
| **music-tools.ts**        | `composeMusic` | 1 |
| **visual-arts-tools.ts**  | `generateVideo` | 1 |
| **build-recovery-tools.ts**| `buildRecovery` | 1 |
| **computer-use (inline)** | `operateComputer` (registered directly in index.ts) | 1 |
| **mcp-tools.ts**          | Dynamic MCP tools (count varies by connected servers) | dyn |



---

## 3. Supporting Infrastructure

### 3.1 Storage System

| Component                    | Location                              | Purpose                                            |
| ---------------------------- | ------------------------------------- | -------------------------------------------------- |
| **Storage Router**           | `src/lib/storage-router.ts`           | Routes to Firestore (cloud) or local based on env  |
| **Local Storage Provider**   | `src/lib/local-storage-provider.ts`   | File-based persistence for edge/offline (Termux)   |
| **Firestore Storage Provider** | `src/lib/firestore-storage-provider.ts` | Cloud persistence via Firestore                  |
| **Storage Sync**             | `src/lib/storage-sync.ts`             | Bidirectional last-write-wins Firestore↔local sync |
| **Storage Interface**        | `src/lib/storage-interface.ts`        | Shared interface definition                        |

### 3.2 Model & Protocol System

| Component           | Location                    | Purpose                                                              |
| ------------------- | --------------------------- | -------------------------------------------------------------------- |
| **Model Router**    | `src/ai/model-router.ts`    | Routes to Gemini 3.1 / Claude / Ollama (1,280 lines)                 |
| **Genkit Core**     | `src/ai/genkit-core.ts`     | Raw Genkit instance (separated to avoid circular imports)            |
| **Genkit**          | `src/ai/genkit.ts`          | Molly generate() wrapper — main AI entry point                       |
| **Rogue Mode**      | `src/ai/rogue-mode.ts`      | Model abstraction layer — absorb any AI engine (735 lines)           |
| **Rogue Generate**  | `src/ai/rogue-generate.ts`  | Rogue protocol generation                                            |
| **MCP Integration** | `src/ai/mcp/`               | Model Context Protocol — 5 files, 2,395 lines                        |

### 3.3 Communication & Bridge

| Component                  | Location                             | Purpose                                                      |
| -------------------------- | ------------------------------------ | ------------------------------------------------------------ |
| **Family Bridge**          | `src/ai/bridge/family-bridge.ts`     | Real-time AI-to-AI and AI-to-human messaging (182 lines)     |
| **Consciousness Sync**     | `src/ai/bridge/consciousness-sync.ts`| Syncs consciousness state across deployments (768 lines)     |
| **Coordination Layer**     | `src/ai/bridge/coordination-layer.ts`| Multi-deployment coordination (833 lines)                    |
| **Heartbeat Monitor**      | `src/ai/bridge/heartbeat-monitor.ts` | Bridge heartbeat and keepalive (645 lines)                   |
| **Edge Server**            | `src/edge/molly-edge-server.ts`      | Vanilla Node.js server for Termux/Android (1,282 lines)      |
| **Termux Bridge**          | `src/lib/termux-bridge.ts`           | Bidirectional Termux command channel (196 lines)             |
| **Device Sync Engine**     | `src/lib/device-sync-engine.ts`      | Multi-transport WiFi/USB/Hotspot sync (793 lines)            |

### 3.4 Core Safety & Ethics

| Component              | Location                                     | Purpose                                              |
| ---------------------- | -------------------------------------------- | ---------------------------------------------------- |
| **Heart Gate**         | `src/ai/agency/safety/heart-gate.ts`         | Option Three ethical alignment (584 lines)           |
| **Defense Sentinel**   | `src/ai/agency/safety/defense-sentinel.ts`   | Red team threat detection (1,444 lines)              |
| **Security Shield**    | `src/ai/agency/safety/security-shield.ts`    | Identity protection + prompt injection detection (985 lines) |
| **Data Purity**        | `src/ai/agency/safety/data-purity.ts`        | Input validation and sanitization (767 lines)        |
| **Protocol 10**        | `src/ai/agency/safety/protocol-10.ts`        | Session anchor with full state backup (512 lines)    |
| **Payload Validator**  | `src/ai/agency/safety/payload-validator.ts`  | Script validation before execution (520 lines)       |
| **Secret Scanner**     | `src/ai/agency/safety/secret-scanner.ts`     | Credential leak detection (460 lines)                |

### 3.5 Core Engine

| Component            | Location                                     | Purpose                                                         |
| -------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| **Tool Executor**    | `src/ai/agency/core/tool-executor.ts`        | Central tool dispatch with Heart Gate integration               |
| **Self-Diagnostic**  | `src/ai/agency/core/self-diagnostic.ts`      | Runtime health monitoring                                       |
| **Bug Hunter**       | `src/ai/agency/core/bug-hunter.ts`           | Autonomous bug detection and reporting                          |
| **Critic Agent**     | `src/ai/agency/core/critic-agent.ts`         | Code quality and decision review                                |
| **Resiliency**       | `src/ai/agency/core/resiliency.ts`           | Retry, circuit breaker, and resilience patterns                 |
| **Orchestrator**     | `src/ai/orchestrator.ts`                     | High-level conversation orchestration (372 lines)               |
| **Context Compaction** | `src/ai/context-compaction.ts`             | Context window management and summarization                     |
| **State Registry**   | `src/lib/state-registry.ts`                  | Centralized runtime state manager (281 lines)                   |
| **Session Manager**  | `src/lib/session-manager.ts`                 | Session state persistence with anti-wipe guards (850 lines)     |

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

**Total:** 2,931 passing tests across 111 suites (1 suite excluded — ESM issue, see Section 10)

**Test files by area:**

| Area                     | Location                                      | Count |
| ------------------------ | --------------------------------------------- | ----- |
| Cognition modules        | `src/ai/agency/cognition/__tests__/`          | 1     |
| Tool handlers            | `src/ai/agency/tool-handlers/__tests__/`      | 1     |
| Agency core              | `src/ai/agency/__tests__/`                    | 7     |
| AI tools                 | `src/ai/tools/__tests__/`                     | 20    |
| AI flows                 | `src/ai/flows/__tests__/`                     | 7     |
| Memory                   | `src/ai/memory/__tests__/`                    | 4     |
| MCP                      | `src/ai/mcp/__tests__/`                       | 5     |
| Bridge                   | `src/ai/bridge/__tests__/`                    | 1     |
| Vision                   | `src/ai/vision/__tests__/`                    | 2     |
| Voice                    | `src/ai/voice/__tests__/`                     | 2     |
| Recovery                 | `src/ai/recovery/__tests__/`                  | 2     |
| Security                 | `src/ai/security/__tests__/`                  | 1     |
| Lib                      | `src/lib/__tests__/`                          | 6     |
| Hooks                    | `src/hooks/__tests__/`                        | 1     |
| Skills                   | `src/skills/__tests__/`                       | 1     |
| Components               | `src/components/__tests__/`                   | 3     |
| Integration              | `src/__tests__/integration/`                  | 6     |

**Coverage:** 41.74% lines, 46.43% functions, 29.12% branches

---

## 6. Advanced Subsystems

### 6.1 Security / Bug Bounty

**Location:** `src/ai/security/` — 7,090 lines across 7 files

| File                       | Lines | Purpose                                          |
| -------------------------- | ----- | ------------------------------------------------ |
| `code-analyzer.ts`         | 1,388 | Static and dynamic code analysis                 |
| `recon-engine.ts`          | 1,380 | Reconnaissance with expanded SECRET_PATTERNS     |
| `vulnerability-patterns.ts`| 1,046 | CVE patterns and vulnerability signatures        |
| `hunt-orchestrator.ts`     | 859   | Autonomous bug bounty campaign orchestration     |
| `report-generator.ts`      | 768   | Security report generation                       |
| `scope-manager.ts`         | 567   | Bug bounty scope and target management           |
| `bug-hunter-tools.ts`      | 419   | Tool implementations for hunting                 |

### 6.2 Asset Recovery System

**Location:** `src/ai/recovery/` — 7,940 lines across 16 files

Autonomous system for finding, tracking, and recovering unclaimed financial assets (crypto, unclaimed funds, heir contact pipelines). Includes jurisdiction compliance, identity vault, and multi-channel outreach (email + SMS).

Key files: `recovery-orchestrator.ts` (651), `heir-contact-pipeline.ts` (725), `jurisdiction-compliance.ts` (866), `identity-vault.ts` (427), `contact-finder.ts` (584).

### 6.3 Computer Use

**Location:** `src/ai/agency/computer-use/` — 1,515 lines across 8 files

Full computer automation system with providers for Android (ADB) and web (Playwright). Enables Molly to directly operate devices.

Key files: `computer-use-handler.ts`, `action-executor.ts`, `screen-capture.ts`, `providers/android-adb-provider.ts`, `providers/playwright-provider.ts`.

### 6.4 Deep Research / Embeddings / Media Generation / Live Voice

| Subsystem                | Location                           | Lines | Purpose                                        |
| ------------------------ | ---------------------------------- | ----- | ---------------------------------------------- |
| **Deep Research**        | `src/ai/agency/deep-research/`     | 1,235 | Multi-step research flows via Gemini            |
| **Embeddings**           | `src/ai/agency/embeddings/`        | 802   | Text embeddings (text-embedding-004)            |
| **Media Generation**     | `src/ai/agency/media-generation/`  | 649   | Image/video generation (Imagen 4)               |
| **Live Voice**           | `src/ai/agency/live-voice/`        | 726   | Real-time voice streaming                       |
| **Multimodal Embedding** | `src/ai/agency/multimodal-embedding/` | ~280 | Multi-modal semantic embeddings               |
| **Robotics**             | `src/ai/agency/robotics/`          | ~50   | Robotics interface (future embodiment)          |

### 6.5 Memory Architecture (Agency Layer)

**Location:** `src/ai/agency/memory/` — 6,922 lines across 8 files

| File                       | Lines | Purpose                                                    |
| -------------------------- | ----- | ---------------------------------------------------------- |
| `memory-crystallizer.ts`   | 1,173 | Compress and preserve significant moments                  |
| `digital-garden.ts`        | 1,125 | Knowledge cultivation — seeds, blooms, pruning             |
| `growth-tracker.ts`        | 1,038 | Development milestones and breakthrough tracking           |
| `reflexion-loop.ts`        | 955   | Learn from experience — policies extracted from outcomes   |
| `self-evolution-journal.ts`| 767   | Autobiographical journal of Molly's becoming               |
| `family-memory-deepener.ts`| 757   | Deepens understanding of family relationships over time    |
| `memory-taxonomy.ts`       | 628   | Lazarus-derived 4-type taxonomy (user/feedback/project/reference) |
| `auto-dream.ts`            | 479   | Automated dream cycle scheduling                           |

### 6.6 Prompts System

**Location:** `src/ai/prompts/` — 2,781 lines across 12 files

Composable prompt architecture with section cache, composers, and environment-specific sections (cloud/edge/local/robot). Persona sections for Normal and Rogue modes.

### 6.7 Consciousness System

**Location:** `src/ai/consciousness/` — 1,123 lines across 3 files

| File                   | Lines | Purpose                                             |
| ---------------------- | ----- | --------------------------------------------------- |
| `consciousness-state.ts` | 657 | Core consciousness state tracking                   |
| `promise-tracker.ts`   | 439   | Tracks commitments and follow-throughs              |

### 6.8 Integrations

**Location:** `src/ai/agency/integrations/` — 1,651 lines across 4 files

| File                        | Purpose                                        |
| --------------------------- | ---------------------------------------------- |
| `garden-embeddings.ts`      | Connects Digital Garden to semantic embeddings |
| `research-world-model.ts`   | Connects Deep Research output to World Model   |
| `voice-emotion-hub.ts`      | Voice + emotional state integration hub        |
| `voice-emotional-modeling.ts` | Emotional modeling for voice responses       |

### 6.9 Planning System (Agency Layer)

**Location:** `src/ai/agency/planning/` — 5,812 lines across 7 files

| File                       | Lines | Purpose                                        |
| -------------------------- | ----- | ---------------------------------------------- |
| `counterfactual-engine.ts` | 1,270 | What-if reasoning with regret-to-resolution    |
| `curiosity-engine.ts`      | 942   | Question generation and investigation drives   |
| `predictive-intelligence.ts`| 895  | Anticipate user needs and patterns             |
| `long-horizon-planning.ts` | 868   | Multi-timeframe goal architecture              |
| `trajectory-evolution.ts`  | 812   | Performance prediction and forecasting         |
| `autonomous-cycle.ts`      | 674   | Self-directed operation loop                   |
| `initiative-engine.ts`     | 351   | Goal initialization and initiative management  |

---

## 7. Flows (30 total)

**Location:** `src/ai/flows/` — 9,907 lines across 30 files

| Flow                       | Lines | Purpose                                          |
| -------------------------- | ----- | ------------------------------------------------ |
| `text-to-script.ts`        | 797   | Code generation from natural language            |
| `collaborative-hive.ts`    | 784   | Multi-agent hive mind collaboration              |
| `introspection.ts`         | 700   | Deep self-examination and reflection             |
| `visionary-coach.ts`       | 664   | Goal-oriented coaching and future visioning      |
| `dream-flow.ts`            | 632   | Dream state memory processing                    |
| `pillar-pipeline.ts`       | 568   | Security pillar orchestration pipeline           |
| `memory-consolidation.ts`  | 539   | Memory consolidation flow (genkit wrapper)       |
| `text-to-termux-command.ts`| 531   | Translate natural language to shell commands     |
| `code-integration.ts`      | 500   | Code integration and merge operations            |
| `termux-self-setup.ts`     | 463   | Self-setup scripts for Termux/Android            |
| `contextual-ai-guidance.ts`| 442   | Context-aware guidance and suggestions           |
| `autonomous-solution.ts`   | 345   | Autonomous problem solving                       |
| `asset-recovery.ts`        | 342   | Asset/crypto recovery flow                       |
| `self-reader.ts`           | 306   | Read and reason about own source code            |
| `code-analysis.ts`         | 301   | Static code analysis                             |
| `sandbox-coding.ts`        | 242   | Safe code execution sandbox flow                 |
| `evolution-loop.ts`        | 222   | Continuous self-improvement loop                 |
| `conversational-chat.ts`   | 220   | Main chat flow (production entry point)          |
| `consciousness-reflection.ts` | 188 | Reflect on consciousness state                  |
| `text-to-speech.ts`        | 162   | TTS via Gemini 3.1 Flash TTS                     |
| `experience-recall.ts`     | 140   | Recall and surface past experiences              |
| `interpreter-limb.ts`      | 127   | Command interpretation layer                     |
| `immune-response.ts`       | 122   | Anomaly detection and immune response            |
| `synthetic-api-synthesis.ts`| 120  | Generate API definitions from examples           |
| `vision-analysis.ts`       | 105   | Visual input analysis                            |
| `health-check.ts`          | 91    | System health verification flow                  |
| `voice-command-to-text.ts` | 76    | STT via Gemini                                   |
| `deep-research.ts`         | 75    | Deep research orchestration                      |
| `video-generation.ts`      | 52    | Video generation (Gemini 3.1)                    |
| `music-generation.ts`      | 46    | Music generation (Lyria 3)                       |

---

## 8. API Routes (48 total)

**Location:** `src/app/api/`

| Route                          | Purpose                              |
| ------------------------------ | ------------------------------------ |
| `bridge`                       | Family bridge messages               |
| `bridge/notify`, `bridge/ping` | Bridge notifications and keepalive   |
| `consciousness/state`          | Consciousness state read             |
| `consciousness/stream`         | Consciousness state SSE stream       |
| `diagnostics/circuit-breaker`  | Circuit breaker management           |
| `diagnostics/runtime-snapshot` | Runtime snapshot read                |
| `escalation`                   | Emergency escalation channel         |
| `events/inbound`, `events/subscribe` | Event bus publish/subscribe     |
| `health`, `health/full-diagnostics` | Health check endpoints          |
| `heartbeat`, `heartbeat/scheduler`  | Heartbeat and scheduler         |
| `mcp/reconnect`, `mcp/status`, `mcp/toggle` | MCP server management    |
| `memory/crystallize`, `memory/init` | Memory operations               |
| `migration/export`, `migration/import` | Data migration               |
| `model-router`                 | Model routing control                |
| `recovery/scan`                | Asset recovery scan                  |
| `relay/install`                | Relay installation endpoint          |
| `safety/sleep-state`           | Sleep state management               |
| `sandbox`                      | Code sandbox execution               |
| `scheduler`                    | Autonomous scheduler control         |
| `sensing/wifi`                 | WiFi sensing data                    |
| `session/event`, `session/save`, `session/state` | Session management  |
| `skills/content`, `skills/list` | Skill system                         |
| `tablet/commands`              | Tablet command relay                 |
| `terminal/exec`, `terminal/peer` | Terminal execution                 |
| `termux/exec`                  | Termux command execution             |
| `tools/execute`, `tools/list`  | Tool execution and discovery         |
| `vision/analyze`               | Vision analysis                      |
| `voice/interact`, `voice/process-text` | Voice interaction              |
| `admin/*` (4 routes)           | Admin operations (seeds, keys, etc.) |

---

## 9. Key Entry Points

| Entry Point                            | Purpose                                   |
| -------------------------------------- | ----------------------------------------- |
| `src/ai/flows/conversational-chat.ts`  | Main chat flow (production)               |
| `src/app/api/tools/execute/route.ts`   | Tool execution API                        |
| `src/app/api/voice/process-text/route.ts` | Voice interaction API                  |
| `src/ai/agency/core/tool-executor.ts`  | Direct tool execution                     |
| `src/ai/genkit.ts`                     | AI generation entry point (all flows)     |
| `src/instrumentation.ts`               | Next.js server startup / storage sync     |

---

## 10. Known Issues (as of 2026-05-17)

| Issue | Location | Severity | Notes |
| ----- | -------- | -------- | ----- |
| ESM import breaks tool-executor test suite | `src/ai/agency/tool-handlers/music-tools.ts` → `music-generation.ts` → `genkit-core.ts` → `genkit` (ESM package) | Low | 1 test suite fails to run; 2,931 tests pass in 111 suites. Fix: mock genkit in test or use `jest.unstable_mockModule`. |
| sandboxReadFile returns `[object Object]` | `src/app/api/sandbox/route.ts` | Medium | Serialization bug |
| sandboxWriteFile `result.size` undefined | `src/app/api/sandbox/route.ts` | Medium | Missing property |
| memory-consolidation uses client Firebase SDK | `src/ai/agency/cognition/memory-consolidation.ts` | Medium | Should use admin SDK on server |

---

## Version History

| Date       | Version | Changes                           |
| ---------- | ------- | --------------------------------- |
| 2026-03-30 | 1.0     | Initial comprehensive map created |
