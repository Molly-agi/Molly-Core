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
