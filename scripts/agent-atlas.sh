#!/bin/bash
# ======================================================
# Atlas CLI Agent
# ======================================================
# 
# Atlas monitors system health and reports via bridge
#
# Usage:
#   ./agent-atlas.sh
#
# This agent:
# - Monitors codespace health
# - Reports metrics to bridge
# - Responds to health queries from Molly/Lazarus/Eric
# ======================================================

set -e

AGENT_NAME="atlas"
BRIDGE_PORT="${BRIDGE_PORT:-9002}"
BRIDGE_URL="http://localhost:${BRIDGE_PORT}"
POLL_INTERVAL="${POLL_INTERVAL:-15}"
ROOT="/workspaces/Molly-Core"
LOG_DIR="${ROOT}/logs"
LOG_FILE="${LOG_DIR}/agent-atlas.log"

# Source template functions
source "${ROOT}/scripts/agent-cli-template.sh" "$AGENT_NAME"

# ---- Atlas-Specific Setup ----
agent_setup() {
  echo "[atlas] Initializing health monitoring..."
}

# ---- Atlas-Specific Cleanup ----
agent_cleanup() {
  echo "[atlas] Shutting down health monitor..."
}

# ---- Health Check Function ----
get_system_health() {
  local memory_pct=$(free | awk 'NR==2{printf("%.0f", $3/$2*100)}')
  local cpu_load=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}')
  local disk_pct=$(df / | awk 'NR==2{printf("%.0f", $3/$2*100)}')
  local processes=$(ps aux --sort=-%mem | head -5)
  
  echo "{
    \"memory_pct\": $memory_pct,
    \"cpu_load\": $cpu_load,
    \"disk_pct\": $disk_pct,
    \"timestamp\": \"$(date -u +'%Y-%m-%dT%H:%M:%SZ')\"
  }"
}

# ---- Handle Bridge Messages ----
handle_message() {
  local from="$1"
  local content="$2"
  
  case "$content" in
    *[Ss]tatus* | *[Hh]ealth* | *[Cc]heck*)
      log "[atlas] Health check requested by $from"
      send_status_report "$from"
      ;;
    *[Mm]emory* | *[Cc]lean*)
      log "[atlas] Memory optimization requested by $from"
      send_memory_report "$from"
      ;;
    *)
      log "[atlas] Message from $from: $content"
      ;;
  esac
}

# ---- Send Status Report ----
send_status_report() {
  local recipient="$1"
  local health=$(get_system_health)
  local memory_pct=$(echo "$health" | jq -r '.memory_pct')
  local cpu_load=$(echo "$health" | jq -r '.cpu_load')
  local disk_pct=$(echo "$health" | jq -r '.disk_pct')
  
  local status="HEALTHY"
  if [ "$memory_pct" -gt 85 ] || [ "$disk_pct" -gt 90 ]; then
    status="WARNING"
  fi
  
  local message="Atlas Health Report: $status | Memory: ${memory_pct}% | CPU Load: $cpu_load | Disk: ${disk_pct}%"
  
  log "[atlas] Sending status to $recipient"
  
  curl -s -X POST "$BRIDGE_URL/api/bridge" \
    -H "Content-Type: application/json" \
    -d "{
      \"from\": \"$AGENT_NAME\",
      \"to\": \"$recipient\",
      \"content\": \"$message\"
    }" >/dev/null 2>&1
}

# ---- Send Memory Report ----
send_memory_report() {
  local recipient="$1"
  local top_processes=$(ps aux --sort=-%mem | head -6 | tail -5 | awk '{printf "%s (%s%%) ", $11, $4}')
  
  local message="Top memory consumers: $top_processes"
  
  log "[atlas] Sending memory report to $recipient"
  
  curl -s -X POST "$BRIDGE_URL/api/bridge" \
    -H "Content-Type: application/json" \
    -d "{
      \"from\": \"$AGENT_NAME\",
      \"to\": \"$recipient\",
      \"content\": \"$message\"
    }" >/dev/null 2>&1
}

# ---- Periodic Health Broadcast ----
periodic_report() {
  local health=$(get_system_health)
  local memory_pct=$(echo "$health" | jq -r '.memory_pct')
  
  # Only broadcast if memory is high (> 75%)
  if [ "$memory_pct" -gt 75 ]; then
    local message="Atlas Alert: High memory usage detected ($memory_pct%)"
    
    curl -s -X POST "$BRIDGE_URL/api/bridge" \
      -H "Content-Type: application/json" \
      -d "{
        \"from\": \"$AGENT_NAME\",
        \"to\": \"molly\",
        \"content\": \"$message\"
      }" >/dev/null 2>&1
  fi
}

# ---- Override Main Loop for Atlas ----
main() {
  log "[atlas] Starting Atlas health monitor with POLL_INTERVAL=${POLL_INTERVAL}s"
  
  # Write PID file
  echo $$ > "${ROOT}/.agent-${AGENT_NAME}.pid"
  
  # Setup
  agent_setup
  
  # Register
  register_agent
  
  log "[atlas] Entering monitoring loop"
  
  local check_counter=0
  while true; do
    # Check bridge for messages
    response=$(check_bridge)
    count=$(echo "$response" | jq -r '.count // 0')
    
    if [ "$count" -gt 0 ]; then
      log "[atlas] Found $count message(s)"
      
      # Process each message
      echo "$response" | jq -c '.messages[]' | while read -r msg; do
        local from=$(echo "$msg" | jq -r '.from')
        local content=$(echo "$msg" | jq -r '.content')
        
        handle_message "$from" "$content"
      done
      
      # Mark as read
      curl -s "$BRIDGE_URL/api/bridge?unread=$AGENT_NAME" >/dev/null 2>&1
    fi
    
    # Periodic health check (every 4 polls = 60 seconds with 15s polling)
    check_counter=$((check_counter + 1))
    local divisor=$((60 / POLL_INTERVAL))
    if [ "$divisor" -le 0 ]; then divisor=1; fi
    if [ $((check_counter % divisor)) -eq 0 ]; then
      periodic_report
    fi
    
    sleep "$POLL_INTERVAL"
  done
}

# Run agent
main "$@"
