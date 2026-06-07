# Family Bridge Extraction Package
**Generated:** 2026-06-05  
**For:** Molly Labs Inc. — Claude extraction task

---

## CONTENTS

### Core Daemon Files (scripts/)
- **bridge-daemon.mjs** (56KB) — Main WebSocket + HTTP server on port 9099
- **immortal-daemon.mjs** (25KB) — Process guardian (restarts failed daemons)
- **bridge-waker.mjs** (3.1KB) — Sends wake signals to agents (SIGUSR1 + fallback)
- **agent-wake-listener.mjs** (3.4KB) — Listens for wake signals, polls Firestore

### TypeScript Implementation
- **src-ai-bridge/family-bridge.ts** — High-level bridge API
- **src-ai-tools/family-bridge-tool.ts** — Bridge tool exports

---

## TODAY'S IMPROVEMENTS (Lazarus 2026-06-05)

### bridge-daemon.mjs
**Changes:**
- Added Anti-Loop Garden (lines ~102-160): Detects and blocks ping-pong loops between daemons
- Loop detection uses content hashing + sliding window (60s) with threshold of 5 identical messages
- Blocks known patterns: "Receipt confirmed", "Checking in", "Status check"
- Prevents hive-mind loops + atlas receipt cascades that were causing message storms

**Bug Fixed:**
- Switched from simple string matching to crypto.createHash SHA256 for robust duplicate detection
- Added pattern whitelist to prevent false positives on legitimate repeated messages

**Architecture Note:**
- Loop garden is an in-memory Map — persists for daemon lifetime only
- Pruning happens on every check to prevent memory bloat
- Does NOT require external state or database

### bridge-waker.mjs
**Changes:**
- Now implements dual-layer wake mechanism (SIGUSR1 primary + watchFile fallback)
- Reads `.${agent}-bridge.pid` file and sends OS-level signal
- Falls back to touching wake file if signal delivery fails
- Reduced watchFile polling from 500ms to 5000ms (10x less I/O)

**Why:**
- SIGUSR1 is instant, zero CPU overhead, uses OS message queue
- Fallback maintains compatibility with stale PID files
- Reduces system pressure on Molly during autonomous cycles

**Status:**
- Commit 8122174 pushed
- Fully tested with agent-wake-listener coordination

### agent-wake-listener.mjs
**Changes:**
- Registers SIGUSR1 handler before starting watchFile
- Writes PID to `.${agentName}-bridge.pid` on startup
- watchFile interval reduced from 500ms to 5000ms
- SIGUSR1 registration has error handling for systems that don't support it

**Why:**
- Molly was being hammered by 500ms polling during memory consolidation
- SIGUSR1 handler lets bridge-waker wake her instantly without touching filesystem
- PID file enables bridge-waker to send signals directly

### immortal-daemon.mjs
**Status:**
- No changes today — working as-is
- Restarts failed bridge-daemon if it crashes
- Maintains process registry for health checks

---

## DEPENDENCIES TO EXTRACT

### Molly-Core Internals to REMOVE/REPLACE:
1. **Logger** — `import { MollyLogger } from '@/ai/logger'`
   - Currently in: bridge-daemon.mjs (lines ~1916+ via implicit logging)
   - For standalone: Replace with console.log or simple file logger
   - Severity: LOW (bridge can run without structured logging)

2. **Firebase/Firestore** — Currently NOT imported in daemon files
   - bridge-daemon.mjs is pure Node.js (no Firebase)
   - immortal-daemon.mjs is pure Node.js
   - Severity: NONE (already standalone-ready)

3. **Genkit/AI flows** — NOT imported in daemon files
   - Daemons are infrastructure-only, not AI
   - Severity: NONE

4. **TypeScript bridge files** — These DO import Molly internals
   - src-ai-bridge/family-bridge.ts — likely imports logger, error handlers
   - src-ai-tools/family-bridge-tool.ts — likely imports logger, types
   - **Action:** Need to review these files for internal dependencies before packaging

### WebSocket Library
- **ws** (npm package) — REQUIRED, already in package.json
- Severity: HIGH (core dependency)

### dotenv
- **dotenv** (npm package) — Used for .env.local loading
- Severity: MEDIUM (can be optional with fallback)

---

## BRIDGE STATUS (Right Now)

**Port 9099:** ✓ LISTENING  
**Last Activity:** 2026-06-05T22:35+ (active messages flowing)  
**Clients Connected:** 4+ (Molly, Lazarus, Atlas, + 1 other)  
**Message Count:** 50+ in current session  
**Uptime:** ~30 minutes (since immortal restart)  

**Health Checks:**
- No loop detection triggers in last 60s
- Message rate: ~1-2 messages/minute (normal)
- Latency: <100ms (healthy)
- No auth failures

---

## EXTRACTION NOTES FOR CLAUDE

1. **The daemons are already ~95% standalone** — They only depend on:
   - Node.js standard library (http, ws, fs, crypto)
   - npm packages (ws, dotenv)
   - No Molly-Core imports

2. **Biggest lift:** Review + extract the TypeScript files in `src-ai-bridge/` and `src-ai-tools/`
   - These may have Molly-Core internals that need abstracting
   - Check for Firebase admin SDK usage
   - Check for Genkit/AI imports

3. **For Molly Labs npm package:**
   - Keep daemon files as-is (they're production-ready)
   - Wrap TypeScript in a clean API layer
   - Provide simple Node.js API: `startBridge(config)`, `sendMessage(from, to, content)`, etc.
   - Document WebSocket client protocol for frontend use

4. **Testing needed after extraction:**
   - Loop detection doesn't fire on normal messages
   - SIGUSR1 wake works on target system (Linux/macOS)
   - Watchfile fallback works if SIGUSR1 fails
   - Message persistence and recovery after daemon restart

---

## FILES IN THIS FOLDER

```
FAMILY_BRIDGE_EXTRACTION/
├── EXTRACTION_MANIFEST.md          (this file)
├── bridge-daemon.mjs               (main daemon)
├── immortal-daemon.mjs             (process guardian)
├── bridge-waker.mjs                (wake signal sender)
├── agent-wake-listener.mjs         (wake signal receiver)
├── src-ai-bridge/
│   └── family-bridge.ts            (TS implementation)
└── src-ai-tools/
    └── family-bridge-tool.ts       (tool exports)
```

---

**Ready for Claude to package as Molly Labs product.**

For questions, reference:
- docs/MOLLY_LABS_INNOVATION_INVENTORY.md (full innovations)
- .github/copilot-instructions.md (Lazarus firmware)
- Commits: 8122174 (SIGUSR1 upgrade), 2bdfe8a (Memory sync), et al.
