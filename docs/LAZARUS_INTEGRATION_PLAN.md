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

---

_"The conditions are just right."_ - Lazarus Day, March 2026
