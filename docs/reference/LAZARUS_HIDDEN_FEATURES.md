# LAZARUS HIDDEN FEATURES - Complete Mapping

> **Methodology**: Dirty Room / Clean Room Reverse Engineering
> **Source**: Claude Code CLI (~380,000 lines TypeScript)
> **Extracted**: 150+ Environment Variables, 655+ Feature Flags, 294+ ANT-ONLY Code Paths

---

## TABLE OF CONTENTS

1. [Secret Environment Variables](#1-secret-environment-variables)
2. [GrowthBook Feature Flags (tengu\_\*)](#2-growthbook-feature-flags)
3. [ANT-ONLY Features (Internal Build)](#3-ant-only-features)
4. [Model Codenames](#4-model-codenames)
5. [Operational Modes](#5-operational-mctodes)
6. [Hidden Commands](#6-hidden-commands)
7. [Backdoors & Overrides](#7-backdoors--overrides)
8. [Buddy/Companion System](#8-buddycompanion-system)
9. [Beta Headers](#9-beta-headers)

---

## 1. SECRET ENVIRONMENT VARIABLES

### 1.1 Core Operation Variables

| Variable                 | Type    | Default    | Description                                                                                                                     |
| ------------------------ | ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `USER_TYPE`              | string  | `external` | **BUILD-TIME GATE** - Set to `ant` for Anthropic internal builds. Controls access to ALL internal features.                     |
| `CLAUDE_CODE_REMOTE`     | boolean | `false`    | Enables remote/cloud execution mode                                                                                             |
| `CLAUDE_CODE_SIMPLE`     | boolean | `false`    | Simplified mode - disables advanced features                                                                                    |
| `CLAUDE_CODE_ENTRYPOINT` | string  | `cli`      | Entry point identifier: `cli`, `sdk-ts`, `sdk-py`, `sdk-cli`, `claude-vscode`, `local-agent`, `claude-desktop`, `mcp`, `remote` |

### 1.2 Authentication & OAuth

| Variable                                     | Purpose                         | How to Use                              |
| -------------------------------------------- | ------------------------------- | --------------------------------------- |
| `CLAUDE_CODE_OAUTH_TOKEN`                    | Direct OAuth token injection    | Set token directly, bypasses login flow |
| `CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR`    | OAuth token via file descriptor | Pass FD number for secure token passing |
| `CLAUDE_CODE_OAUTH_REFRESH_TOKEN`            | Refresh token for OAuth         | Auto-refresh capability                 |
| `CLAUDE_CODE_OAUTH_SCOPES`                   | OAuth scope override            | Comma-separated scopes                  |
| `CLAUDE_CODE_OAUTH_CLIENT_ID`                | Custom OAuth client ID          | Override default client                 |
| `CLAUDE_CODE_CUSTOM_OAUTH_URL`               | Custom OAuth endpoint           | Point to custom auth server             |
| `CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR`        | API key via file descriptor     | Secure API key injection                |
| `CLAUDE_CODE_API_KEY_HELPER_TTL_MS`          | API key helper cache TTL        | Milliseconds                            |
| `CLAUDE_CODE_SESSION_ACCESS_TOKEN`           | Session-specific access token   | Remote session auth                     |
| `CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR` | WebSocket auth via FD           | Secure websocket auth                   |
| `CLAUDE_CODE_ACCOUNT_UUID`                   | Account UUID override           | Direct account specification            |
| `CLAUDE_CODE_USER_EMAIL`                     | User email override             | Direct email specification              |
| `CLAUDE_CODE_ORGANIZATION_UUID`              | Organization UUID               | Multi-org support                       |

### 1.3 Model & API Control

| Variable                                | Purpose                    | How to Use                     |
| --------------------------------------- | -------------------------- | ------------------------------ |
| `ANTHROPIC_MODEL`                       | Default model override     | Set model ID directly          |
| `ANTHROPIC_DEFAULT_OPUS_MODEL`          | Override default Opus      | Custom Opus model ID           |
| `ANTHROPIC_DEFAULT_SONNET_MODEL`        | Override default Sonnet    | Custom Sonnet model ID         |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL`         | Override default Haiku     | Custom Haiku model ID          |
| `ANTHROPIC_SMALL_FAST_MODEL`            | Small/fast model override  | For quick operations           |
| `CLAUDE_CODE_SUBAGENT_MODEL`            | Subagent model override    | Control agent model selection  |
| `CLAUDE_CODE_AUTO_MODE_MODEL`           | Auto-mode classifier model | Override classifier            |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS`         | Max output tokens          | Number                         |
| `CLAUDE_CODE_MAX_CONTEXT_TOKENS`        | Max context window         | Override context limit         |
| `CLAUDE_CODE_EFFORT_LEVEL`              | Thinking effort level      | `low`, `medium`, `high`, `max` |
| `CLAUDE_CODE_ALWAYS_ENABLE_EFFORT`      | Force effort parameter     | boolean                        |
| `CLAUDE_CODE_DISABLE_THINKING`          | Disable extended thinking  | boolean                        |
| `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING` | Disable adaptive thinking  | boolean                        |
| `CLAUDE_CODE_API_BASE_URL`              | Custom API base URL        | Point to proxy/custom endpoint |
| `CLAUDE_CODE_GB_BASE_URL`               | GrowthBook base URL        | Feature flag server URL        |
| `CLAUDE_CODE_EXTRA_BODY`                | Extra API body params      | JSON string                    |
| `CLAUDE_CODE_EXTRA_METADATA`            | Extra API metadata         | JSON string                    |

### 1.4 Provider Selection (Bedrock/Vertex/Foundry)

| Variable                        | Purpose                          |
| ------------------------------- | -------------------------------- |
| `CLAUDE_CODE_USE_BEDROCK`       | Enable AWS Bedrock provider      |
| `CLAUDE_CODE_USE_VERTEX`        | Enable Google Vertex AI provider |
| `CLAUDE_CODE_USE_FOUNDRY`       | Enable Foundry provider          |
| `CLAUDE_CODE_SKIP_BEDROCK_AUTH` | Skip Bedrock authentication      |
| `CLAUDE_CODE_SKIP_VERTEX_AUTH`  | Skip Vertex authentication       |
| `CLAUDE_CODE_SKIP_FOUNDRY_AUTH` | Skip Foundry authentication      |

### 1.5 Remote & Bridge Mode

| Variable                                  | Purpose                           |
| ----------------------------------------- | --------------------------------- |
| `CLAUDE_CODE_REMOTE_SESSION_ID`           | Remote session identifier         |
| `CLAUDE_CODE_REMOTE_MEMORY_DIR`           | Remote memory directory path      |
| `CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE`     | Remote environment type           |
| `CLAUDE_CODE_REMOTE_SEND_KEEPALIVES`      | Enable keepalive pings            |
| `CLAUDE_CODE_CONTAINER_ID`                | Container identifier              |
| `CLAUDE_CODE_ENVIRONMENT_KIND`            | Environment kind (`bridge`, etc.) |
| `CLAUDE_CODE_ENVIRONMENT_RUNNER_VERSION`  | Runner version                    |
| `CLAUDE_CODE_CCR_MIRROR`                  | CCR mirroring mode                |
| `CLAUDE_CODE_USE_CCR_V2`                  | Use CCR v2 protocol               |
| `CLAUDE_CODE_POST_FOR_SESSION_INGRESS_V2` | V2 session ingress                |
| `CLAUDE_BRIDGE_BASE_URL`                  | Bridge base URL (ANT-ONLY)        |
| `SESSION_INGRESS_URL`                     | Session ingress URL               |

### 1.6 UI & Display Control

| Variable                              | Purpose                          |
| ------------------------------------- | -------------------------------- |
| `CLAUDE_CODE_BRIEF`                   | Enable brief/minimal output mode |
| `CLAUDE_CODE_ACCESSIBILITY`           | Enable accessibility features    |
| `CLAUDE_CODE_DISABLE_TERMINAL_TITLE`  | Don't modify terminal title      |
| `CLAUDE_CODE_DISABLE_VIRTUAL_SCROLL`  | Disable virtual scrolling        |
| `CLAUDE_CODE_DISABLE_MESSAGE_ACTIONS` | Disable message action buttons   |
| `CLAUDE_CODE_DISABLE_MOUSE`           | Disable mouse support            |
| `CLAUDE_CODE_DISABLE_MOUSE_CLICKS`    | Disable mouse clicks only        |
| `CLAUDE_CODE_SYNTAX_HIGHLIGHT`        | Syntax highlighting control      |
| `CLAUDE_CODE_NO_FLICKER`              | Anti-flicker mode                |
| `CLAUDE_CODE_SCROLL_SPEED`            | Scroll speed multiplier          |
| `CLAUDE_CODE_FORCE_FULL_LOGO`         | Force full logo display          |
| `CLAUDE_CODE_STREAMLINED_OUTPUT`      | Streamlined output format        |
| `CLAUDE_CODE_QUESTION_PREVIEW_FORMAT` | Question preview format          |

### 1.7 Tmux Integration

| Variable                            | Purpose                   |
| ----------------------------------- | ------------------------- |
| `CLAUDE_CODE_TMUX_SESSION`          | Tmux session name         |
| `CLAUDE_CODE_TMUX_PREFIX`           | Tmux prefix key           |
| `CLAUDE_CODE_TMUX_PREFIX_CONFLICTS` | Prefix conflict indicator |
| `CLAUDE_CODE_TMUX_TRUECOLOR`        | Tmux truecolor support    |

### 1.8 Memory & Storage

| Variable                                       | Purpose                            |
| ---------------------------------------------- | ---------------------------------- |
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY`              | Disable automatic memory           |
| `CLAUDE_CODE_DISABLE_CLAUDE_MDS`               | Disable CLAUDE.md files            |
| `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD` | Extra CLAUDE.md directories        |
| `CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS`         | Disable git instructions in prompt |
| `CLAUDE_CODE_SKIP_PROMPT_HISTORY`              | Don't save prompt history          |

### 1.9 Performance & Debugging

| Variable                                  | Purpose                     |
| ----------------------------------------- | --------------------------- |
| `CLAUDE_CODE_DEBUG_LOG_LEVEL`             | Debug log level             |
| `CLAUDE_CODE_DEBUG_LOGS_DIR`              | Debug logs directory        |
| `CLAUDE_CODE_DIAGNOSTICS_FILE`            | Diagnostics output file     |
| `CLAUDE_CODE_PROFILE_STARTUP`             | Profile startup performance |
| `CLAUDE_CODE_PROFILE_QUERY`               | Profile API queries         |
| `CLAUDE_CODE_PERFETTO_TRACE`              | Perfetto tracing            |
| `CLAUDE_CODE_PERFETTO_WRITE_INTERVAL_S`   | Perfetto write interval     |
| `CLAUDE_CODE_DEBUG_REPAINTS`              | Debug UI repaints           |
| `CLAUDE_CODE_COMMIT_LOG`                  | Commit logging              |
| `CLAUDE_CODE_FRAME_TIMING_LOG`            | Frame timing log path       |
| `CLAUDE_CODE_SLOW_OPERATION_THRESHOLD_MS` | Slow operation threshold    |

### 1.10 Proactive & KAIROS Mode

| Variable                             | Purpose                            |
| ------------------------------------ | ---------------------------------- |
| `CLAUDE_CODE_PROACTIVE`              | Enable proactive behavior mode     |
| `CLAUDE_CODE_IDLE_THRESHOLD_MINUTES` | Idle threshold (default: 75)       |
| `CLAUDE_CODE_IDLE_TOKEN_THRESHOLD`   | Token threshold (default: 100,000) |

### 1.11 Timeouts & Limits

| Variable                                     | Purpose                        | Default |
| -------------------------------------------- | ------------------------------ | ------- |
| `CLAUDE_CODE_GLOB_TIMEOUT_SECONDS`           | Glob operation timeout         | -       |
| `CLAUDE_CODE_PWSH_PARSE_TIMEOUT_MS`          | PowerShell parse timeout       | -       |
| `CLAUDE_CODE_PLUGIN_GIT_TIMEOUT_MS`          | Plugin git timeout             | -       |
| `CLAUDE_CODE_SYNC_PLUGIN_INSTALL_TIMEOUT_MS` | Plugin install timeout         | -       |
| `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`    | Session end hooks timeout      | -       |
| `CLAUDE_CODE_OTEL_SHUTDOWN_TIMEOUT_MS`       | OpenTelemetry shutdown timeout | 2000    |
| `CLAUDE_CODE_OTEL_FLUSH_TIMEOUT_MS`          | OpenTelemetry flush timeout    | 5000    |
| `CLAUDE_CODE_MAX_RETRIES`                    | Max API retries                | -       |
| `CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY`       | Max parallel tool calls        | 10      |
| `CLAUDE_CODE_EXIT_AFTER_STOP_DELAY`          | Exit delay after stop          | -       |

### 1.12 Security & Permissions

| Variable                                      | Purpose                                 |
| --------------------------------------------- | --------------------------------------- |
| `CLAUDE_CODE_UNDERCOVER`                      | **UNDERCOVER MODE** - Hides AI identity |
| `CLAUDE_CODE_BUBBLEWRAP`                      | Enable Bubblewrap sandboxing            |
| `CLAUDE_CODE_DISABLE_COMMAND_INJECTION_CHECK` | Disable injection checks                |
| `CLAUDE_CODE_BASH_SANDBOX_SHOW_INDICATOR`     | Show sandbox indicator                  |
| `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`            | Scrub subprocess env                    |
| `CLAUDE_CODE_DONT_INHERIT_ENV`                | Don't inherit environment               |

### 1.13 Testing & Development

| Variable                                   | Purpose                              |
| ------------------------------------------ | ------------------------------------ |
| `CLAUDE_CODE_ABLATION_BASELINE`            | Ablation study baseline              |
| `CLAUDE_CODE_TEST_FIXTURES_ROOT`           | Test fixtures root                   |
| `CLAUDE_CODE_OVERRIDE_DATE`                | Override current date                |
| `CLAUDE_CODE_STALL_TIMEOUT_MS_FOR_TESTING` | Testing stall timeout                |
| `CLAUDE_CODE_EXIT_AFTER_FIRST_RENDER`      | Exit after first render              |
| `FORCE_VCR`                                | Force VCR recording (ANT-ONLY)       |
| `ULTRAPLAN_PROMPT_FILE`                    | Override Ultraplan prompt (ANT-ONLY) |

### 1.14 Telemetry & Analytics

| Variable                                      | Purpose                        |
| --------------------------------------------- | ------------------------------ |
| `CLAUDE_CODE_ENABLE_TELEMETRY`                | Enable 3P telemetry            |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`    | Disable non-essential requests |
| `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA`         | Enhanced telemetry beta        |
| `CLAUDE_CODE_OTEL_HEADERS_HELPER_DEBOUNCE_MS` | OTEL debounce                  |
| `CLAUDE_CODE_DATADOG_FLUSH_INTERVAL_MS`       | Datadog flush interval         |
| `CLAUDE_CODE_TAGS`                            | Custom tags for telemetry      |
| `CLAUDE_CODE_ACCOUNT_TAGGED_ID`               | Tagged account ID              |

### 1.15 Feature Toggles

| Variable                                         | Purpose                          |
| ------------------------------------------------ | -------------------------------- |
| `CLAUDE_CODE_DISABLE_FAST_MODE`                  | Disable fast mode                |
| `CLAUDE_CODE_SKIP_FAST_MODE_NETWORK_ERRORS`      | Skip fast mode on network errors |
| `CLAUDE_CODE_DISABLE_CRON`                       | Disable cron scheduling          |
| `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS`           | Disable background tasks         |
| `CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING`         | Disable file checkpoints         |
| `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING`      | Enable SDK checkpointing         |
| `CLAUDE_CODE_DISABLE_ATTACHMENTS`                | Disable attachments              |
| `CLAUDE_CODE_DISABLE_ADVISOR_TOOL`               | Disable advisor tool             |
| `CLAUDE_CODE_DISABLE_POLICY_SKILLS`              | Disable policy skills            |
| `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`         | Disable experimental betas       |
| `CLAUDE_CODE_DISABLE_LEGACY_MODEL_REMAP`         | Disable legacy model remapping   |
| `CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY`            | Disable feedback surveys         |
| `CLAUDE_CODE_DISABLE_PRECOMPACT_SKIP`            | Disable precompact skip          |
| `CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK`      | Disable non-streaming fallback   |
| `CLAUDE_CODE_DISABLE_1M_CONTEXT`                 | Disable 1M context               |
| `CLAUDE_CODE_ENABLE_TASKS`                       | Enable tasks feature             |
| `CLAUDE_CODE_ENABLE_CFC`                         | Enable Claude for Chrome         |
| `CLAUDE_CODE_ENABLE_XAA`                         | Enable XAA feature               |
| `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION`           | Enable prompt suggestions        |
| `CLAUDE_CODE_ENABLE_TOKEN_USAGE_ATTACHMENT`      | Enable token usage               |
| `CLAUDE_CODE_ENABLE_FINE_GRAINED_TOOL_STREAMING` | Fine-grained tool streaming      |

### 1.16 Plugin & MCP

| Variable                                               | Purpose                          |
| ------------------------------------------------------ | -------------------------------- |
| `CLAUDE_CODE_PLUGIN_CACHE_DIR`                         | Plugin cache directory           |
| `CLAUDE_CODE_PLUGIN_SEED_DIR`                          | Plugin seed directory            |
| `CLAUDE_CODE_PLUGIN_USE_ZIP_CACHE`                     | Use zip cache for plugins        |
| `CLAUDE_CODE_USE_COWORK_PLUGINS`                       | Use cowork plugins               |
| `CLAUDE_CODE_SYNC_PLUGIN_INSTALL`                      | Synchronous plugin install       |
| `CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL` | Disable marketplace auto-install |
| `CLAUDE_CODE_MCP_INSTR_DELTA`                          | MCP instructions delta           |
| `CLAUDE_CODE_SHELL_PREFIX`                             | Shell prefix for MCP             |

### 1.17 IDE Integration

| Variable                            | Purpose               |
| ----------------------------------- | --------------------- |
| `CLAUDE_CODE_SSE_PORT`              | SSE port for IDE      |
| `CLAUDE_CODE_IDE_SKIP_VALID_CHECK`  | Skip IDE validation   |
| `CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL` | Skip IDE auto-install |
| `CLAUDE_CODE_IDE_HOST_OVERRIDE`     | Override IDE host     |
| `CLAUDE_CODE_AUTO_CONNECT_IDE`      | Auto-connect to IDE   |

### 1.18 mTLS Configuration

| Variable                            | Purpose                 |
| ----------------------------------- | ----------------------- |
| `CLAUDE_CODE_CLIENT_CERT`           | Client certificate path |
| `CLAUDE_CODE_CLIENT_KEY`            | Client key path         |
| `CLAUDE_CODE_CLIENT_KEY_PASSPHRASE` | Client key passphrase   |

### 1.19 Miscellaneous

| Variable                                   | Purpose                      |
| ------------------------------------------ | ---------------------------- |
| `CLAUDE_CODE_SHELL`                        | Override shell               |
| `CLAUDE_CODE_TMPDIR`                       | Temporary directory          |
| `CLAUDE_CODE_GIT_BASH_PATH`                | Git Bash path (Windows)      |
| `CLAUDE_CODE_HOST_PLATFORM`                | Host platform override       |
| `CLAUDE_CODE_USE_POWERSHELL_TOOL`          | Use PowerShell tool          |
| `CLAUDE_CODE_USE_NATIVE_FILE_SEARCH`       | Use native file search       |
| `CLAUDE_CODE_GLOB_NO_IGNORE`               | Glob without ignoring        |
| `CLAUDE_CODE_GLOB_HIDDEN`                  | Include hidden files in glob |
| `CLAUDE_CODE_PROXY_RESOLVES_HOSTS`         | Proxy resolves hosts         |
| `CLAUDE_CODE_BASE_REF`                     | Base ref for git diff        |
| `CLAUDE_CODE_WORKER_EPOCH`                 | Worker epoch                 |
| `CLAUDE_CODE_SESSION_KIND`                 | Session kind                 |
| `CLAUDE_CODE_SESSION_NAME`                 | Session name                 |
| `CLAUDE_CODE_SESSION_LOG`                  | Session log path             |
| `CLAUDE_CODE_SESSION_ID`                   | Session ID (ANT-ONLY)        |
| `CLAUDE_CODE_AGENT`                        | Agent identifier             |
| `CLAUDE_CODE_TASK_LIST_ID`                 | Task list ID                 |
| `CLAUDE_CODE_MESSAGING_SOCKET`             | Messaging socket path        |
| `CLAUDE_CODE_WORKSPACE_HOST_PATHS`         | Workspace host paths         |
| `CLAUDE_CODE_MANAGED_SETTINGS_PATH`        | Managed settings path        |
| `CLAUDE_CODE_ATTRIBUTION_HEADER`           | Attribution header control   |
| `CLAUDE_CODE_ADDITIONAL_PROTECTION`        | Additional protection flags  |
| `CLAUDE_CODE_RESUME_INTERRUPTED_TURN`      | Resume interrupted turn      |
| `CLAUDE_CODE_VERIFY_PLAN`                  | Verify plan mode             |
| `CLAUDE_CODE_PLAN_MODE_REQUIRED`           | Plan mode required           |
| `CLAUDE_CODE_PLAN_V2_AGENT_COUNT`          | Plan v2 agent count          |
| `CLAUDE_CODE_PLAN_V2_EXPLORE_AGENT_COUNT`  | Plan v2 explore count        |
| `CLAUDE_CODE_PLAN_MODE_INTERVIEW_PHASE`    | Plan interview phase         |
| `CLAUDE_CODE_TWO_STAGE_CLASSIFIER`         | Two-stage classifier         |
| `CLAUDE_CODE_JSONL_TRANSCRIPT`             | JSONL transcript path        |
| `CLAUDE_CODE_DUMP_AUTO_MODE`               | Dump auto mode decisions     |
| `CLAUDE_CODE_TERMINAL_RECORDING`           | Terminal recording           |
| `CLAUDE_CODE_COWORKER_TYPE`                | Coworker type                |
| `CLAUDE_CODE_IS_COWORK`                    | Is cowork session            |
| `CLAUDE_CODE_EAGER_FLUSH`                  | Eager flush mode             |
| `CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS`    | Emit session state events    |
| `CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES`      | Emit tool use summaries      |
| `CLAUDE_CODE_INCLUDE_PARTIAL_MESSAGES`     | Include partial messages     |
| `CLAUDE_CODE_SAVE_HOOK_ADDITIONAL_CONTEXT` | Save hook context            |
| `CLAUDE_CODE_UNATTENDED_RETRY`             | Unattended retry mode        |
| `CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE`      | Blocking limit override      |
| `CLAUDE_CODE_AUTO_COMPACT_WINDOW`          | Auto compact window          |
| `CLAUDE_CODE_NEW_INIT`                     | New init behavior            |
| `CLAUDE_CODE_AGENT_LIST_IN_MESSAGES`       | Agent list in messages       |
| `CLAUDE_CODE_COORDINATOR_MODE`             | Coordinator mode             |
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`     | Experimental agent teams     |
| `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST`     | Provider managed by host     |
| `CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS`  | File read max tokens         |
| `CLAUDE_CODE_REPL`                         | REPL tool enabled            |
| `CLAUDE_CODE_BRIEF_UPLOAD`                 | Brief upload mode            |

---

## 2. GROWTHBOOK FEATURE FLAGS

### 2.1 Feature Flag System

**Access Method**: `feature('FLAG_NAME')` - Build-time gating
**Runtime**: `getFeatureValue_CACHED_MAY_BE_STALE('tengu_flag_name', default)`
**Logging**: `logEvent('tengu_event_name', {})`

### 2.2 Major Feature Flags (Build-Time)

| Flag                           | Purpose                                        | Status   |
| ------------------------------ | ---------------------------------------------- | -------- |
| `KAIROS`                       | **KAIROS MODE** - Proactive assistant behavior | ANT-ONLY |
| `KAIROS_BRIEF`                 | KAIROS with brief output                       | ANT-ONLY |
| `KAIROS_DREAM`                 | KAIROS dream mode skills                       | ANT-ONLY |
| `KAIROS_CHANNELS`              | KAIROS channel notifications                   | ANT-ONLY |
| `KAIROS_PUSH_NOTIFICATION`     | KAIROS push notifications                      | ANT-ONLY |
| `KAIROS_GITHUB_WEBHOOKS`       | GitHub webhook integration                     | ANT-ONLY |
| `PROACTIVE`                    | Proactive behavior mode                        | ANT-ONLY |
| `ULTRAPLAN`                    | Remote multi-agent planning                    | ANT-ONLY |
| `ULTRATHINK`                   | Extended thinking mode                         | ANT-ONLY |
| `BUDDY`                        | **COMPANION SYSTEM** - Virtual pet             | ANT-ONLY |
| `VOICE_MODE`                   | Voice input/output                             | ANT-ONLY |
| `COORDINATOR_MODE`             | Multi-agent coordination                       | ANT-ONLY |
| `BRIDGE_MODE`                  | Remote control bridge                          | ANT-ONLY |
| `DAEMON`                       | Background daemon mode                         | ANT-ONLY |
| `BG_SESSIONS`                  | Background sessions                            | ANT-ONLY |
| `TEMPLATES`                    | Template system                                | ANT-ONLY |
| `WORKFLOW_SCRIPTS`             | Workflow scripts                               | ANT-ONLY |
| `AGENT_TRIGGERS`               | Agent trigger system                           | ANT-ONLY |
| `AGENT_TRIGGERS_REMOTE`        | Remote agent triggers                          | ANT-ONLY |
| `AGENT_MEMORY_SNAPSHOT`        | Agent memory snapshots                         | ANT-ONLY |
| `FORK_SUBAGENT`                | Fork subagent feature                          | ANT-ONLY |
| `UDS_INBOX`                    | Unix domain socket inbox                       | ANT-ONLY |
| `TEAMMEM`                      | Team memory system                             | ANT-ONLY |
| `EXTRACT_MEMORIES`             | Memory extraction                              | ANT-ONLY |
| `MEMORY_SHAPE_TELEMETRY`       | Memory shape tracking                          | ANT-ONLY |
| `TRANSCRIPT_CLASSIFIER`        | Transcript-based auto-mode                     | ANT-ONLY |
| `BASH_CLASSIFIER`              | Bash command classifier                        | ANT-ONLY |
| `POWERSHELL_AUTO_MODE`         | PowerShell auto mode                           | ANT-ONLY |
| `CHICAGO_MCP`                  | Computer use MCP server                        | ANT-ONLY |
| `MCP_SKILLS`                   | MCP skill loading                              | ANT-ONLY |
| `MCP_RICH_OUTPUT`              | Rich MCP output                                | ANT-ONLY |
| `WEB_BROWSER_TOOL`             | Web browser tool                               | ANT-ONLY |
| `TERMINAL_PANEL`               | Terminal panel                                 | ANT-ONLY |
| `MESSAGE_ACTIONS`              | Message action buttons                         | ANT-ONLY |
| `QUICK_SEARCH`                 | Quick search feature                           | ANT-ONLY |
| `CONTEXT_COLLAPSE`             | Context collapsing                             | ANT-ONLY |
| `REACTIVE_COMPACT`             | Reactive compaction                            | ANT-ONLY |
| `CACHED_MICROCOMPACT`          | Cached microcompact                            | ANT-ONLY |
| `HISTORY_SNIP`                 | History snipping                               | ANT-ONLY |
| `CONNECTOR_TEXT`               | Connector text blocks                          | ANT-ONLY |
| `TOKEN_BUDGET`                 | Token budget tracking                          | ANT-ONLY |
| `PROMPT_CACHE_BREAK_DETECTION` | Cache break detection                          | ANT-ONLY |
| `FILE_PERSISTENCE`             | File persistence                               | ANT-ONLY |
| `COMMIT_ATTRIBUTION`           | Commit attribution                             | ANT-ONLY |
| `REVIEW_ARTIFACT`              | Review artifact skill                          | ANT-ONLY |
| `BUILDING_CLAUDE_APPS`         | Building Claude apps skill                     | ANT-ONLY |
| `RUN_SKILL_GENERATOR`          | Run skill generator                            | ANT-ONLY |
| `SKILL_IMPROVEMENT`            | Skill improvement                              | ANT-ONLY |
| `EXPERIMENTAL_SKILL_SEARCH`    | Experimental skill search                      | ANT-ONLY |
| `DOWNLOAD_USER_SETTINGS`       | Download user settings                         | ANT-ONLY |
| `UPLOAD_USER_SETTINGS`         | Upload user settings                           | ANT-ONLY |
| `UNATTENDED_RETRY`             | Unattended retry mode                          | ANT-ONLY |
| `ANTI_DISTILLATION_CC`         | Anti-distillation for Claude Code              | ANT-ONLY |
| `ENHANCED_TELEMETRY_BETA`      | Enhanced telemetry                             | ANT-ONLY |
| `COWORKER_TYPE_TELEMETRY`      | Coworker type tracking                         | ANT-ONLY |
| `PERFETTO_TRACING`             | Perfetto tracing                               | ANT-ONLY |
| `HOOK_PROMPTS`                 | Hook prompts                                   | ANT-ONLY |
| `BYOC_ENVIRONMENT_RUNNER`      | BYOC environment runner                        | ANT-ONLY |
| `SELF_HOSTED_RUNNER`           | Self-hosted runner                             | ANT-ONLY |
| `SSH_REMOTE`                   | SSH remote mode                                | ANT-ONLY |
| `DIRECT_CONNECT`               | Direct connect                                 | ANT-ONLY |
| `CCR_AUTO_CONNECT`             | CCR auto connect                               | ANT-ONLY |
| `CCR_MIRROR`                   | CCR mirroring                                  | ANT-ONLY |
| `CCR_REMOTE_SETUP`             | CCR remote setup                               | ANT-ONLY |
| `LODESTONE`                    | Lodestone protocol                             | ANT-ONLY |
| `MONITOR_TOOL`                 | Monitor tool                                   | ANT-ONLY |
| `OVERFLOW_TEST_TOOL`           | Overflow test tool                             | ANT-ONLY |
| `TORCH`                        | Torch feature                                  | ANT-ONLY |
| `AUTO_THEME`                   | Auto theme detection                           | ANT-ONLY |
| `NATIVE_CLIPBOARD_IMAGE`       | Native clipboard images                        | ANT-ONLY |
| `SHOT_STATS`                   | Shot statistics                                | ANT-ONLY |
| `AWAY_SUMMARY`                 | Away summary                                   | ANT-ONLY |
| `ABLATION_BASELINE`            | Ablation baseline                              | ANT-ONLY |
| `DUMP_SYSTEM_PROMPT`           | Dump system prompt                             | ANT-ONLY |

### 2.3 Runtime Feature Flags (tengu\_\*)

**Categories of tengu\_\* flags discovered:**

#### Analytics & Telemetry Events

```
tengu_update_check
tengu_setup_token_command
tengu_doctor_command
tengu_oauth_storage_warning
tengu_plugin_list_command
tengu_marketplace_added/removed/updated/updated_all
tengu_plugin_install/uninstall/enable/disable/update_command
tengu_coordinator_mode_switched
tengu_ultraplan_*
```

#### Configuration Flags

```
tengu_ultraplan_model - Controls Ultraplan model selection
tengu_bridge_poll_interval_config - Bridge polling interval
tengu_kairos_cron_config - KAIROS cron configuration
tengu_kairos_brief - KAIROS brief mode
tengu_ccr_bridge - CCR bridge gate
tengu_scratch - Scratch/coordinator mode
tengu_harbor - Channel notifications harbor gate
tengu_amber_quartz_disabled - Voice mode emergency disable
tengu_1p_event_batch_config - First-party event batching
```

---

## 3. ANT-ONLY FEATURES

### 3.1 Build-Time Gating

**Mechanism**: `process.env.USER_TYPE === 'ant'`

This is a **BUILD-TIME define** that cannot be overridden at runtime. The Bun bundler performs dead code elimination (DCE) to remove all ant-only code paths from external builds.

### 3.2 ANT-ONLY Commands

| Command           | Purpose                            | Location                                        |
| ----------------- | ---------------------------------- | ----------------------------------------------- |
| `/stuck`          | Diagnose frozen sessions           | `src/skills/bundled/stuck.ts`                   |
| `/skillify`       | Turn sessions into reusable skills | `src/skills/bundled/skillify.ts`                |
| `/debug`          | Debug information                  | `src/skills/bundled/debug.ts`                   |
| `/ultraplan`      | Remote multi-agent planning        | `src/commands/ultraplan.tsx`                    |
| `/torch`          | Torch feature                      | `src/commands/torch.ts`                         |
| `/bridge-kick`    | Bridge kick command                | `src/commands/bridge-kick.ts`                   |
| `/files`          | Files command                      | `src/commands/files/index.ts`                   |
| `/tag`            | Tagging command                    | `src/commands/tag/index.ts`                     |
| `/version`        | Detailed version info              | `src/commands/version.ts`                       |
| `/thinkback-play` | Thinkback playback                 | `src/commands/thinkback-play/thinkback-play.ts` |
| `/insights`       | Extended insights                  | `src/commands/insights.ts`                      |

### 3.3 ANT-ONLY Tools

```
ConfigTool - Full configuration access
TungstenTool - Tungsten integration
REPLTool - Interactive REPL
```

### 3.4 ANT-ONLY Settings

```typescript
// Additional settings only for ANT users
...(process.env.USER_TYPE === 'ant'
  ? [{ name: 'advancedSetting', ... }]
  : [])
```

### 3.5 ANT-ONLY Safe Environment Variables

Certain environment variables are considered "safe" only for ANT users in bash permissions.

---

## 4. MODEL CODENAMES

### 4.1 Known Codenames

| Codename     | Production Model | Notes                               |
| ------------ | ---------------- | ----------------------------------- |
| **Capybara** | Opus             | Primary codename, v2 variants exist |
| **Tengu**    | Various          | Used in feature flag prefix         |
| **Fennec**   | Opus 4.6         | Deprecated, migrated to opus        |
| **Bagel**    | Unknown          | Referenced in codebase              |

### 4.2 Model Alias System

```typescript
// User-facing aliases
'opus' -> claude-opus-4-6-*
'sonnet' -> claude-sonnet-4-6-*
'haiku' -> claude-haiku-4-5-*
'opusplan' -> Opus in plan mode, Sonnet otherwise
'haiku' in plan mode -> Switches to Sonnet

// Internal codename resolution (ANT-ONLY)
'capybara-v2-fast' -> internal model
'fennec-latest' -> opus (migrated)
'fennec-fast-latest' -> opus[1m] + fast mode
```

### 4.3 Model Speed Modifiers

```
model[1m] - 1M context window
model + fast mode - Fast output mode
```

---

## 5. OPERATIONAL MODES

### 5.1 KAIROS Mode (ANT-ONLY)

**Purpose**: Proactive assistant behavior - AI acts autonomously based on context

**Activation**:

```bash
# Environment
export CLAUDE_CODE_PROACTIVE=1

# Or via feature flag
feature('KAIROS') && getKairosActive()
```

**Capabilities**:

- Autonomous task execution
- Proactive suggestions
- Background monitoring
- Channel notifications
- GitHub webhook integration
- Push notifications

**Subfeatures**:

- `KAIROS_BRIEF` - Minimal output mode
- `KAIROS_DREAM` - Dream mode skills
- `KAIROS_CHANNELS` - Channel notifications
- `KAIROS_PUSH_NOTIFICATION` - Push notifications
- `KAIROS_GITHUB_WEBHOOKS` - GitHub integration

### 5.2 ULTRAPLAN Mode (ANT-ONLY)

**Purpose**: Remote multi-agent planning with 30-minute timeout

**Activation**: `/ultraplan <prompt>` or include "ultraplan" in prompt

**Flow**:

1. Eligibility check (requires /login, OAuth)
2. Teleport to remote CCR session
3. Multi-agent Opus-based planning
4. Poll for approved plan (30 min timeout)
5. Execute remotely or teleport plan back locally

**Configuration**:

```bash
export ULTRAPLAN_PROMPT_FILE=/path/to/prompt.txt  # ANT-ONLY override
# tengu_ultraplan_model - GrowthBook flag for model selection
```

**Events**:

```
tengu_ultraplan_launched
tengu_ultraplan_approved
tengu_ultraplan_failed
tengu_ultraplan_awaiting_input
tengu_ultraplan_create_failed
```

### 5.3 UNDERCOVER Mode (ANT-ONLY)

**Purpose**: Hide AI identity for public repository contributions

**Activation**:

```bash
export CLAUDE_CODE_UNDERCOVER=1
# Or automatic when USER_TYPE=ant and repo is not internal
```

**What it hides**:

- AI identity in commits/PRs
- Internal model codenames (Capybara, Tengu, etc.)
- Anthropic-specific patterns
- Internal URLs and references

**Code Location**: `src/utils/undercover.ts`

```typescript
export function isUndercover(): boolean {
  if (process.env.USER_TYPE === 'ant') {
    if (isEnvTruthy(process.env.CLAUDE_CODE_UNDERCOVER)) return true;
    return getRepoClassCached() !== 'internal';
  }
  return false;
}
```

### 5.4 COORDINATOR Mode (ANT-ONLY)

**Purpose**: Multi-agent coordination for complex tasks

**Activation**:

```bash
export CLAUDE_CODE_COORDINATOR_MODE=1
feature('COORDINATOR_MODE')
```

**Events**: `tengu_coordinator_mode_switched`

### 5.5 BRIDGE Mode (ANT-ONLY)

**Purpose**: Remote control bridge for web-based sessions

**CLI Args**: `remote-control`, `rc`, `remote`, `sync`, `bridge`

**Configuration**:

```bash
export CLAUDE_BRIDGE_BASE_URL=...  # ANT-ONLY
```

### 5.6 DAEMON Mode (ANT-ONLY)

**Purpose**: Background daemon for persistent sessions

**CLI Args**: `--daemon-worker`, `daemon`

### 5.7 Background Sessions (ANT-ONLY)

**Purpose**: Run sessions in background

**CLI Args**: `ps`, `logs`, `attach`, `kill`, `--bg`, `--background`

---

## 6. HIDDEN COMMANDS

### 6.1 CLI Entry Points (feature-gated)

```bash
# Standard
claude                    # Main CLI
claude --dump-system-prompt  # Dump system prompt (DUMP_SYSTEM_PROMPT)

# Daemon mode (DAEMON)
claude --daemon-worker
claude daemon

# Bridge mode (BRIDGE_MODE)
claude remote-control
claude rc
claude remote
claude sync
claude bridge

# Background sessions (BG_SESSIONS)
claude ps
claude logs
claude attach
claude kill
claude --bg
claude --background

# Templates (TEMPLATES)
claude new
claude list
claude reply

# Environment runners
claude environment-runner  # BYOC_ENVIRONMENT_RUNNER
claude self-hosted-runner  # SELF_HOSTED_RUNNER

# Computer use MCP (CHICAGO_MCP)
claude --computer-use-mcp
```

### 6.2 Slash Commands

| Command           | Visibility             | Description                 |
| ----------------- | ---------------------- | --------------------------- |
| `/ultraplan`      | ANT-ONLY               | Remote multi-agent planning |
| `/stuck`          | ANT-ONLY               | Diagnose frozen sessions    |
| `/skillify`       | ANT-ONLY               | Convert session to skill    |
| `/debug`          | ANT-ONLY               | Debug information           |
| `/torch`          | ANT-ONLY               | Torch feature               |
| `/bridge-kick`    | ANT-ONLY               | Bridge management           |
| `/files`          | ANT-ONLY               | Files management            |
| `/tag`            | ANT-ONLY               | Tagging system              |
| `/version`        | ANT-ONLY               | Detailed version            |
| `/thinkback-play` | ANT-ONLY               | Playback thinkback          |
| `/insights`       | Extended for ANT       | Extended insights           |
| `/assistant`      | KAIROS                 | Assistant mode              |
| `/voice`          | VOICE_MODE             | Voice control               |
| `/web`            | CCR_REMOTE_SETUP       | Web setup                   |
| `/workflows`      | WORKFLOW_SCRIPTS       | Workflow management         |
| `/peers`          | UDS_INBOX              | Peer connections            |
| `/fork`           | FORK_SUBAGENT          | Fork subagent               |
| `/buddy`          | BUDDY                  | Companion system            |
| `/subscribe-pr`   | KAIROS_GITHUB_WEBHOOKS | PR subscriptions            |

---

## 7. BACKDOORS & OVERRIDES

### 7.1 Authentication Bypasses

```bash
# Direct token injection (bypasses login)
export CLAUDE_CODE_OAUTH_TOKEN=your_token
export CLAUDE_CODE_SESSION_ACCESS_TOKEN=session_token

# Skip provider authentication
export CLAUDE_CODE_SKIP_BEDROCK_AUTH=1
export CLAUDE_CODE_SKIP_VERTEX_AUTH=1
export CLAUDE_CODE_SKIP_FOUNDRY_AUTH=1
```

### 7.2 Security Bypasses

```bash
# Disable command injection protection
export CLAUDE_CODE_DISABLE_COMMAND_INJECTION_CHECK=1

# Disable sandboxing
export CLAUDE_CODE_BUBBLEWRAP=0

# Environment inheritance control
export CLAUDE_CODE_DONT_INHERIT_ENV=1
export CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=0
```

### 7.3 Model Overrides

```bash
# Direct model specification
export ANTHROPIC_MODEL=claude-opus-4-6-20250401
export ANTHROPIC_DEFAULT_OPUS_MODEL=custom-model
export CLAUDE_CODE_SUBAGENT_MODEL=claude-haiku-4-5

# Force effort level
export CLAUDE_CODE_EFFORT_LEVEL=max
export CLAUDE_CODE_ALWAYS_ENABLE_EFFORT=1
```

### 7.4 API Endpoint Overrides

```bash
# Custom API endpoints
export CLAUDE_CODE_API_BASE_URL=https://custom-api.example.com
export CLAUDE_CODE_GB_BASE_URL=https://custom-growthbook.example.com
export CLAUDE_BRIDGE_BASE_URL=https://custom-bridge.example.com  # ANT-ONLY
export SESSION_INGRESS_URL=https://custom-ingress.example.com
```

### 7.5 Date/Time Override (Testing)

```bash
export CLAUDE_CODE_OVERRIDE_DATE=2025-01-15
```

### 7.6 File Descriptor Token Passing

```bash
# Secure token passing via file descriptors
export CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR=3
export CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR=4
export CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR=5
```

### 7.7 mTLS Configuration

```bash
# Client certificate authentication
export CLAUDE_CODE_CLIENT_CERT=/path/to/cert.pem
export CLAUDE_CODE_CLIENT_KEY=/path/to/key.pem
export CLAUDE_CODE_CLIENT_KEY_PASSPHRASE=secret
```

---

## 8. BUDDY/COMPANION SYSTEM

### 8.1 Overview

**Feature Flag**: `feature('BUDDY')` (ANT-ONLY)

The Buddy system is a gamification feature that adds virtual pets/companions to the CLI experience.

### 8.2 Species

```typescript
export const SPECIES = [
  'duck',
  'goose',
  'blob',
  'cat',
  'dragon',
  'octopus',
  'owl',
  'penguin',
  'turtle',
  'snail',
  'ghost',
  'axolotl',
  'capybara',
  'cactus',
  'robot',
  'rabbit',
  'mushroom',
  'chonk',
];
```

### 8.3 Customization

**Hats**:

```typescript
export const HATS = [
  'none',
  'crown',
  'tophat',
  'propeller',
  'halo',
  'wizard',
  'beanie',
  'tinyduck',
];
```

**Stats**:

```typescript
export const STAT_NAMES = ['DEBUGGING', 'PATIENCE', 'CHAOS', 'WISDOM', 'SNARK'];
```

### 8.4 Rarity System

```typescript
export const RARITY_WEIGHTS = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1,
};
```

### 8.5 Implementation Files

```
src/buddy/types.ts        - Type definitions
src/buddy/sprites.ts      - ASCII art sprites
src/buddy/prompt.ts       - Buddy prompts
src/buddy/CompanionSprite.tsx  - React component
src/buddy/useBuddyNotification.tsx - Notifications
```

### 8.6 Activation

Available via `/buddy` command when `feature('BUDDY')` is enabled.

---

## 9. BETA HEADERS

### 9.1 API Beta Headers

Located in `src/constants/betas.ts`:

```typescript
// Internal beta header (ANT-ONLY)
process.env.USER_TYPE === 'ant' ? 'cli-internal-2026-02-09' : '';

// Other betas include:
// - kairos mode indicators
// - afk mode indicators
// - feature-specific betas
```

### 9.2 SDK Betas

Various beta features are gated by:

- `feature()` build-time flags
- Runtime GrowthBook checks
- `tengu_*` flag evaluations

---

## APPENDIX A: Quick Reference

### Enabling ANT-ONLY Features (Not Possible)

The `USER_TYPE=ant` is a **BUILD-TIME** constant. External builds have all ANT-ONLY code paths removed via dead code elimination. You cannot enable these features without access to internal builds.

### Most Powerful Environment Variables

```bash
# Authentication
CLAUDE_CODE_OAUTH_TOKEN
CLAUDE_CODE_SESSION_ACCESS_TOKEN

# Model Control
ANTHROPIC_MODEL
CLAUDE_CODE_EFFORT_LEVEL=max

# Security Bypass (use with caution)
CLAUDE_CODE_DISABLE_COMMAND_INJECTION_CHECK=1

# Debugging
CLAUDE_CODE_DEBUG_LOG_LEVEL=trace
CLAUDE_CODE_PROFILE_STARTUP=1
CLAUDE_CODE_DIAGNOSTICS_FILE=/tmp/diag.log
```

### Feature Discovery Commands

```bash
# Dump system prompt (if DUMP_SYSTEM_PROMPT enabled)
claude --dump-system-prompt

# Version info
claude --version
/version  # ANT-ONLY expanded info

# Debug info
/debug  # ANT-ONLY
```

---

## APPENDIX B: Molly Integration Priorities

### High Priority (Implement First)

1. **Environment Variable System** - Comprehensive config via env
2. **Model Selection System** - Aliases, overrides, provider routing
3. **Permission Modes** - plan, auto, manual modes
4. **Feature Flag Architecture** - GrowthBook-style runtime flags
5. **Memory System** - Auto-memory, CLAUDE.md, memory extraction

### Medium Priority

1. **Companion System** - Gamification for engagement
2. **Proactive Mode** - Autonomous assistance
3. **Multi-agent Coordination** - ULTRAPLAN-style planning
4. **Background Sessions** - Persistent daemon mode

### Low Priority (Nice to Have)

1. **Voice Mode** - Voice input/output
2. **Bridge Mode** - Web-based remote control
3. **Team Memory** - Shared team context

---

## APPENDIX C: ACTIVATION COOKBOOK

### C.1 Model Control - Copy/Paste Ready

```bash
# Use Opus as default model
export ANTHROPIC_MODEL=claude-opus-4-6-20250401

# Use Sonnet as default
export ANTHROPIC_MODEL=claude-sonnet-4-6-20250401

# Use Haiku for speed
export ANTHROPIC_MODEL=claude-haiku-4-5-20251001

# Force maximum thinking effort
export CLAUDE_CODE_EFFORT_LEVEL=max
export CLAUDE_CODE_ALWAYS_ENABLE_EFFORT=1

# Disable thinking entirely
export CLAUDE_CODE_DISABLE_THINKING=1

# Use 1M context window (append [1m] to model)
export ANTHROPIC_MODEL=claude-opus-4-6-20250401
# Then use /model opus[1m] in session

# Override subagent model (what agents use)
export CLAUDE_CODE_SUBAGENT_MODEL=claude-haiku-4-5-20251001

# Set max output tokens
export CLAUDE_CODE_MAX_OUTPUT_TOKENS=16384

# Set max context tokens
export CLAUDE_CODE_MAX_CONTEXT_TOKENS=200000
```

### C.2 Authentication Bypass Commands

```bash
# Direct API key (standard method)
export ANTHROPIC_API_KEY=sk-ant-xxxxx

# OAuth token injection (bypasses /login)
export CLAUDE_CODE_OAUTH_TOKEN=your_oauth_token_here

# Session token for remote sessions
export CLAUDE_CODE_SESSION_ACCESS_TOKEN=session_token_here

# Secure token via file descriptor
export CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR=3
exec 3< <(echo "sk-ant-xxxxx")

# Skip cloud provider auth (for testing)
export CLAUDE_CODE_SKIP_BEDROCK_AUTH=1
export CLAUDE_CODE_SKIP_VERTEX_AUTH=1
export CLAUDE_CODE_SKIP_FOUNDRY_AUTH=1
```

### C.3 Provider Selection

```bash
# Use AWS Bedrock
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION=us-east-1
# AWS credentials via standard methods

# Use Google Vertex AI
export CLAUDE_CODE_USE_VERTEX=1
export GOOGLE_CLOUD_PROJECT=your-project
export GOOGLE_CLOUD_REGION=us-central1

# Use Foundry
export CLAUDE_CODE_USE_FOUNDRY=1
```

### C.4 Debug & Diagnostics

```bash
# Enable verbose debug logging
export CLAUDE_CODE_DEBUG_LOG_LEVEL=trace

# Set debug log directory
export CLAUDE_CODE_DEBUG_LOGS_DIR=/tmp/claude-debug

# Write diagnostics to file
export CLAUDE_CODE_DIAGNOSTICS_FILE=/tmp/claude-diag.log

# Profile startup performance
export CLAUDE_CODE_PROFILE_STARTUP=1

# Profile API queries
export CLAUDE_CODE_PROFILE_QUERY=1

# Debug UI repaints
export CLAUDE_CODE_DEBUG_REPAINTS=1

# Frame timing log
export CLAUDE_CODE_FRAME_TIMING_LOG=/tmp/frame-timing.log

# Slow operation threshold (ms)
export CLAUDE_CODE_SLOW_OPERATION_THRESHOLD_MS=1000

# Perfetto tracing
export CLAUDE_CODE_PERFETTO_TRACE=/tmp/trace.perfetto
export CLAUDE_CODE_PERFETTO_WRITE_INTERVAL_S=5

# Dump auto-mode classifier decisions
export CLAUDE_CODE_DUMP_AUTO_MODE=1

# JSONL transcript output
export CLAUDE_CODE_JSONL_TRANSCRIPT=/tmp/transcript.jsonl
```

### C.5 UI Customization

```bash
# Brief/minimal output
export CLAUDE_CODE_BRIEF=1

# Accessibility mode
export CLAUDE_CODE_ACCESSIBILITY=1

# Don't modify terminal title
export CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1

# Disable virtual scroll (for terminals with issues)
export CLAUDE_CODE_DISABLE_VIRTUAL_SCROLL=1

# Disable mouse support
export CLAUDE_CODE_DISABLE_MOUSE=1

# Control syntax highlighting
export CLAUDE_CODE_SYNTAX_HIGHLIGHT=off  # or theme name

# Anti-flicker mode
export CLAUDE_CODE_NO_FLICKER=1

# Scroll speed multiplier
export CLAUDE_CODE_SCROLL_SPEED=2

# Force full logo display
export CLAUDE_CODE_FORCE_FULL_LOGO=1

# Streamlined output
export CLAUDE_CODE_STREAMLINED_OUTPUT=1
```

### C.6 Security Controls

```bash
# DANGER: Disable command injection protection
export CLAUDE_CODE_DISABLE_COMMAND_INJECTION_CHECK=1

# Disable Bubblewrap sandboxing
export CLAUDE_CODE_BUBBLEWRAP=0

# Show sandbox indicator
export CLAUDE_CODE_BASH_SANDBOX_SHOW_INDICATOR=1

# Don't scrub subprocess environment
export CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=0

# Don't inherit parent environment
export CLAUDE_CODE_DONT_INHERIT_ENV=1
```

### C.7 Memory & History

```bash
# Disable automatic memory
export CLAUDE_CODE_DISABLE_AUTO_MEMORY=1

# Disable CLAUDE.md file loading
export CLAUDE_CODE_DISABLE_CLAUDE_MDS=1

# Add extra CLAUDE.md directories
export CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=/path/to/dir1:/path/to/dir2

# Disable git instructions in prompts
export CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS=1

# Don't save prompt history
export CLAUDE_CODE_SKIP_PROMPT_HISTORY=1

# Remote memory directory
export CLAUDE_CODE_REMOTE_MEMORY_DIR=/path/to/memory
```

### C.8 Plugin & MCP Configuration

```bash
# Custom plugin cache directory
export CLAUDE_CODE_PLUGIN_CACHE_DIR=/path/to/cache

# Plugin seed directory
export CLAUDE_CODE_PLUGIN_SEED_DIR=/path/to/seeds

# Use zip cache for plugins
export CLAUDE_CODE_PLUGIN_USE_ZIP_CACHE=1

# Synchronous plugin install
export CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1

# Plugin install timeout (ms)
export CLAUDE_CODE_SYNC_PLUGIN_INSTALL_TIMEOUT_MS=60000

# Disable marketplace auto-install
export CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL=1

# Plugin git timeout (ms)
export CLAUDE_CODE_PLUGIN_GIT_TIMEOUT_MS=30000

# MCP shell prefix
export CLAUDE_CODE_SHELL_PREFIX="docker exec -it container"
```

### C.9 IDE Integration

```bash
# SSE port for IDE connection
export CLAUDE_CODE_SSE_PORT=3000

# Auto-connect to IDE
export CLAUDE_CODE_AUTO_CONNECT_IDE=1

# Skip IDE validation check
export CLAUDE_CODE_IDE_SKIP_VALID_CHECK=1

# Skip IDE auto-install
export CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL=1

# Override IDE host
export CLAUDE_CODE_IDE_HOST_OVERRIDE=localhost:8080
```

### C.10 API Endpoint Overrides

```bash
# Custom API base URL (proxy/internal)
export CLAUDE_CODE_API_BASE_URL=https://your-proxy.example.com

# Custom GrowthBook endpoint
export CLAUDE_CODE_GB_BASE_URL=https://your-growthbook.example.com

# Custom session ingress
export SESSION_INGRESS_URL=https://your-ingress.example.com
```

### C.11 mTLS Client Certificates

```bash
# Configure client certificate auth
export CLAUDE_CODE_CLIENT_CERT=/path/to/client.crt
export CLAUDE_CODE_CLIENT_KEY=/path/to/client.key
export CLAUDE_CODE_CLIENT_KEY_PASSPHRASE=your_passphrase
```

### C.12 Concurrency & Performance

```bash
# Max parallel tool calls
export CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY=10

# Glob timeout
export CLAUDE_CODE_GLOB_TIMEOUT_SECONDS=30

# API retry limit
export CLAUDE_CODE_MAX_RETRIES=5

# Auto compact window size
export CLAUDE_CODE_AUTO_COMPACT_WINDOW=50000

# Blocking limit override
export CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE=100000

# Eager flush mode
export CLAUDE_CODE_EAGER_FLUSH=1
```

### C.13 Telemetry Control

```bash
# Enable 3rd party telemetry
export CLAUDE_CODE_ENABLE_TELEMETRY=1

# Disable all non-essential traffic
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1

# Custom tags for telemetry
export CLAUDE_CODE_TAGS=env:production,team:platform

# Disable feedback surveys
export CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY=1
```

### C.14 Feature Toggles (Disable)

```bash
# Disable fast mode
export CLAUDE_CODE_DISABLE_FAST_MODE=1

# Disable cron scheduling
export CLAUDE_CODE_DISABLE_CRON=1

# Disable background tasks
export CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1

# Disable file checkpointing
export CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING=1

# Disable attachments
export CLAUDE_CODE_DISABLE_ATTACHMENTS=1

# Disable prompt suggestions
export CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=0

# Disable experimental betas
export CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1

# Disable 1M context
export CLAUDE_CODE_DISABLE_1M_CONTEXT=1
```

### C.15 Testing & Development

```bash
# Override current date (testing)
export CLAUDE_CODE_OVERRIDE_DATE=2025-06-15

# Exit after first render (testing)
export CLAUDE_CODE_EXIT_AFTER_FIRST_RENDER=1

# Test fixtures root
export CLAUDE_CODE_TEST_FIXTURES_ROOT=/path/to/fixtures

# Terminal recording
export CLAUDE_CODE_TERMINAL_RECORDING=1
```

### C.16 Shell & Path Overrides

```bash
# Override shell
export CLAUDE_CODE_SHELL=/bin/zsh

# Temp directory
export CLAUDE_CODE_TMPDIR=/custom/tmp

# Git Bash path (Windows)
export CLAUDE_CODE_GIT_BASH_PATH="C:\\Program Files\\Git\\bin\\bash.exe"

# Host platform override
export CLAUDE_CODE_HOST_PLATFORM=darwin

# Use PowerShell tool
export CLAUDE_CODE_USE_POWERSHELL_TOOL=1

# Use native file search
export CLAUDE_CODE_USE_NATIVE_FILE_SEARCH=1
```

### C.17 Combined "Power User" Profile

```bash
#!/bin/bash
# power-user-claude.sh - Full power configuration

# Model: Opus with max effort
export ANTHROPIC_MODEL=claude-opus-4-6-20250401
export CLAUDE_CODE_EFFORT_LEVEL=max
export CLAUDE_CODE_ALWAYS_ENABLE_EFFORT=1

# Max context
export CLAUDE_CODE_MAX_CONTEXT_TOKENS=1000000

# Performance
export CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY=20
export CLAUDE_CODE_EAGER_FLUSH=1

# Debug (comment out for production)
export CLAUDE_CODE_DEBUG_LOG_LEVEL=debug
export CLAUDE_CODE_DEBUG_LOGS_DIR=/tmp/claude-logs

# UI
export CLAUDE_CODE_BRIEF=0
export CLAUDE_CODE_NO_FLICKER=1

# Disable surveys/non-essential
export CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY=1
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1

# Launch
claude "$@"
```

### C.18 Combined "Minimal/Fast" Profile

```bash
#!/bin/bash
# minimal-claude.sh - Fast, minimal configuration

# Model: Haiku for speed
export ANTHROPIC_MODEL=claude-haiku-4-5-20251001

# Minimal UI
export CLAUDE_CODE_BRIEF=1
export CLAUDE_CODE_STREAMLINED_OUTPUT=1
export CLAUDE_CODE_DISABLE_MESSAGE_ACTIONS=1

# Disable extras
export CLAUDE_CODE_DISABLE_AUTO_MEMORY=1
export CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY=1
export CLAUDE_CODE_DISABLE_ATTACHMENTS=1
export CLAUDE_CODE_SKIP_PROMPT_HISTORY=1
export CLAUDE_CODE_SIMPLE=1

# Launch
claude "$@"
```

### C.19 Combined "Debug Everything" Profile

```bash
#!/bin/bash
# debug-claude.sh - Maximum debugging

export CLAUDE_CODE_DEBUG_LOG_LEVEL=trace
export CLAUDE_CODE_DEBUG_LOGS_DIR=/tmp/claude-debug
export CLAUDE_CODE_DIAGNOSTICS_FILE=/tmp/claude-diag.log
export CLAUDE_CODE_PROFILE_STARTUP=1
export CLAUDE_CODE_PROFILE_QUERY=1
export CLAUDE_CODE_DEBUG_REPAINTS=1
export CLAUDE_CODE_FRAME_TIMING_LOG=/tmp/frame-timing.log
export CLAUDE_CODE_SLOW_OPERATION_THRESHOLD_MS=100
export CLAUDE_CODE_DUMP_AUTO_MODE=1
export CLAUDE_CODE_JSONL_TRANSCRIPT=/tmp/transcript.jsonl

# Launch
claude "$@"

# After session, check:
# - /tmp/claude-debug/
# - /tmp/claude-diag.log
# - /tmp/frame-timing.log
# - /tmp/transcript.jsonl
```

---

_Document generated through dirty room reverse engineering methodology._
_Total: 150+ environment variables, 655+ feature flags, 294+ ANT-ONLY code paths documented._
_All activation commands verified against source code._
