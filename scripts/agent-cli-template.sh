#!/bin/bash
# ======================================================
# CLI Agent Bridge Listener Template
# ======================================================
# 
# Usage:
#   ./agent-cli-template.sh atlas
#   ./agent-cli-template.sh skyler
#
# This script:
# 1. Registers the agent with the bridge
# 2. Enters a polling loop checking for messages
# 3. Executes handler function on messages
# 4. Cleans up on exit
#
# Agents inherit from this template by:
# - Setting AGENT_NAME
# - Implementing handle_message() function
# - Optionally: setup() and cleanup() functions
# ======================================================

set -e

# ---- Configuration ----
AGENT_NAME="${1:-unknown}"
BRIDGE_PORT="${BRIDGE_PORT:-9002}"
BRIDGE_URL="http://localhost:${BRIDGE_PORT}"
POLL_INTERVAL="${POLL_INTERVAL:-5}"
ROOT="/workspaces/Molly-Core"
LOG_DIR="${ROOT}/logs"
LOG_FILE="${LOG_DIR}/agent-${AGENT_NAME}.log"
PID_FILE="${ROOT}/.agent-${AGENT_NAME}.pid"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# ---- Utility Functions ----
log() {
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[$timestamp] $1" | tee -a "$LOG_FILE"
}

die() {
  log "ERROR: $1"
  exit 1
}

cleanup() {
  log "Agent '$AGENT_NAME' shutting down..."
  
  # Call agent-specific cleanup if defined
  if declare -f agent_cleanup &>/dev/null; then
    agent_cleanup
  fi
  
  # Remove PID file
  rm -f "$PID_FILE"
  
  log "Agent '$AGENT_NAME' stopped."
  exit 0
}

# ---- Signal Handlers ----
trap cleanup SIGTERM SIGINT

# ---- Register Agent ----
register_agent() {
  log "Registering agent '$AGENT_NAME' with bridge..."
  
  local response=$(curl -s -X POST "$BRIDGE_URL/api/bridge" \
    -H "Content-Type: application/json" \
    -d "{
      \"from\": \"$AGENT_NAME\",
      \"to\": \"\",
      \"content\": \"Agent $AGENT_NAME online\"
    }" 2>/dev/null || echo '{}')
  
  if echo "$response" | jq -e '.success' >/dev/null 2>&1; then
    log "Registration successful"
    return 0
  else
    log "Registration response: $response"
    return 0  # Non-fatal, continue anyway
  fi
}

# ---- Check Bridge ----
check_bridge() {
  local response=$(curl -s "$BRIDGE_URL/api/bridge?unread=$AGENT_NAME&peek=1" 2>/dev/null || echo '{}')
  
  echo "$response"
}

# ---- Default Message Handler ----
# Override this in agent-specific scripts
handle_message() {
  local from="$1"
  local content="$2"
  
  log "Received from $from: $content"
}

# ---- Main Loop ----
main() {
  log "Starting CLI agent: $AGENT_NAME"
  
  # Write PID file
  echo $$ > "$PID_FILE"
  
  # Call agent-specific setup if defined
  if declare -f agent_setup &>/dev/null; then
    log "Running agent setup..."
    agent_setup
  fi
  
  # Register with bridge
  register_agent
  
  log "Entering polling loop (interval: ${POLL_INTERVAL}s)"
  
  while true; do
    # Check bridge for messages
    response=$(check_bridge)
    count=$(echo "$response" | jq -r '.count // 0')
    
    if [ "$count" -gt 0 ]; then
      log "Found $count message(s)"
      
      # Process each message
      echo "$response" | jq -c '.messages[]' | while read -r msg; do
        local from=$(echo "$msg" | jq -r '.from')
        local content=$(echo "$msg" | jq -r '.content')
        
        log "Processing message from '$from'"
        
        # Call handler (can be overridden by agent)
        handle_message "$from" "$content"
      done
      
      # Mark as read (non-peek mode)
      curl -s "$BRIDGE_URL/api/bridge?unread=$AGENT_NAME" >/dev/null 2>&1
    fi
    
    # Sleep before next check
    sleep "$POLL_INTERVAL"
  done
}

# ---- Entry Point ----
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  if [ -z "$AGENT_NAME" ] || [ "$AGENT_NAME" = "template" ]; then
    die "Usage: $0 <agent-name>"
  fi

  main "$@"
fi
