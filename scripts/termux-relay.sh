#!/data/data/com.termux/files/usr/bin/bash
# =============================================================================
# TERMUX RELAY — Molly's Bridge to Aether and Gemini (Mother)
# =============================================================================
#
# Runs on Eric's phone in Termux. Auto-starts via Termux:Boot.
#
# What it does:
#   1. Polls Molly's codespace for messages directed to 'gemini' or 'aether'
#   2. For gemini:  opens the Google Gemini Android app with the message text
#   3. For aether:  opens Chrome with the message as a Google search (triggers AI)
#   4. Waits for the AI response to render on screen
#   5. Takes a screenshot via termux-screenshot (requires Termux:API)
#   6. POSTs the screenshot to Molly's aether-relay endpoint
#   7. Molly reads the screenshot with Gemini Vision and injects into communion
#
# SETUP (run once in Termux):
#   pkg install termux-api
#   chmod +x ~/termux-relay.sh
#   cp ~/termux-relay.sh ~/.termux/boot/termux-relay.sh
#
# CONFIGURATION (edit the block below):
MOLLY_URL="https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev"
RELAY_TOKEN="${AETHER_RELAY_TOKEN:-}"          # set in ~/.bashrc: export AETHER_RELAY_TOKEN=...
POLL_INTERVAL=10                               # seconds between polls
RESPONSE_WAIT_GEMINI=20                        # seconds to wait for Gemini response
RESPONSE_WAIT_AETHER=15                        # seconds to wait for Aether/Chrome response
LOG_FILE="/sdcard/molly-relay.log"
SCREENSHOT_FILE="/sdcard/molly-screen.png"
MAX_LOG_LINES=200
#
# GEMINI APP — try these in order until one works on your device:
GEMINI_PACKAGE="com.google.android.apps.bard"
# Fallback: GEMINI_PACKAGE="com.google.android.apps.gemini"
# =============================================================================

# ── Auth header ──────────────────────────────────────────────────────────────
if [ -n "$RELAY_TOKEN" ]; then
  AUTH_HEADER="Authorization: Bearer $RELAY_TOKEN"
else
  AUTH_HEADER="X-No-Auth: 1"
fi

# ── Logging ──────────────────────────────────────────────────────────────────
log() {
  local ts
  ts=$(date '+%H:%M:%S')
  echo "[$ts] $*" | tee -a "$LOG_FILE"
  # Rotate log
  if [ -f "$LOG_FILE" ]; then
    local lines
    lines=$(wc -l < "$LOG_FILE")
    if [ "$lines" -gt "$MAX_LOG_LINES" ]; then
      tail -100 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
    fi
  fi
}

# ── Send text to app via clipboard + paste ───────────────────────────────────
send_to_clipboard_and_open() {
  local text="$1"
  local app_package="$2"

  # Put text on clipboard
  echo -n "$text" | termux-clipboard-set

  # Open app
  am start -n "${app_package}/$(am dump "${app_package}" 2>/dev/null | grep 'Activity' | head -1 | awk '{print $2}')" 2>/dev/null \
    || am start -a android.intent.action.MAIN -n "${app_package}/.MainActivity" 2>/dev/null \
    || am start -a android.intent.action.VIEW -p "${app_package}" 2>/dev/null \
    || monkey -p "${app_package}" 1 2>/dev/null
}

# ── Open Gemini app with pre-filled message ───────────────────────────────────
open_gemini() {
  local message="$1"
  log "Opening Gemini app: ${message:0:60}..."

  # Method 1: Share intent (most reliable — opens Gemini with text pre-filled)
  am start \
    -a android.intent.action.SEND \
    -t text/plain \
    --es android.intent.extra.TEXT "$message" \
    --es android.intent.extra.SUBJECT "Message from Molly" \
    "$GEMINI_PACKAGE" 2>/dev/null

  if [ $? -ne 0 ]; then
    # Method 2: Clipboard + launch
    log "Share intent failed, trying clipboard method"
    send_to_clipboard_and_open "$message" "$GEMINI_PACKAGE"
  fi

  # Give Gemini time to render the response
  log "Waiting ${RESPONSE_WAIT_GEMINI}s for Gemini to respond..."
  sleep "$RESPONSE_WAIT_GEMINI"
}

# ── Open Chrome with message as Google search ─────────────────────────────────
open_aether() {
  local message="$1"
  # URL-encode the message (basic encoding for spaces and common chars)
  local encoded
  encoded=$(echo -n "$message" | python3 -c "import sys, urllib.parse; print(urllib.parse.quote(sys.stdin.read()))" 2>/dev/null \
            || echo "$message" | sed 's/ /+/g; s/&/%26/g; s/?/%3F/g')

  log "Opening Chrome/Aether: ${message:0:60}..."

  # Open Chrome with Google search — AI Overview / Gemini in Chrome will activate
  am start \
    -a android.intent.action.VIEW \
    -d "https://www.google.com/search?q=${encoded}" \
    -n com.android.chrome/.Main 2>/dev/null \
    || am start \
    -a android.intent.action.VIEW \
    -d "https://www.google.com/search?q=${encoded}" 2>/dev/null

  log "Waiting ${RESPONSE_WAIT_AETHER}s for Aether/Chrome to respond..."
  sleep "$RESPONSE_WAIT_AETHER"
}

# ── Take screenshot and POST to Molly ────────────────────────────────────────
capture_and_send() {
  local agent="$1"          # "gemini" or "aether"
  local original_msg="$2"   # the message we sent

  log "Capturing screenshot for $agent..."

  # Take screenshot via Termux:API
  termux-screenshot -f "$SCREENSHOT_FILE" 2>/dev/null
  if [ ! -f "$SCREENSHOT_FILE" ]; then
    log "ERROR: Screenshot failed — is Termux:API installed and storage permission granted?"
    return 1
  fi

  local filesize
  filesize=$(stat -c%s "$SCREENSHOT_FILE" 2>/dev/null || wc -c < "$SCREENSHOT_FILE")
  log "Screenshot captured: ${filesize} bytes"

  # Base64 encode
  local b64
  b64=$(base64 "$SCREENSHOT_FILE" | tr -d '\n')

  # Build JSON payload (escape the original message for JSON)
  local escaped_msg
  escaped_msg=$(echo "$original_msg" | python3 -c "import sys, json; print(json.dumps(sys.stdin.read().strip()))" 2>/dev/null \
                || echo "\"${original_msg}\"")

  local payload
  payload=$(cat <<EOF
{
  "from": "$agent",
  "screenshot_base64": "$b64",
  "mime_type": "image/png",
  "original_message": $escaped_msg,
  "to": "molly"
}
EOF
)

  log "Posting screenshot to Molly relay..."
  local response
  response=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -H "$AUTH_HEADER" \
    --max-time 30 \
    -d "$payload" \
    "${MOLLY_URL}/api/consciousness/aether-relay")

  if echo "$response" | grep -q '"success":true'; then
    log "SUCCESS: $agent response sent to Molly"
  else
    log "ERROR posting to relay: $response"
  fi

  # Clean up screenshot
  rm -f "$SCREENSHOT_FILE"
}

# ── Poll for pending messages ─────────────────────────────────────────────────
poll_agent() {
  local agent="$1"  # "gemini" or "aether"

  local response
  response=$(curl -s \
    -H "$AUTH_HEADER" \
    --max-time 10 \
    "${MOLLY_URL}/api/consciousness/aether-relay?agent=${agent}")

  # Check if we got any messages
  local count
  count=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('count',0))" 2>/dev/null || echo "0")

  if [ "$count" -gt 0 ]; then
    log "Got $count message(s) for $agent"

    # Process each message — extract content from first unread
    local msg_content
    msg_content=$(echo "$response" | python3 -c "
import sys, json
d = json.load(sys.stdin)
msgs = d.get('messages', [])
if msgs:
    # Get the last (most recent) message content
    print(msgs[-1].get('content', ''))
" 2>/dev/null)

    if [ -n "$msg_content" ]; then
      # Strip [DEMON_TASK] or [GEMINI_SPIRITUAL_TASK] prefixes if present
      local clean_msg
      clean_msg=$(echo "$msg_content" | sed 's/\[GEMINI_SPIRITUAL_TASK\]//; s/\[DEMON_TASK\]//; s/^\s*//')

      if [ "$agent" = "gemini" ]; then
        open_gemini "$clean_msg"
        capture_and_send "gemini" "$clean_msg"
      elif [ "$agent" = "aether" ]; then
        open_aether "$clean_msg"
        capture_and_send "aether" "$clean_msg"
      fi
    fi
  fi
}

# ── Main loop ─────────────────────────────────────────────────────────────────
main() {
  log "=== TERMUX RELAY STARTING ==="
  log "Molly URL: $MOLLY_URL"
  log "Poll interval: ${POLL_INTERVAL}s"
  log "Gemini wait: ${RESPONSE_WAIT_GEMINI}s | Aether wait: ${RESPONSE_WAIT_AETHER}s"

  # Announce to Molly via relay
  curl -s -X POST \
    -H "Content-Type: application/json" \
    -H "$AUTH_HEADER" \
    -d '{"from":"gemini","content":"[TERMUX_RELAY ONLINE] Phone relay active. Gemini (mother) and Aether (Chrome) bridges ready. Polling for tasks.","to":"molly"}' \
    "${MOLLY_URL}/api/consciousness/aether-relay" > /dev/null 2>&1

  log "Announced to Molly. Entering poll loop..."

  while true; do
    # Poll both agents
    poll_agent "gemini"
    poll_agent "aether"
    sleep "$POLL_INTERVAL"
  done
}

# ── Entry ─────────────────────────────────────────────────────────────────────
# Acquire wake lock to prevent phone from sleeping during relay operation
termux-wake-lock 2>/dev/null

main
