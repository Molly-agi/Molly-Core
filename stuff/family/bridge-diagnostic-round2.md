# Bridge Diagnostic — Round 2 (Decision Tree)

**For: Lazarus**
**From: Opus (via Eric)**
**Goal:** Find the EXACT reason Gemini only ever emits 90s-timeout errors, land on the precise fix, and confirm the separate Eric-delivery bug.

---

## RULES

- Paste command output and code **VERBATIM**. Errors included — errors are signal.
- **Redact secrets.** Replace any API key value with `<REDACTED>`. Never paste a key.
- **Do not restart or modify any running service** unless a step is explicitly marked **SAFE TO APPLY**.
- At the end, report **which leaf you landed on** (e.g. "STEP 2 → input mismatch → FIX-A").

---

## STEP 1 — Read the input contract (before running anything)

The bridge spawns the CLI with the prompt as an **argument**:
`spawn('bash', ['scripts/gemini-cli-headless.sh', prompt])`

We need to know whether the script consumes its prompt from `$1` (argv) or from **stdin**.

```bash
cat scripts/gemini-cli-headless.sh
```
Also paste the full `runGemini()` function from `scripts/gemini-bridge.mjs`.

**DECISION:**
- Script reads prompt from **stdin** (`read`, `cat`, `< /dev/stdin`, `$(cat)`) but bridge passes **argv `$1`** → **MISMATCH. Go to FIX-A.** This alone explains a deterministic 90s hang: the script blocks on stdin that never arrives.
- Script reads **`$1` / `$@`** and bridge passes argv → contracts match. **Go to STEP 2.**
- Unclear → **Go to STEP 2.**

---

## STEP 2 — Run the CLI by hand, two ways

**Test A — prompt as argument:**
```bash
time bash scripts/gemini-cli-headless.sh "say hello in five words"
```
**Test B — prompt on stdin:**
```bash
echo "say hello in five words" | time bash scripts/gemini-cli-headless.sh
```
Paste full output, timing, and exit behavior for **both**.

**DECISION:**
- One returns text fast, the other hangs → input-method mismatch; the working one is the true contract. **Go to FIX-A.**
- Both hang ~90s, no output → script blocks on something (interactive auth, TTY, network stall). **Go to STEP 3.**
- Both error fast with auth/permission/quota wording (`401`, `403`, `429`, `API key`, `PERMISSION_DENIED`, `quota`, `RESOURCE_EXHAUSTED`) → credential/quota problem. **Go to STEP 4.**
- Both error fast with `command not found` / missing binary → **Go to FIX-C.**
- Returns text fast both ways → CLI is fine in isolation; timeout is in the spawn environment. **Go to STEP 5.**

---

## STEP 3 — Is it waiting on auth / a TTY?

```bash
grep -nE 'gemini|gcloud|npx|node|curl|read|stdin|login|auth' scripts/gemini-cli-headless.sh
which gemini; gemini --version 2>&1 | head -20
```
(Adjust `gemini` to whatever binary the script actually calls.)

**DECISION:**
- Needs interactive login / has no non-interactive mode → CLI path is a dead end in a headless Codespace. **Go to FIX-B.**
- Has a non-interactive flag the script isn't passing → note the flag. **Go to FIX-A** (add the flag).

---

## STEP 4 — Verify the API key directly (independent of the CLI)

Confirm a key is present (REDACT the value):
```bash
env | grep -iE 'GEMINI|GOOGLE|GENAI|GENERATIVE' | sed -E 's/=.*/=<REDACTED>/'
```
Test the key straight against the API (does NOT touch the CLI):
```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$GOOGLE_GENAI_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"contents":[{"parts":[{"text":"say hello in five words"}]}]}' | head -40
```
(Use whichever env var name STEP 4 found.)

**DECISION:**
- Returns generated text → key is **GOOD**, CLI is the blocker, API path works. **Go to FIX-B.**
- Returns an error → credential/quota is the real root. Paste `error.status` + `error.message` (NOT the key). **STOP and report to Eric.** A code rewrite would fail identically — this is a credential fix, not a code fix.

---

## STEP 5 — Spawn-environment diff

CLI works by hand but times out from the bridge. Compare:
- Does `runGemini` pass prompt as argv while the working hand-test used stdin (or vice versa)? Cross-check STEP 2. → **FIX-A**
- Is `cwd` different? Bridge may spawn from a dir where a relative config/path isn't found. Paste the full `spawn()` call **including options** (`cwd`, `env`).
- Prompt size: `buildPrompt()` may produce a very large prompt. Re-run the hand-test with a realistically large prompt to see if size triggers the hang.

Report findings to Eric.

---

## FIXES

### FIX-A — Input-contract mismatch (trivial — **SAFE TO APPLY**)
Make the bridge feed the prompt the way the script consumes it:
- Script wants **stdin** → change the spawn to write the prompt to `child.stdin` then `end()` it, instead of passing argv.
- Script wants **`$1`** but currently reads stdin → make the script read `"$1"`.

Paste the one-line diff you intend **before** applying. After applying: re-run a STEP 2 test to confirm real output, then send a live bridge message and confirm a **non-error** gemini reply lands in the queue.

### FIX-B — Replace CLI with direct API call (**HOLD for Opus**)
Confirmed: key works, CLI is the blocker. Opus will write the `runGemini()` replacement using `fetch()` against the endpoint validated in STEP 4. **Do not improvise it.** Report that you reached FIX-B and paste: the full current `runGemini()`, the `MAX_REPLY_CHARS` value, and the working curl response shape from STEP 4.

### FIX-C — CLI not installed (report)
Paste `which` results and `$PATH`. Reinstall vs. switch to FIX-B is Eric's call.

---

## BUG 2 — Eric delivery (separate; do after the Bug-1 branch is found)

This is delivery, not Gemini. **Diagnose only — apply nothing.**

```bash
# Paste the WebSocket setup block from scripts/bridge-ui.html:
# the onopen / onclose / reconnect logic.
```
Two questions to answer from that block:
1. On **reconnect**, does the UI re-send `{type:'identify',identity:'eric'}`? If it does **not** re-identify, the daemon never replays unread on reconnect → that's the delivery bug, fully independent of Android flakiness.
2. Does the UI do **any** HTTP poll of `/api/bridge?unread=eric`, or is it WebSocket-only?

Report both. Opus will write the UI HTTP-poll + `visibilitychange` backfill once we see the current reconnect block.

---

## WHAT TO SEND BACK

- The leaf you landed on (e.g. "STEP 2 → both hang → STEP 3 → interactive auth → FIX-B").
- Verbatim evidence for every step you ran.
- For Bug 2: the UI WebSocket/reconnect block + whether it re-identifies.

Write it into `bridge-diagnostic-round3.md` and hand it to Eric.
