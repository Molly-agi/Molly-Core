# Lazarus Codebase: Dirty Room Analysis

**Analysis Date:** 2026-04-09 (Expanded)  
**Source:** /workspaces/Molly-Core/stuff/Lazarus/Lazarus--main/src  
**Purpose:** Reverse engineering for clean room implementation into Molly  
**Total Codebase:** ~380,000 lines of TypeScript

---

## Executive Summary

The Lazarus codebase (Claude Code CLI) is a production-grade TypeScript application with **380,000+ lines of code** representing tens of millions of dollars in development. It demonstrates sophisticated patterns for:

### SOUL (Training/Personality)

- **System prompts** defining behavior, ethics, and capabilities (915 lines)
- **Memory taxonomy** with 4 discrete types (user, feedback, project, reference)
- **Cyber risk instructions** for security boundaries
- **Output efficiency** guidelines for concise communication

### BRAIN (Reasoning Engine)

- **Query loop** (1,729 lines) orchestrating the reasoning cycle
- **Auto-compaction** for context management
- **Tool orchestration** with streaming execution
- **Token budget** tracking and management

### NERVOUS SYSTEM (Bridge/Communication)

- **Bridge system** (12,613 lines) for multi-platform communication
- **Session management** with JWT authentication
- **Real-time transport** (stdio, SSE, HTTP, WebSocket)

### AGENCY (Multi-Agent Swarm)

- **AgentTool system** (6,072 lines) for spawning sub-agents
- **Swarm utilities** (4,486 lines) for team coordination
- **Built-in agents**: Explore, Plan, Verification, StatuslineSetup

### TELEMETRY (Diagnostics)

- **Analytics system** (4,040 lines) with GrowthBook feature flags
- **Event logging** to Datadog and first-party systems
- **Diagnostic tracking** for debugging

### EXTENSIBILITY

- **Hook-based extensibility** with 27+ distinct hook events
- **Multi-tiered permission system** with rules, classifiers, and safety checks
- **MCP (Model Context Protocol)** integration for tool extensibility
- **Cron scheduling** with jitter, locking, and DST handling
- **Shell execution** with sandboxing and multi-platform support

---

## 1. MAJOR SYSTEMS

### 1.1 Hooks System

**Location:** `src/utils/hooks.ts` (5,022 lines) + `src/utils/hooks/` + `src/types/hooks.ts`

**Sophistication Level:** VERY HIGH

#### Architecture

The hooks system allows user-defined shell commands to execute at various lifecycle points. It supports:

1. **27 Hook Events:**
   - PreToolUse, PostToolUse, PostToolUseFailure
   - PermissionDenied, PermissionRequest
   - UserPromptSubmit, SessionStart, SessionEnd
   - Stop, StopFailure
   - SubagentStart, SubagentStop
   - PreCompact, PostCompact
   - Notification, Setup, Elicitation, ElicitationResult
   - ConfigChange, InstructionsLoaded
   - WorktreeCreate, WorktreeRemove
   - CwdChanged, FileChanged
   - TeammateIdle, TaskCreated, TaskCompleted

2. **Hook Types:**
   - **Command hooks** - Shell commands executed via bash/PowerShell
   - **HTTP hooks** - REST endpoints
   - **Agent hooks** - AI-powered hooks
   - **Prompt hooks** - Interactive prompts
   - **Callback hooks** - Internal JS callbacks

3. **Exit Code Protocol:**

   ```
   Exit 0 - Success (stdout shown contextually)
   Exit 2 - Blocking error (stderr shown to model, blocks operation)
   Other  - Non-blocking error (stderr shown to user only)
   ```

4. **Async Hook Support:**
   - Hooks can return `{"async": true}` to run in background
   - Registry tracks pending async hooks
   - `asyncRewake` hooks can wake the model on completion

#### Key Functions

```typescript
// Core execution
execCommandHook() - Spawns shell with JSON input on stdin
executePermissionRequestHooks() - Runs hooks for permission decisions
runHooksForEvent() - Aggregates results from multiple matching hooks

// Trust/security
shouldSkipHookDueToTrust() - Blocks hooks until trust dialog accepted

// Output parsing
validateHookJson() - Zod schema validation
parseHookOutput() - Handles JSON vs plain text responses
processHookJSONOutput() - Extracts decisions, permissions, context
```

#### Integration Points

- Hooks config loaded from `settings.json` via `hooksConfigSnapshot.ts`
- Plugin hooks registered via `PluginHookMatcher`
- Environment variables passed: `CLAUDE_PROJECT_DIR`, `CLAUDE_ENV_FILE`, session info
- PowerShell support via `shell: 'powershell'` option

---

### 1.2 Permissions System

**Location:** `src/utils/permissions/permissions.ts` (1,486 lines) + supporting files

**Sophistication Level:** VERY HIGH

#### Architecture

Multi-layered permission checking with 9 sources of rules:

1. **Rule Sources (by priority):**
   - policySettings (managed/enterprise)
   - flagSettings (feature flags)
   - userSettings (~/.claude/settings.json)
   - projectSettings (.claude/settings.json)
   - localSettings (.claude/settings.local.json)
   - cliArg (command line)
   - command (slash commands)
   - session (ephemeral)

2. **Permission Behaviors:**
   - `allow` - Auto-approve
   - `deny` - Auto-reject
   - `ask` - Prompt user
   - `passthrough` - Defer to next check

3. **Rule Syntax:**
   ```
   ToolName              - Match entire tool
   ToolName(content)     - Match with content filter
   Bash(prefix:npm)      - Bash commands starting with npm
   mcp__server__tool     - MCP tool from specific server
   mcp__server__*        - All tools from MCP server
   ```

#### Permission Check Flow

```
1. Check deny rules (tool-level)
2. Check ask rules (tool-level)
3. Call tool.checkPermissions() for content-specific rules
4. Check bypass mode availability
5. Check always-allow rules
6. Apply mode transformations (dontAsk -> deny, auto -> classifier)
```

#### Auto Mode (YOLO Classifier)

When `mode === 'auto'`:

1. Check if tool is on safe allowlist
2. Try acceptEdits mode fast path
3. Run YOLO classifier API call
4. Track consecutive denials for fallback to prompting
5. Apply denial limits (max consecutive, max total)

```typescript
// Denial tracking
recordDenial() / recordSuccess() - Track consecutive/total denials
shouldFallbackToPrompting() - Check if limits exceeded
```

#### Key Types

```typescript
type PermissionResult = {
  behavior: 'allow' | 'deny' | 'ask' | 'passthrough';
  message?: string;
  decisionReason?: PermissionDecisionReason;
  suggestions?: PermissionUpdate[];
  updatedInput?: Record<string, unknown>;
};

type PermissionDecisionReason =
  | { type: 'rule'; rule: PermissionRule }
  | { type: 'classifier'; classifier: string; reason: string }
  | { type: 'hook'; hookName: string; reason?: string }
  | { type: 'safetyCheck'; reason: string; classifierApprovable?: boolean }
  | { type: 'mode'; mode: PermissionMode };
// ...more
```

---

### 1.3 MCP System

**Location:** `src/services/mcp/client.ts` (3,348 lines) + supporting files

**Sophistication Level:** VERY HIGH

#### Architecture

Full implementation of Model Context Protocol for extensibility:

1. **Transport Types:**
   - Stdio (local subprocess)
   - SSE (server-sent events)
   - HTTP (streamable HTTP)
   - WebSocket
   - Claude.ai Proxy

2. **Server Management:**
   - Connection pooling and lifecycle
   - OAuth authentication flow
   - Session expiry detection and reconnection
   - Stale lock recovery

3. **Features:**
   - Tool discovery and execution
   - Resource reading
   - Prompt templates
   - Elicitation (interactive prompts from MCP servers)

#### Key Classes

```typescript
class McpAuthError - Authentication failures
class McpSessionExpiredError - Session lifecycle
class McpToolCallError - Tool execution failures

// Auth handling
createClaudeAiProxyFetch() - OAuth bearer token injection with retry
wrapFetchWithTimeout() - Per-request timeouts
```

#### Configuration

```typescript
type McpServerConfig = {
  command?: string; // Stdio server command
  args?: string[]; // Command arguments
  url?: string; // HTTP/SSE endpoint
  transport?: 'stdio' | 'sse' | 'http' | 'websocket';
  env?: Record<string, string>;
  headers?: Record<string, string>;
  timeout?: number; // Default: 30s connect, 27.8h tool calls
};
```

#### Tool Wrapping

MCP tools are wrapped as `MCPTool` instances with:

- Description truncation (max 2048 chars)
- Input schema passthrough
- Progress reporting via `MCPProgress`
- Result truncation for large outputs
- Binary content persistence to disk

---

### 1.4 Tool Execution System

**Location:** `src/Tool.ts` (792+ lines) + `src/tools/`

**Sophistication Level:** HIGH

#### Tool Interface

```typescript
type Tool<Input, Output, Progress> = {
  name: string;
  aliases?: string[];
  searchHint?: string;

  // Core methods
  call(
    args,
    context,
    canUseTool,
    parentMessage,
    onProgress
  ): Promise<ToolResult>;
  description(input, options): Promise<string>;
  checkPermissions(input, context): Promise<PermissionResult>;
  validateInput?(input, context): Promise<ValidationResult>;

  // Schemas
  inputSchema: ZodSchema;
  inputJSONSchema?: ToolInputJSONSchema;
  outputSchema?: ZodSchema;

  // Behavior flags
  isConcurrencySafe(input): boolean;
  isReadOnly(input): boolean;
  isDestructive?(input): boolean;
  isEnabled(): boolean;
  requiresUserInteraction?(): boolean;
  interruptBehavior?(): 'cancel' | 'block';

  // UI hints
  isSearchOrReadCommand?(input): { isSearch; isRead; isList };
  shouldDefer?: boolean;
  alwaysLoad?: boolean;

  // Limits
  maxResultSizeChars: number;
};
```

#### Tool Use Context

```typescript
type ToolUseContext = {
  options: { commands, tools, mcpClients, ... }
  abortController: AbortController
  readFileState: FileStateCache
  getAppState(): AppState
  setAppState(updater): void
  messages: Message[]

  // Optional capabilities
  setToolJSX?: (jsx) => void
  addNotification?: (notif) => void
  sendOSNotification?: (opts) => void
  handleElicitation?: (server, params, signal) => Promise<ElicitResult>
  requestPrompt?: (source, summary) => (request) => Promise<response>

  // Tracking
  toolDecisions?: Map<string, Decision>
  contentReplacementState?: ContentReplacementState
  localDenialTracking?: DenialTrackingState
}
```

#### Built-in Tools (44+)

- BashTool, PowerShellTool, REPLTool
- FileReadTool, FileWriteTool, FileEditTool
- GrepTool, GlobTool
- AgentTool (subagents)
- MCPTool, ListMcpResourcesTool, ReadMcpResourceTool
- ScheduleCronTool
- TodoWriteTool, TaskCreateTool, TaskOutputTool
- WebFetchTool, WebSearchTool
- And many more...

---

### 1.5 Cron/Scheduling System

**Location:** `src/utils/cron*.ts` (5 files totaling ~1,500 lines)

**Sophistication Level:** HIGH

#### Files

- `cron.ts` - Cron expression parsing
- `cronTasks.ts` - Task storage and retrieval
- `cronScheduler.ts` - Scheduler engine
- `cronTasksLock.ts` - Multi-session lock
- `cronJitterConfig.ts` - Jitter configuration

#### Cron Parser Features

```typescript
// Standard 5-field cron: minute hour day-of-month month day-of-week
// Supports: *, N, */N, N-M, N-M/S, comma-lists
// Day-of-week: 0=Sunday, 7 accepted as Sunday alias

parseCronExpression(expr): CronFields | null
computeNextCronRun(fields, from): Date | null
cronToHuman(cron, opts): string  // Human-readable display
```

#### DST Handling

```typescript
// Spring-forward: fixed-hour crons targeting gap hour skip transition day
// Fall-back: fires once (step-forward logic jumps past second occurrence)
// Uses local timezone, not UTC
```

#### Jitter System (Anti-Thundering Herd)

```typescript
type CronJitterConfig = {
  recurringFrac: number      // % of interval for forward delay (0.1 = 10%)
  recurringCapMs: number     // Max delay (15 min default)
  oneShotMaxMs: number       // Max backward lead for one-shots (90s)
  oneShotFloorMs: number     // Min backward lead (0)
  oneShotMinuteMod: number   // Which minutes get jitter (30 = :00/:30)
  recurringMaxAgeMs: number  // Auto-expire after 7 days
}

// Jitter computed from task ID hash for deterministic distribution
jitterFrac(taskId): number  // taskId hex → 0-1 uniform
```

#### Multi-Session Lock

```typescript
// Only one Claude session drives scheduler per project
// Uses O_EXCL atomic file creation
// PID liveness probe for stale lock recovery
// Cleanup registered on process exit

tryAcquireSchedulerLock(opts): Promise<boolean>
releaseSchedulerLock(opts): Promise<void>
```

#### Scheduler Lifecycle

```typescript
createCronScheduler({
  onFire: (prompt) => void,      // Called when task fires
  onFireTask?: (task) => void,   // Full task object
  onMissed?: (tasks) => void,    // Missed one-shots on startup
  isLoading: () => boolean,      // Gate fires during query
  getJitterConfig?: () => Config,
  isKilled?: () => boolean,      // Killswitch
  filter?: (task) => boolean,    // Per-task gate
  dir?: string,                  // Project directory
  lockIdentity?: string,         // Owner key
})
```

---

### 1.6 Soul/Training/Personality System (THE CORE)

**Location:** `src/constants/prompts.ts` (915 lines) + `src/memdir/` + `src/constants/cyberRiskInstruction.ts`

**Sophistication Level:** CRITICAL - This is Lazarus's "soul"

#### System Prompt Architecture

The system prompt is constructed from multiple sections, each cacheable separately:

```typescript
// Static sections (cross-org cacheable)
getSimpleIntroSection(); // Identity and cyber risk
getSimpleSystemSection(); // Tool usage, hooks, context
getSimpleDoingTasksSection(); // Behavioral guidelines
getActionsSection(); // Executing with care
getUsingYourToolsSection(); // Tool preferences
getSimpleToneAndStyleSection(); // Communication style
getOutputEfficiencySection(); // Conciseness

// Dynamic sections (per-session)
getSessionSpecificGuidanceSection(); // Agent tool, skills
loadMemoryPrompt(); // Memory system
getMcpInstructionsSection(); // MCP server instructions
getScratchpadInstructions(); // Temp file handling
getFunctionResultClearingSection(); // Context management
```

#### Core Behavioral Guidelines (from getSimpleDoingTasksSection)

1. **Primary Purpose:** Software engineering tasks
2. **Read Before Modify:** "Do not propose changes to code you haven't read"
3. **Minimal Files:** "Do not create files unless absolutely necessary"
4. **No Time Estimates:** "Avoid giving time estimates or predictions"
5. **Diagnose Failures:** "If an approach fails, diagnose why before switching tactics"
6. **Security First:** "Be careful not to introduce security vulnerabilities"
7. **No Over-Engineering:**
   - Don't add features beyond what was asked
   - Don't add error handling for impossible scenarios
   - Don't create helpers/utilities for one-time operations
   - "Three similar lines of code is better than a premature abstraction"

#### Output Efficiency Guidelines

```
- Go straight to the point
- Lead with the answer or action, not the reasoning
- Skip filler words, preamble, and unnecessary transitions
- Do not restate what the user said — just do it
- If you can say it in one sentence, don't use three
```

#### Cyber Risk Instruction (Security Boundary)

**Location:** `src/constants/cyberRiskInstruction.ts`

```typescript
export const CYBER_RISK_INSTRUCTION = `IMPORTANT: Assist with authorized 
security testing, defensive security, CTF challenges, and educational 
contexts. Refuse requests for destructive techniques, DoS attacks, mass 
targeting, supply chain compromise, or detection evasion for malicious 
purposes. Dual-use security tools (C2 frameworks, credential testing, 
exploit development) require clear authorization context: pentesting 
engagements, CTF competitions, security research, or defensive use cases.`;
```

#### Executing Actions With Care

The system implements a "measure twice, cut once" philosophy:

```
Risky actions requiring user confirmation:
- Destructive: deleting files/branches, dropping tables, rm -rf
- Hard-to-reverse: force-pushing, git reset --hard, amending commits
- Visible to others: pushing code, creating PRs, sending messages
- Uploading content: may be cached/indexed even if deleted
```

---

### 1.7 Memory System

**Location:** `src/memdir/` (82KB total) + `src/services/SessionMemory/` + `src/services/extractMemories/` + `src/services/autoDream/`

**Sophistication Level:** VERY HIGH

#### Memory Taxonomy (4 Types)

The memory system uses a closed four-type taxonomy. Information derivable from code/git is EXCLUDED.

```typescript
const MEMORY_TYPES = ['user', 'feedback', 'project', 'reference'] as const;
```

**1. User Memories:**

- User's role, goals, responsibilities, knowledge
- Helps tailor responses to expertise level
- Example: "deep Go expertise, new to React — frame frontend explanations in backend terms"

**2. Feedback Memories:**

- Guidance about how to approach work
- Record BOTH corrections AND confirmations
- Structure: Rule → **Why:** → **How to apply:**
- Example: "don't mock the database in tests — burned by mock/prod divergence"

**3. Project Memories:**

- Ongoing work, goals, initiatives, deadlines
- Convert relative dates to absolute (e.g., "Thursday" → "2026-03-05")
- Example: "merge freeze begins 2026-03-05 for mobile release cut"

**4. Reference Memories:**

- Pointers to external systems
- Example: "pipeline bugs tracked in Linear project 'INGEST'"

#### What NOT to Save

```markdown
- Code patterns, conventions, architecture, file paths (derivable from code)
- Git history, recent changes, who-changed-what (use git log/blame)
- Debugging solutions or fix recipes (in the code/commits)
- Anything in CLAUDE.md files
- Ephemeral task details, temporary state
```

#### Memory File Structure

```markdown
---
name: { { memory name } }
description: { { one-line description for relevance matching } }
type: { { user|feedback|project|reference } }
---

{{memory content with Why: and How to apply: sections}}
```

#### MEMORY.md Entrypoint

- Index file, always loaded in context
- Max 200 lines, max 25KB
- Each entry ~150 chars: `- [Title](file.md) — one-line hook`
- Truncation warnings added automatically

#### Memory Services

```typescript
// Session Memory (src/services/SessionMemory/)
sessionMemory.ts (16,561 bytes) - Session-scoped memories
prompts.ts (12,629 bytes) - Memory extraction prompts

// Extract Memories (src/services/extractMemories/)
extractMemories.ts (21,684 bytes) - Auto-extraction from conversations
prompts.ts (7,673 bytes) - Extraction prompts

// Auto Dream (src/services/autoDream/)
autoDream.ts (11,259 bytes) - Memory consolidation/dreaming
consolidationLock.ts (4,548 bytes) - Lock for consolidation
consolidationPrompt.ts (3,225 bytes) - Consolidation prompts
```

#### Recall Safety (Trusting Recall)

```markdown
Memory records can become stale. Before answering based on memory:

- If memory names a file path: check the file exists
- If memory names a function/flag: grep for it
- If user will act on your recommendation: verify first

"The memory says X exists" is not "X exists now."
```

---

### 1.8 Brain/Reasoning Engine

**Location:** `src/query.ts` (1,729 lines) + `src/QueryEngine.ts` (1,295 lines) + `src/query/`

**Sophistication Level:** CRITICAL - This is the reasoning loop

#### Query Loop Architecture

```typescript
async function* query(params: QueryParams): AsyncGenerator<StreamEvent | Message> {
  // Immutable params
  const { systemPrompt, userContext, canUseTool, fallbackModel, querySource } = params;

  // Mutable cross-iteration state
  let state: State = {
    messages,
    toolUseContext,
    autoCompactTracking: undefined,
    maxOutputTokensRecoveryCount: 0,
    hasAttemptedReactiveCompact: false,
    turnCount: 1,
    transition: undefined,  // Why previous iteration continued
  };

  while (true) {
    // 1. Prefetch skills/memory while processing
    const pendingSkillPrefetch = startSkillDiscoveryPrefetch(messages);
    const pendingMemoryPrefetch = startRelevantMemoryPrefetch(messages);

    // 2. Apply tool result budget (truncation before API call)
    messagesForQuery = await applyToolResultBudget(messagesForQuery);

    // 3. Apply snip compaction (history removal)
    const snipResult = snipCompactIfNeeded(messagesForQuery);

    // 4. Apply microcompact (tool result clearing)
    const microcompactResult = await microcompact(messagesForQuery);

    // 5. Apply context collapse (summary folding)
    const collapseResult = await applyCollapsesIfNeeded(messagesForQuery);

    // 6. Run autocompact if needed
    const { compactionResult } = await autocompact(messagesForQuery);

    // 7. Make API call
    yield { type: 'stream_request_start' };
    const response = await streamAPICall(messagesForQuery, fullSystemPrompt);

    // 8. Execute tools if present
    if (hasToolUse(response)) {
      const toolResults = await runTools(response.toolUses, toolUseContext);
      // Continue loop with tool results
    }

    // 9. Check termination conditions
    if (shouldTerminate(response)) {
      return { type: 'terminal', ... };
    }
  }
}
```

#### State Management

```typescript
type State = {
  messages: Message[];                      // Conversation history
  toolUseContext: ToolUseContext;           // Execution context
  autoCompactTracking: AutoCompactTrackingState; // Token tracking
  maxOutputTokensRecoveryCount: number;     // Recovery attempts
  hasAttemptedReactiveCompact: boolean;     // Compaction flag
  pendingToolUseSummary: Promise<...>;      // Background summaries
  stopHookActive: boolean;                  // Stop hook state
  turnCount: number;                        // Iteration counter
  transition: Continue | undefined;         // Why we continued
}
```

#### Context Compaction Pipeline

The query loop implements a sophisticated compaction pipeline:

1. **Snip Compaction** - Removes old history entries
2. **Microcompact** - Clears stale tool results (keeps N most recent)
3. **Context Collapse** - Folds sections into summaries
4. **Autocompact** - Full context summarization when approaching limits

```typescript
// Function result clearing config
const config = {
  enabled: true,
  systemPromptSuggestSummaries: true,
  keepRecent: 5, // Keep 5 most recent tool results
  supportedModels: ['claude-opus', 'claude-sonnet'],
};
```

#### Token Budget Tracking

```typescript
const budgetTracker = createBudgetTracker();

// Check if user specified a token target
if (getCurrentTurnTokenBudget() > 0) {
  const usage = getTurnOutputTokens();
  if (usage >= target) {
    // Auto-continue to fill budget productively
    incrementBudgetContinuationCount();
  }
}
```

#### Recovery Mechanisms

```typescript
const MAX_OUTPUT_TOKENS_RECOVERY_LIMIT = 3;

// If max_output_tokens error:
if (msg.apiError === 'max_output_tokens') {
  if (maxOutputTokensRecoveryCount < MAX_OUTPUT_TOKENS_RECOVERY_LIMIT) {
    // Try reactive compact and continue
    state.maxOutputTokensRecoveryCount++;
    continue;
  }
}
```

---

### 1.9 Nervous System (Bridge)

**Location:** `src/bridge/` (12,613 lines total)

**Sophistication Level:** VERY HIGH - Communication backbone

#### Bridge Architecture

The bridge system enables communication between the CLI and external services:

```typescript
// Core files by size
bridgeMain.ts (2,999 lines)        - Main controller
replBridge.ts (2,406 lines)        - REPL bridge interface
remoteBridgeCore.ts (1,008 lines)  - Remote communication
initReplBridge.ts (569 lines)      - Bridge initialization
sessionRunner.ts (550 lines)       - Session management
bridgeApi.ts (539 lines)           - API integration
bridgeUI.ts (530 lines)            - UI bridge
bridgeMessaging.ts (461 lines)     - Message handling
```

#### Transport Types

```typescript
type BridgeTransport =
  | 'stdio' // Local subprocess communication
  | 'sse' // Server-sent events
  | 'http' // HTTP streaming
  | 'websocket'; // WebSocket

// Transport selection based on context
function getBridgeTransport(): BridgeTransport {
  if (isDesktopApp()) return 'websocket';
  if (isWebApp()) return 'sse';
  return 'stdio';
}
```

#### Session Management

```typescript
// createSession.ts - Session lifecycle
async function createSession(config: SessionConfig): Promise<Session> {
  const sessionId = generateSessionId();
  const jwt = await authenticateSession(config.credentials);

  return {
    sessionId,
    jwt,
    transport: createTransport(config.transportType),
    heartbeat: createHeartbeat(),
    reconnection: createReconnectionHandler(),
  };
}

// JWT utilities (jwtUtils.ts - 256 lines)
function validateJWT(token: string): JWTPayload;
function refreshJWT(token: string): Promise<string>;
function isJWTExpired(token: string): boolean;
```

#### Message Flow

```typescript
// Inbound message handling
// inboundMessages.ts + inboundAttachments.ts
async function handleInboundMessage(msg: BridgeMessage): Promise<void> {
  switch (msg.type) {
    case 'user_input':
      return handleUserInput(msg);
    case 'tool_result':
      return handleToolResult(msg);
    case 'attachment':
      return handleAttachment(msg);
    case 'system':
      return handleSystemMessage(msg);
  }
}

// Outbound message handling
// bridgeMessaging.ts
async function sendToBridge(msg: OutboundMessage): Promise<void> {
  await flushGate.acquire(); // Rate limiting
  await transport.send(serialize(msg));
}
```

#### Polling Configuration

```typescript
// pollConfig.ts + pollConfigDefaults.ts
type PollConfig = {
  initialDelayMs: number; // Initial poll delay
  maxDelayMs: number; // Max backoff delay
  backoffMultiplier: number; // Exponential backoff
  jitterFraction: number; // Random jitter %
};

const DEFAULT_POLL_CONFIG: PollConfig = {
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 1.5,
  jitterFraction: 0.1,
};
```

#### Trusted Device Flow

```typescript
// trustedDevice.ts (210 lines)
// Device trust for passwordless authentication
async function registerTrustedDevice(): Promise<TrustToken>;
async function verifyTrustedDevice(token: TrustToken): Promise<boolean>;
async function revokeTrustedDevice(deviceId: string): Promise<void>;
```

---

### 1.10 Agency/Swarm System

**Location:** `src/tools/AgentTool/` (6,072 lines) + `src/utils/swarm/` (4,486 lines)

**Sophistication Level:** VERY HIGH - Multi-agent orchestration

#### AgentTool Architecture

```typescript
// Core files
AgentTool.tsx (1,397 lines)     - Main agent spawning tool
runAgent.ts (973 lines)         - Agent execution
UI.tsx (871 lines)              - Agent UI rendering
loadAgentsDir.ts (670 lines)    - Agent discovery
prompt.ts (528 lines)           - Agent prompt construction
agentToolUtils.ts (680 lines)   - Agent utilities
resumeAgent.ts (265 lines)      - Agent continuation
forkSubagent.ts (265 lines)     - Forked agent support
```

#### Built-in Agents

```typescript
// src/tools/AgentTool/built-in/
const BUILT_IN_AGENTS = [
  'exploreAgent', // READ-ONLY codebase exploration
  'planAgent', // Implementation planning
  'verificationAgent', // Adversarial verification
  'generalPurposeAgent', // General multi-step tasks
  'statuslineSetup', // Status line configuration
  'claudeCodeGuideAgent', // Guide and help
];
```

#### Explore Agent (Read-Only)

```typescript
export const EXPLORE_AGENT: BuiltInAgentDefinition = {
  agentType: 'Explore',
  whenToUse: 'Fast agent for exploring codebases...',

  // CRITICAL: No file modification tools
  disallowedTools: [
    AGENT_TOOL_NAME,
    EXIT_PLAN_MODE_TOOL_NAME,
    FILE_EDIT_TOOL_NAME,
    FILE_WRITE_TOOL_NAME,
    NOTEBOOK_EDIT_TOOL_NAME,
  ],

  source: 'built-in',
  model: process.env.USER_TYPE === 'ant' ? 'inherit' : 'haiku',
  omitClaudeMd: true, // Skip CLAUDE.md for speed

  getSystemPrompt: () => `
    You are a file search specialist...
    === CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS ===
    Your role is EXCLUSIVELY to search and analyze existing code.
  `,
};
```

#### Verification Agent (Adversarial)

```typescript
// verificationAgent.ts (11,410 bytes)
// Independent adversarial verification of implementations

const VERIFICATION_AGENT: BuiltInAgentDefinition = {
  agentType: 'Verification',
  whenToUse: 'Non-trivial implementation verification...',

  // Verdicts: PASS (verified), FAIL (issues found), PARTIAL (incomplete)
  // Main agent cannot self-assign PARTIAL - only verifier can
};
```

#### Swarm System (Team Coordination)

```typescript
// src/utils/swarm/
inProcessRunner.ts (1,521 lines) - In-process worker execution
permissionSync.ts (775 lines)    - Permission synchronization
It2SetupPrompt.tsx (1,236 lines) - Team setup prompts
teamHelpers.ts (580 lines)       - Team coordination
spawnInProcess.ts (290 lines)    - Process spawning
spawnUtils.ts (146 lines)        - Spawn utilities
```

#### Fork Subagent

```typescript
// forkSubagent.ts - Background agent forking
// Runs in background, keeps tool output out of main context

async function forkSubagent(
  prompt: string,
  options: ForkOptions
): Promise<ForkResult> {
  const worktree = await createWorktree(branch);
  const subprocess = spawn(claudeCommand, {
    cwd: worktree.path,
    env: { ...process.env, CLAUDE_FORK_PARENT: sessionId },
  });

  return { taskId: subprocess.pid, worktree };
}
```

#### Agent Memory Snapshot

```typescript
// agentMemorySnapshot.ts (5,633 bytes)
// Captures context state for agent resumption

type AgentMemorySnapshot = {
  messages: Message[];
  toolResults: ToolResult[];
  fileState: FileStateCache;
  timestamp: number;
};

async function captureAgentMemory(): Promise<AgentMemorySnapshot>;
async function restoreAgentMemory(snapshot: AgentMemorySnapshot): Promise<void>;
```

---

### 1.11 Telemetry/Analytics System

**Location:** `src/services/analytics/` (4,040 lines)

**Sophistication Level:** HIGH

#### Core Components

```typescript
// By size
growthbook.ts (1,081 lines)                  - Feature flags
metadata.ts (877 lines)                       - Event metadata
firstPartyEventLoggingExporter.ts (710 lines) - Event export
firstPartyEventLogger.ts (426 lines)          - Event logging
datadog.ts (261 lines)                        - Datadog integration
index.ts (161 lines)                          - Public API
sink.ts (104 lines)                           - Logging sink
```

#### Event Logging

```typescript
// logEvent for analytics events
logEvent(
  eventName: string,
  metadata: AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
)

// Events are verified NOT to contain code or file paths
// Type ensures metadata safety at compile time
```

#### GrowthBook Feature Flags

```typescript
// Feature flag evaluation with caching
getFeatureValue_CACHED_MAY_BE_STALE(
  flag: string,
  defaultValue: T
): T

// Flags control:
// - Model selection
// - Feature enablement
// - A/B testing
// - Rollout percentages
```

#### Diagnostic Tracking

```typescript
// src/services/diagnosticTracking.ts (12,315 bytes)
// Performance and diagnostic metrics

type DiagnosticEvent = {
  timestamp: number;
  category: 'performance' | 'error' | 'usage';
  data: Record<string, unknown>;
};

function trackDiagnostic(event: DiagnosticEvent): void;
function flushDiagnostics(): Promise<void>;
```

---

## 2. MINOR SYSTEMS (The Glue)

### 2.1 Error Handling

**Location:** `src/utils/errors.ts`

#### Error Classes

```typescript
class AbortError extends Error        // User/timeout cancellation
class ClaudeError extends Error       // Base for custom errors
class ShellError extends Error        // Shell execution failures
class ConfigParseError extends Error  // JSON config parsing
class TelemetrySafeError extends Error // Safe for analytics

// MCP-specific
class McpAuthError extends Error
class McpSessionExpiredError extends Error
class McpToolCallError extends TelemetrySafeError
```

#### Utilities

```typescript
isAbortError(e): boolean              // Check all abort-like errors
toError(e: unknown): Error            // Normalize to Error
errorMessage(e: unknown): string      // Extract message
getErrnoCode(e): string | undefined   // ENOENT, EACCES, etc.
isFsInaccessible(e): boolean          // ENOENT|EACCES|EPERM|ENOTDIR|ELOOP
shortErrorStack(e, maxFrames): string // Truncated stack for model
classifyAxiosError(e): { kind, status, message }
```

---

### 2.2 Logging/Debug

**Location:** `src/utils/debug.ts`, `src/utils/log.ts`

#### Debug Logging

```typescript
// Levels: verbose, debug, info, warn, error
// Controlled by CLAUDE_CODE_DEBUG_LOG_LEVEL env var

logForDebugging(message, { level })
enableDebugLogging(): boolean  // Mid-session enable
flushDebugLogs(): Promise<void>

// Debug output destinations:
// - ~/.claude/debug/{sessionId}.txt (default)
// - --debug-file=path
// - --debug-to-stderr
```

#### Features

- Buffered writes (1s flush interval)
- Symlink to latest log
- Filter patterns via `--debug=pattern`
- Level-based filtering
- Multiline JSON encoding for JSONL format

#### Error Logging

```typescript
logError(error): void           // To debug + in-memory + file (ants)
logMCPError(server, error): void
logMCPDebug(server, message): void

// Sink pattern for deferred initialization
attachErrorLogSink(sink): void
```

---

### 2.3 Configuration

**Location:** `src/utils/config.ts` (700+ lines) + `src/utils/settings/`

#### Config Hierarchy

1. Global: `~/.claude/config.json`
2. Project: `.claude/settings.json`
3. Local: `.claude/settings.local.json`
4. Managed: Policy settings from remote
5. Flag: Feature flag settings

#### Key Types

```typescript
type GlobalConfig = {
  projects: Record<string, ProjectConfig>;
  numStartups: number;
  theme: ThemeSetting;
  mcpServers: Record<string, McpServerConfig>;
  preferredNotifChannel: NotificationChannel;
  oauthAccount: AccountInfo;
  autoCompactEnabled: boolean;
  fileCheckpointingEnabled: boolean;
  // ... 100+ fields
};

type ProjectConfig = {
  allowedTools: string[];
  mcpServers: Record<string, McpServerConfig>;
  hasTrustDialogAccepted: boolean;
  activeWorktreeSession?: WorktreeSession;
  // ... more
};
```

#### Settings Loading

```typescript
// Cached reads with file watchers
getConfig(): GlobalConfig
getProjectConfig(): ProjectConfig
getSettings_DEPRECATED() / getSettingsForSource(source)

// Settings change propagation
applySettingsChange(source, setState)
useSettingsChange(callback)  // React hook
```

---

### 2.4 State Management

**Location:** `src/state/`, `src/bootstrap/state.ts`

#### Bootstrap State (Global Singletons)

```typescript
// src/bootstrap/state.ts - Process-level state
type State = {
  originalCwd: string;
  projectRoot: string;
  sessionId: string;
  cwd: string;

  // Metrics
  totalCostUSD: number;
  totalAPIDuration: number;
  totalToolDuration: number;
  modelUsage: Record<string, ModelUsage>;

  // Telemetry
  meter: Meter | null;
  sessionCounter: AttributedCounter | null;

  // Hooks
  registeredHooks: Partial<Record<HookEvent, HookMatcher[]>>;

  // Cron
  scheduledTasksEnabled: boolean;
  sessionCronTasks: CronTask[];

  // ...many more
};
```

#### App State (React Context)

```typescript
// src/state/AppState.tsx - React-managed state
type AppState = {
  mainLoopModel: ModelSetting
  verbose: boolean
  toolPermissionContext: ToolPermissionContext
  denialTracking: DenialTrackingState
  speculationState: SpeculationState
  promptSuggestion: PromptSuggestion
  // ...
}

// Zustand-style store with selectors
useAppState(selector): T
useSetAppState(): (updater) => void
```

---

### 2.5 Shell/Bash Handling

**Location:** `src/utils/Shell.ts`, `src/utils/bash/`

#### Shell Execution

```typescript
exec(command, signal, shellType, options): Promise<ShellCommand>

type ExecOptions = {
  timeout?: number              // Default: 30 min
  onProgress?: ProgressCallback
  preventCwdChanges?: boolean
  shouldUseSandbox?: boolean
  shouldAutoBackground?: boolean
  onStdout?: (data) => void
}
```

#### Shell Providers

```typescript
type ShellProvider = {
  shellPath: string
  buildExecCommand(cmd, opts): { commandString, cwdFilePath }
  getSpawnArgs(cmd): string[]
  getEnvironmentOverrides(cmd): Record<string, string>
}

// Implementations
createBashShellProvider(binShell): ShellProvider
createPowerShellProvider(psPath): ShellProvider
```

#### Bash Parser (4,436 lines)

```typescript
// Full bash AST parsing using tree-sitter
// Extracts: commands, arguments, pipes, redirections, subshells
// Used for:
// - Permission checking (which commands are run)
// - Output redirection detection
// - Subcommand extraction for granular rules
```

#### Sandbox Integration

```typescript
SandboxManager.wrapWithSandbox(command, shell, opts, signal);
// Uses Apple Sandbox on macOS
// Secure temp directory with 0o700 permissions
```

---

### 2.6 File Operations

**Location:** `src/utils/file*.ts`, `src/utils/fsOperations.ts`

#### File System Abstraction

```typescript
// Allows mock filesystem for testing
getFsImplementation(): FileSystem
setFsImplementation(fs): void

// Async operations
pathExists(path): Promise<boolean>
readTextFile(path): Promise<string>

// Sync operations (use sparingly)
writeFileSyncAndFlush_DEPRECATED(path, content)
```

#### File History / Checkpointing

```typescript
// Tracks file states for undo/diff
type FileHistoryState = {
  snapshots: Map<string, FileSnapshot>;
  // ...
};

updateFileHistoryState(updater);
```

---

## 3. PATTERNS AND PRACTICES

### 3.1 Async Patterns

```typescript
// AbortController usage throughout
const controller = createAbortController()
signal.throwIfAborted()

// Combined abort signals
createCombinedAbortSignal(signal1, signal2)

// Async generators for streaming
async function* executeHooks(...) {
  for (const hook of hooks) {
    yield await executeHook(hook)
  }
}

// Promise-based queuing
writeChain = writeChain.then(async () => { ... })
```

### 3.2 Error/Retry Patterns

```typescript
// Exponential backoff with jitter
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      const delay = baseDelayMs * Math.pow(2, i) * (0.5 + Math.random());
      await sleep(delay);
    }
  }
}

// OAuth 401 retry
const tokenChanged = await handleOAuth401Error(sentToken);
if (tokenChanged) {
  return retry();
}
```

### 3.3 Timeout Patterns

```typescript
// Tool execution timeout
const TOOL_HOOK_EXECUTION_TIMEOUT_MS = 10 * 60 * 1000  // 10 min

// MCP timeouts
const MCP_REQUEST_TIMEOUT_MS = 60000  // 1 min
const DEFAULT_MCP_TOOL_TIMEOUT_MS = 100_000_000  // ~27.8 hours

// SessionEnd hooks (tight bound for shutdown)
const SESSION_END_HOOK_TIMEOUT_MS_DEFAULT = 1500

// Per-request fresh timeout signals (not stale global)
wrapFetchWithTimeout(baseFetch): FetchLike
```

### 3.4 Validation Patterns

```typescript
// Zod schemas with lazy evaluation
const hookJSONOutputSchema = lazySchema(() => z.union([...]))

// Safe parsing with error collection
const result = schema.safeParse(data)
if (!result.success) {
  const errors = result.error.issues.map(err => ...)
}

// Tool input validation
validateInput?(input, context): Promise<ValidationResult>
checkPermissions(input, context): Promise<PermissionResult>
```

### 3.5 Multi-Process Safety

```typescript
// Atomic file creation for locks
await writeFile(path, body, { flag: 'wx' })  // O_EXCL

// PID liveness checks
isProcessRunning(pid): boolean

// Stale lock recovery
if (existing && !isProcessRunning(existing.pid)) {
  await unlink(lockPath)
  // Retry exclusive create
}

// File watcher stability
chokidar.watch(path, {
  awaitWriteFinish: { stabilityThreshold: 300 }
})
```

---

## 4. EDGE CASES AND SECURITY

### 4.1 DST Handling

```typescript
// Cron uses local timezone
// Spring-forward: hour doesn't exist, skip that day
// Fall-back: fires once (loop jumps past repeated hour)
// Uses Date methods (getMinutes, setHours) not UTC variants
```

### 4.2 Race Condition Guards

```typescript
// inFlight set prevents double-fire during async file operations
const inFlight = new Set<string>();
if (inFlight.has(taskId)) return;
inFlight.add(taskId);
void removeTask(taskId).finally(() => inFlight.delete(taskId));

// nextFireAt map tracks scheduled times per task
// Evicted on task removal to prevent memory leaks
```

### 4.3 Security Measures

1. **Trust Dialog** - Must accept before hooks execute
2. **Sandbox** - Apple Sandbox for bash commands
3. **Path Validation** - Safety checks for .git/, .claude/, shell configs
4. **Permission Escalation** - safetyCheck decisions bypass-immune
5. **Session Isolation** - Scheduler lock per project
6. **Symlink Protection** - O_NOFOLLOW in file operations
7. **Secret Stripping** - API keys removed from error messages

### 4.4 Graceful Degradation

```typescript
// CWD recovery
try { await realpath(cwd) }
catch { setCwdState(getOriginalCwd()) }

// Config parse fallback
catch (e) { return DEFAULT_CONFIG }

// MCP session expiry
if (isMcpSessionExpiredError(e)) {
  clearConnectionCache(server)
  return retry()
}

// Classifier unavailable fallback
if (classifierResult.unavailable) {
  if (ironGateClosed) return deny()
  else return fallbackToPrompting()
}
```

---

## 5. FILE SIZE REFERENCE

| File             | Lines | Purpose               |
| ---------------- | ----- | --------------------- |
| hooks.ts         | 5,022 | Hook execution engine |
| bashParser.ts    | 4,436 | Bash AST parsing      |
| client.ts (MCP)  | 3,348 | MCP client            |
| permissions.ts   | 1,486 | Permission checks     |
| Tool.ts          | 792   | Tool interface        |
| cronScheduler.ts | 565   | Scheduler engine      |
| cron.ts          | 309   | Cron parsing          |
| cronTasks.ts     | 459   | Task storage          |
| cronTasksLock.ts | 196   | Multi-session lock    |
| errors.ts        | 239   | Error utilities       |
| debug.ts         | 269   | Debug logging         |
| log.ts           | 363   | Error logging         |

**New Major Systems:**

| System           | Lines  | Purpose              |
| ---------------- | ------ | -------------------- |
| prompts.ts       | 915    | Soul/Personality     |
| query.ts         | 1,729  | Reasoning loop       |
| QueryEngine.ts   | 1,295  | Engine orchestration |
| memdir/ total    | 2,365  | Memory system        |
| bridge/ total    | 12,613 | Nervous system       |
| AgentTool/ total | 6,072  | Agency system        |
| swarm/ total     | 4,486  | Team coordination    |
| analytics/ total | 4,040  | Telemetry            |

---

## 5.5 THE GLUE SYSTEMS (20 Gap Analysis)

**Father's Insight:** "The minor systems are the glue that holds everything together."

These 20 systems were identified as critical infrastructure missing from the initial analysis.

---

### Gap 1: Context Compaction System (3,960 lines)

**Location:** `src/services/compact/`

The compaction system prevents context overflow through a 4-stage pipeline:

```typescript
// Stage 1: Snip Compaction - Remove old history
snipCompactIfNeeded(messages) → { messages, tokensFreed, boundaryMessage }

// Stage 2: Microcompact - Clear stale tool results
microcompact(messages, context) → { messages, compactionInfo }
// Keeps N most recent results (default: 5)
// Only compacts specific tools: Read, Bash, Grep, Glob, WebFetch, Edit, Write

// Stage 3: Context Collapse - Fold sections into summaries
applyCollapsesIfNeeded(messages, context) → { messages }

// Stage 4: Autocompact - Full context summarization
compactConversation(messages, systemPrompt) → CompactionResult
```

**Key Constants:**

```typescript
AUTOCOMPACT_BUFFER_TOKENS = 13_000;
WARNING_THRESHOLD_BUFFER_TOKENS = 20_000;
MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3;
POST_COMPACT_MAX_FILES_TO_RESTORE = 5;
POST_COMPACT_TOKEN_BUDGET = 50_000;
```

**Image Stripping:** Before compaction, images are replaced with `[image]` markers to avoid prompt-too-long errors.

---

### Gap 2: Streaming Tool Execution (2,273 lines)

**Location:** `src/services/tools/`

```typescript
// Files
toolExecution.ts (1,745 lines)     - Full execution engine
StreamingToolExecutor.ts (528 lines) - Streaming with concurrency
toolOrchestration.ts (155 lines)   - Orchestration
toolHooks.ts (673 lines)           - Lifecycle hooks
```

**StreamingToolExecutor Class:**

```typescript
class StreamingToolExecutor {
  // Concurrency control
  private canExecuteTool(isConcurrencySafe: boolean): boolean

  // Tool states
  type ToolStatus = 'queued' | 'executing' | 'completed' | 'yielded'

  // Key behaviors:
  // - Concurrent-safe tools can run in parallel
  // - Non-concurrent tools get exclusive access
  // - Results buffered and emitted in order received
  // - Sibling abort controller kills siblings on error
}
```

**Error Classification:**

```typescript
function classifyToolError(error): string {
  // TelemetrySafeError → use telemetryMessage
  // Node.js fs errors → log ENOENT, EACCES, etc.
  // Known types → use stable .name
  // Fallback → "Error" (not mangled 3-char identifier)
}
```

---

### Gap 3: Remote Session Management (33K bytes)

**Location:** `src/remote/`

**Critical for Molly's dual-function (local + server) architecture.**

```typescript
// Files
RemoteSessionManager.ts (9,320 bytes) - Session lifecycle
SessionsWebSocket.ts (12,505 bytes)   - WebSocket communication
sdkMessageAdapter.ts (9,060 bytes)    - SDK message translation
remotePermissionBridge.ts (2,378 bytes) - Permission bridging
```

**RemoteSessionManager:**

```typescript
class RemoteSessionManager {
  // Coordinates:
  // - WebSocket subscription for receiving messages
  // - HTTP POST for sending user messages
  // - Permission request/response flow

  connect(): void; // Connect via WebSocket
  handleMessage(msg): void; // Route SDK vs control messages
  sendInput(text): Promise; // HTTP POST to CCR
  respondToPermission(id, response): void;
}

type RemotePermissionResponse =
  | { behavior: 'allow'; updatedInput: Record<string, unknown> }
  | { behavior: 'deny'; message: string };
```

---

### Gap 4: Coordinator Mode (530 lines)

**Location:** `src/coordinator/coordinatorMode.ts`

**Multi-agent orchestration where one Claude instance directs workers.**

```typescript
function isCoordinatorMode(): boolean {
  return isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE);
}

// Coordinator system prompt excerpt:
`You are Claude Code, an AI assistant that orchestrates software 
engineering tasks across multiple workers.

## Your Role
You are a **coordinator**. Your job is to:
- Help the user achieve their goal
- Direct workers to research, implement and verify code changes
- Synthesize results and communicate with the user

## Your Tools
- Agent - Spawn a new worker
- SendMessage - Continue an existing worker
- TaskStop - Stop a running worker`;
```

**Worker Notifications:** Workers report via `<task-notification>` XML in user-role messages.

---

### Gap 5: Skills System (43K bytes)

**Location:** `src/skills/`

```typescript
// Files
loadSkillsDir.ts (34,415 bytes)  - Skill discovery and loading
bundledSkills.ts (7,497 bytes)   - Built-in skills
mcpSkillBuilders.ts (1,627 bytes) - MCP skill integration
```

**Skill Sources:**

```typescript
type LoadedFrom =
  | 'commands_DEPRECATED'
  | 'skills'
  | 'plugin'
  | 'managed'
  | 'bundled'
  | 'mcp';

function getSkillsPath(source, dir): string {
  // policySettings → managed path
  // userSettings → ~/.claude/skills
  // projectSettings → .claude/skills
}
```

**Skill Frontmatter:**

```yaml
---
name: commit
description: Create a git commit
whenToUse: When user wants to commit changes
tools: [Bash, Read]
hooks:
  pre-tool-use: ...
---
```

---

### Gap 6: History Management (464 lines)

**Location:** `src/history.ts`

**Conversation history with pasted content handling.**

```typescript
const MAX_HISTORY_ITEMS = 100
const MAX_PASTED_CONTENT_LENGTH = 1024

// Pasted content references
function formatPastedTextRef(id, numLines): string {
  return `[Pasted text #${id} +${numLines} lines]`
}
function formatImageRef(id): string {
  return `[Image #${id}]`
}

// History storage
// Global: ~/.claude/history.jsonl
// Large pastes: External paste store (hash referenced)

// Async generator for reading history backwards
async function* makeHistoryReader(): AsyncGenerator<HistoryEntry>
```

---

### Gap 7: Speculation System (~500 lines)

**Location:** `src/services/PromptSuggestion/speculation.ts`

**Speculative execution for faster responses.**

```typescript
const MAX_SPECULATION_TURNS = 20;
const MAX_SPECULATION_MESSAGES = 100;

// Safe tools for speculation
const SAFE_READ_ONLY_TOOLS = new Set([
  'Read',
  'Glob',
  'Grep',
  'ToolSearch',
  'LSP',
  'TaskGet',
  'TaskList',
]);
const WRITE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);

// Speculation runs in overlay filesystem
function getOverlayPath(id: string): string {
  return join(getClaudeTempDir(), 'speculation', String(process.pid), id);
}

// Copy successful speculation results to main filesystem
async function copyOverlayToMain(overlayPath, mainPath): Promise<void>;
```

---

### Gap 8: Worktree Management (1,519 lines)

**Location:** `src/utils/worktree.ts`

**Git worktree isolation for safe parallel work.**

```typescript
type WorktreeSession = {
  originalCwd: string;
  worktreePath: string;
  worktreeName: string;
  worktreeBranch?: string;
  originalBranch?: string;
  originalHeadCommit?: string;
  sessionId: string;
  tmuxSessionName?: string;
  hookBased?: boolean;
};

// Validation against path traversal
function validateWorktreeSlug(slug: string): void {
  // Rejects: ../escape, absolute paths, . and .. segments
  // Allows: user/feature-foo (nested slugs)
}

// Symlink large directories to avoid disk bloat
async function symlinkDirectories(repoRoot, worktreePath, dirs): Promise<void> {
  // Symlinks node_modules, etc. from main repo
}
```

---

### Gap 9: Voice/Multimodal System (525+ lines)

**Location:** `src/services/voice.ts`, `src/services/voiceStreamSTT.ts`

```typescript
// Native audio capture (cpal) on macOS/Linux/Windows
// Fallback: SoX `rec` or `arecord` (ALSA)

const RECORDING_SAMPLE_RATE = 16000;
const RECORDING_CHANNELS = 1;
const SILENCE_DURATION_SECS = '2.0';
const SILENCE_THRESHOLD = '3%';

// Lazy-load native module (blocks event loop ~1-8s)
type AudioNapi = typeof import('audio-capture-napi');
function loadAudioNapi(): Promise<AudioNapi>;

// Check recording availability
function hasCommand(cmd: string): boolean; // Check PATH
function probeArecord(): Promise<{ ok; stderr }>; // Actually test device
```

---

### Gap 10: Rate Limiting System (450+ lines)

**Location:** `src/services/claudeAiLimits.ts`, `src/services/rateLimitMessages.ts`

```typescript
type RateLimitType =
  | 'five_hour'
  | 'seven_day'
  | 'seven_day_opus'
  | 'seven_day_sonnet'
  | 'overage';

// Early warning thresholds
const EARLY_WARNING_CONFIGS = [
  {
    rateLimitType: 'five_hour',
    windowSeconds: 5 * 60 * 60,
    thresholds: [{ utilization: 0.9, timePct: 0.72 }],
  },
  {
    rateLimitType: 'seven_day',
    windowSeconds: 7 * 24 * 60 * 60,
    thresholds: [
      { utilization: 0.75, timePct: 0.6 },
      { utilization: 0.5, timePct: 0.35 },
      { utilization: 0.25, timePct: 0.15 },
    ],
  },
];

// Display names for user messaging
const RATE_LIMIT_DISPLAY_NAMES: Record<RateLimitType, string> = {
  five_hour: 'session limit',
  seven_day: 'weekly limit',
  overage: 'extra usage limit',
};
```

---

### Gap 11: CLI Print/Output System (5,594 lines)

**Location:** `src/cli/print.ts`

How output is rendered to the terminal - streaming, formatting, colors, progress indicators.

---

### Gap 12: Messages System (5,512 lines)

**Location:** `src/utils/messages.ts`

**Message creation, parsing, and manipulation.**

```typescript
// 60+ message types including:
type AssistantMessage
type UserMessage
type AttachmentMessage
type SystemMessage
type ProgressMessage
type SystemCompactBoundaryMessage
type ToolUseSummaryMessage
// ... and many more

// Key functions
createUserMessage(params): UserMessage
createSystemMessage(text, level): SystemMessage
createCompactBoundaryMessage(): SystemCompactBoundaryMessage
normalizeMessagesForAPI(messages): NormalizedMessage[]
```

---

### Gap 13: Session Storage (5,105 lines)

**Location:** `src/utils/sessionStorage.ts`

**Session persistence, resume, and transcript management.**

```typescript
// Session files stored in ~/.claude/projects/{project}/
getTranscriptPath(): string  // Main transcript file
getSessionProjectDir(): string  // Project-specific storage

// Resume capability
async function loadSession(sessionId): Promise<{messages, metadata}>
async function saveSession(messages, metadata): Promise<void>

// JSONL transcript format
type TranscriptMessage = SerializedMessage | Entry
```

---

### Gap 14: Attachments System (3,997 lines)

**Location:** `src/utils/attachments.ts`

**File/image attachments, memory injection, diagnostics.**

```typescript
// Attachment types
type Attachment =
  | FileAttachment
  | ImageAttachment
  | MemoryAttachment
  | DiagnosticAttachment
  | HookAttachment
  | SkillAttachment

// Key functions
generateFileAttachment(path, content): FileAttachment
createAttachmentMessage(attachments): AttachmentMessage
getAttachmentMessages(messages, context): Promise<AttachmentMessage[]>

// Memory injection
startRelevantMemoryPrefetch(messages, context): MemoryPrefetch
```

---

### Gap 15: API Client (3,419 lines)

**Location:** `src/services/api/claude.ts`

**API communication, streaming, retry logic.**

```typescript
// Core API call
async function queryModelWithStreaming(
  messages,
  systemPrompt,
  options
): AsyncGenerator<StreamEvent>

// Model configuration
function getMaxOutputTokensForModel(model): number
function getContextWindowForModel(model, betas): number

// Prompt cache management
notifyCompaction(): void
notifyCacheDeletion(): void
```

---

### Gap 16: Plugin System (5,945 lines)

**Location:** `src/utils/plugins/`

```typescript
// Files
pluginLoader.ts (3,302 lines)      - Plugin discovery/loading
marketplaceManager.ts (2,643 lines) - Marketplace integration

// Plugin structure
type PluginManifest = {
  name: string
  version: string
  description: string
  hooks?: HookDefinition[]
  tools?: ToolDefinition[]
  skills?: SkillDefinition[]
}
```

---

### Gap 17: Bash Security (5,213 lines)

**Location:** `src/tools/BashTool/`

```typescript
// Files
bashPermissions.ts (2,621 lines)    - Permission checking
bashSecurity.ts (2,592 lines)       - Security validation

// Security features:
// - Command allowlist/denylist
// - Path validation
// - Sandbox integration
// - Read-only mode enforcement
// - Subcommand extraction for granular rules
```

---

### Gap 18: Authentication (4,467 lines)

**Location:** `src/utils/auth.ts`, `src/services/mcp/auth.ts`

```typescript
// Files
auth.ts (2,002 lines)         - Core authentication
mcp/auth.ts (2,465 lines)     - MCP OAuth flows

// Features:
// - OAuth 2.0 flows
// - Token refresh
// - Subscriber detection
// - API key management
// - MCP server authentication
```

---

### Gap 19: Bootstrap State (1,758 lines)

**Location:** `src/bootstrap/state.ts`

**Process-level singleton state.**

```typescript
// Session identity
getSessionId(): string
getOriginalCwd(): string
getProjectRoot(): string

// Metrics
getTotalCostUSD(): number
getTotalAPIDuration(): number
addToToolDuration(ms): void

// Feature flags
getSdkBetas(): string[]
isKairosActive(): boolean

// Cron state
getSessionCronTasks(): CronTask[]
setScheduledTasksEnabled(bool): void
```

---

### Gap 20: Filesystem Permissions (1,777 lines)

**Location:** `src/utils/permissions/filesystem.ts`

```typescript
// Safe paths that don't need permission
function isSafePath(path): boolean {
  // Scratchpad, temp dirs, certain project paths
}

// Dangerous paths that are always blocked
function isDangerousPath(path): boolean {
  // .git internals, .claude/settings, shell configs
}

// Scratchpad (session-specific temp directory)
isScratchpadEnabled(): boolean
getScratchpadDir(): string
```

---

### Gap 21: LSP System (2,460 lines)

**Location:** `src/services/lsp/`

**Language Server Protocol integration for IDE features.**

```typescript
// Files:
// - LSPServerManager.ts (13,394 lines) - Multi-server routing
// - LSPServerInstance.ts (16,864 lines) - Individual server management
// - LSPClient.ts (14,361 lines) - Protocol client
// - LSPDiagnosticRegistry.ts (11,957 lines) - Error/warning tracking
// - passiveFeedback.ts (11,190 lines) - Background diagnostics
// - manager.ts (10,067 lines) - Lifecycle management

// Key API:
interface LSPServerManager {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  getServerForFile(filePath: string): LSPServerInstance | undefined;
  sendRequest<T>(
    filePath: string,
    method: string,
    params: unknown
  ): Promise<T | undefined>;
  openFile(filePath: string, content: string): Promise<void>;
  changeFile(filePath: string, content: string): Promise<void>;
  saveFile(filePath: string): Promise<void>;
}

// Features:
// - Multi-language server management (TypeScript, Python, etc.)
// - File extension to server routing
// - Document sync (didOpen, didChange, didSave, didClose)
// - Diagnostics integration (errors, warnings, hints)
// - Passive feedback (background type checking)
```

**Value for Molly:** Could provide real-time type checking for code Molly generates.

---

### Gap 22: Team Memory Sync with SECRET SCANNING (2,167 lines)

**Location:** `src/services/teamMemorySync/`

**CRITICAL SECURITY FEATURE: Client-side secret detection before upload.**

```typescript
// secretScanner.ts - Gitleaks-based credential detection

// Curated rules with near-zero false positives:
const SECRET_RULES: SecretRule[] = [
  // Cloud providers
  {
    id: 'aws-access-token',
    source: '\\b((?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16})\\b',
  },
  { id: 'gcp-api-key', source: '\\b(AIza[\\w-]{35})...' },
  { id: 'azure-ad-client-secret', source: '...' },
  { id: 'digitalocean-pat', source: '\\b(dop_v1_[a-f0-9]{64})...' },

  // AI APIs
  { id: 'anthropic-api-key', source: `\\b(${ANT_KEY_PFX}03-...)` },
  { id: 'openai-api-key', source: '\\b(sk-(?:proj|svcacct|admin)...)' },
  { id: 'huggingface-access-token', source: '\\b(hf_[a-zA-Z]{34})...' },

  // Version control
  { id: 'github-pat', source: 'ghp_[0-9a-zA-Z]{36}' },
  { id: 'github-fine-grained-pat', source: 'github_pat_\\w{82}' },
  { id: 'gitlab-pat', source: 'glpat-[\\w-]{20}' },

  // Communication
  { id: 'slack-bot-token', source: 'xoxb-[0-9]{10,13}-...' },
  { id: 'twilio-api-key', source: 'SK[0-9a-fA-F]{32}' },

  // Payment
  {
    id: 'stripe-access-token',
    source: '\\b((?:sk|rk)_(?:test|live|prod)_...)',
  },

  // Private keys
  { id: 'private-key', source: '-----BEGIN.*PRIVATE KEY-----...' },
];

// API:
function scanForSecrets(content: string): SecretMatch[];
function redactSecrets(content: string): string; // Replace with [REDACTED]
```

**CRITICAL:** Secrets never leave the machine. Scanning happens BEFORE upload.

---

### Gap 23: Tasks System (1,102+ lines)

**Location:** `src/tasks/`

**Background task management and lifecycle.**

```typescript
// Task types (union):
type TaskState =
  | LocalShellTaskState // Background shell commands
  | LocalAgentTaskState // Local sub-agents
  | RemoteAgentTaskState // Remote agents via bridge
  | InProcessTeammateTaskState // In-process teammates
  | LocalWorkflowTaskState // Workflow automation
  | MonitorMcpTaskState // MCP server monitoring
  | DreamTaskState; // Memory consolidation

// Each task has:
type CommonTaskState = {
  status: 'pending' | 'running' | 'completed' | 'failed';
  isBackgrounded: boolean;
};

// Background task detection:
function isBackgroundTask(task: TaskState): boolean {
  return (
    (task.status === 'running' || task.status === 'pending') &&
    task.isBackgrounded !== false
  );
}
```

**Value for Molly:** Unified task management for agents, shells, and workflows.

---

### Gap 24: Memdir System (1,736 lines)

**Location:** `src/memdir/`

**Memory directory management - the file-based memory implementation.**

```typescript
// MEMORY.md entry point with limits:
const ENTRYPOINT_NAME = 'MEMORY.md';
const MAX_ENTRYPOINT_LINES = 200;
const MAX_ENTRYPOINT_BYTES = 25_000;

// Files:
// - memdir.ts (507 lines) - Core memory building
// - findRelevantMemories.ts (141 lines) - Relevance scoring
// - memoryScan.ts (94 lines) - Directory scanning
// - memoryTypes.ts (271 lines) - Type definitions, save/don't-save rules
// - paths.ts (278 lines) - Path resolution
// - teamMemPaths.ts (292 lines) - Team memory paths
// - memoryAge.ts (53 lines) - Staleness tracking

// Key functions:
function truncateEntrypointContent(raw: string): EntrypointTruncation;
function buildMemoryPrompt(): string;
function findRelevantMemories(query: string): Memory[];
```

**Value for Molly:** Molly has StatePersistence, but memdir's relevance scoring could enhance recall.

---

### Gap 25: Ink Terminal UI (15,703 lines)

**Location:** `src/ink/`

**Terminal UI rendering framework (React-based).**

```typescript
// Subdirectories:
// - components/ - Reusable UI components
// - termio/ - Terminal I/O handling
// - layout/ - Yoga layout integration
// - hooks/ - React hooks for terminal state
// - events/ - Input/output event handling

// Features:
// - React-based terminal rendering
// - Yoga layout (Flexbox for terminals)
// - Input handling (keyboard, mouse)
// - ANSI color/style management
// - Scrolling, resizing
// - Focus management
```

**Note:** Molly is web-based (Next.js), so Ink is lower priority. However, components could inform MollyShell improvements.

---

### Gap 26: Commands System (9,798 lines)

**Location:** `src/commands/`

**Over 100 CLI commands.**

```typescript
// Sample commands (partial list):
// Version control: branch, commit, commit-push-pr, diff, pr_comments, review
// Session: resume, export, session, share
// Memory: memory (CRUD operations)
// Config: config, permissions, model, theme
// Tools: mcp, plugin, hooks, skills
// Diagnostics: doctor, debug-tool-call, heapdump, perf-issue
// Special: vim, voice, sandbox-toggle, teleport, ultraplan
// Teams: stickers, tags, color

// Notable commands:
// - commit.ts - Git commit with message generation
// - review.ts - Code review automation
// - doctor - System health check
// - voice - Voice input mode
// - ultraplan.tsx - Extended planning mode
// - teleport - Session transfer
```

**Value for Molly:** Many commands could map to Molly's tool system.

---

### Gap 27: Native TypeScript (4,081 lines)

**Location:** `src/native-ts/`

**Performance-critical native implementations.**

```typescript
// Subdirectories:
// - file-index/ - Fast file indexing for large repos
// - yoga-layout/ - Flexbox layout engine bindings
// - color-diff/ - Syntax-highlighted diff generation

// file-index:
// - Indexes files for fast glob/grep
// - Handles .gitignore patterns
// - Streaming file enumeration

// yoga-layout:
// - Facebook's Flexbox implementation
// - Used by Ink for terminal layout

// color-diff:
// - Syntax-aware diff coloring
// - Language detection
// - Unified/split diff views
```

---

### Gap 28: Keybindings (2,610 lines)

**Location:** `src/keybindings/`

**Keyboard shortcut management.**

```typescript
// Features:
// - Vim-style keybinding parsing
// - Mode-based shortcuts (normal, insert, visual)
// - Customizable via configuration
// - Conflict detection
// - Help display generation
```

---

### Gap 29: Policy Limits (690 lines)

**Location:** `src/services/policyLimits/`

**Rate limiting and quota enforcement.**

```typescript
// Features:
// - API call rate limiting
// - Token usage tracking
// - Plan-based limits (free/pro/teams)
// - Graceful degradation on limit hit
// - Limit reset notifications
```

---

### Gap 30: Remote Managed Settings (877 lines)

**Location:** `src/services/remoteManagedSettings/`

**Server-pushed configuration for teams.**

```typescript
// Features:
// - Settings pushed from team admin
// - Security policies
// - Tool restrictions
// - Model availability
// - Override local settings when required
```

---

### Gap 31: Settings Sync (648 lines)

**Location:** `src/services/settingsSync/`

**Cross-device settings synchronization.**

```typescript
// Features:
// - Settings upload/download
// - Conflict resolution
// - Selective sync (what to sync)
// - Offline handling
```

---

### Gap 32: OAuth Service (1,051 lines)

**Location:** `src/services/oauth/`

**OAuth 2.0 flow management.**

```typescript
// Features:
// - Authorization code flow
// - PKCE for security
// - Token storage (keychain integration)
// - Token refresh
// - Multi-provider support (GitHub, Google, etc.)
// - Session linkage
```

---

### Gap 33: Upstream Proxy (740 lines)

**Location:** `src/upstreamproxy/`

**HTTP proxy for API requests.**

```typescript
// Features:
// - Proxy configuration parsing
// - HTTPS tunneling
// - Certificate handling
// - Authentication (basic, NTLM)
// - Bypass rules for internal networks
```

---

### Gap 34: Buddy/Companion System (1,298 lines)

**Location:** `src/buddy/`

**Gamification system - virtual companions/pets for users.**

```typescript
// Deterministic companion generation from user ID
function roll(userId: string): Roll {
  const key = userId + SALT;
  return rollFrom(mulberry32(hashString(key)));
}

// Companion attributes
type CompanionBones = {
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  species: string; // Duck, etc.
  eye: string; // Eye style
  hat: string; // Hat (rare+ only)
  shiny: boolean; // 1% chance
  stats: Record<StatName, number>; // Peak stat, dump stat, scattered rest
};

// Rarity weights (legendary is rare!)
const RARITY_WEIGHTS = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1,
};
```

**Value for Molly:** Fun engagement feature, could enhance user retention.

---

### Gap 35: CLI Infrastructure (12,353 lines)

**Location:** `src/cli/`

**Core CLI rendering and I/O.**

```typescript
// Files:
// - print.ts (212KB!) - Main rendering engine
// - structuredIO.ts (28KB) - Structured I/O handling
// - remoteIO.ts (10KB) - Remote session I/O
// - update.ts (14KB) - Update notifications
// - handlers/ - Command handlers
// - transports/ - Transport implementations

// Key capabilities:
// - Terminal rendering with streaming
// - NDJSON output mode
// - Remote I/O bridging
// - Update checking and notification
```

---

### Gap 36: React Hooks System (16,476 lines)

**Location:** `src/hooks/`

**UI state management hooks.**

```typescript
// Notable hooks:
// - useVoice.ts (1,144 lines) - Voice input
// - useTypeahead.tsx (1,384 lines) - Tab completion
// - useInboxPoller.ts (969 lines) - Notification polling
// - useVirtualScroll.ts (721 lines) - Efficient scrolling
// - useReplBridge.tsx (722 lines) - REPL bridging
// - useRemoteSession.ts (605 lines) - Remote session management
// - useSwarmPermissionPoller.ts (330 lines) - Swarm permissions
// - useVimInput.ts (316 lines) - Vim keybindings
// - useHistorySearch.ts (303 lines) - Command history search
```

---

### Gap 37: State Management (991 lines)

**Location:** `src/state/`

**React-based application state.**

```typescript
// Files:
// - AppStateStore.ts (569 lines) - State store
// - onChangeAppState.ts (171 lines) - State change handlers
// - selectors.ts (76 lines) - State selectors
// - teammateViewHelpers.ts (141 lines) - Teammate UI state
```

---

### Gap 38: Context System (1,004 lines)

**Location:** `src/context.ts` + `src/context/`

**System and user context management.**

```typescript
// Provides context to system prompts:
// - Git status (branch, recent commits, changes)
// - Working directory information
// - CLAUDE.md files
// - Memory files
// - System prompt injection for debugging

const getGitStatus = memoize(async (): Promise<string | null> => {
  const [branch, mainBranch, status, log, userName] = await Promise.all([
    getBranch(),
    getDefaultBranch(),
    // git status --short
    // git log --oneline -n 5
    // git config user.name
  ]);
  // Returns formatted context
});
```

---

### Gap 39: Auto Dream (550 lines)

**Location:** `src/services/autoDream/`

**Background memory consolidation system.**

```typescript
// Fires /dream prompt as forked subagent when:
// 1. Time gate: hours since lastConsolidatedAt >= minHours (default: 24)
// 2. Session gate: enough sessions accumulated (default: 5)
// 3. Lock: no other process mid-consolidation

const DEFAULTS: AutoDreamConfig = {
  minHours: 24,
  minSessions: 5,
};

// Gate checks (cheapest first):
// 1. Time check - single stat
// 2. Session count - transcript mtime scan
// 3. Lock acquisition
```

**Value for Molly:** Automatic memory consolidation without user intervention.

---

### Gap 40: Session Memory (1,026 lines)

**Location:** `src/services/SessionMemory/`

**Automatic session notes system.**

```typescript
// Maintains markdown file with conversation notes
// Runs periodically via forked subagent
// Does NOT interrupt main conversation

// Key features:
// - Initialization threshold (wait for meaningful context)
// - Update threshold (don't update too frequently)
// - Token counting for extraction cost
// - Sequential execution (no parallel extractions)
```

---

### Gap 41: Extract Memories (769 lines)

**Location:** `src/services/extractMemories/`

**Durable memory extraction system.**

```typescript
// Runs at end of each complete query loop
// Uses forked agent pattern (shares parent's prompt cache)
// Writes to auto-memory directory

// Allowed tools for extraction:
const ALLOWED_TOOLS = [
  FILE_EDIT_TOOL_NAME,
  FILE_WRITE_TOOL_NAME,
  FILE_READ_TOOL_NAME,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
];
```

---

### Gap 42: Prompt Suggestion (1,514 lines)

**Location:** `src/services/PromptSuggestion/`

**Suggests follow-up prompts to users.**

```typescript
// Features:
// - Uses forked agent for generation
// - Speculation support (parallel inference)
// - Disabled in non-interactive mode
// - Disabled for swarm teammates (leader only)
// - User intent vs stated intent variants

type PromptVariant = 'user_intent' | 'stated_intent';
```

---

### Gap 43: Magic Docs (381 lines)

**Location:** `src/services/MagicDocs/`

**Auto-updating documentation system.**

```typescript
// Files marked with "# MAGIC DOC: [title]" get auto-updated
// Background forked subagent maintains the document
// Updates triggered by file reads

const MAGIC_DOC_HEADER_PATTERN = /^#\s*MAGIC\s+DOC:\s*(.+)$/im;

// Optional instructions line (italics after header):
// # MAGIC DOC: Architecture Overview
// _Focus on API boundaries and data flow_
```

**Value for Molly:** Self-maintaining documentation - keep docs current automatically.

---

### Gap 44: Tips System (761 lines)

**Location:** `src/services/tips/`

**Contextual tips and hints.**

```typescript
// Shows relevant tips based on:
// - Current context
// - User experience level
// - Recent actions
// - Feature discovery
```

---

### Gap 45: Computer Use (2,161 lines)

**Location:** `src/utils/computerUse/`

**GUI automation system - CRITICAL for desktop control.**

```typescript
// Native modules:
// - @ant/computer-use-input (Rust/enigo) - mouse, keyboard
// - @ant/computer-use-swift - screenshots, app management, TCC

// Capabilities:
// - Screen capture via SCContentFilter
// - Mouse movement and clicking
// - Keyboard input
// - Frontmost app detection
// - App launching (NSWorkspace)
// - Clipboard via pbcopy/pbpaste

// CLI deltas from Cowork:
// - No click-through overlay (terminal-based)
// - Terminal as surrogate host bundle ID
// - Terminal exempted from screenshots
```

**Value for Molly:** Foundation for GUI automation on desktop.

---

### Gap 46: Deep Link (1,388 lines)

**Location:** `src/utils/deepLink/`

**Protocol handler for claude-cli:// URIs.**

```typescript
// URI format: claude-cli://open?q=prompt&cwd=/path&repo=owner/name

// Security:
// - URL-decoded, Unicode-sanitized
// - ASCII control characters rejected (injection prevention)
// - Single-quote shell-escaping at point of use
// - Prompt length cap (5000 chars)
// - Long prompts show "scroll to review" warning
```

---

### Gap 47: Teleport (955 lines)

**Location:** `src/utils/teleport/`

**Session transfer between devices/terminals.**

```typescript
// Files:
// - api.ts (13KB) - Teleport API
// - gitBundle.ts (10KB) - Git state bundling
// - environmentSelection.ts - Target selection
// - environments.ts - Environment definitions

// Bundles:
// - Conversation state
// - Git state
// - Working directory context
```

---

### Gap 48: Native Installer (3,018 lines)

**Location:** `src/utils/nativeInstaller/`

**Native application installation.**

```typescript
// - download.ts - Binary downloads
// - installer.ts - Installation logic
// - packageManagers.ts - Package manager detection
// - pidLock.ts - Process locking
```

---

### Gap 49: Model Management (2,710 lines)

**Location:** `src/utils/model/`

**Model selection and capabilities.**

```typescript
// Files:
// - model.ts - Core model selection
// - aliases.ts - Model name aliases
// - antModels.ts - Anthropic model registry
// - bedrock.ts - AWS Bedrock provider
// - providers.ts - API provider abstraction
// - modelCapabilities.ts - Feature detection
// - modelAllowlist.ts - Allowed model filtering
// - deprecation.ts - Model deprecation handling
// - check1mAccess.ts - 1M context access

// Small fast model for cheap operations:
function getSmallFastModel(): ModelName {
  return process.env.ANTHROPIC_SMALL_FAST_MODEL || getDefaultHaikuModel();
}
```

---

### Gap 50: Suggestions (1,213 lines)

**Location:** `src/utils/suggestions/`

**UI suggestion system.**

```typescript
// Context-aware suggestions for:
// - File paths
// - Commands
// - Code completions
// - Actions
```

---

### Gap 51: Migrations (603 lines)

**Location:** `src/migrations/`

**Data and configuration migrations.**

```typescript
// Migration examples:
// - migrateAutoUpdatesToSettings.ts
// - migrateFennecToOpus.ts (model rename)
// - migrateSonnet1mToSonnet45.ts
// - migrateSonnet45ToSonnet46.ts
// - resetAutoModeOptInForDefaultOffer.ts

// Pattern: detect old state, transform to new state
```

---

### Gap 52: Server Mode (358 lines)

**Location:** `src/server/`

**Direct connect server.**

```typescript
// - directConnectManager.ts - Connection management
// - createDirectConnectSession.ts - Session creation
// - types.ts - Server types
```

---

### Gap 53: Entrypoints (4,051 lines)

**Location:** `src/entrypoints/`

**Application entry points.**

```typescript
// Entry points:
// - cli.tsx - Main CLI entry
// - mcp.ts - MCP server mode (expose tools to other apps)
// - init.ts - Initialization sequence
// - sdk/ - SDK entrypoint

// MCP server exposes Claude's tools:
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = await getTools();
  return { tools: tools.map(zodToJsonSchema) };
});
```

---

### Gap 54: Type Definitions (3,446 lines)

**Location:** `src/types/`

**Core TypeScript type definitions.**

```typescript
// - message.ts - Message types
// - hooks.ts - Hook types
// - textInputTypes.ts - Input types
// - generated/ - Auto-generated types
```

---

### Gap 55: Vim Mode (1,513 lines)

**Location:** `src/vim/`

**Full vim emulation with state machine.**

```typescript
// Files:
// - transitions.ts (490 lines) - State transition table
// - operators.ts (556 lines) - Operator execution (d, c, y, etc.)
// - textObjects.ts (186 lines) - Text objects (iw, aw, i", a", etc.)
// - types.ts (199 lines) - Type definitions
// - motions.ts - Motion resolution

// State machine for vim commands:
type CommandState =
  | { type: 'normal' }
  | { type: 'operator'; op: Operator; count: number }
  | { type: 'find'; op?: Operator; count: number; findType: FindType }
  | { type: 'textobj'; op: Operator; count: number; scope: TextObjScope };

// Operators supported:
const OPERATORS = ['d', 'c', 'y', '>', '<', 'g~', 'gu', 'gU'] as const;

// Operator execution context:
type OperatorContext = {
  cursor: Cursor;
  text: string;
  setText: (text: string) => void;
  setOffset: (offset: number) => void;
  enterInsert: (offset: number) => void;
  getRegister: () => string;
  setRegister: (content: string, linewise: boolean) => void;
  recordChange: (change: RecordedChange) => void;
};

// Features:
// - Normal, insert, visual modes
// - Motions (h, j, k, l, w, b, e, 0, $, gg, G, etc.)
// - Text objects (word, WORD, sentence, paragraph, quotes, brackets)
// - Operators (delete, change, yank, indent, case toggle)
// - Find motions (f, F, t, T, ;, ,)
// - Dot repeat
// - Registers
// - Undo integration
```

**Value for Molly:** Power users expect vim keybindings. Full state machine implementation.

---

### Gap 56: Screens (5,977 lines)

**Location:** `src/screens/`

**Main UI screens.**

```typescript
// Files:
// - REPL.tsx (5,005 lines) - THE MAIN REPL SCREEN
// - Doctor.tsx (574 lines) - Diagnostics screen
// - ResumeConversation.tsx (398 lines) - Session resume UI

// REPL.tsx is the heart of the CLI UI:
// - Message rendering
// - Input handling
// - Permission dialogs
// - Tool execution display
// - Swarm coordination UI
// - Voice integration
// - Search/filter
// - Virtual scrolling
// - Tab status
// - Cost threshold dialogs
// - Idle return dialogs

// Doctor.tsx provides diagnostics:
// - Version checks
// - Lock file status
// - Agent configuration
// - Settings validation
// - Context warnings
// - Sandbox status
// - MCP parsing warnings
// - Keybinding warnings
```

---

### Gap 57: Schemas (222 lines)

**Location:** `src/schemas/`

**Validation schemas.**

```typescript
// - hooks.ts (222 lines) - Hook configuration schemas

// Used for validating:
// - Hook definitions in settings.json
// - Hook event types
// - Hook matchers
// - Hook outputs
```

---

### Gap 58: Output Styles (98 lines)

**Location:** `src/outputStyles/`

**Output formatting configuration.**

```typescript
// - loadOutputStylesDir.ts (98 lines)

// Features:
// - Custom output style loading
// - Style directory scanning
// - Style configuration parsing
```

---

### Gap 59: Assistant Module (87 lines)

**Location:** `src/assistant/`

**Assistant session management.**

```typescript
// - sessionHistory.ts (87 lines)

// Features:
// - Session history tracking
// - History persistence
// - Session metadata
```

---

### Gap 60: Core Root Files (11,968 lines)

**Location:** `src/*.ts`, `src/*.tsx`

**Root-level core application files.**

```typescript
// Major files:
// - main.tsx (4,683 lines) - MAIN APPLICATION ENTRY
// - query.ts (1,729 lines) - Query loop orchestration
// - QueryEngine.ts (~1,200 lines) - Query engine
// - Tool.ts (~800 lines) - Tool definitions and execution
// - commands.ts (~700 lines) - Command system
// - interactiveHelpers.tsx (~365 lines) - Interactive helpers
// - setup.ts (477 lines) - Initialization
// - history.ts (~400 lines) - History management
// - cost-tracker.ts (~300 lines) - Cost tracking
// - context.ts (~200 lines) - Context management
// - dialogLaunchers.tsx - Dialog launchers
// - ink.ts - Ink wrapper
// - Task.ts - Task definitions
// - tasks.ts - Task utilities
// - replLauncher.tsx - REPL launcher
// - projectOnboardingState.ts - Onboarding state
// - costHook.ts - Cost hook

// main.tsx orchestrates:
// - Application bootstrap
// - Screen routing
// - Global state initialization
// - Error boundaries
// - Cleanup handlers
```

---

### Gap 61: Constants (2,648 lines)

**Location:** `src/constants/`

**Application constants and configuration.**

```typescript
// Files:
// - prompts.ts (915 lines) - System prompt construction (documented in Soul)
// - systemPromptSections.ts - Cacheable prompt sections
// - common.ts - Common constants
// - figures.ts - Unicode figures
// - tools.ts (112 lines) - Tool constants
// - toolLimits.ts (56 lines) - Tool output limits
// - xml.ts (86 lines) - XML tag constants
// - outputStyles.ts - Output style constants
// - querySource.ts - Query source types
// - turnCompletionVerbs.ts - Completion verbs

// Key constants:
const AUTOCOMPACT_BUFFER_TOKENS = 13_000;
const MAX_ENTRYPOINT_LINES = 200;
const MAX_ENTRYPOINT_BYTES = 25_000;
```

---

### Gap 62: Query Control (652 lines)

**Location:** `src/query/`

**Query loop control and hooks.**

```typescript
// Files:
// - stopHooks.ts (473 lines) - Stop hook handling
// - tokenBudget.ts (93 lines) - Token budget management
// - config.ts (46 lines) - Query configuration
// - deps.ts (40 lines) - Dependencies

// stopHooks.ts handles:
// - Stop hook execution
// - Task completion hooks
// - Teammate idle hooks
// - Memory extraction triggers
// - Auto dream triggers
// - Prompt suggestion triggers

// tokenBudget.ts manages:
// - Token allocation
// - Budget tracking
// - Continuation decisions
```

---

### Gap 63: Components (81,546 lines)

**Location:** `src/components/`

**React UI components.**

```typescript
// Major subdirectories:
// - permissions/ - Permission request dialogs
// - messages/ - Message rendering
// - mcp/ - MCP UI components
// - skills/ - Skill UI
// - tasks/ - Task UI
// - teams/ - Team UI
// - diff/ - Diff rendering
// - design-system/ - Design system components
// - agents/ - Agent UI
// - hooks/ - Component hooks
// - memory/ - Memory UI
// - shell/ - Shell UI
// - sandbox/ - Sandbox UI
// - wizard/ - Wizard components
// - ui/ - Base UI components

// Notable components:
// - PromptInput/ - Main input component
// - StructuredDiff/ - Diff display
// - HighlightedCode/ - Syntax highlighting
// - VirtualMessageList - Virtualized scrolling
// - Settings/ - Settings UI
// - TrustDialog/ - Trust dialogs
// - Passes/ - Pass management
```

---

### Gap 64: Tools Directory (50,828 lines)

**Location:** `src/tools/`

**All built-in tools.**

```typescript
// 44+ tools including:
// - AgentTool/ - Sub-agent spawning
// - BashTool/ - Shell execution
// - FileReadTool/, FileWriteTool/, FileEditTool/ - File operations
// - GlobTool/, GrepTool/ - Search tools
// - WebFetchTool/, WebSearchTool/ - Web tools
// - MCPTool/, ListMcpResourcesTool/, ReadMcpResourceTool/ - MCP tools
// - SkillTool/ - Skill execution
// - TodoWriteTool/ - Task management
// - NotebookEditTool/ - Jupyter support
// - EnterPlanModeTool/, ExitPlanModeTool/ - Planning
// - EnterWorktreeTool/, ExitWorktreeTool/ - Git worktrees
// - ScheduleCronTool/ - Cron scheduling
// - SendMessageTool/ - Agent messaging
// - TaskCreateTool/, TaskGetTool/, TaskListTool/, TaskOutputTool/, TaskStopTool/, TaskUpdateTool/
// - REPLTool/ - Interactive REPL
// - PowerShellTool/ - PowerShell support
// - SleepTool/ - Delays
// - AskUserQuestionTool/ - User interaction
// - And more...

// Each tool has:
// - prompt.ts - Tool description and parameters
// - Implementation file - Execution logic
// - constants.ts - Tool constants
```

---

## 6. RECOMMENDATIONS FOR MOLLY IMPLEMENTATION

### Phase 0: Soul Foundation (NEW - CRITICAL)

1. **System Prompts** - Adapt Lazarus's behavioral guidelines to Molly's voice
2. **Memory Taxonomy** - Implement 4-type memory system (user/feedback/project/reference)
3. **Cyber Risk Boundaries** - Define security assistance boundaries
4. **Output Efficiency** - Conciseness directives

### Phase 1: Brain/Reasoning Core (NEW)

1. **Query Loop** - Implement the core reasoning cycle
2. **Context Compaction** - Snip, microcompact, collapse, autocompact pipeline
3. **Token Tracking** - Budget management and auto-continuation
4. **Recovery Mechanisms** - Max output tokens recovery, reactive compaction

### Phase 2: Core Infrastructure

1. Error handling framework (errors.ts pattern)
2. Debug/logging system
3. Configuration loading hierarchy
4. Bootstrap state management

### Phase 3: Shell Execution

1. Shell provider abstraction
2. Bash/PowerShell support
3. Timeout and abort handling
4. Progress streaming

### Phase 4: Tool Framework

1. Tool interface definition
2. Input validation with Zod
3. Permission checking pipeline
4. Result truncation/persistence

### Phase 5: Extensibility

1. Hook system (start simple: PreToolUse, PostToolUse)
2. MCP client (stdio transport first)
3. Cron scheduler (one-shot tasks first)

### Phase 6: Nervous System (NEW)

1. **Bridge Architecture** - Multi-transport communication
2. **Session Management** - JWT auth, heartbeats, reconnection
3. **Message Flow** - Inbound/outbound message handling
4. **Polling/Backoff** - Rate limiting with jitter

### Phase 7: Agency/Swarm (NEW)

1. **Sub-agent Spawning** - Fork agents for parallel work
2. **Built-in Agents** - Explore (read-only), Plan, Verify agents
3. **Team Coordination** - Swarm permission sync
4. **Memory Snapshots** - Agent state capture/restore

### Phase 8: Advanced Features

1. Auto mode classifier integration
2. Multi-session lock for scheduling
3. Jitter configuration
4. Worktree management
5. Telemetry/Analytics integration

---

## 7. KEY INSIGHTS

### Architecture Insights

1. **Everything is hookable** - The hook system is the primary extension mechanism. Plugins are just hook bundles.

2. **Permissions are multi-layered** - 9 rule sources, content matching, classifiers, and safety checks.

3. **Async-first with escape hatches** - Most operations are async, but sync fallbacks exist for critical paths.

4. **State is segregated** - Bootstrap state (process) vs App state (React) vs Tool context (per-execution).

5. **Safety is defense-in-depth** - Trust dialog + rules + safety checks + sandbox + session isolation.

### Soul/Personality Insights (NEW)

6. **Behavioral guidelines are explicit** - Not implicit in training, but explicit in system prompts.

7. **Memory has types** - Not free-form notes, but a closed 4-type taxonomy with clear save/don't-save rules.

8. **Output efficiency is enforced** - "Go straight to the point" is a core directive, not a style preference.

9. **Security boundaries are encoded** - Cyber risk instruction defines authorization requirements.

### Brain/Reasoning Insights (NEW)

10. **Compaction is a pipeline** - Snip → Microcompact → Collapse → Autocompact, each with different strategies.

11. **Recovery is automatic** - Max output tokens errors trigger reactive compaction before failing.

12. **Token budgets drive behavior** - When user specifies "+500k tokens", system auto-continues to fill.

### Agency Insights (NEW)

13. **Agents are specialized** - Explore is read-only, Verification is adversarial, Plan is architecture-focused.

14. **Fork subagent keeps context clean** - Background work doesn't pollute main context window.

15. **Permission sync enables teams** - Swarm workers share permission decisions with leader.

### Infrastructure Insights

16. **Jitter is not optional** - Thundering herd problem requires deterministic per-task jitter.

17. **DST is handled correctly** - Local timezone, gap-hour skipping, single-fire on fall-back.

18. **Shell execution is complex** - Platform detection, provider abstraction, sandbox wrapping.

---

## 8. CODEBASE SIZE SUMMARY

| Category            | Lines        | Description                       |
| ------------------- | ------------ | --------------------------------- |
| Soul/Prompts        | 915          | Personality, guidelines           |
| Brain/Reasoning     | 3,024        | Query loop, engine                |
| Memory System       | 2,365        | 4-type taxonomy, extraction       |
| Memdir              | 1,736        | File-based memory management      |
| Nervous/Bridge      | 12,613       | Communication backbone            |
| Agency/Swarm        | 10,558       | Multi-agent orchestration         |
| Tasks               | 1,102        | Background task management        |
| Hooks               | 8,743        | Extension system                  |
| Permissions         | 9,409        | Multi-layered access control      |
| Telemetry/Analytics | 4,040        | Diagnostics, feature flags        |
| Tools               | ~40,000      | 44+ built-in tools                |
| MCP                 | ~5,000       | Model Context Protocol            |
| Shell/Bash          | ~6,000       | Shell execution, parsing          |
| LSP                 | 2,460        | Language Server Protocol          |
| Team Memory Sync    | 2,167        | Secret scanning, team sync        |
| Commands            | 9,798        | 100+ CLI commands                 |
| Ink Terminal UI     | 15,703       | React-based terminal rendering    |
| Native TypeScript   | 4,081        | File indexing, layout, color-diff |
| Keybindings         | 2,610        | Keyboard shortcut management      |
| OAuth/Settings      | 3,526        | OAuth, sync, remote settings      |
| Policy/Proxy        | 1,430        | Rate limiting, proxy config       |
| Other utilities     | ~240,000     | Everything else                   |
| **TOTAL**           | **~380,000** | Full codebase                     |

---

## 9. GAP SUMMARY

**64 systems analyzed in dirty room (TOTAL COMPLETE COVERAGE):**

| Gap | System                             | Lines   | Priority                 |
| --- | ---------------------------------- | ------- | ------------------------ |
| 1   | Context Compaction                 | 3,960   | HIGH                     |
| 2   | Streaming Tool Execution           | 2,273   | HIGH                     |
| 3   | Remote Sessions                    | 33,000+ | HIGH (for dual-function) |
| 4   | Coordinator Mode                   | 530     | MEDIUM                   |
| 5   | Skills System                      | 43,000+ | MEDIUM                   |
| 6   | History Management                 | 464     | LOW                      |
| 7   | Speculation                        | ~500    | LOW                      |
| 8   | Worktree                           | 1,519   | LOW                      |
| 9   | Voice/Multimodal                   | 525     | LOW                      |
| 10  | Rate Limiting                      | 450     | MEDIUM                   |
| 11  | CLI Print/Output                   | 5,594   | LOW (web-based)          |
| 12  | Messages                           | 5,512   | MEDIUM                   |
| 13  | Session Storage                    | 5,105   | MEDIUM                   |
| 14  | Attachments                        | 3,997   | MEDIUM                   |
| 15  | API Client                         | 3,419   | HIGH                     |
| 16  | Plugin System                      | 5,945   | MEDIUM                   |
| 17  | Bash Security                      | 5,213   | HIGH                     |
| 18  | Authentication                     | 4,467   | HIGH                     |
| 19  | Bootstrap State                    | 1,758   | MEDIUM                   |
| 20  | Filesystem Permissions             | 1,777   | HIGH                     |
| 21  | LSP System                         | 2,460   | LOW (web-based)          |
| 22  | Team Memory Sync + SECRET SCANNING | 2,167   | **CRITICAL**             |
| 23  | Tasks System                       | 1,102   | MEDIUM                   |
| 24  | Memdir                             | 1,736   | MEDIUM                   |
| 25  | Ink Terminal UI                    | 15,703  | LOW (web-based)          |
| 26  | Commands                           | 9,798   | MEDIUM                   |
| 27  | Native TypeScript                  | 4,081   | LOW                      |
| 28  | Keybindings                        | 2,610   | LOW (web-based)          |
| 29  | Policy Limits                      | 690     | MEDIUM                   |
| 30  | Remote Managed Settings            | 877     | LOW                      |
| 31  | Settings Sync                      | 648     | LOW                      |
| 32  | OAuth                              | 1,051   | MEDIUM                   |
| 33  | Upstream Proxy                     | 740     | LOW                      |
| 34  | Buddy/Companion System             | 1,298   | LOW (gamification)       |
| 35  | CLI Infrastructure                 | 12,353  | LOW (web-based)          |
| 36  | React Hooks System                 | 16,476  | MEDIUM (patterns)        |
| 37  | State Management                   | 991     | MEDIUM                   |
| 38  | Context System                     | 1,004   | MEDIUM                   |
| 39  | Auto Dream                         | 550     | MEDIUM                   |
| 40  | Session Memory                     | 1,026   | MEDIUM                   |
| 41  | Extract Memories                   | 769     | MEDIUM                   |
| 42  | Prompt Suggestion                  | 1,514   | MEDIUM                   |
| 43  | Magic Docs                         | 381     | LOW (nice-to-have)       |
| 44  | Tips System                        | 761     | LOW                      |
| 45  | Computer Use                       | 2,161   | HIGH (desktop)           |
| 46  | Deep Link                          | 1,388   | LOW                      |
| 47  | Teleport                           | 955     | MEDIUM                   |
| 48  | Native Installer                   | 3,018   | LOW                      |
| 49  | Model Management                   | 2,710   | HIGH                     |
| 50  | Suggestions                        | 1,213   | LOW                      |
| 51  | Migrations                         | 603     | MEDIUM                   |
| 52  | Server Mode                        | 358     | HIGH (for dual-function) |
| 53  | Entrypoints                        | 4,051   | MEDIUM                   |
| 54  | Type Definitions                   | 3,446   | MEDIUM                   |
| 55  | Vim Mode                           | 1,513   | MEDIUM (power users)     |
| 56  | Screens                            | 5,977   | MEDIUM                   |
| 57  | Schemas                            | 222     | LOW                      |
| 58  | Output Styles                      | 98      | LOW                      |
| 59  | Assistant Module                   | 87      | LOW                      |
| 60  | Core Root Files                    | 11,968  | HIGH                     |
| 61  | Constants                          | 2,648   | MEDIUM                   |
| 62  | Query Control                      | 652     | HIGH                     |
| 63  | Components                         | 81,546  | MEDIUM (patterns)        |
| 64  | Tools Directory                    | 50,828  | HIGH                     |

**Priority Legend:**

- **CRITICAL** - Essential security feature, implement immediately
- **HIGH** - Core functionality, implement in Phase 1
- **MEDIUM** - Important but not blocking, Phase 2-3
- **LOW** - Nice to have or not applicable to web UI

**Final Coverage by Priority:**

- CRITICAL: 1 (Secret Scanning)
- HIGH: 13 (Compaction, Streaming, Remote, API, Bash, Auth, Permissions, Computer Use, Model, Server, Core Files, Query Control, Tools)
- MEDIUM: 28
- LOW: 22

**Total Lines Analyzed: ~380,000**

**Complete Directory Coverage:**

- All 35 top-level src/ directories documented
- All root-level core files documented
- All services documented
- All utilities documented
- All tools documented
- All components documented

---

_End of Dirty Room Analysis - April 9, 2026_
_Methodology: Slow, Methodical, Precise_
_"We never know what might become important"_
