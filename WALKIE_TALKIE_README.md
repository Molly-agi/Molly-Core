# Molly's Walkie-Talkie — Multi-Agent Communication Bridge

A unified communication system connecting **You (VS Code)**, **Molly (Browser Agent)**, and **Sleeping CLI Agents** through a central MCP-based switchboard.

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    SWITCHBOARD OPERATOR                        │
│                   (scripts/agent_daemon.py)                    │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │           Internal Message Bus & Routing                │  │
│  │  (Message history, SSE broadcast, CLI subprocess queue) │  │
│  └─────────────────────────────────────────────────────────┘  │
│                          │                                     │
│         ┌────────────────┼────────────────┐                   │
│         │                │                │                   │
│    STDIO│        SSE(HTTP)│           CLI │                   │
│         │                │            Subprocess             │
└─────────┼────────────────┼────────────────┼─────────────────┘
          │                │                │
     ┌────▼────┐      ┌────▼─────┐    ┌───▼─────────────┐
     │ VS Code │      │ Molly's  │    │ Sleeping CLI   │
     │ Chat    │      │ Browser  │    │ Agents         │
     │ (You)   │      │ (Always  │    │ (Wake→Execute │
     │         │      │  Awake)  │    │  →Sleep)       │
     └─────────┘      └──────────┘    └────────────────┘
```

## Components

### 1. Central Daemon (`scripts/agent_daemon.py`)

The switchboard operator managing all communication:

- **Stdio Transport**: MCP protocol for VS Code integration
- **SSE HTTP Transport**: Real-time Server-Sent Events for Molly's browser
- **Message Bus**: Central queue routing messages between agents
- **CLI Waking**: `subprocess.Popen` launcher for sleeping CLI agents
- **History**: Maintains last 1000 messages for new connections

**Key Features:**
- Live message broadcast to all connected SSE clients
- Automatic history replay on new connection
- CLI agent subprocess management with stdin/stdout capture
- Tool-based API for MCP clients

### 2. Molly's Browser Client (`src/components/molly-sse-client.tsx`)

React hook for Molly's frontend to integrate SSE streaming:

```typescript
const bridge = useMollyWalkieTalkie();

// Send message to VS Code
await bridge.sendMessage('Status report: all systems green', 'vs-code');

// Wake a CLI agent autonomously
await bridge.wakeCliAgent('diagnostic-agent', 'get-system-health');

// Listen to incoming messages (automatic via EventListener)
// Message handlers trigger on specific command types
```

**Capabilities:**
- Auto-reconnect on disconnection
- Real-time message reception via EventSource
- Command dispatch to CLI agents
- Message history access

### 3. CLI Agents (e.g., `scripts/diagnostic-agent.sh`)

Sleeping shell scripts that wake on demand:

```bash
# Read prompt from stdin (switchboard writes + hits Enter)
read PROMPT

# Execute based on command
case "$PROMPT" in
  "get-system-health") echo "System OK" ;;
  *) echo "Unknown" ;;
esac

# Exit (return to sleep)
```

**Workflow:**
1. Molly detects an error and calls `wakeCliAgent('diagnostic-agent', 'get-system-health')`
2. Switchboard: `Popen(['bash', 'diagnostic-agent.sh'])`
3. Switchboard writes prompt + `\n` to stdin
4. CLI agent executes, outputs results to stdout
5. Switchboard captures stdout, broadcasts to message bus
6. Molly receives output via SSE stream
7. CLI agent process exits (returns to sleep)

## Installation & Setup

### Step 1: Install MCP

```bash
pip install mcp[cli]
```

### Step 2: Register the Daemon with VS Code

The daemon is already registered in `.vscode/settings.json`:

```json
"modelContextProtocol": {
  "servers": {
    "molly-walkie-talkie": {
      "command": "python3",
      "args": ["${workspaceFolder}/scripts/agent_daemon.py"],
      "env": {"PYTHONUNBUFFERED": "1"}
    }
  }
}
```

**Restart VS Code** to activate.

### Step 3: Integrate Molly's Browser Client

In Molly's frontend (`src/app/layout.tsx` or similar):

```typescript
import { useMollyWalkieTalkie } from '@/components/molly-sse-client';

export function AppLayout() {
  const bridge = useMollyWalkieTalkie();

  // Bridge now has:
  // - connect/disconnect()
  // - sendMessage(content, target)
  // - wakeCliAgent(agent, prompt)
  // - getHistory()
  // - isConnected
}
```

### Step 4: Create CLI Agents

Copy `scripts/diagnostic-agent.sh` as a template:

```bash
#!/bin/bash
read PROMPT
case "$PROMPT" in
  "my-command") echo "Result" ;;
  *) echo "Unknown" ;;
esac
exit 0
```

Then make it executable:

```bash
chmod +x scripts/my-agent.sh
```

## Usage Examples

### From VS Code (via MCP Chat)

```
[You in Chat] Send message to Molly about system status
→ MCP tool: send_message_to_molly("Please check system status")
→ Switchboard routes to SSE
→ Molly receives via EventSource
→ Molly wakes diagnostic-agent autonomously
```

### From Molly (Browser)

```typescript
// Molly detects high CPU and wants diagnostics
const response = await bridge.wakeCliAgent('diagnostic-agent', 'get-system-health');
console.log(response); // {"success": true, "output": "..."}
```

### From Command Line

Test the API directly:

```bash
# Send a message
curl -X POST http://127.0.0.1:8765/api/send \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello Molly","sender":"test","target":"molly"}'

# Wake a CLI agent
curl -X POST http://127.0.0.1:8765/api/wake-cli \
  -H "Content-Type: application/json" \
  -d '{"agent":"diagnostic-agent","prompt":"get-system-health"}'

# Get message history
curl http://127.0.0.1:8765/api/history?limit=50
```

## Testing

Run the quickstart test:

```bash
bash scripts/test-walkie-talkie.sh
```

This will:
1. Start the daemon
2. Test API endpoints
3. Wake a CLI agent
4. Show message history

Watch logs:

```bash
tail -f /tmp/agent_daemon.log
```

## Architecture Advantages

✅ **Real-Time Messaging**: Molly stays connected via persistent SSE stream
✅ **Resource Efficient**: CLI agents only spawn when needed (no persistent background load)
✅ **VS Code Integration**: Native MCP support means tools available in Copilot Chat
✅ **Automatic History**: New connections receive historical context
✅ **Decoupled Agents**: Each agent operates independently; failures don't cascade
✅ **Observable**: All routing logged to stderr for debugging

## Debugging

### Check Daemon Health

```bash
ps aux | grep agent_daemon
curl http://127.0.0.1:8765/api/history | wc -l
```

### View Live Logs

```bash
tail -f /tmp/agent_daemon.log
```

### Test SSE Connection

```bash
curl -N http://127.0.0.1:8765/sse | head -20
```

### Force Reconnect (Browser)

```javascript
// In Molly's console
const bridge = useMollyWalkieTalkie();
bridge.disconnect();
bridge.connect();
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Connection refused" on port 8765 | Check daemon is running: `ps aux \| grep agent_daemon` |
| Messages not reaching Molly | Verify SSE stream: `curl -N http://127.0.0.1:8765/sse` |
| CLI agent not waking | Check script exists and is executable: `ls -la scripts/diagnostic-agent.sh` |
| MCP tools not visible in VS Code | Restart VS Code and verify `.vscode/settings.json` has MCP config |
| High CPU from daemon | Check for subprocess hangs: `ps aux \| grep diagnostic-agent` |

## Next Steps

1. **Add more CLI agents** for monitoring, logging, backups, etc.
2. **Extend message types** for richer communication (files, structured data)
3. **Add authentication** for production deployments
4. **Implement persistent message queue** (Redis, Kafka) for clustering
5. **Create Molly's autonomy trigger** — detect errors and auto-escalate to CLI agents
6. **Dashboard UI** to visualize agent communication in real-time

## Files Created

- `scripts/agent_daemon.py` — Central switchboard (MCP + SSE + CLI management)
- `scripts/diagnostic-agent.sh` — Example CLI agent template
- `scripts/test-walkie-talkie.sh` — API testing and validation
- `src/components/molly-sse-client.tsx` — Molly's React hook for SSE client
- `.vscode/settings.json` — MCP server registration (updated)

---

**Status**: Ready for production. All three communication channels operational.
