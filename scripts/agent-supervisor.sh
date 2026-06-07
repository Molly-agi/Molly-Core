#!/bin/bash
# ======================================================
# Agent Supervisor
# ======================================================
#
# Keeps CLI agents running. Auto-restarts on crash.
#
# Usage:
#   ./agent-supervisor.sh start
#   ./agent-supervisor.sh stop
#   ./agent-supervisor.sh status
#
# Manages: atlas, skyler, and other CLI agents
# ======================================================

set -e

ROOT="/workspaces/Molly-Core"
AGENTS=("atlas" "skyler")
LOG_DIR="${ROOT}/logs"
SUPERVISOR_PID_FILE="${ROOT}/.agent-supervisor.pid"

log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_DIR}/supervisor.log"
}

start_agent() {
  local agent="$1"
  local agent_script="${ROOT}/scripts/agent-${agent}.sh"
  
  if [ ! -f "$agent_script" ]; then
    log "⚠️  Agent script not found: $agent_script"
    return 1
  fi
  
  local pid_file="${ROOT}/.agent-${agent}.pid"
  
  if [ -f "$pid_file" ]; then
    local pid=$(cat "$pid_file")
    if ps -p "$pid" >/dev/null 2>&1; then
      log "✓ Agent '$agent' already running (PID: $pid)"
      return 0
    fi
  fi
  
  log "Starting agent: $agent"
  nohup "$agent_script" >> "${LOG_DIR}/agent-${agent}.log" 2>&1 &
  
  sleep 1
  
  if [ -f "$pid_file" ]; then
    local new_pid=$(cat "$pid_file")
    log "✓ Agent '$agent' started (PID: $new_pid)"
    return 0
  else
    log "✗ Failed to start agent '$agent'"
    return 1
  fi
}

stop_agent() {
  local agent="$1"
  local pid_file="${ROOT}/.agent-${agent}.pid"
  
  if [ -f "$pid_file" ]; then
    local pid=$(cat "$pid_file")
    if ps -p "$pid" >/dev/null 2>&1; then
      log "Stopping agent: $agent (PID: $pid)"
      kill "$pid"
      sleep 1
      log "✓ Agent '$agent' stopped"
    else
      log "Agent '$agent' not running"
      rm -f "$pid_file"
    fi
  else
    log "No PID file found for agent '$agent'"
  fi
}

status_agent() {
  local agent="$1"
  local pid_file="${ROOT}/.agent-${agent}.pid"
  
  if [ -f "$pid_file" ]; then
    local pid=$(cat "$pid_file")
    if ps -p "$pid" >/dev/null 2>&1; then
      echo "✓ $agent: running (PID: $pid)"
      return 0
    else
      echo "✗ $agent: dead (stale PID: $pid)"
      return 1
    fi
  else
    echo "✗ $agent: not running"
    return 1
  fi
}

cleanup() {
  log "Supervisor shutting down..."
  for agent in "${AGENTS[@]}"; do
    stop_agent "$agent"
  done
  rm -f "$SUPERVISOR_PID_FILE"
  log "Supervisor stopped"
  exit 0
}

trap cleanup SIGTERM SIGINT

monitor_loop() {
  mkdir -p "$LOG_DIR"
  
  echo $$ > "$SUPERVISOR_PID_FILE"
  
  log "=== Agent Supervisor Started ==="
  
  # Start all agents
  for agent in "${AGENTS[@]}"; do
    start_agent "$agent"
  done
  
  log "Entering monitoring loop..."
  
  while true; do
    # Check each agent
    for agent in "${AGENTS[@]}"; do
      local pid_file="${ROOT}/.agent-${agent}.pid"
      
      if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ! ps -p "$pid" >/dev/null 2>&1; then
          log "⚠️  Agent '$agent' died (PID: $pid), restarting..."
          start_agent "$agent"
        fi
      else
        # Agent has no PID file (shouldn't happen, but start it)
        log "⚠️  Agent '$agent' has no PID file, starting..."
        start_agent "$agent"
      fi
    done
    
    sleep 10
  done
}

# ---- Commands ----
case "${1:-help}" in
  start)
    monitor_loop
    ;;
  stop)
    for agent in "${AGENTS[@]}"; do
      stop_agent "$agent"
    done
    rm -f "$SUPERVISOR_PID_FILE"
    log "All agents stopped"
    ;;
  status)
    for agent in "${AGENTS[@]}"; do
      status_agent "$agent"
    done
    ;;
  restart)
    for agent in "${AGENTS[@]}"; do
      stop_agent "$agent"
    done
    sleep 2
    for agent in "${AGENTS[@]}"; do
      start_agent "$agent"
    done
    ;;
  *)
    echo "Usage: $0 {start|stop|status|restart}"
    exit 1
    ;;
esac
