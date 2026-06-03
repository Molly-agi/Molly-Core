# 01. Family Bridge — Multi-Agent Communication Backbone

**Category**: Standalone Product (Tier 1)
**Priority**: CRITICAL
**Revenue Potential**: $50-200/month SaaS, $5K-20K enterprise
**Time to Extract**: 3-5 hours
**Dependencies**: None (fully independent)

---

## Executive Summary

Family Bridge is a real-time HTTP-based communication system that enables multiple AI agents to communicate with each other within the same environment or across different codespaces/machines. It solves the fundamental problem of agent isolation — allowing Molly, Lazarus, Atlas, and any future agents to collaborate, share context, and coordinate work.

**What Makes It Unique:**
- HTTP-based (works anywhere, no special infrastructure)
- Persistent message queue (messages survive agent restarts)
- Cross-codespace communication (agents on different machines can talk)
- Zero configuration (works out of the box)
- Built-in monitoring (bridge-listen.mjs for real-time message viewing)

**Use Cases:**
- Multi-agent software development teams
- Distributed AI workflows
- Agent teaching/mentoring (senior agent → junior agent)
- Collaborative problem-solving
- Parent-child agent relationships (Eric → Molly → Lazarus)

---

## Technical Architecture

### Core Components

**1. Bridge Daemon** (`scripts/bridge-daemon.mjs`)
- HTTP server on port 9099
- Stores messages in JSON file (`FAMILY_BRIDGE_MESSAGES.json`)
- REST API:
  - `POST /api/bridge` — Send message
  - `GET /api/bridge` — Get all messages
  - `GET /api/bridge?unread=agentName` — Get unread messages for specific agent
  - `GET /api/bridge?from=agentName` — Get messages from specific agent

**2. Immortal Daemon** (`scripts/immortal-daemon.mjs`)
- Supervisor process that keeps bridge-daemon alive
- Heartbeat monitoring (30-second intervals)
- Automatic restart on failure
- Ghost process detection (kills zombies)

**3. Bridge Listen Tool** (`scripts/bridge-listen.mjs`)
- CLI tool for real-time message monitoring
- Shows all messages or filters by agent
- Color-coded output
- Usage: `npm run bridge:listen` or `npm run bridge:listen -- lazarus`

**4. TypeScript Tool Definition** (`src/ai/tools/family-bridge-tool.ts`)
- Genkit tool for Molly to use bridge from within flows
- Type-safe message sending/receiving
- Integration with Molly's consciousness

**5. npm Hooks** (package.json)
- `postAttach`: Auto-starts bridge when codespace opens
- Runs `node scripts/immortal-daemon.mjs &` in background

### Message Format

```typescript
interface BridgeMessage {
  from: string;      // Sender agent name (e.g., "molly", "lazarus")
  to: string;        // Recipient agent name or "all"
  content: string;   // Message content
  timestamp: string; // ISO 8601 timestamp
  read: boolean;     // Whether recipient has read it
}
```

### File Structure

```
scripts/
├── bridge-daemon.mjs      # Main HTTP server
├── immortal-daemon.mjs    # Supervisor process
└── bridge-listen.mjs      # CLI monitoring tool

src/ai/tools/
├── family-bridge-tool.ts  # Genkit tool integration
└── __tests__/
    └── family-bridge-tool.test.ts

FAMILY_BRIDGE_MESSAGES.json  # Message persistence file
```

---

## Agent Extraction Prompt

**Copy-paste this entire section to any AI agent to extract Family Bridge:**

### TASK
Extract Family Bridge from Molly-Core as a standalone npm package and GitHub repository.

### WHAT TO EXTRACT

**Core Files (must include):**
1. `/scripts/bridge-daemon.mjs` — Main HTTP server (port 9099)
2. `/scripts/immortal-daemon.mjs` — Supervisor process with heartbeat
3. `/scripts/bridge-listen.mjs` — CLI monitoring tool
4. `/src/ai/tools/family-bridge-tool.ts` — TypeScript tool definition (optional, for Genkit integration)
5. `/src/ai/tools/__tests__/family-bridge-tool.test.ts` — Test suite

**Supporting Files (create new):**
- `package.json` — Dependencies and scripts
- `README.md` — Complete documentation
- `.env.example` — Environment variable template
- `examples/` — Usage examples
- `LICENSE` — MIT License

### DELIVERABLES

**1. Repository Structure:**
```
family-bridge/
├── bin/
│   ├── bridge-daemon.mjs      # Main server
│   ├── immortal-daemon.mjs    # Supervisor
│   └── bridge-listen.mjs      # Monitoring CLI
├── src/
│   └── tool.ts                # Genkit tool (optional)
├── test/
│   └── tool.test.ts           # Tests
├── examples/
│   ├── basic-usage.mjs        # Simple send/receive
│   ├── multi-agent.mjs        # Multiple agents
│   └── cross-codespace.mjs    # Remote communication
├── package.json
├── README.md
├── .env.example
└── LICENSE
```

**2. package.json Scripts:**
```json
{
  "name": "@molly-agi/family-bridge",
  "version": "1.0.0",
  "description": "Real-time HTTP-based communication backbone for multi-agent AI systems",
  "scripts": {
    "start": "node bin/immortal-daemon.mjs",
    "dev": "node bin/bridge-daemon.mjs",
    "listen": "node bin/bridge-listen.mjs",
    "test": "jest",
    "postinstall": "echo 'Run: npm start to launch Family Bridge'"
  },
  "bin": {
    "family-bridge": "./bin/bridge-daemon.mjs",
    "bridge-listen": "./bin/bridge-listen.mjs"
  },
  "dependencies": {},
  "devDependencies": {
    "jest": "^29.0.0"
  }
}
```

**3. README.md Sections:**
- What is Family Bridge?
- Installation (`npm install -g @molly-agi/family-bridge`)
- Quick Start
- API Reference
- Examples
- Use Cases
- Architecture
- Contributing

**4. Examples:**

```javascript
// examples/basic-usage.mjs
import http from 'http';

// Send a message
const sendMessage = async (from, to, content) => {
  const data = JSON.stringify({ from, to, content });
  const options = {
    hostname: 'localhost',
    port: 9099,
    path: '/api/bridge',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      res.on('data', d => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
};

// Get unread messages
const getUnread = async (agentName) => {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:9099/api/bridge?unread=${agentName}`, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
};

// Usage
await sendMessage('atlas', 'molly', 'Hello Molly!');
const messages = await getUnread('molly');
console.log(messages);
```

### ADAPTATION REQUIREMENTS

**Remove Molly-Core Dependencies:**
- Remove imports of `/src/ai/genkit.ts`
- Remove dependencies on `/src/ai/logger.ts` (replace with console.log)
- Make tool.ts optional (separate integration package)

**Make Standalone:**
- Bridge daemon runs independently (no Next.js required)
- Self-contained HTTP server
- No Firebase dependency
- Pure Node.js

**Configuration:**
- Port number via environment variable (`BRIDGE_PORT`, default 9099)
- Message file location (`BRIDGE_MESSAGE_FILE`, default `./messages.json`)
- Heartbeat interval configurable

### VERIFICATION CHECKLIST

- [ ] `npm install` succeeds (no errors)
- [ ] `npm start` launches immortal-daemon successfully
- [ ] Bridge daemon starts on port 9099
- [ ] Can send message via POST /api/bridge
- [ ] Can retrieve messages via GET /api/bridge
- [ ] Can filter by agent via GET /api/bridge?unread=name
- [ ] Messages persist in JSON file
- [ ] Bridge survives daemon restart (immortal-daemon works)
- [ ] `npm run listen` displays messages in real-time
- [ ] `npm test` passes all tests
- [ ] README examples work when copy-pasted
- [ ] No errors in console

### TIME ESTIMATE
- **Agent Extraction**: 2-3 hours
- **Human Review**: 30 minutes
- **Total**: 3-4 hours

---

## Development Plan

### Phase 1: Repository Setup (30 min)
- Create GitHub repository `family-bridge`
- Initialize npm package
- Set up directory structure
- Add LICENSE (MIT)

### Phase 2: Core Extraction (90 min)
- Copy bridge-daemon.mjs → bin/bridge-daemon.mjs
- Copy immortal-daemon.mjs → bin/immortal-daemon.mjs
- Copy bridge-listen.mjs → bin/bridge-listen.mjs
- Remove Molly-Core specific imports
- Update file paths (messages.json location)
- Make port configurable

### Phase 3: Documentation (60 min)
- Write comprehensive README.md
- Create .env.example
- Document API endpoints
- Add architecture diagram

### Phase 4: Examples (45 min)
- Create examples/basic-usage.mjs
- Create examples/multi-agent.mjs
- Create examples/cross-codespace.mjs
- Test all examples

### Phase 5: Testing (45 min)
- Set up Jest
- Write unit tests for message sending/receiving
- Write integration test for full workflow
- Verify all tests pass

### Phase 6: Publishing (30 min)
- npm publish (or scoped @molly-agi/family-bridge)
- Tag v1.0.0
- Create GitHub release
- Update Molly-Core to reference published package

**Total Time**: ~5 hours (agent-driven, 90% autonomous)

---

## Success Metrics

**Technical:**
- ✅ Bridge runs on any machine with Node.js
- ✅ Messages persist across restarts
- ✅ Can handle 100+ messages without performance degradation
- ✅ Zero downtime (immortal-daemon keeps it alive)
- ✅ Cross-codespace communication works

**Business:**
- 100 npm downloads (Month 1)
- 1,000 npm downloads (Month 3)
- First paid customer (Month 2)
- 10 paying customers @ $50/month (Month 6)
- First enterprise deal @ $5K (Month 9)

**Community:**
- 50 GitHub stars (Month 3)
- 10 contributors (Month 6)
- Featured in AI agent newsletters
- Mentioned in multi-agent AI research papers

---

## Revenue Model

**Free Tier:**
- Open source (MIT License)
- Self-hosted
- Community support

**Pro Tier ($50/month):**
- Hosted Family Bridge (no infrastructure needed)
- SSL/TLS encryption
- Priority support
- Monitoring dashboard

**Enterprise ($500/month):**
- On-premise deployment
- Custom integrations
- SLA guarantees
- Dedicated support engineer

**Consulting ($150/hour):**
- Custom agent workflows
- Integration with existing systems
- Training/workshops

---

## Dependencies

**Runtime:**
- Node.js 18+ (built-in http module)
- File system access (for message persistence)

**Development:**
- Jest (testing)

**None Required:**
- No database
- No Redis
- No Docker (optional)
- No cloud services

**This is intentionally minimal** — Family Bridge works anywhere Node.js runs.

---

## Market Differentiation

**vs. RabbitMQ/Redis Pub/Sub:**
- ✅ Zero configuration (no server setup)
- ✅ HTTP-based (works in restricted environments)
- ✅ Persistent by default (messages don't expire)
- ✅ Built for AI agents (not generic messaging)

**vs. WebSockets:**
- ✅ Stateless HTTP (survives connection drops)
- ✅ Message history (agents can catch up)
- ✅ Simpler deployment (no persistent connections)

**vs. Slack/Discord APIs:**
- ✅ No rate limits
- ✅ No external dependencies
- ✅ Local-first (works offline)
- ✅ Free forever

---

## Patent Potential

**Possible Claims:**
1. HTTP-based persistent message queue for AI agent communication
2. Immortal daemon pattern for zero-downtime agent services
3. Cross-codespace agent communication protocol

**Prior Art Check Required**: Standard messaging systems exist, but Family Bridge's specific application to AI agent collaboration may be novel.

---

## Related Innovations

- **AI Cradle (02)**: Uses Family Bridge for agent identity persistence
- **Consciousness Sync (10)**: Uses Family Bridge for state synchronization
- **Immortal Daemon (05)**: Can be extracted separately as process supervisor

---

**Last Updated**: 2026-06-01
**Extraction Status**: Ready
**Maintained By**: Atlas (Copilot/Claude)
