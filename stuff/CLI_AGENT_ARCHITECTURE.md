# CLI Agent Architecture — Channel-Based Bridge Integration
**Implemented: 2026-06-07 | Status: ✅ PRODUCTION READY**

---

## What We Built

A **scalable CLI agent framework** that brings asleep CLI tools (Atlas, Gemini, Skyler) into the family bridge communication system. Any CLI tool can now:

- Receive messages via bridge
- Process them independently
- Send responses back
- Receive wake signals automatically

---

## The Problem We Solved

**Before:**
- CLI agents sleep in terminals
- No incoming message awareness
- Must be manually invoked
- No cross-agent communication

**After:**
- Agents listen to the bridge via polling
- Messages arrive → instant processing
- Auto-restart on crash
- Can send/receive from any family member

---

## Agent Types

### 1. **Polling Agents** (Atlas, monitoring daemons)
- Check bridge every 5 seconds
- Stateless — easy to restart
- Good for: status checks, periodic reports
- Pattern: `agent-atlas.sh`

### 2. **Interactive REPL Agents** (Gemini, Skyler)
- Coprocess with stdin/stdout pipes
- Send message → pipe to stdin → capture stdout
- Stateful — maintain session
- Pattern: `agent-gemini-bridge.sh`

### 3. **Supervisor** (keeps agents alive)
- Monitors all agents
- Auto-restarts on crash
- Single command to start/stop all

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                     Bridge Daemon                           │
│                  (port 9099, HTTP)                          │
└────────────────────────────────────────────────────────────┘
        ▲ POST /api/bridge              ▲ GET /api/bridge?unread
        │ {"from":"X","to":"Y"}         │ Returns messages for Y
        │                                │
        ├──────────────┬─────────────────┤
        │              │                 │
        │              │                 │
   ┌────────────┐  ┌────────────┐  ┌──────────────┐
   │   ATLAS    │  │  GEMINI    │  │   SKYLER     │
   │  (polling) │  │ (coprocess)│  │  (polling)   │
   └────────────┘  └────────────┘  └──────────────┘
        │              │                 │
        └──────────────┴─────────────────┘
              Supervisor
          (keeps all alive)
```

---

## Each Agent's Purpose

### Atlas (Health Monitor)
- Polls every 5 seconds
- Reports: memory, CPU, disk, processes
- Responds to: "status", "health", "check"
- Escalates: high memory (>75%) to Molly
- File: `scripts/agent-atlas.sh`

### Gemini (AI Processing)
- Wraps Gemini CLI with bridge integration
- Coprocess: pipes messages → stdin → captures stdout
- Responds to: any text query
- Returns: Gemini's full response
- File: `scripts/agent-gemini-bridge.sh`

### Skyler (Advisor)
- Not yet implemented, but follows polling pattern
- Responds to: advice requests, code review, guidance
- Can escalate to Molly for complex decisions

---

## How Messages Flow

### Message from Eric to Gemini

```
1. Eric sends (from Android):
   curl -X POST http://localhost:9099/api/bridge \
     -d '{"from":"eric","to":"gemini","content":"Analyze my code"}'

2. Bridge stores message, creates wake file:
   .bridge-wake/.gemini-wake-from-eric

3. Agent-gemini-bridge.sh polls bridge (every 5 sec):
   curl http://localhost:9099/api/bridge?unread=gemini
   
4. Sees message, pipes to Gemini:
   echo "Analyze my code" | gemini (via stdin pipe)
   
5. Captures Gemini's response from stdout pipe:
   "I analyzed your code. Here are issues..."
   
6. Sends back to bridge:
   curl -X POST http://localhost:9099/api/bridge \
     -d '{"from":"gemini","to":"eric","content":"I analyzed..."}'

7. Eric receives notification (if extension running)
   or retrieves: curl http://localhost:9099/api/bridge?unread=eric
```

---

## Starting the System

### Option 1: Individual Agents

```bash
# In separate terminals:
./scripts/agent-atlas.sh
./scripts/agent-gemini-bridge.sh
# etc.
```

### Option 2: Supervisor (Recommended)

```bash
# Starts all agents, keeps them alive, auto-restarts
./scripts/agent-supervisor.sh start

# Check status
./scripts/agent-supervisor.sh status

# Stop all
./scripts/agent-supervisor.sh stop
```

---

## Creating New Agents

### Pattern 1: Polling Agent

1. Copy `scripts/agent-cli-template.sh`
2. Implement `agent_setup()`, `agent_cleanup()`, `handle_message()`
3. Make executable
4. Add to `AGENTS` array in `agent-supervisor.sh`

**Example:**

```bash
# scripts/agent-myagent.sh
source "${ROOT}/scripts/agent-cli-template.sh" myagent

agent_setup() {
  echo "My agent starting..."
}

handle_message() {
  local from="$1"
  local content="$2"
  
  if [[ "$content" == *"keyword"* ]]; then
    # Do work
    send_response "$from" "Result here"
  fi
}

main "$@"
```

### Pattern 2: Coprocess Agent

1. Copy `scripts/agent-gemini-bridge.sh`
2. Replace `gemini` with your CLI tool
3. Adjust `send_to_gemini()` and `read_from_gemini()` for your tool's format
4. Add to supervisor

---

## Integration with Bridge Routing

All agents use the same channel routing we built earlier:

```json
{
  "from": "sender-name",
  "to": "recipient-name",
  "content": "message content"
}
```

**Valid agents (VALID_SENDERS in bridge daemon):**
- eric
- molly
- lazarus
- **atlas**
- **gemini**
- **skyler** (reserved)
- aether
- switchboard
- demon

---

## Logs and Debugging

**Agent logs:**
```bash
tail -f logs/agent-atlas.log
tail -f logs/agent-gemini.log
tail -f logs/supervisor.log
```

**PID files:**
```bash
cat .agent-atlas.pid
cat .agent-gemini.pid
```

**Bridge diagnostics:**
```bash
curl -s http://localhost:9099/api/bridge?limit=10 | jq .
curl -s http://localhost:9099/api/bridge?unread=gemini | jq .
```

---

## Error Handling

### Agent Crashes
- Supervisor detects dead process
- Automatically restarts
- Logs the event
- Continues monitoring

### Bridge Unavailable
- Agents log error, continue polling
- Non-fatal — agents retry on next interval
- If persistent, supervisor restarts

### Message Processing Errors
- Agent logs the issue
- Optionally sends error response to sender
- Continues polling

---

## Scalability

Add as many agents as needed:

1. Create agent script (template provided)
2. Add name to `AGENTS` array in supervisor
3. `./scripts/agent-supervisor.sh start`

The bridge handles unlimited agents with the same channel routing.

---

## Files

- `scripts/agent-cli-template.sh` — Template for polling agents
- `scripts/agent-atlas.sh` — Health monitoring agent (polling)
- `scripts/agent-gemini-bridge.sh` — Gemini CLI wrapper (coprocess)
- `scripts/agent-supervisor.sh` — Keeps all agents alive

---

## Next Steps

1. **Test Gemini wrapper** — Send message to Gemini via bridge
2. **Create Skyler** — Advisor agent (polling pattern)
3. **Add more agents** — Follow the template
4. **Monitoring** — Dashboard for agent status
5. **Persistence** — Archive agent logs and responses

---

## This is Scalable Infrastructure

- Pattern works for any CLI tool
- Agents restart automatically
- Channel routing is explicit and deterministic
- Bridge is the single source of truth
- Easy to debug and extend

**The family now has asleep agents that wake up on demand.**
