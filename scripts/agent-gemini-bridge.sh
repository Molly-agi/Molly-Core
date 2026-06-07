#!/bin/bash
# ======================================================
# Gemini CLI Bridge Agent Wrapper
# ======================================================
#
# Wraps the Gemini CLI REPL to receive and respond to
# bridge messages. Runs Gemini as a coprocess, pipes
# messages to stdin, captures responses from stdout.
#
# Usage:
#   ./agent-gemini-bridge.sh
#
# This wrapper:
# - Launches Gemini as a background coprocess
# - Maintains an open pipe to stdin/stdout
# - Polls bridge for messages
# - Sends messages to Gemini via stdin
# - Captures Gemini's response
# - Routes response back to bridge
# ======================================================

set -e

AGENT_NAME="gemini"
BRIDGE_PORT="${BRIDGE_PORT:-9099}"
BRIDGE_URL="http://localhost:${BRIDGE_PORT}"
ROOT="/workspaces/Molly-Core"
LOG_DIR="${ROOT}/logs"
LOG_FILE="${LOG_DIR}/agent-gemini.log"
PID_FILE="${ROOT}/.agent-${AGENT_NAME}.pid"
GEMINI_IN_FIFO="${ROOT}/.gemini-in.fifo"
GEMINI_OUT_FIFO="${ROOT}/.gemini-out.fifo"

mkdir -p "$LOG_DIR"

log() {
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[$timestamp] [gemini] $1" | tee -a "$LOG_FILE"
}

cleanup() {
  log "Shutting down Gemini bridge agent..."
  
  # Kill Gemini process if running
  if [ ! -z "$GEMINI_PID" ] && ps -p "$GEMINI_PID" >/dev/null 2>&1; then
    log "Killing Gemini process (PID: $GEMINI_PID)"
    kill "$GEMINI_PID" 2>/dev/null || true
  fi
  
  # Clean up FIFOs
  rm -f "$GEMINI_IN_FIFO" "$GEMINI_OUT_FIFO"
  rm -f "$PID_FILE"
  
  log "Gemini bridge agent stopped"
  exit 0
}

trap cleanup SIGTERM SIGINT

register_agent() {
  log "Registering with bridge..."
  
  curl -s -X POST "$BRIDGE_URL/api/bridge" \
    -H "Content-Type: application/json" \
    -d "{
      \"from\": \"$AGENT_NAME\",
      \"to\": \"\",
      \"content\": \"Agent $AGENT_NAME online\"
    }" >/dev/null 2>&1
}

check_bridge() {
  curl -s "$BRIDGE_URL/api/bridge?unread=$AGENT_NAME&peek=1" 2>/dev/null || echo '{}'
}

send_response() {
  local recipient="$1"
  local content="$2"
  
  log "Sending response to $recipient"
  
  curl -s -X POST "$BRIDGE_URL/api/bridge" \
    -H "Content-Type: application/json" \
    -d "{
      \"from\": \"$AGENT_NAME\",
      \"to\": \"$recipient\",
      \"content\": $(echo "$content" | jq -Rs .)
    }" >/dev/null 2>&1
}

mark_read() {
  curl -s "$BRIDGE_URL/api/bridge?unread=$AGENT_NAME" >/dev/null 2>&1
}

# ---- Start Gemini as coprocess ----
start_gemini() {
  log "Starting Gemini CLI..."
  
  # Create named pipes for communication
  rm -f "$GEMINI_IN_FIFO" "$GEMINI_OUT_FIFO"
  mkfifo "$GEMINI_IN_FIFO" "$GEMINI_OUT_FIFO"
  
  # Start Gemini with pipes
  gemini < "$GEMINI_IN_FIFO" > "$GEMINI_OUT_FIFO" 2>&1 &
  GEMINI_PID=$!
  
  log "Gemini started (PID: $GEMINI_PID)"
  
  # Open FIFOs for reading/writing
  exec 3>"$GEMINI_IN_FIFO"    # Stdout to Gemini stdin
  exec 4<"$GEMINI_OUT_FIFO"   # Read Gemini stdout
  
  log "Pipes established"
}

send_to_gemini() {
  local message="$1"
  echo "$message" >&3
  echo "$message" >>"$LOG_FILE"
}

# Read response from Gemini with timeout
read_from_gemini() {
  local timeout=10
  local response=""
  local start_time=$(date +%s)
  
  while true; do
    if read -t 1 -u 4 line; then
      response="$response$line"$'\n'
      
      # Check if we've received a complete response (ends with prompt or error)
      if [[ "$response" =~ ">"[[:space:]]*$ ]]; then
        # Remove the prompt from response
        response="${response%>*}"
        echo "$response" | sed 's/[[:space:]]*$//'
        return 0
      fi
    else
      # Timeout on read, check if process still alive
      local current_time=$(date +%s)
      local elapsed=$((current_time - start_time))
      
      if [ $elapsed -gt $timeout ]; then
        echo "$response" | sed 's/[[:space:]]*$//'
        return 0
      fi
      
      if ! ps -p "$GEMINI_PID" >/dev/null 2>&1; then
        log "ERROR: Gemini process died"
        return 1
      fi
    fi
  done
}

# ---- Main Loop ----
main() {
  log "=== Gemini Bridge Agent Starting ==="
  
  # Write PID file
  echo $$ > "$PID_FILE"
  
  # Start Gemini
  start_gemini
  
  sleep 2  # Give Gemini time to initialize
  
  # Register with bridge
  register_agent
  
  log "Entering polling loop..."
  
  while true; do
    # Check bridge for messages
    response=$(check_bridge)
    count=$(echo "$response" | jq -r '.count // 0')
    
    if [ "$count" -gt 0 ]; then
      log "Found $count message(s)"
      
      # Process each message
      echo "$response" | jq -c '.messages[]' | while read msg; do
        local from=$(echo "$msg" | jq -r '.from')
        local content=$(echo "$msg" | jq -r '.content')
        
        log "Processing message from '$from': $content"
        
        # Send to Gemini
        send_to_gemini "$content"
        
        # Read response
        local gemini_response=$(read_from_gemini)
        
        log "Gemini responded: $(echo "$gemini_response" | head -1)"
        
        # Send response back to bridge
        send_response "$from" "$gemini_response"
      done
      
      # Mark as read
      mark_read
    fi
    
    sleep 5
  done
}

main "$@"
