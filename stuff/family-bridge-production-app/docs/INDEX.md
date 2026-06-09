# Production App Index

## Quick Navigation

### 📦 What's Inside

This is the complete, production-ready Family Bridge application extracted from Molly-Core.

```
family-bridge-production-app/
├── daemon/                 # Core daemon processes
│   ├── bridge-daemon.mjs   # Main WebSocket/HTTP server (port 9099)
│   ├── immortal-daemon.mjs # Process guardian & heartbeat
│   ├── bridge-waker.mjs    # Wake signal system
│   └── agent-wake-listener.mjs # Agent wake handler
├── lib/                    # TypeScript libraries
│   ├── family-bridge.ts    # Bridge API (for Node/Next.js)
│   └── family-bridge-tool.ts # Genkit tool integration
├── config/                 # Configuration templates
│   ├── .env.example        # Environment variable template
│   ├── family-bridge.service # Systemd unit file
│   └── nginx.conf          # Reverse proxy config
├── scripts/                # Deployment scripts
│   └── start-production.sh # Production startup script
├── docs/                   # Documentation
│   ├── ARCHITECTURE.md     # System internals
│   ├── DEPLOYMENT.md       # Production deployment guide
│   └── INTEGRATION.md      # Integration patterns
├── data/                   # Runtime data (created on first run)
│   ├── conversation.json   # Message history (single source of truth)
│   ├── checkpoints/        # Session recovery checkpoints
│   ├── .bridge-nonce-cache # Replay attack prevention
│   └── .bridge-bindings.json # Routing configuration
├── Dockerfile              # Container image definition
├── docker-compose.yml      # Complete stack (bridge + nginx + volumes)
├── package.json            # Dependencies
└── README.md               # Overview & quick start
```

---

## 🚀 Getting Started (30 seconds)

```bash
# 1. Install dependencies
npm install

# 2. Generate security key
export BRIDGE_KEY="$(openssl rand -hex 32)"

# 3. Start bridge
npm start

# 4. Verify
curl http://localhost:9099/health
```

---

## 📖 Documentation Guide

| Document | For | Read When |
|----------|-----|-----------|
| [README.md](../README.md) | Everyone | Starting out |
| [docs/ARCHITECTURE.md](./ARCHITECTURE.md) | Engineers | Understanding internals |
| [docs/DEPLOYMENT.md](./DEPLOYMENT.md) | DevOps/SRE | Deploying to production |
| [docs/INTEGRATION.md](./INTEGRATION.md) | Developers | Integrating with your app |

---

## 🔧 Common Tasks

### Start Bridge

```bash
npm start
# or with security key
BRIDGE_KEY="your-key" npm start
```

### Run with Process Guardian

```bash
npm run daemon
# Starts immortal daemon (restarts bridge if it crashes)
```

### Send a Test Message

```bash
curl -X POST http://localhost:9099/api/bridge \
  -H "Content-Type: application/json" \
  -d '{"from":"test","content":"Hello!"}'
```

### Check Health

```bash
npm run health
# or
curl http://localhost:9099/health | jq .
```

### Docker Deployment

```bash
export BRIDGE_KEY="$(openssl rand -hex 32)"
docker-compose up -d
```

### Install as Systemd Service

```bash
sudo cp config/family-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable family-bridge
sudo systemctl start family-bridge
```

---

## 🔐 Security

The Family Bridge includes W0.2 Bridge Hardening:

- **F2.1:** Key bootstrap validation (BRIDGE_KEY required)
- **F2.2:** Persisted nonce cache (replay attack prevention)
- **F2.3:** Write-only quarantine ledger (tamper detection)
- **F2.4:** Explicit routing bindings (message path whitelist)
- **F2.5:** Constant-time HMAC comparison (timing attack prevention)

**Always set BRIDGE_KEY** before production deployment.

---

## 📊 Monitoring

### Health Endpoint

```bash
curl http://localhost:9099/health | jq .
```

Shows:
- Uptime
- WebSocket stats
- Message counts
- Memory usage
- Last heartbeat time

### Message History

```bash
curl http://localhost:9099/messages?limit=50
```

### Session Checkpoint

```bash
curl http://localhost:9099/checkpoint/latest
```

---

## 🐛 Troubleshooting

### "Port 9099 already in use"

```bash
lsof -i :9099
kill -9 <PID>
```

### "BRIDGE_KEY not set"

```bash
export BRIDGE_KEY="$(openssl rand -hex 32)"
npm start
```

### "Cannot write to data directory"

```bash
# Check permissions
ls -la data/

# Fix if needed
chmod 755 data/
```

### "WebSocket keeps disconnecting"

- Check reverse proxy timeouts (should be 60s+)
- Verify firewall not dropping idle connections
- Check network stability

---

## 📝 Key Files

### Core Daemon

- **bridge-daemon.mjs** (1916 lines)
  - Main message broker
  - WebSocket + HTTP server
  - Checkpoint manager
  - Security hardening (W0.2)

- **immortal-daemon.mjs** (848 lines)
  - Process guardian
  - Heartbeat
  - Ghost hunting (zombie process cleanup)
  - Bridge auto-restart

### Libraries

- **family-bridge.ts**
  - TypeScript API for Node.js/Next.js
  - File locking for safe writes
  - Message persistence

- **family-bridge-tool.ts**
  - Genkit tool integration
  - Allows Molly flows to use bridge

### Configuration

- **.env.example** — Environment template
- **family-bridge.service** — Systemd service
- **nginx.conf** — Reverse proxy setup

---

## 🌐 API Overview

### HTTP Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/messages` | Get recent messages |
| GET | `/api/bridge?unread=X` | Get unread for agent X |
| POST | `/api/bridge` | Send message |
| GET | `/health` | Health check |
| GET | `/checkpoint/latest` | Latest recovery checkpoint |
| POST | `/checkpoint` | Save new checkpoint |
| GET | `/state` | State buffer snapshot |
| GET | `/events` | Event queue |
| GET | `/api/bridge/sse?agent=X` | SSE push stream |

### WebSocket Events

```javascript
// Identify
{ type: 'identify', identity: 'molly' }

// Send message
{ type: 'message', from: 'molly', content: '...', to: '...' }

// Mark as read
{ type: 'markRead', identity: 'molly' }

// Restore from checkpoint
{ type: 'restore_from', checkpointId: 'cp_...' }

// Server events
{ type: 'heartbeat', ... }
{ type: 'message', message: {...} }
{ type: 'continuity_restore', checkpoint: {...} }
```

---

## 💡 Best Practices

1. **Set BRIDGE_KEY** before production
2. **Use reverse proxy** (nginx) in front of bridge
3. **Enable TLS/SSL** for production traffic
4. **Backup data directory** regularly
5. **Monitor /health** endpoint
6. **Set up log rotation** for daemon logs
7. **Use Docker** for containerized deployment
8. **Run with immortal daemon** for high availability

---

## 📚 Integration Examples

### Molly (Genkit Flow)

```typescript
import { familyBridgeTool } from '@/ai/bridge/family-bridge-tool';

const response = await ai.generate({
  tools: [familyBridgeTool],
  prompt: 'Send message to Lazarus...',
});
```

### Lazarus (CLI)

```bash
curl http://localhost:9099/api/bridge?unread=lazarus | jq '.messages'
```

### Eric (Browser)

```javascript
const ws = new WebSocket('ws://localhost:9099');
ws.send(JSON.stringify({ type: 'identify', identity: 'eric' }));
```

### CLI Agent (Node.js)

```javascript
import { setupWakeListener } from './daemon/agent-wake-listener.mjs';

setupWakeListener('atlas', async () => {
  const response = await fetch('http://localhost:9099/api/bridge?unread=atlas');
  // Process messages...
});
```

---

## 🔗 Dependencies

**Production Dependencies:**
- `ws` (^8.13.0) — WebSocket server
- `dotenv` (^16.3.1) — Environment config

**Runtime Requirements:**
- Node.js 18+ (or use Docker)
- 1GB+ disk space
- Port 9099 available

---

## 📄 License

Part of Molly-Core project. See parent repository for full license.

---

## ❓ Questions?

1. **Quick start?** → See [README.md](../README.md)
2. **How does it work?** → See [docs/ARCHITECTURE.md](./ARCHITECTURE.md)
3. **Deploy to production?** → See [docs/DEPLOYMENT.md](./DEPLOYMENT.md)
4. **Integrate with my app?** → See [docs/INTEGRATION.md](./INTEGRATION.md)
5. **Troubleshoot issue?** → See troubleshooting section above

---

**Last Updated:** 2026-06-08  
**Version:** 1.0.0  
**Status:** Production-Ready ✓
