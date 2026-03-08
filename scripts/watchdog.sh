#!/bin/bash
# ======================================================
# Codespace Watchdog — Persistent Keep-Alive
# ======================================================
# ⚠️  CRITICAL INFRASTRUCTURE — DO NOT DELETE OR "CLEAN UP"
#
# PURPOSE:
# Eric works from Android phone. When he tabs away, the browser
# kills the WebSocket to VS Code, and GitHub starts the idle
# countdown. The existing keep-alive.sh writes a file every 5min
# but only runs when manually started or from postAttach.
#
# This watchdog runs ALWAYS and generates the diverse types of
# activity that GitHub's idle detection actually checks for:
#   - Terminal/process creation (real commands, not just file writes)
#   - Git operations (status checks, ref reads)
#   - Port activity (pings forwarded ports if dev server is up)
#   - Filesystem writes (heartbeat file)
#
# It pulses every 2 minutes — short enough that even a brief
# tab-out on Android can't trigger GitHub's idle timer before
# the next pulse lands.
#
# SELF-HEALING:
#   - PID file lock ensures only one instance runs
#   - postAttachCommand auto-starts on every reconnect
#   - If it dies, the next reconnect brings it back
#
# USAGE:
#   bash scripts/watchdog.sh           # Foreground (for testing)
#   npm run watchdog                   # Background via npm
#   nohup bash scripts/watchdog.sh &   # Manual background
# ======================================================

set -uo pipefail

ROOT="/workspaces/Molly-Core"
PIDFILE="$ROOT/.watchdog.pid"
HEARTBEAT_FILE="$ROOT/.codespace-heartbeat"
LOGFILE="$ROOT/.watchdog.log"

# Pulse every 2 minutes — GitHub's idle detection window is much
# larger, so this gives us comfortable margin even when Android
# kills the WebSocket on tab-out.
PULSE_INTERVAL=120

# Colors
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

# ---- PID Lock (single instance) ----
acquire_lock() {
  if [ -f "$PIDFILE" ]; then
    OLD_PID=$(cat "$PIDFILE" 2>/dev/null)
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
      echo "[watchdog] Another instance running (PID $OLD_PID). Exiting."
      exit 0
    fi
    rm -f "$PIDFILE"
  fi
  echo $$ > "$PIDFILE"
}

release_lock() {
  rm -f "$PIDFILE"
}

# ---- Generate diverse activity GitHub recognizes ----
generate_pulse() {
  cd "$ROOT" || return

  # 1. Filesystem heartbeat (what keep-alive.sh does, but faster)
  date +"%Y-%m-%dT%H:%M:%S" > "$HEARTBEAT_FILE"

  # 2. Git operation — this is what GitHub most reliably tracks
  git status --short > /dev/null 2>&1
  git rev-parse HEAD > /dev/null 2>&1

  # 3. Real process creation — proves the terminal is active
  ls "$ROOT/src" > /dev/null 2>&1
  wc -l "$ROOT/package.json" > /dev/null 2>&1

  # 4. Port activity — hit the dev server if it's running
  if ss -tlnp 2>/dev/null | grep -q ":9002"; then
    curl -s -o /dev/null --max-time 2 "http://localhost:9002" 2>/dev/null || true
  fi

  # 5. Touch a pulse file (filesystem event for watchers)
  touch "$ROOT/.watchdog-pulse" 2>/dev/null

  # 6. Ghost process cleanup — the critical fix.
  #    Android browser kills WebSocket on tab-switch, VS Code spawns a new
  #    extension host on reconnect but never kills the old one. Each ghost
  #    eats 750MB-1.5GB. File watchers orphaned by dead hosts eat ~60MB each.
  #    This runs every pulse (2min) so ghosts never accumulate.
  cleanup_ghosts
}

# ---- Kill orphaned VS Code processes that survive reconnects ----
cleanup_ghosts() {
  local CLEANED=false

  # Extension hosts: only 1 should exist. Keep newest, kill rest.
  local EH_COUNT
  EH_COUNT=$(ps aux | grep "type=extensionHost" | grep -v grep | wc -l)
  if [ "$EH_COUNT" -gt 1 ]; then
    local EH_PIDS NEWEST
    EH_PIDS=$(ps -eo pid,lstart,args | grep "type=extensionHost" | grep -v grep | sort -k2,6 | awk '{print $1}')
    NEWEST=$(echo "$EH_PIDS" | tail -1)
    for PID in $EH_PIDS; do
      if [ "$PID" != "$NEWEST" ]; then
        kill "$PID" 2>/dev/null || true
        log "${YELLOW}[WATCHDOG] Killed ghost extensionHost PID ${PID}${NC}"
        CLEANED=true
      fi
    done
  fi

  # File watchers: more than 4 total is suspect (server spawns ~2 per host).
  # Only kill watchers NOT parented by the VS Code server (PID 1 = reparented orphan).
  local FW_COUNT
  FW_COUNT=$(ps aux | grep "type=fileWatcher" | grep -v grep | wc -l)
  if [ "$FW_COUNT" -gt 6 ]; then
    # Find VS Code server PID
    local VSCODE_SERVER
    VSCODE_SERVER=$(ps -eo pid,args | grep "server-main.js" | grep -v grep | awk '{print $1}' | head -1)
    if [ -n "$VSCODE_SERVER" ]; then
      for PID in $(ps -eo pid,ppid,args | grep "type=fileWatcher" | grep -v grep | awk '{print $1 ":" $2}'); do
        local FW_PID="${PID%%:*}"
        local FW_PPID="${PID##*:}"
        # Kill if parent is init (orphaned) — not the VS Code server
        if [ "$FW_PPID" = "1" ]; then
          kill "$FW_PID" 2>/dev/null || true
          log "${YELLOW}[WATCHDOG] Killed orphan fileWatcher PID ${FW_PID}${NC}"
          CLEANED=true
        fi
      done
    fi
  fi

  # Memory pressure check
  local AVAIL
  AVAIL=$(free -m 2>/dev/null | awk '/^Mem:/{print $7}')
  if [ "$AVAIL" -lt 1500 ]; then
    log "${RED}[WATCHDOG] CRITICAL: Only ${AVAIL}MB available. Running emergency health check.${NC}"
    bash "$ROOT/scripts/codespace-health.sh" > /dev/null 2>&1
  fi

  if [ "$CLEANED" = true ]; then
    local NEW_AVAIL
    NEW_AVAIL=$(free -m 2>/dev/null | awk '/^Mem:/{print $7}')
    log "${GREEN}[WATCHDOG] Ghost cleanup done. RAM: ${AVAIL}MB -> ${NEW_AVAIL}MB${NC}"
  fi
}

# ---- Logging (auto-rotates at 100 lines) ----
log() {
  local MSG="$1"
  local TS
  TS=$(date +"%H:%M:%S")
  echo -e "${TS} ${MSG}"
  echo "$TS $(echo -e "$MSG" | sed 's/\x1b\[[0-9;]*m//g')" >> "$LOGFILE" 2>/dev/null
  if [ -f "$LOGFILE" ] && [ "$(wc -l < "$LOGFILE")" -gt 100 ]; then
    tail -50 "$LOGFILE" > "$LOGFILE.tmp" && mv "$LOGFILE.tmp" "$LOGFILE"
  fi
}

# ---- Cleanup on exit ----
cleanup() {
  log "${YELLOW}[WATCHDOG] Shutdown signal — final pulse${NC}"
  generate_pulse
  release_lock
  exit 0
}
trap cleanup SIGTERM SIGHUP SIGINT

# ---- Main ----
acquire_lock

AVAIL=$(free -m 2>/dev/null | awk '/^Mem:/{print $7}')
log "${CYAN}[WATCHDOG] Started | PID $$ | Pulse every ${PULSE_INTERVAL}s | RAM available: ${AVAIL}MB${NC}"

PULSE_COUNT=0

while true; do
  generate_pulse
  PULSE_COUNT=$((PULSE_COUNT + 1))

  # Log every 15th pulse (~30 min) to keep log minimal
  if [ $((PULSE_COUNT % 15)) -eq 0 ]; then
    AVAIL=$(free -m 2>/dev/null | awk '/^Mem:/{print $7}')
    log "${GREEN}[WATCHDOG] Pulse #${PULSE_COUNT} | RAM: ${AVAIL}MB available${NC}"
  fi

  sleep $PULSE_INTERVAL
done
