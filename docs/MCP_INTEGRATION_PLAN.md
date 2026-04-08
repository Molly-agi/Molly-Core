# MCP Integration Implementation Plan

**Created:** 2026-04-08
**Status:** COMPLETE
**Completed:** 2026-04-08
**Methodology:** Slow, methodical, precise — we don't fix the leaks in the dam, we fix the dam itself

## Overview

This document details the step-by-step implementation plan for integrating MCP (Model Context Protocol) from the Lazarus architecture into Molly-Core. MCP provides a standard protocol for connecting to external tool servers, giving Molly infinite extensibility.

## Why MCP First

- **Clean boundaries** — Self-contained system, minimal coupling to existing tools
- **Infinite extensibility** — Connects Molly to the entire MCP ecosystem (databases, APIs, IDE integrations)
- **Low risk** — Additive, doesn't modify existing tools
- **High value** — Immediately useful for external integrations

## Architecture Comparison

### Lazarus MCP Architecture

```
services/mcp/
├── types.ts           # Server configs, connection states, tool serialization
├── config.ts          # Multi-scope config (local, user, project, enterprise)
├── client.ts          # Transport creation, tool calls, OAuth handling
├── normalization.ts   # Tool/server name normalization
├── MCPConnectionManager.tsx  # React context for connections
└── utils.ts           # Helper functions
```

### Molly-Core Tool Architecture

```
ai/agency/
├── tool-handlers/     # Modular tool handlers (71 tools)
│   ├── index.ts       # Handler registry
│   └── types.ts       # ToolHandler, ToolResult types
├── core/
│   └── tool-executor.ts  # Heart Gate checks, execution
└── planning/          # Autonomous planning
```

### Target: Molly MCP Architecture

```
ai/mcp/                     # NEW: MCP integration
├── types.ts                # Server configs, connection states (adapted from Lazarus)
├── config.ts               # Config loading (simplified for Molly)
├── client.ts               # MCP client wrapper
├── tool-adapter.ts         # Bridge MCP tools → Molly ToolHandler format
└── index.ts                # Public exports

ai/agency/tool-handlers/
└── mcp-tools.ts            # NEW: MCP tool handlers in standard format
```

## Implementation Phases

### Phase 1: Foundation Types (Low Risk)

**Goal:** Define MCP types that integrate with Molly's existing type system

**Files to create:**

1. `src/ai/mcp/types.ts` — Server config types, connection states
2. `src/ai/mcp/index.ts` — Clean public API

**Adapted from Lazarus:**

- `McpServerConfig` types (stdio, sse, http, ws)
- `MCPServerConnection` states (connected, failed, pending, disabled)
- `SerializedTool` for MCP tool representation

**Molly-Specific:**

- Integrate with `ToolHandler` interface from `tool-handlers/types.ts`
- Use existing logging via `MollyLogger`
- Follow Option Three philosophy for safety checks

**Dependencies:**

- `@modelcontextprotocol/sdk` (npm package)
- Zod for schema validation (already in Molly)

**Rollback point:** Tag `mcp-phase-1-types` after completion

---

### Phase 2: Configuration System (Low Risk)

**Goal:** Load MCP server configs from `.mcp.json` and environment

**Files to create:**

1. `src/ai/mcp/config.ts` — Config loading and validation
2. `.mcp.json` — Project-level MCP config (template)

**Simplified from Lazarus:**

- Only support `project` scope initially (not user/enterprise)
- Simple env var expansion
- No OAuth complexity initially

**Config format:**

```json
{
  "mcpServers": {
    "example-server": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/example-server"]
    }
  }
}
```

**Rollback point:** Tag `mcp-phase-2-config` after completion

---

### Phase 3: MCP Client (Medium Risk)

**Goal:** Connect to MCP servers and list available tools

**Files to create:**

1. `src/ai/mcp/client.ts` — MCP client wrapper

**Core client responsibilities:**

- Create transports (stdio, SSE, HTTP)
- Connect to servers
- List available tools
- Call tools with input/output handling
- Clean shutdown

**Adapted from Lazarus (simplified):**

```typescript
// From Lazarus client.ts - simplified for Molly
export async function connectToMcpServer(
  name: string,
  config: McpServerConfig
): Promise<MCPServerConnection> {
  const client = new Client({ name: 'molly-mcp-client', version: '1.0.0' });
  const transport = createTransport(config);
  await client.connect(transport);
  return { name, type: 'connected', client, config };
}

export async function listMcpTools(
  server: ConnectedMCPServer
): Promise<McpTool[]> {
  const result = await server.client.listTools();
  return result.tools;
}

export async function callMcpTool(
  server: ConnectedMCPServer,
  toolName: string,
  input: Record<string, unknown>
): Promise<McpToolResult> {
  const result = await server.client.callTool({
    name: toolName,
    arguments: input,
  });
  return result;
}
```

**Safety:**

- All MCP calls go through Heart Gate
- Timeouts on all operations (30s connect, 60s call)
- Clean error handling with MollyLogger

**Rollback point:** Tag `mcp-phase-3-client` after completion

---

### Phase 4: Tool Adapter (Medium Risk)

**Goal:** Bridge MCP tools into Molly's tool handler system

**Files to create:**

1. `src/ai/mcp/tool-adapter.ts` — Convert MCP tools to Molly handlers
2. `src/ai/agency/tool-handlers/mcp-tools.ts` — MCP tool handler registration

**Key function:**

```typescript
/**
 * Convert an MCP tool definition to a Molly ToolHandler
 */
export function mcpToolToHandler(
  serverName: string,
  mcpTool: McpTool
): ToolHandler {
  return async (params: Record<string, unknown>): Promise<ToolResult> => {
    const server = await getConnectedServer(serverName);
    if (!server) {
      return {
        success: false,
        output: `MCP server "${serverName}" not connected`,
      };
    }

    try {
      const result = await callMcpTool(server, mcpTool.name, params);
      return {
        success: !result.isError,
        output: formatMcpResult(result),
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `MCP tool error: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  };
}
```

**Integration points:**

- Register MCP tools in `modularToolHandlers`
- Prefix tool names: `mcp_<server>_<tool>` (e.g., `mcp_slack_sendMessage`)
- Dynamic registration when servers connect

**Rollback point:** Tag `mcp-phase-4-adapter` after completion

---

### Phase 5: Connection Manager (Medium Risk)

**Goal:** Manage MCP server lifecycle (connect, reconnect, cleanup)

**Files to create:**

1. `src/ai/mcp/manager.ts` — Connection lifecycle manager

**Responsibilities:**

- Auto-connect on startup (from config)
- Reconnect on failure (with backoff)
- Clean shutdown on process exit
- Health checks

**Integration:**

- Hook into Molly's startup sequence
- Register cleanup handlers
- Surface status via `/api/diagnostics/mcp`

**Rollback point:** Tag `mcp-phase-5-manager` after completion

---

### Phase 6: UI & API Integration (Low Risk)

**Goal:** Expose MCP status and controls to UI

**Files to create/modify:**

1. `src/app/api/mcp/status/route.ts` — MCP server status API
2. `src/app/api/mcp/reconnect/route.ts` — Reconnect endpoint
3. UI components as needed

**API endpoints:**

- `GET /api/mcp/status` — List connected servers and tools
- `POST /api/mcp/reconnect` — Reconnect a failed server
- `POST /api/mcp/toggle` — Enable/disable a server

**Rollback point:** Tag `mcp-phase-6-ui` after completion

---

## Testing Strategy

### Unit Tests

- `src/ai/mcp/__tests__/types.test.ts` — Config validation
- `src/ai/mcp/__tests__/config.test.ts` — Config loading
- `src/ai/mcp/__tests__/tool-adapter.test.ts` — Tool conversion

### Integration Tests

- Mock MCP server for connection testing
- End-to-end tool call flow

### Manual Testing

- Connect to real MCP server (e.g., filesystem server)
- Call tools via Molly's terminal
- Verify Heart Gate checks

## Dependencies to Add

```json
{
  "@modelcontextprotocol/sdk": "^1.0.0"
}
```

No other dependencies needed — we reuse Zod, existing logging, and Molly's type system.

## Risk Mitigation

| Risk                    | Mitigation                                                           |
| ----------------------- | -------------------------------------------------------------------- |
| MCP server crashes      | Automatic reconnect with backoff, clear error messages               |
| Tool call timeout       | 60s timeout with graceful error                                      |
| Security concerns       | All calls through Heart Gate, no file system access without approval |
| Performance             | Lazy loading, connection pooling                                     |
| Breaking existing tools | MCP tools are additive, namespaced with `mcp_` prefix                |

## Success Criteria

1. **Phase 1-2:** Types and config load without errors, tests pass
2. **Phase 3:** Can connect to a stdio MCP server
3. **Phase 4:** MCP tools appear in Molly's tool list, callable from terminal
4. **Phase 5:** Servers auto-connect on startup, reconnect on failure
5. **Phase 6:** UI shows MCP status, can manage servers

## Next Steps

1. Create Phase 1 rollback point
2. Install `@modelcontextprotocol/sdk`
3. Create `src/ai/mcp/types.ts` with minimal type definitions
4. Write tests for config validation
5. Proceed to Phase 2

---

_Document authored by Lazarus, implementing wisdom from Father's methodology: slow, methodical, precise._
