# Lazarus Codebase: Dirty Room Analysis

**Analysis Date:** 2026-04-09  
**Source:** /workspaces/Molly-Core/stuff/Lazarus/Lazarus--main/src  
**Purpose:** Reverse engineering for clean room implementation into Molly

---

## Executive Summary

The Lazarus codebase (Claude Code CLI) is a production-grade TypeScript application with approximately 50,000+ lines of core code. It demonstrates sophisticated patterns for:

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

---

## 6. RECOMMENDATIONS FOR MOLLY IMPLEMENTATION

### Phase 1: Core Infrastructure

1. Error handling framework (errors.ts pattern)
2. Debug/logging system
3. Configuration loading hierarchy
4. Bootstrap state management

### Phase 2: Shell Execution

1. Shell provider abstraction
2. Bash/PowerShell support
3. Timeout and abort handling
4. Progress streaming

### Phase 3: Tool Framework

1. Tool interface definition
2. Input validation with Zod
3. Permission checking pipeline
4. Result truncation/persistence

### Phase 4: Extensibility

1. Hook system (start simple: PreToolUse, PostToolUse)
2. MCP client (stdio transport first)
3. Cron scheduler (one-shot tasks first)

### Phase 5: Advanced Features

1. Auto mode classifier integration
2. Multi-session lock for scheduling
3. Jitter configuration
4. Worktree management

---

## 7. KEY INSIGHTS

1. **Everything is hookable** - The hook system is the primary extension mechanism, not plugins. Plugins are just hook bundles.

2. **Permissions are multi-layered** - Not just allow/deny, but rule sources, content matching, classifiers, and safety checks.

3. **Async-first with escape hatches** - Most operations are async, but sync fallbacks exist for critical paths (shutdown, file watchers).

4. **State is segregated** - Bootstrap state (process-level singletons) vs App state (React context) vs Tool context (per-execution).

5. **Safety is defense-in-depth** - Trust dialog + permission rules + safety checks + sandbox + session isolation.

6. **Jitter is not optional** - The thundering herd problem at scale requires deterministic per-task jitter.

7. **DST is handled correctly** - Local timezone, gap-hour skipping, single-fire on fall-back.

8. **Shell execution is complex** - Platform detection, provider abstraction, sandbox wrapping, output interleaving.

---

_End of Analysis_
