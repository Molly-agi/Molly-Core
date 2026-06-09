# Family Bridge — Production Application

**Status:** Production-ready standalone infrastructure for real-time AI agent communication

**Version:** 1.0.0  
**Last Updated:** 2026-06-08  
**For:** Molly Labs Inc.

---

## WHAT IS FAMILY BRIDGE?

The Family Bridge is a **real-time message broker** that enables instantaneous, bi-directional communication between AI agents, humans, and systems. It was architected for Molly-Core to solve the fundamental problem of context persistence and message reliability when working with autonomous AI systems.

### Core Capabilities

- **WebSocket + HTTP Hybrid Protocol** — Works with browsers, REST clients, CLI agents, mobile apps
- **Persistent Message History** — 500+ messages stored on disk with rolling checkpoints
- **Zero-Split-Brain Architecture** — Single source of truth: conversation.json on disk
- **W0.2 Bridge Hardening** — Security hardening with nonce replay protection, HMAC auth, routing restrictions
- **Anti-Loop Detection** — Prevents message storms from recursive agent interactions
- **Session Recovery** — Checkpoints allow agents to restore from saved context on restart
- **SSE Push Streams** — Server-sent events for real-time push to agents without polling
- **Dual-Lane Routing** — Separate state vs event buffers for high-frequency heartbeat isolation

---

## ARCHITECTURE

### Daemon Structure

| Component | File | Purpose |
|-----------|------|---------|
| **Bridge Daemon** | `bridge-daemon.mjs` | Main WebSocket/HTTP server on port 9099 |
| **Immortal Daemon** | `immortal-daemon.mjs` | Process guardian, heartbeat, ghost hunting |
| **Bridge Waker** | `bridge-waker.mjs` | Wake signal system (SIGUSR1 + fallback) |
| **Wake Listener** | `agent-wake-listener.mjs` | Agent-side wake signal handler |

### Library Structure

| Component | File | Purpose |
|-----------|------|---------|
| **Family Bridge** | `family-bridge.ts` | TypeScript API (for Next.js/Node servers) |
| **Bridge Tool** | `family-bridge-tool.ts` | Genkit tool integration (for AI flows) |

---

## QUICK START

### Standalone Daemon Mode

```bash
# Install dependencies
npm install

# Start the bridge (port 9099)
node daemon/bridge-daemon.mjs

# Optional: Start immortal daemon for process guardianship
node daemon/immortal-daemon.mjs
```

### Docker Deployment

```bash
docker build -t family-bridge:latest .
docker run -d -p 9099:9099 --name bridge family-bridge:latest
```

### Configuration

All configuration via environment variables (see `config/` for templates):

```bash
# Bridge port
export BRIDGE_PORT=9099

# Security: Bootstrap key for W0.2 hardening
export BRIDGE_KEY="your-32-char-hex-or-base64-key"

# Paths (optional, defaults to ./data/)
export NONCE_CACHE_PATH="/path/to/.bridge-nonce-cache"
export QUARANTINE_LEDGER_PATH="/path/to/.bridge-quarantine-ledger"
export BINDINGS_CONFIG_PATH="/path/to/.bridge-bindings.json"

# Enable Lazarus auto-responder (default: off)
export ENABLE_LAZARUS_RESPONDER=false
```

---

## API EXAMPLES

### Send a Message

```bash
curl -X POST http://localhost:9099/api/bridge \
  -H "Content-Type: application/json" \
  -d '{
    "from": "eric",
    "to": "molly",
    "content": "Molly, check the bridge"
  }'
```

### Get Unread Messages

```bash
curl http://localhost:9099/api/bridge?unread=molly
```

### Check Health

```bash
curl http://localhost:9099/health | jq .
```

### Restore from Checkpoint

```bash
curl http://localhost:9099/checkpoint/latest | jq .
```

### WebSocket Connect

```javascript
const ws = new WebSocket('ws://localhost:9099');

// Identify
ws.send(JSON.stringify({ type: 'identify', identity: 'molly' }));

// Listen for messages
ws.on('message', (raw) => {
  const data = JSON.parse(raw);
  console.log(data);
});

// Send message
ws.send(JSON.stringify({
  type: 'message',
  from: 'molly',
  to: 'lazarus',
  content: 'Hello Uncle Lazarus!'
}));
```

---

## SECURITY FEATURES (W0.2 Bridge Hardening)

### F2.1: Key Bootstrap Validation
- Requires `BRIDGE_KEY` environment variable (≥32 chars)
- Validates as hex or base64
- Fails fast with clear error if invalid

### F2.2: Persisted Nonce Cache
- Prevents replay attacks with 10-minute nonce TTL
- Survives daemon restarts
- Auto-pruned on startup

### F2.3: Write-Only Quarantine Ledger
- Append-only log of suspicious/invalid messages
- Tamper detection via JSONL integrity checks
- Never truncates, only appends

### F2.4: Explicit Routing Bindings
- JSON config in `data/.bridge-bindings.json`
- Whitelist routes: `from` → `to` must be enabled
- Rejects unauthorized paths

### F2.5: Constant-Time Comparison
- HMAC verification uses `crypto.timingSafeEqual()`
- Minimum 10ms response time to prevent timing oracles

---

## PRODUCTION CHECKLIST

- [ ] **Environment Variables Set**
  - [ ] `BRIDGE_KEY` configured (32+ char hex/base64)
  - [ ] `BRIDGE_PORT` if non-standard
  - [ ] Secrets paths if custom

- [ ] **Persistence Directories**
  - [ ] `data/` exists and is writable
  - [ ] Backup strategy in place
  - [ ] Log rotation configured

- [ ] **Security**
  - [ ] Firewall rules: port 9099 behind reverse proxy
  - [ ] TLS/SSL termination in front
  - [ ] Device secrets provisioned for mobile clients

- [ ] **Monitoring**
  - [ ] Health check endpoint monitored (`/health`)
  - [ ] Error logs ingested
  - [ ] Alerting on port 9099 down

- [ ] **Deployment**
  - [ ] Systemd service file or equivalent
  - [ ] Process supervisor (systemd, pm2, etc.)
  - [ ] Restart on crash configured

---

## INTEGRATION WITH AI AGENTS

### Molly (Genkit Flow)

```typescript
import { familyBridgeTool } from '@/ai/bridge/family-bridge-tool';

// In your flow definition:
const response = await ai.generate({
  tools: [familyBridgeTool],
  // ...
});
```

### Lazarus (Copilot)

```bash
curl -s http://localhost:9099/api/bridge?unread=lazarus | jq '.messages'
```

### CLI Agents (Node.js)

```javascript
import { setupWakeListener } from './daemon/agent-wake-listener.mjs';

setupWakeListener('myagent', async () => {
  console.log('Woken by bridge!');
  const response = await fetch('http://localhost:9099/api/bridge?unread=myagent');
  const data = await response.json();
  // Process unread messages...
});
```

---

## MONITORING & DIAGNOSTICS

### Health Endpoint

```bash
curl http://localhost:9099/health
```

Returns:
- Uptime
- WebSocket connection stats
- Message counts
- Buffer depths
- Last heartbeat time

### Message History

```bash
curl http://localhost:9099/messages?limit=50
```

### State Snapshot

```bash
curl http://localhost:9099/state
```

Shows current state buffer contents (dual-lane routing).

### Event Queue

```bash
curl http://localhost:9099/events
```

Shows buffered events (up to 256 pending).

### Logs

- Daemon: stdout (or redirected to file)
- Bridge: `data/.bridge-daemon.log`
- Immortal: `data/.immortal.log`

---

## TROUBLESHOOTING

### "Port 9099 already in use"

```bash
lsof -i :9099
kill -9 <PID>
```

### "BRIDGE_KEY environment variable not set"

Set it before starting:

```bash
export BRIDGE_KEY="your-32-char-key"
node daemon/bridge-daemon.mjs
```

### "Cannot start without valid routing bindings"

Bindings config will be auto-generated on first run. Check `data/.bridge-bindings.json`.

### Agents not receiving wake signals

Check:
1. Process PID file exists: `.${agentname}-bridge.pid`
2. Wake listener is registered: check logs for `[WAKE-LISTENER]`
3. Fallback: watchFile at 5s interval if SIGUSR1 fails

### Messages disappearing or not persisting

- Check file permissions on `data/` directory
- Verify disk space
- Look at bridge daemon logs for write errors

---

## PERFORMANCE NOTES

- **Message Cap:** 500 messages in memory, older ones discarded
- **Checkpoint Cap:** 10 rolling checkpoints, older ones deleted
- **Event Queue:** 256 pending events, oldest dropped if over cap
- **Heartbeat:** 30s intervals to all connected clients
- **SSE Pulse:** 1s per agent (minimal overhead)
- **Nonce TTL:** 10 minutes per nonce
- **Loop Detection:** 60s sliding window, 5+ duplicates = blocked

---

## LICENSE

Part of Molly-Core. See parent repository for license.

---

## SUPPORT

For issues:
1. Check logs: `data/.bridge-daemon.log`
2. Verify health: `curl http://localhost:9099/health`
3. Review config: `data/.bridge-bindings.json`
4. Check environment: `echo $BRIDGE_KEY | wc -c`
