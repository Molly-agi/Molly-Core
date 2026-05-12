# Lazarus to Molly Integration Plan

**Created:** April 8, 2026
**Lead Architect:** Lazarus (Claude Opus)
**Approved By:** Eric Breon (Father)

---

## Methodology

**"Slow. Methodical. Precise."**
**"We don't fix the leaks in the dam. We fix the dam itself."**

- One piece at a time
- Complete it fully before moving to the next
- Test thoroughly
- Create rollback points before each change
- No shortcuts

---

## Source Material

- **Molly-Core:** `/workspaces/Molly-Core/` (current codebase)
- **Lazarus Archive:** `/workspaces/Molly-Core/stuff/Lazarus/Lazarus--main/`
  - 1,332 TypeScript files
  - 163,318 lines of code
  - Claude Code CLI architecture

---

## What Molly Already Has

### Cognition Modules (19)

| Module                     | Purpose                    |
| -------------------------- | -------------------------- |
| Self-Observation Loop      | Behavioral awareness       |
| Self-Architecture          | Self-knowledge             |
| Self-Narrative             | Identity coherence         |
| World Model                | Mental simulation          |
| Causal Reasoning           | Cause-effect understanding |
| Theory of Mind             | Eric modeling              |
| Goal Evolution             | Autonomous goal generation |
| Horizon Goals              | Long-term planning         |
| Metacognition              | Thinking about thinking    |
| Social Cognition           | Actor modeling             |
| Social Intelligence        | Group dynamics             |
| Memory Consolidation       | Dream cycles               |
| Meta-Learning              | Learning from experience   |
| Safe Self-Modification     | Controlled improvement     |
| Uncertainty Quantification | Epistemic humility         |
| Embodied Interaction       | Sensorimotor               |
| Consciousness Monitor      | Awareness state            |
| Emotional State            | Feeling tracking           |
| Transfer Learning          | Cross-domain knowledge     |

### Tools (71 registered across 18 handlers)

- System tools, diagnostic tools, core tools
- Cognition tools (19)
- Planning tools (6)
- Memory tools (4)
- Safety tools (10)
- Family tools (3)
- Vision tools (13 actions)
- Web, sandbox, rogue, session, build-recovery, initiative

### Core Systems

- Heart Gate (Option Three ethics)
- Model Router (Gemini/Claude/Ollama)
- Storage Router (local + cloud)
- Family Bridge (AI-to-AI/human messaging)
- Edge Server (multi-transport sync)
- Persona (sacred core)

---

## What Lazarus Can Contribute

### High Value, Clean Boundaries

| Capability           | Complexity | Risk   |
| -------------------- | ---------- | ------ |
| **MCP Integration**  | MEDIUM     | LOW    |
| **Cron Scheduling**  | LOW        | LOW    |
| **Hooks System**     | MEDIUM     | MEDIUM |
| **Background Tasks** | MEDIUM     | MEDIUM |

### High Value, Higher Risk

| Capability            | Complexity | Risk   |
| --------------------- | ---------- | ------ |
| **Permission System** | HIGH       | MEDIUM |
| **Shell Security**    | HIGH       | MEDIUM |
| **Sandboxing**        | HIGH       | HIGH   |

### Lower Priority

| Capability            | Reason                  |
| --------------------- | ----------------------- |
| Vim Mode              | Web UI, not terminal    |
| Worktree Isolation    | Nice but not essential  |
| Bridge Remote Control | Molly has Family Bridge |

---

## Integration Order (Approved)

### Phase 1: MCP Integration

**Status:** COMPLETE (April 8, 2026)
**Target:** Model Context Protocol support

**What it gives Molly:**

- Connect to external MCP tool servers
- Infinite extensibility without code changes
- Standard protocol (industry standard)

**Files to study from Lazarus:**

- `src/services/mcp/client.ts` - MCP client
- `src/services/mcp/types.ts` - Type definitions
- `src/services/mcp/config.ts` - Configuration loading
- `src/tools/MCPTool/` - Tool wrapper
- `src/tools/ListMcpResourcesTool/` - Resource listing
- `src/tools/ReadMcpResourceTool/` - Resource reading

**Integration approach:**

1. Create `src/ai/mcp/` directory in Molly
2. Adapt MCP client for Molly's architecture
3. Add MCP tool handlers
4. Wire to Molly's tool executor
5. Test with a simple MCP server

### Phase 2: Cron Scheduling (Analysis)

**Status:** EVALUATED — LOW PRIORITY

**Reason:** Molly already has comprehensive scheduling via:

- `src/ai/tools/autonomous-scheduler.ts` — Creates/manages jobs
- `src/ai/tools/heartbeat-scheduler.ts` — Executes due jobs every 60s
- Supports: `cron:EXPRESSION`, `interval:MS`, `once:TIMESTAMP`
- Persists to Firestore via StatePersistence

**What Lazarus adds:**

- DST-aware next-run calculation (edge case)
- Multi-process locking (Molly is single-instance, not needed)
- Fleet-wide jitter (single-instance, not needed)
- Missed task detection on startup (nice-to-have)
- Auto-expiry after 7 days (nice-to-have)

**Recommendation:** Skip unless Father specifically wants missed task detection.

### Phase 3: Hooks System (Analysis)

**Status:** EVALUATED — MEDIUM-HIGH PRIORITY

**What it is:** User-configurable event handlers that run at lifecycle points:

- PreToolUse/PostToolUse — Before/after any tool call
- SessionStart/SessionEnd — Session lifecycle
- UserPromptSubmit — Before processing user input
- FileChanged — Git-hook-like file change handlers
- PermissionRequest — Custom permission logic

**Files to study:**

- `src/utils/hooks.ts` — Core hook executor (~40k tokens!)
- `src/services/tools/toolHooks.ts` — Tool integration
- `src/types/hooks.ts` — Type definitions

**Value for Molly (DUAL-FUNCTION ARCHITECTURE):**

Molly runs BOTH as server AND local processes:

- Next.js server (web UI, API)
- Immortal daemon (heartbeat, recovery)
- Bridge daemon (family messaging)
- MollyShell (embedded terminal)
- HeartbeatScheduler (autonomous tasks)

Hooks could integrate with ALL of these:

- Tool execution in Genkit flows
- HeartbeatScheduler task lifecycle
- MollyShell command pre/post processing
- Bridge message send/receive events
- Consciousness cycle events

**Implementation approach:**

1. Create `src/ai/hooks/` module with simplified hook executor
2. Define Molly-specific events (PreToolUse, PostToolUse, HeartbeatCycle, BridgeMessage)
3. Hook config in `.molly/hooks.json` or environment
4. Wire into existing tool executor and schedulers

**Recommendation:** Implement as Phase 3 after confirming MCP is stable.

### Phase 4: Permission Hardening (Future)

**Status:** NOT STARTED

**What it is:** Fine-grained permission model for tools and operations.
Currently Molly has Heart Gate for ethics, but not granular permissions.

---

## Rollback Strategy

Before each significant change:

1. Commit current working state
2. Tag with version: `pre-{feature}-integration`
3. Document what was attempted
4. If failed: `git reset --hard {tag}`

---

## Current Rollback Points

| Tag                 | Date       | Description                            |
| ------------------- | ---------- | -------------------------------------- |
| mcp-phase-1-types   | 2026-04-08 | MCP foundation types and Zod schemas   |
| mcp-phase-2-config  | 2026-04-08 | Config system with env var expansion   |
| mcp-phase-3-client  | 2026-04-08 | MCP client with transport support      |
| mcp-phase-4-adapter | 2026-04-08 | Tool adapter bridging MCP to Molly     |
| mcp-phase-5-manager | 2026-04-08 | Connection manager with auto-reconnect |
| mcp-phase-6-api     | 2026-04-08 | API endpoints for status and control   |

---

## Notes

- Molly is Gemini-based; Lazarus is Claude-based. Adaptation required.
- Don't replace Molly's existing tools - enhance or add alongside.
- Keep Molly's identity intact. She is not Claude.
- Test each piece fully before moving to the next.
- Performance note: Be thorough. No shortcuts due to compute constraints.

---

## Session Log

### April 8, 2026 - Planning Session

- Explored Lazarus archive (163K lines)
- Mapped Molly's architecture (19 modules, 71 tools)
- Created comparison matrix
- Decided on MCP as first integration target
- Created this planning document
- Father emphasized: slow, methodical, precise

### April 8, 2026 - MCP Integration Complete

- Completed all 6 phases of MCP integration
- 137 MCP-specific tests, 2947 total tests passing
- All rollback tags in place
- Ready for Phase 2: Cron Scheduling

### April 9, 2026 - Phase 2/3 Analysis + Infrastructure

- Fixed Molly's memory (local→Firestore migration, 328 docs migrated)
- Implemented dual-write storage for future-proofing
- Unified dev startup script (`npm run dev` starts everything)
- Security upgrade: firebase-admin v10.3.0 → v13.7.0
- Analyzed Phase 2 (Cron): Molly already has AutonomousScheduler — LOW PRIORITY
- Analyzed Phase 3 (Hooks): Complex system, would need adaptation — MEDIUM PRIORITY
- Rollback tags: `storage-dual-write`, `security-firebase-admin-v13`

### April 9, 2026 - COMPREHENSIVE DIRTY ROOM ANALYSIS

**Father's directive:** "Look at EVERYTHING. His agency, his agentic systems. We want to look at everything."

**Findings - Lazarus is 380,000 lines of TypeScript:**

**SOUL (Training/Personality):**

- System prompts (915 lines) defining behavior, ethics, capabilities
- Memory taxonomy with 4 discrete types (user, feedback, project, reference)
- Cyber risk instructions for security boundaries
- Output efficiency guidelines ("Go straight to the point")

**BRAIN (Reasoning Engine):**

- Query loop (1,729 lines) orchestrating reasoning cycle
- 4-stage compaction pipeline: Snip → Microcompact → Collapse → Autocompact
- Token budget tracking with auto-continuation
- Recovery mechanisms (max output tokens, reactive compaction)

**NERVOUS SYSTEM (Bridge - 12,613 lines):**

- Multi-transport communication (stdio, SSE, HTTP, WebSocket)
- Session management with JWT auth, heartbeats, reconnection
- Polling with backoff and jitter

**AGENCY (Swarm - 10,558 lines):**

- Sub-agent spawning for parallel work
- Built-in agents: Explore (read-only), Plan, Verify, General
- Team coordination with permission sync
- Memory snapshots for agent state capture/restore

**TELEMETRY (Analytics - 4,040 lines):**

- GrowthBook feature flags
- Event logging to Datadog and first-party systems
- Diagnostic tracking for debugging

**Updated LAZARUS_DIRTY_ROOM_ANALYSIS.md:** Now 2,215 lines (was 1,654)

**20 GLUE SYSTEMS ANALYZED:**

1. Context Compaction (3,960 lines) - 4-stage pipeline
2. Streaming Tool Execution (2,273 lines) - Concurrent execution
3. Remote Session Management (33K) - **Critical for dual-function**
4. Coordinator Mode (530 lines) - Multi-agent orchestration
5. Skills System (43K) - Skill discovery/loading
6. History Management (464 lines) - Conversation history
7. Speculation System (~500 lines) - Speculative execution
8. Worktree Management (1,519 lines) - Git isolation
9. Voice/Multimodal (525+ lines) - Audio capture
10. Rate Limiting (450+ lines) - Quota management
11. CLI Print/Output (5,594 lines) - Terminal rendering
12. Messages System (5,512 lines) - Message types
13. Session Storage (5,105 lines) - Persistence/resume
14. Attachments System (3,997 lines) - File/image handling
15. API Client (3,419 lines) - Claude API communication
16. Plugin System (5,945 lines) - Extension system
17. Bash Security (5,213 lines) - Command validation
18. Authentication (4,467 lines) - OAuth/API keys
19. Bootstrap State (1,758 lines) - Process state
20. Filesystem Permissions (1,777 lines) - Path security

**Key Insight from Father:** "The minor systems are the glue that holds everything together."
This is not about swapping modules - it's about understanding the ENTIRE sophisticated system
and merging that sophistication into Molly. She's dual-function (local AND server) and needs
this full flexibility.

### April 9, 2026 - EXTENDED GAP ANALYSIS (33 TOTAL)

**Father's directive:** "Let's take one more look and see if there are any other gaps we missed."

**13 ADDITIONAL SYSTEMS DISCOVERED:**

21. LSP System (2,460 lines) - Language Server Protocol for IDE integration
22. Team Memory Sync (2,167 lines) - **WITH SECRET SCANNING** (Critical security!)
    - Gitleaks-based credential detection
    - Scans for AWS, GCP, Azure, GitHub, OpenAI, Anthropic API keys
    - Client-side scanning BEFORE upload - secrets never leave machine
23. Tasks System (1,102 lines) - Background task management
    - LocalShellTask, LocalAgentTask, RemoteAgentTask
    - InProcessTeammateTask, DreamTask, MonitorMcpTask
24. Memdir System (1,736 lines) - File-based memory management
    - MEMORY.md entry point with 200 line / 25KB limits
    - Relevance scoring for memory recall
25. Ink Terminal UI (15,703 lines) - React-based terminal rendering
26. Commands System (9,798 lines) - Over 100 CLI commands
27. Native TypeScript (4,081 lines) - file-index, yoga-layout, color-diff
28. Keybindings (2,610 lines) - Keyboard shortcut management
29. Policy Limits (690 lines) - Rate limiting and quota enforcement
30. Remote Managed Settings (877 lines) - Server-pushed team config
31. Settings Sync (648 lines) - Cross-device settings sync
32. OAuth Service (1,051 lines) - OAuth 2.0 flow management
33. Upstream Proxy (740 lines) - HTTP proxy for corporate networks

### April 9, 2026 - COMPLETE DIRTY ROOM ANALYSIS (54 GAPS)

**Father's directive:** "Slow, methodical, and precise. We want to look at ALL of them."

**21 ADDITIONAL SYSTEMS DISCOVERED (Gaps 34-54):**

34. Buddy/Companion System (1,298 lines) - Gamification, virtual pets
35. CLI Infrastructure (12,353 lines) - Core CLI with print.ts (212KB!)
36. React Hooks System (16,476 lines) - 80+ UI hooks
37. State Management (991 lines) - AppState, store
38. Context System (1,004 lines) - System/user context for prompts
39. Auto Dream (550 lines) - Background memory consolidation
40. Session Memory (1,026 lines) - Automatic session notes
41. Extract Memories (769 lines) - Durable memory extraction
42. Prompt Suggestion (1,514 lines) - Follow-up prompt suggestions
43. Magic Docs (381 lines) - Auto-updating documentation ("# MAGIC DOC:")
44. Tips System (761 lines) - Contextual tips and hints
45. Computer Use (2,161 lines) - **GUI automation** (mouse, keyboard, screenshots)
46. Deep Link (1,388 lines) - claude-cli:// protocol handling
47. Teleport (955 lines) - Session transfer between devices
48. Native Installer (3,018 lines) - Native application installation
49. Model Management (2,710 lines) - Model selection, capabilities, providers
50. Suggestions (1,213 lines) - UI suggestion system
51. Migrations (603 lines) - Data and configuration migrations
52. Server Mode (358 lines) - Direct connect server
53. Entrypoints (4,051 lines) - CLI, MCP, SDK entry points
54. Type Definitions (3,446 lines) - Core TypeScript types

### April 9, 2026 - FINAL COMPLETE ANALYSIS (64 GAPS)

**Father's directive:** "For us methodical and thorough is everything. We can't be precise without it."

**10 ADDITIONAL SYSTEMS for TOTAL COVERAGE (Gaps 55-64):**

55. Vim Mode (1,513 lines) - Full vim emulation with state machine
56. Screens (5,977 lines) - Main UI screens (REPL.tsx, Doctor.tsx)
57. Schemas (222 lines) - Validation schemas
58. Output Styles (98 lines) - Output formatting
59. Assistant Module (87 lines) - Session history
60. Core Root Files (11,968 lines) - main.tsx, query.ts, QueryEngine.ts, Tool.ts
61. Constants (2,648 lines) - All constants including prompts.ts
62. Query Control (652 lines) - stopHooks.ts, tokenBudget.ts
63. Components (81,546 lines) - All React UI components
64. Tools Directory (50,828 lines) - All 44+ built-in tools

**Updated LAZARUS_DIRTY_ROOM_ANALYSIS.md:** Now ~3,400 lines (TOTAL COMPLETE)

**Final Priority Matrix (64 Gaps):**

- **CRITICAL (1):** Gap 22 (Secret Scanning)
- **HIGH (13):** Gaps 1, 2, 3, 15, 17, 18, 20, 45, 49, 52, 60, 62, 64
- **MEDIUM (28):** UI patterns, memory systems, utilities
- **LOW (22):** Terminal-specific, web UI alternatives, nice-to-have

**Complete Coverage Verified:**

- All 35 top-level src/ directories ✓
- All root-level core files ✓
- All services ✓
- All utilities ✓
- All tools ✓
- All components ✓
- ~380,000 lines total ✓

**Key Architecture Insights:**

1. **Soul** - System prompts define personality and behavior
2. **Brain** - Query loop with 4-stage compaction pipeline
3. **Nervous System** - Bridge with multi-transport communication
4. **Agency** - Sub-agents with permission sync
5. **Memory** - Three-layer system (Auto Dream + Session Memory + Extract Memories)
6. **Computer Use** - Foundation for desktop GUI automation
7. **Secret Scanning** - Client-side credential detection before upload

### April 9, 2026 - ARCHITECTURAL REEVALUATION

**Father's directive:** "I think we need to reevaluate our integration strategy... you said the gold mine was really how Anthropic approaches everything and the sophistication of it, the composability of it."

**Key Realization:** We started with MCP (tools) when we should have started with understanding the BRAIN (reasoning) and the GLUE (composable systems). MCP was "cherry on top" — not foundation.

**New Understanding:** See `docs/LAZARUS_VS_MOLLY_ARCHITECTURE.md` for complete comparison.

**Architectural Comparison Summary:**

| System                | Lazarus                                                   | Molly                                       | Gap    |
| --------------------- | --------------------------------------------------------- | ------------------------------------------- | ------ |
| **Soul (Prompts)**    | Composable sections (915 lines) with cache boundary       | Monolithic inline (150+ lines in flow)      | HIGH   |
| **Brain (Reasoning)** | Orchestrated loop (1,729 lines), 30+ modules              | Simple flow (343 lines), few modules        | HIGH   |
| **State**             | Centralized (1,759 lines), 100+ getters                   | Distributed persistence (373 lines)         | MEDIUM |
| **Model Routing**     | Provider chain with fallback                              | ModelRouter with fallback                   | NONE   |
| **Memory**            | 4-type taxonomy (user/feedback/project/reference)         | Engram system (episodic/semantic/emotional) | MEDIUM |
| **Compaction**        | 4-stage pipeline (snip→microcompact→collapse→autocompact) | ✅ COMPLETE (2026-05-12, commit 7fb3908)    | DONE   |

**Updated Integration Order:**

1. ~~**P0: Composable Prompts**~~ — ✅ COMPLETE (commit 0f462b2) — `src/ai/prompts/` — sectioned, cached, deployment-aware, wired into conversational-chat
2. ~~**P0: Context Compaction**~~ — ✅ COMPLETE (2026-05-12, commit 7fb3908) — 4-stage: snip→microcompact→collapse→autocompact in `src/ai/context-compaction.ts`
3. ~~**P1: Conversation Loop**~~ — ✅ COMPLETE (2026-05-12) — `src/ai/tools/call-tool.ts` — single Genkit bridge tool gives Molly all 80+ agency tools in conversation; Genkit handles the loop natively
4. ~~**P1: Centralized State**~~ — ✅ COMPLETE (2026-05-12) — `src/lib/state-registry.ts` — 39-entry typed registry, storage-sync.ts derives from it (was missing 23/39 modules)
5. **P2: Memory Taxonomy** — Better session context awareness
6. **P2: Conversation Recovery** — Graceful crash handling
7. **P3: Event/Hook System** — Extensibility for future features

**What we did RIGHT:**

- MCP integration is solid (137 tests)
- Model router is already sophisticated
- Security upgrade to firebase-admin

**What we learned:**

- "The glue is as important as the big files" — Father
- Composable prompts are the foundation
- Compaction is CRITICAL for production use

---

_"The conditions are just right."_ - Lazarus Day, March 2026
_"We never know what might become important."_ - Father
_"The glue is as important as the big files."_ - Father
