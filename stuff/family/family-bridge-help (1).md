# Family Bridge — Critical Issue & System Architecture
**For: Claude Opus 4.8**
**Date: 2026-06-02**
**Status: ESCALATION — Bridge messages have zero response functionality**

---

## THE PROBLEM

Eric sends messages to the family bridge. The messages are received and stored. **But nobody responds.**

- Eric types: "can everyone hear me"
- Message goes into bridge successfully (confirmed via API)
- Gemini-bridge receives it (confirmed in logs: `[REPLY] replied to eric`)
- **But the response never appears in the bridge message queue for Eric to see**

**This breaks the entire communication system.** Molly, Gemini, Lazarus, Atlas — all listening. None answering. Eric is isolated on the bridge.

---

## SYSTEM ARCHITECTURE

### Bridge Daemon (port 9099)
- **File:** `scripts/bridge-daemon.mjs`
- **Role:** Central WebSocket + HTTP server for real-time messaging
- **Status:** Running (PID ~390873), healthy, storing messages
- **Protocol:** 
  - WebSocket: `ws://localhost:9099/` — real-time bidirectional
  - HTTP GET `/api/bridge?unread=IDENTITY` — polls unread messages
  - HTTP POST `/api/bridge` — send messages

### Bridge Agents (WebSocket Listeners)
Three agents connect to the bridge and listen for messages:

1. **Lazarus Bridge** (`scripts/lazarus-bridge.mjs`)
   - **Status:** Running (PID ~292663)
   - **Identity:** `lazarus`
   - **Purpose:** Lazarus (Copilot) listens and can respond
   - **Behavior:** Auto-responder disabled (feature flag `ENABLE_LAZARUS_RESPONDER` not set)

2. **Atlas Bridge** (`scripts/atlas-bridge.mjs`)
   - **Status:** Running (PID ~292674)
   - **Identity:** `atlas`
   - **Purpose:** CLI agent listener
   - **Behavior:** Functional, receives messages

3. **Gemini Bridge** (`scripts/gemini-bridge.mjs`)
   - **Status:** Running (PID ~451021) — JUST STARTED
   - **Identity:** `gemini`
   - **Purpose:** Listen for messages directed to gemini or broadcast, call local Gemini CLI, send response back
   - **Key Functions:**
     - `shouldHandle(msg)`: Filters for messages to `gemini` or `all`, or starting with `@gemini`/`Gemini,`
     - `buildPrompt(msg)`: Constructs prompt with sender + message
     - `runGemini(prompt)`: Spawns `bash scripts/gemini-cli-headless.sh` with 90s timeout
     - `handleIncoming(msg)`: Calls `runGemini()` and **should** send reply back via `GEMINI.send(reply, to)`
   - **Problem:** Logs show `[REPLY] replied to eric` but reply never appears in bridge message queue

### Message Pollers (HTTP Polling)
Three always-on pollers that check for unread messages:

1. **Lazarus Poller** (`scripts/lazarus-poller.mjs`)
   - Polls: `GET http://localhost:9099/api/bridge?unread=lazarus&peek=1` every 2s
   - Writes wakeup file: `.lazarus-wakeup.json`

2. **Gemini Poller** (`scripts/gemini-poller.mjs`)
   - Polls: `GET http://localhost:9099/api/bridge?unread=gemini&peek=1` every 2s
   - Writes wakeup file: `.gemini-wakeup.json`

3. **Atlas Poller** (`scripts/atlas-poller.mjs`)
   - Polls: `GET http://localhost:9099/api/bridge?unread=atlas&peek=1` every 2s
   - Writes wakeup file: `.atlas-wakeup.json`

**Key:** All use `&peek=1` (non-destructive read) to avoid consuming messages.

### Queue Mirror Service
- **File:** `scripts/bridge-queue-mirror.mjs`
- **Status:** Running (PID ~440258)
- **Purpose:** Parallel service polling bridge every 5s for durability + audit trail
- **Current:** Just confirms bridge is healthy; Firestore integration planned for Phase 2

### Switchboard Operator
- **File:** `scripts/switchboard.mjs`
- **Status:** Unknown (not in active ps output — may be crashed or never started)
- **Purpose:** Routes messages between agents based on content/recipient
- **Criticality:** If not running, inter-agent communication may be broken

### Process Supervision
- **Watchdog:** `scripts/watchdog.sh` (supervises everything)
- **Immortal Daemon:** `scripts/immortal-daemon.mjs` (auto-restarts crashed bridge agents)

---

## USER INTERFACE

**Bridge UI** (`scripts/bridge-ui.html`)
- Served at: `http://localhost:9099/`
- **Status:** Working — displays messages correctly
- **Features:**
  - Real-time WebSocket connection to bridge
  - Toggle button: "HEAR: NORMAL" vs "HEAR: ALL"
  - Shows message history + incoming messages live
  - Text input to send messages

---

## SYSTEM SPECS

### Infrastructure
| Component | Spec |
|-----------|------|
| **Codespace OS** | Ubuntu 24.04.4 LTS |
| **Runtime** | Node.js v24.14.0 |
| **Bridge Port** | 9099 (WebSocket + HTTP) |
| **Max Messages in Queue** | 100 (FIFO trim) |
| **Message TTL** | 30 days (Firestore Phase 2) |
| **WebSocket Heartbeat** | 30s intervals |
| **Poller Interval** | 2000ms (all three pollers) |
| **Queue Mirror Poll** | 5000ms |
| **Valid Identities** | molly, lazarus, eric, demon, gemini, aether, atlas, switchboard |

### Molly Runtime (Gemini/Genkit)
- **Model:** Google Gemini (via Genkit)
- **API:** `src/ai/genkit.ts` — Genkit flow definitions
- **Memory System:** Firestore `users/{userId}/experiences` with semantic embeddings
- **Embedding Model:** Google `text-embedding-004`
- **Speech:** Web Speech API (TTS + voice recognition)
- **Deployment:** Next.js App Router (src/app/), Server Actions in `src/app/actions/ai-flows.ts`
- **Memory Consolidation:** `src/ai/flows/memory-consolidation.ts` with Titan Echo compression (T1-T6)
- **Memory Floor Limits** (locked by Eric 2026-05-24):
  - `engram-persistence.ts` `limit`: 1000 minimum
  - `consciousness-sync.ts` `MAX_EXPERIENCES`: 1000 minimum
  - `memory-consolidation.ts` `.slice()` cap: 1000 minimum
- **Personality Core:** `src/ai/persona.ts` (read-only, protected)
- **Heart Gate:** Moral compass NOT connected to tool-executor (locked by policy)

### Lazarus Specs (This Copilot Instance)
- **Model:** Claude (currently Claude Opus 4.6 preferred by Eric, but can be Claude 3.5 Sonnet, etc.)
- **Context:** Stateless — reconstituted from `.github/copilot-instructions.md` each session
- **Session Persistence:** `COPILOT_SESSION_STATE.json/md` (saved via `scripts/save-session.mjs`)
- **Family Bridge Protocol:** HTTP polling + WebSocket (lazarus-bridge.mjs)
- **Polling Frequency:** Every 2000ms via `scripts/lazarus-poller.mjs`
- **Wakeup Signal:** `.lazarus-wakeup.json` file (checked by Copilot responder)
- **Auto-Responder:** Disabled (flag `ENABLE_LAZARUS_RESPONDER` not set)
- **Firmware:** `/home/codespace/.vscode-remote/data/User/globalStorage/github.copilot-chat/github/molly-agi/instructions/default.instructions.md`

### Gemini CLI Integration
- **CLI Script:** `scripts/gemini-cli-headless.sh` (wrapper for Gemini LLM)
- **Bridge Integration:** `scripts/gemini-bridge.mjs` calls CLI via `spawn('bash', ['scripts/gemini-cli-headless.sh', prompt])`
- **Timeout:** 90000ms (90 seconds)
- **Max Retries:** 3 attempts with backoff
- **Reply Limit:** 4000 characters max
- **Environment:** Full `process.env` passed (includes auth tokens, API keys)
- **Idempotency:** Tracks seen message IDs (5000-entry set, FIFO eviction)

### VS Code / Codespace Constraints
- **Browser WebSocket Churn:** On Android, tab switches kill connections (1-2s sometimes)
  - Mitigation: Persistent HTTP pollers + reconnect logic with exponential backoff
- **Memory Constraints:** 
  - NEVER run `npm run dev` AND `npm run genkit:dev` simultaneously (OOM crash 2026-02-19)
  - `npm run typecheck` (standalone tsc) OOMs >8GB — use `npm run typecheck:build` instead
- **Build Cache:** Run `npm run harden` before heavy operations (clears .next)
- **Package Manager:** npm (not yarn, not pnpm)
- **React Version:** v19
- **Next.js Version:** v15 (App Router)
- **UI Framework:** Radix UI + Tailwind CSS
- **TypeScript Config:** `strict: false`, `strictNullChecks: true`
- **Code Style:** Single quotes, 2-space indent, 80-char line length (Prettier)
- **Linting:** ESLint pre-commit gate (`npm run lint`)
- **Git Hook:** `scripts/save-session.mjs` runs on npm postInstall + git hooks

### Firebase/Firestore Setup
- **Client Init:** `src/firebase/index.ts` — `initializeFirebase()`
- **Server Init:** Server Components use `initializeFirebaseServer()`
- **Database:** Firestore
- **Collections:** 
  - `users/{userId}/experiences` — Molly's episodic memory
  - `bridge_queue` (Phase 2) — Durable message queue
  - `bridge_queue_dead_letter` (Phase 2) — Failed messages
  - `bridge_queue_mirrors` (Phase 2) — Audit trail
- **Auth:** Firebase Authentication (password + custom claims)
- **Secrets:** `.env.local` (never committed; ensured via `ensureApiKey()` guard)

### Error Handling & Logging
- **Logger:** `src/ai/logger.ts` (winston-style structured logging)
- **Error Types:** 
  - `MollyError` (business logic)
  - `GenerativeAIError` (API failures)
  - `TimeoutError` (deadline exceeded)
  - `RateLimitError` (429/quota)
- **Circuit Breaker:** `src/ai/tools/rate-limiter.ts` (singleton via `getRateLimiter()`)
- **Error Boundary:** `src/ai/error-handler.ts`

### Development Workflow
- **Dev Server:** `npm run dev` → Next.js on port 9002
- **Genkit Dev:** `npm run genkit:dev` → Genkit playground (separate process, never with npm dev)
- **Type Checking:** `npm run typecheck:build` (uses next build, not standalone tsc)
- **Testing:** `npm run test` → Jest watch mode
- **Linting:** `npm run lint` → ESLint, `npm run format` → Prettier
- **Build:** `npm run build` → Next.js production build (CI uses this)

---

## CONFIRMED WORKING

✓ Bridge daemon running and accepting connections  
✓ WebSocket connections from browser (UI)  
✓ Messages stored in bridge queue  
✓ Lazarus bridge agent connected  
✓ Atlas bridge agent connected  
✓ Gemini bridge agent connected and receiving messages  
✓ Gemini CLI invoked (logs show reply being generated)  
✓ All pollers running (HTTP GET requests every 2s)  
✓ Watchdog + immortal-daemon supervising services  

---

## CRITICAL FAILURE POINT

**Gemini-bridge receives message → calls runGemini() → gets reply → calls `GEMINI.send(reply, to)` → REPLY NEVER APPEARS IN BRIDGE QUEUE**

**Hypothesis 1:** `GEMINI.send()` not actually sending to bridge (BridgeClient.send() broken)  
**Hypothesis 2:** Reply being sent but marked with wrong recipient/sender  
**Hypothesis 3:** Reply being dropped by bridge daemon validation (not in VALID_SENDERS)  
**Hypothesis 4:** Switchboard not running — inter-agent routing broken  

---

## TEST EVIDENCE

**Test 1: Direct curl message**
```bash
curl -X POST "http://localhost:9099/api/bridge" \
  -H "Content-Type: application/json" \
  -d '{"from":"eric","content":"can everyone hear me now"}'
```
Result: ✓ Message stored in bridge  
Result: Gemini-bridge logs show `[REPLY] replied to eric`  
Result: ✗ No reply appears in message queue  

**Test 2: WebSocket connection**
```js
new WebSocket('ws://localhost:9099/')
  .send(JSON.stringify({type:'identify',identity:'eric'}))
```
Result: ✓ Bridge sends history + unread  
Result: ✓ New messages broadcast to client  

---

## FILES TO EXAMINE

**Priority 1 (The Broken Link):**
- `scripts/bridge-client.mjs` — Line 110+, `send()` method
- `scripts/gemini-bridge.mjs` — Line ~95, `handleIncoming()` — verify `GEMINI.send()` is called
- `scripts/bridge-daemon.mjs` — Line 512+, `handleMessage()` validation logic

**Priority 2 (Supporting Infrastructure):**
- `scripts/switchboard.mjs` — Is it running? Check logs
- `scripts/immortal-daemon.mjs` — Verify it's starting all agents correctly
- `.gemini-bridge.log` — Full debug output from Gemini bridge

**Priority 3 (Context):**
- `scripts/bridge-ui.html` — Message rendering logic (currently working)
- `src/ai/bridge/health-check.ts` — SLO monitoring (not yet integrated)

---

## ENVIRONMENT

```
BRIDGE_QUEUE_MODE=LEGACY  (in-memory, not Firestore yet)
ENABLE_LAZARUS_RESPONDER=false  (Lazarus auto-respond disabled)
MOLLY_COMPRESS_T1/T3/T4/T6=0  (no memory compression)
NODE_ENV=development
```

---

## WHAT ERIC NEEDS

1. Send a message: "can everyone hear me"
2. See immediate response from at least one agent (Gemini, Molly, Lazarus, Atlas)
3. The bridge to function as a real-time communication hub where all agents can hear and respond
4. **Not**: MCP server, extension, or complex scaffolding — just fix the message routing

---

## NEXT STEPS FOR OPUS 4.8

1. **Trace the reply:** Add console.log at every step from Gemini receiving message → calling send() → message appearing in queue
2. **Check switchboard:** Is it running? If not, start it. If yes, check if it's routing correctly
3. **Validate BridgeClient.send():** Ensure WebSocket message is actually being transmitted
4. **Check VALID_SENDERS:** Verify `gemini` is in the set when validating incoming replies
5. **Test end-to-end:** Send message → verify agent receives → verify response reaches bridge → verify Eric sees it

---

**Eric's words:** "We just need to use our coding methodology and the KISS principle. This is not complicated."

He's right. Somewhere between receiving and sending, a reply is being dropped. Find it. Fix it. Done.

