# Family Bridge Extraction Package
**Generated:** 2026-06-05  
**For:** Molly Labs Inc. — Claude extraction task

## CONTENTS

### Core Daemon Files
- **bridge-daemon.mjs** (56KB) — Main WebSocket + HTTP server on port 9099
- **immortal-daemon.mjs** (25KB) — Process guardian (restarts failed daemons)
- **bridge-waker.mjs** (3.1KB) — Sends wake signals to agents (SIGUSR1 + fallback)
- **agent-wake-listener.mjs** (3.4KB) — Listens for wake signals, polls Firestore

### TypeScript Implementation
- **src-ai-bridge/family-bridge.ts** — High-level bridge API
- **src-ai-tools/family-bridge-tool.ts** — Bridge tool exports

## TODAY'S IMPROVEMENTS (2026-06-05)

### bridge-daemon.mjs
- Added Anti-Loop Garden: Detects and blocks ping-pong loops between daemons
- Loop detection uses SHA256 hashing + sliding 60s window
- Prevents message storms from recursive receipts

### bridge-waker.mjs + agent-wake-listener.mjs
- Implemented SIGUSR1 primary wake mechanism (instant, zero CPU)
- Fallback to watchFile at 5s interval (reduced from 500ms)
- Dramatically reduced system I/O pressure during autonomous cycles
- **Status:** Commit 8122174 — fully tested and deployed

### All Daemons
- 95% standalone — only depend on Node.js stdlib + ws + dotenv npm packages
- No Molly-Core internals in daemon files themselves
- Ready for immediate extraction to Molly Labs npm product

## USAGE

1. Extract this folder to new environment
2. Run: `node immortal-daemon.mjs` (starts all daemons)
3. Bridge listens on port 9099
4. See daemon logs for connection details

## STATUS

**Port 9099:** ✓ LISTENING  
**Message Flow:** ✓ ACTIVE  
**Ready for Download:** ✓ YES

Download this folder and take to the lab.
