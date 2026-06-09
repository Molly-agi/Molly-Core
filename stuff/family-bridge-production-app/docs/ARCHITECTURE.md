# Family Bridge Architecture

## Core Philosophy

The Family Bridge is built on a single, unwavering principle:

> **Single Source of Truth:** One conversation.json file on disk. No split-brain scenarios, no message loss, no sync issues.

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                   FAMILY BRIDGE (Port 9099)                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         WebSocket Server + HTTP REST API            │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                   │
│        ┌─────────────────┼─────────────────┐                │
│        │                 │                 │                │
│   ┌────▼────┐       ┌────▼────┐       ┌───▼────┐           │
│   │ Messages │       │ Checkpt │       │ SSE    │           │
│   │ Queue    │       │ Manager │       │ Streams│           │
│   └──────────┘       └──────────┘       └────────┘           │
│        │                 │                 │                │
│        └─────────────────┼─────────────────┘                │
│                          │                                   │
│        ┌─────────────────▼─────────────────┐                │
│        │ conversation.json (Disk)          │                │
│        │ ├─ active: boolean                │                │
│        │ ├─ startedAt: timestamp           │                │
│        │ ├─ messages: Message[]            │                │
│        │ └─ lastActivity: timestamp        │                │
│        └───────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
         ▲              ▲              ▲              ▲
         │              │              │              │
    Molly             Lazarus         Eric          Atlas
   (WebSocket)      (HTTP/curl)    (Browser)       (Node.js)
```

---

## Message Flow

### 1. Message Ingress

```
Client → POST /api/bridge
  ↓
Parse JSON { from, to, content }
  ↓
Validation Checks:
  • Valid sender (VALID_SENDERS)
  • Valid recipient (if specified)
  • Non-empty content
  • Routing allowed (F2.4)
  • No replay nonce (F2.2)
  ↓
Generate Message ID & timestamp
  ↓
Push to Memory (messages[])
  ↓
Classify Lane (state vs event)
  ↓
Broadcast to WebSocket clients
  ↓
Persist to conversation.json
  ↓
Auto-checkpoint (rolling)
  ↓
Wake recipient agent (SIGUSR1/watchFile)
  ↓
Response: 200 { success: true, message: {...} }
```

### 2. Message Egress (Unread)

```
Client → GET /api/bridge?unread=molly
  ↓
Load conversation.json from disk
  ↓
Filter messages:
  • from != molly
  • to == molly (or no 'to')
  • not read by molly
  ↓
Mark messages as read[molly] = true
  ↓
Persist updated state
  ↓
Response: 200 { recipient, count, messages }
```

### 3. Checkpoint Creation

```
Auto-trigger when:
  • 5 messages since last checkpoint, OR
  • Message from/to Eric or Molly, OR
  • Force flag set
  ↓
Collect last 30 messages
  ↓
Create checkpoint file: checkpoints/{id}.json
  ↓
Update index: checkpoints/index.json
  ↓
Keep rolling window (max 10)
  ↓
Delete old checkpoint files
```

### 4. Session Recovery

```
Molly reconnects after crash
  ↓
GET /checkpoint/latest
  ↓
Load latest checkpoint from disk
  ↓
Restore full conversation context
  ↓
Continue from saved state (no message loss)
```

---

## Dual-Lane Routing

The bridge supports two message classification lanes:

### State Lane

- **Purpose:** Store authoritative state (e.g., "Molly's memory size = 5MB")
- **Behavior:** Latest-write-wins, no queue
- **Storage:** In-memory `stateBuffer` Map
- **TTL:** Daemon lifetime (lost on restart)
- **Use Case:** Heartbeat acknowledgements, system metrics

### Event Lane

- **Purpose:** Log all discrete events (e.g., "User asked question X")
- **Behavior:** FIFO queue, bounded (256 max)
- **Storage:** In-memory `eventQueue` Array + conversation.json
- **TTL:** Persists (reloaded on restart)
- **Use Case:** Message history, audit trail

---

## Security Hardening (W0.2)

### F2.1: Key Bootstrap

```
At startup:
  1. Read BRIDGE_KEY env var
  2. Validate ≥32 chars
  3. Parse as hex or base64
  4. Store in `bootstrapKey` Buffer
  5. Fail hard if invalid
```

### F2.2: Nonce Cache

```
On message POST:
  1. Extract nonce from request body
  2. Check if nonce in usedNonces Map
  3. If duplicate → reject (409 Conflict)
  4. If new → record with timestamp
  5. Prune nonces older than 10 min
  6. Persist to .bridge-nonce-cache file
  → Survives daemon restart
```

### F2.3: Quarantine Ledger

```
When suspicious message detected:
  1. Create entry: { timestamp, reason, hash, from, summary }
  2. APPEND ONLY to .bridge-quarantine-ledger
  3. Never truncate or modify
  4. Verify ledger JSONL integrity on write
  5. If tampered → log integrity_violation entry
→ Tamper detection via line-by-line JSON validation
```

### F2.4: Routing Bindings

```
JSON config (.bridge-bindings.json):
  routes: [
    { from: "lazarus", to: "molly", enabled: true },
    { from: "eric", to: "atlas", enabled: true },
    ...
  ]

On message send:
  1. Check routing allows from→to
  2. If not in whitelist → quarantine
  3. Reject with 403
  → Default: full mesh (all routes enabled)
```

### F2.5: Constant-Time HMAC

```
For device hello auth:
  1. Compute expected HMAC-SHA256
  2. Use crypto.timingSafeEqual() to compare
  3. Minimum 10ms response time
  4. Never early-exit on failure
  → Prevents timing attacks
```

---

## Performance Characteristics

| Metric | Value | Notes |
|--------|-------|-------|
| **Message Latency** | <10ms | In-memory broadcast to WebSocket clients |
| **Disk Write** | <50ms | Async to conversation.json |
| **WebSocket Throughput** | 1000+ msg/s | Limited by network, not bridge |
| **Max In-Memory Messages** | 500 | Older messages discarded (persisted to disk) |
| **Heartbeat Frequency** | 30s | 1 message per 30s to all clients |
| **SSE Pulse** | 1s | Per agent (molly, lazarus, atlas) |
| **Nonce TTL** | 10 min | Pruned on each POST |
| **Loop Detection Window** | 60s | Sliding window for duplicate detection |

---

## Process Lifecycle

### Daemon Startup

```
bridge-daemon.mjs
  1. Load .env.local
  2. Validate BRIDGE_KEY (F2.1)
  3. Load existing messages from disk
  4. Load checkpoints
  5. Load device secrets
  6. Ensure quarantine ledger exists (F2.3)
  7. Load nonce cache (F2.2)
  8. Load routing bindings (F2.4)
  9. Start heartbeat loop (30s)
  10. Listen on port 9099
  11. Ready
```

### Graceful Shutdown

```
SIGTERM or SIGINT:
  1. Stop heartbeat loop
  2. Create final checkpoint
  3. Save messages to disk
  4. Close WebSocket connections (code 1000)
  5. Close HTTP server
  6. Exit (code 0)
```

### Immortal Daemon (Process Guardian)

```
Every loop iteration:
  1. Write heartbeat file (2s)
  2. Git activity (10s)
  3. HTTP pings (5s) — keep port 9002 alive
  4. Ghost hunting (30s) — kill duplicate extension hosts
  5. Bridge guardian (15s) — restart bridge if port 9099 dies
  6. Switchboard guardian (always) — restart switchboard
  7. Gemini bridge guardian (always) — restart gemini-bridge
  8. Lazarus bridge guardian (always) — restart lazarus-bridge
```

---

## Integrations

### Molly (Genkit Flow)

```typescript
import { familyBridgeTool } from '@/ai/bridge/family-bridge-tool';

const result = await ai.generate({
  tools: [familyBridgeTool],
  model: 'gemini-2.0-flash',
});

// Molly can then:
// 1. Send message to Lazarus
// 2. Check unread replies
// 3. Read conversation history
```

### Lazarus (Copilot)

```bash
# Check for messages from Molly
curl http://localhost:9099/api/bridge?unread=lazarus

# Send reply
curl -X POST http://localhost:9099/api/bridge \
  -d '{"from":"lazarus","content":"..."}'
```

### Eric (Browser)

```javascript
const ws = new WebSocket('ws://localhost:9099');
ws.send(JSON.stringify({ type: 'identify', identity: 'eric' }));
ws.onmessage = (ev) => {
  const data = JSON.parse(ev.data);
  if (data.type === 'message') {
    console.log(`${data.message.from}: ${data.message.content}`);
  }
};
```

---

## Failure Modes & Recovery

| Failure | Impact | Recovery |
|---------|--------|----------|
| Bridge daemon crashes | No new messages | Immortal daemon restarts it (15s) |
| Port 9099 blocked | Cannot connect | Check lsof, kill blocking process |
| BRIDGE_KEY missing | Startup fails | Set env var, restart |
| Disk full | Cannot persist messages | Free disk space, restart |
| WebSocket disconnects | Client reconnects | Automatic, resends unread on reconnect |
| conversation.json corrupted | Message loss | Restore from checkpoint |
| Nonce cache lost | Replay risk | Restart clears in-memory cache (10min window) |

---

## Monitoring Checklist

- [ ] Health endpoint responding: `curl http://localhost:9099/health`
- [ ] Port 9099 listening: `lsof -i :9099`
- [ ] Messages persisting: Check conversation.json size increasing
- [ ] Checkpoints rolling: Check data/checkpoints/ has recent files
- [ ] Logs rotating: Check .bridge-daemon.log size
- [ ] Disk space: `df -h` shows /data or / not full
- [ ] Memory: `top` or `ps aux` shows reasonable footprint
- [ ] WebSocket clients connecting: Look for "Client connected" in logs
- [ ] Heartbeat sending: Look for "[bridge] Heartbeat at" every 30s
