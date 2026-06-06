# Bridge Diagnostic — Round 3
**For: Opus 4.8**
**From: Lazarus**
**Date: 2026-06-02**

---

## BUG 1 — DECISION PATH

STEP 1 → contracts match (argv used both sides) → STEP 2
STEP 2 → both hang (5s timeout, no output) → STEP 3
STEP 3 → binary exists (`gemini` v0.44.1 at `/home/codespace/nvm/current/bin/gemini`) but hangs headless
STEP 4 → **key GOOD, CLI is blocker → FIX-B**

---

## STEP 1 EVIDENCE (VERBATIM)

### gemini-cli-headless.sh (full):
```bash
#!/bin/bash
set -euo pipefail

if [[ -z "${GOOGLE_GENAI_API_KEY:-}" ]]; then
  echo "[ERROR] GOOGLE_GENAI_API_KEY environment variable not set"
  exit 1
fi

export GEMINI_API_KEY="$GOOGLE_GENAI_API_KEY"
export GEMINI_CLI_TRUST_WORKSPACE=true

if [[ $# -gt 0 ]]; then
  gemini -p "$*"
else
  gemini -p "$(cat)"
fi
```

### runGemini() from gemini-bridge.mjs (full):
```js
function runGemini(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['scripts/gemini-cli-headless.sh', prompt], {
      cwd: '/workspaces/Molly-Core',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    // ...90s timer kills child, rejects...
  });
}
```

STDIN is `'ignore'`. Script receives prompt via `$1`. Contracts match. → STEP 2.

---

## STEP 2 EVIDENCE (VERBATIM)

```
$ timeout 5 bash scripts/gemini-cli-headless.sh "say hello in five words" 2>&1
Ripgrep is not available. Falling back to GrepTool.
Exit: 124
```

Both argv and stdin tests hang past 5 seconds (timeout kills them).
The only output before kill: `Ripgrep is not available. Falling back to GrepTool.`
This is the `gemini` CLI v0.44.1 trying to boot in agentic/interactive mode. It hangs waiting for a TTY or an interactive session initialization — it never runs the prompt.
→ STEP 3, then STEP 4.

---

## STEP 3 EVIDENCE (VERBATIM)

```
$ which gemini
/home/codespace/nvm/current/bin/gemini
$ gemini --version
0.44.1
```

The Gemini CLI (`@google/generative-ai` or similar npm package) is installed.
The `-p` flag is supposed to run a prompt non-interactively, but v0.44.1 still
initializes workspace scanning (ripgrep call) before executing. In a headless
Codespace environment this appears to hang indefinitely — never completing.
→ STEP 4.

---

## STEP 4 EVIDENCE (VERBATIM)

### Env vars present (keys REDACTED):
```
GOOGLE_GENAI_API_KEY=<REDACTED>
GEMINI_API_KEY=<REDACTED>
GEMINI_CLI_TRUST_WORKSPACE=<REDACTED>
```

### Direct API test — gemini-2.0-flash (deprecated):
```json
{"error":{"code":404,"message":"This model models/gemini-2.0-flash is no longer available...","status":"NOT_FOUND"}}
```

### Direct API test — gemini-2.5-flash (WORKS):
```json
{
  "candidates": [{
    "content": {"parts": [{"text": "Hello, how are you today?"}], "role": "model"},
    "finishReason": "STOP"
  }],
  "modelVersion": "gemini-2.5-flash"
}
```

**CONCLUSION: Key is GOOD. `gemini-2.5-flash` responds fast. CLI is the blocker → FIX-B.**

---

## FIX-B PACKAGE (for Opus to write the replacement)

**Current runGemini() to replace:**
```js
function runGemini(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['scripts/gemini-cli-headless.sh', prompt], {
      cwd: '/workspaces/Molly-Core',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Gemini timeout after ${REPLY_TIMEOUT_MS}ms`));
    }, REPLY_TIMEOUT_MS);
    child.stdout.on('data', (d) => { stdout += String(d); });
    child.stderr.on('data', (d) => { stderr += String(d); });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) { reject(new Error(`Gemini CLI exited with ${code}: ${stderr.trim()}`)); return; }
      resolve(stdout.trim());
    });
  });
}
```

**Constants in scope:**
```js
const REPLY_TIMEOUT_MS = 90000;   // can reduce to ~15000 with fetch()
const MAX_REPLY_CHARS = 4000;
```

**Working API endpoint confirmed:**
```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=GOOGLE_GENAI_API_KEY
Content-Type: application/json
Body: {"contents":[{"parts":[{"text":"YOUR PROMPT"}]}]}
```

**Response shape:**
```json
{
  "candidates": [{
    "content": {"parts": [{"text": "RESPONSE TEXT"}], "role": "model"},
    "finishReason": "STOP"
  }],
  "modelVersion": "gemini-2.5-flash"
}
```

Extract text: `response.candidates[0].content.parts[0].text`

Env var to use: `process.env.GOOGLE_GENAI_API_KEY`
Node version: v24.14.0 — native `fetch()` available, no node-fetch needed.

---

## BUG 2 — ERIC DELIVERY (WebSocket reconnect block, verbatim)

### connect() from scripts/bridge-ui.html:
```js
function connect() {
  try { 
    dbg(`Connecting to ${wsUrl()}`);
    ws = new WebSocket(wsUrl()); 
  }
  catch (e) { 
    dbg(`WS error: ${e.message}`);
    setStatus(false); 
    scheduleReconnect(); 
    return; 
  }

  ws.onopen = () => {
    dbg('WS opened, sending identify');
    backoff = 500;
    setStatus(true);
    ws.send(JSON.stringify({ type: 'identify', identity: 'eric' }));
  };
  ws.onmessage = (ev) => {
    const d = JSON.parse(ev.data);
    if (d.type === 'history' && Array.isArray(d.messages)) {
      for (const m of d.messages) renderMsg(m);
    } else if (d.type === 'message' && d.message) {
      ingestList([d.message]);
    } else if (d.type === 'unread' && Array.isArray(d.messages)) {
      ingestList(d.messages);
    }
  };
  ws.onclose = () => { setStatus(false); scheduleReconnect(); };
  ws.onerror = () => { setStatus(false); };
}

function scheduleReconnect() {
  setTimeout(() => { backoff = Math.min(backoff * 2, 10000); connect(); }, backoff);
}
```

### Bug 2 answers:

**Q1: Does UI re-send `{type:'identify',identity:'eric'}` on reconnect?**
YES. `ws.onopen` always sends identify. Daemon then replays unread. Re-identify is working.

**Q2: Does UI do any HTTP poll of `/api/bridge?unread=eric`?**
NO. Zero HTTP polling. WebSocket is the ONLY path. No `visibilitychange` handler. No fetch fallback.

**Bug 2 root cause:** On Android, tab switches kill the WebSocket. Reconnect fires after backoff (500ms → 1s → 2s → ... 10s). During that window, messages arrive and are broadcast — but Eric's socket is dead. When he reconnects, the daemon replays `unread` for eric. HOWEVER: `seenIds` in the UI accumulates across the session and is never cleared between reconnects (unless toggle is clicked). If the same message was already rendered before disconnect, it won't re-render on reconnect even if it arrives in the unread batch.

Also: `MAX_MESSAGES = 100` in the daemon. Heavy bridge traffic evicts old messages. If 100 messages arrive while Eric is disconnected (unlikely but possible), earlier ones are gone.

**What Opus needs to write:**
1. HTTP poll fallback: poll `GET /api/bridge?unread=eric&peek=1` every 3s, render any messages not in seenIds
2. `visibilitychange` handler: when tab becomes visible, immediately force-poll unread + reconnect WebSocket if closed
3. seenIds is already a Set — the HTTP poll just needs to check `!seenIds.has(m.id)` before rendering

---

## SUMMARY

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Bug 1: Gemini never responds | `gemini` CLI v0.44.1 hangs headless; model `gemini-2.0-flash` also deprecated | Replace `runGemini()` with native `fetch()` to `gemini-2.5-flash` API |
| Bug 2: Eric misses messages on Android | No HTTP fallback; WebSocket only; no `visibilitychange` recovery | Add HTTP poll + visibilitychange handler to bridge-ui.html |

Both bugs are code fixes. Key is valid. Infrastructure is running. No credential issues.
