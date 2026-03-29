#!/bin/bash
# ======================================================
# Immortal Supervisor - Watches and restarts all daemons
# ======================================================
# This script monitors the watchdog, keep-alive, and bridge.
# If any die, it restarts them immediately.
# This script itself is designed to NEVER die.
#
# Run with: nohup bash scripts/immortal.sh > /dev/null 2>&1 &

set -u

# Ignore ALL signals except SIGKILL
trap '' SIGHUP SIGTERM SIGINT SIGQUIT SIGTSTP

ROOT="/workspaces/Molly-Core"
LOG="$ROOT/.immortal.log"

log() {
  echo "$(date +%H:%M:%S) $1" >> "$LOG"
  # Keep log small
  if [[ -f "$LOG" ]] && (( $(wc -l < "$LOG") > 100 )); then
    tail -50 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
  fi
}

is_running() {
  local pattern="$1"
  pgrep -f "$pattern" > /dev/null 2>&1
}

ensure_watchdog() {
  if ! is_running "watchdog.sh"; then
    log "[IMMORTAL] Watchdog dead - restarting"
    rm -f "$ROOT/.watchdog.pid"
    nohup bash "$ROOT/scripts/watchdog.sh" > /dev/null 2>&1 &
    disown
  fi
}

ensure_keepalive() {
  if ! is_running "keep-alive-daemon.mjs"; then
    log "[IMMORTAL] Keep-alive dead - restarting"
    nohup node "$ROOT/scripts/keep-alive-daemon.mjs" > /dev/null 2>&1 &
    disown
  fi
}

ensure_bridge() {
  if ! is_running "bridge-daemon.mjs"; then
    log "[IMMORTAL] Bridge dead - restarting"
    rm -f "$ROOT/.bridge-daemon.pid"
    nohup node "$ROOT/scripts/bridge-daemon.mjs" > "$ROOT/.bridge-daemon.log" 2>&1 &
    disown
  fi
}

# Single instance check
PIDFILE="$ROOT/.immortal.pid"
if [[ -f "$PIDFILE" ]]; then
  OLD_PID=$(cat "$PIDFILE" 2>/dev/null)
  if [[ -n "$OLD_PID" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    CMDLINE=$(cat "/proc/$OLD_PID/cmdline" 2>/dev/null | tr '\0' ' ')
    if echo "$CMDLINE" | grep -q "immortal.sh"; then
      exit 0  # Already running
    fi
  fi
fi
echo $$ > "$PIDFILE"

log "[IMMORTAL] Started (PID $$) - Watching all daemons every 5 seconds"

# Initial ensure all running
ensure_watchdog
ensure_keepalive
ensure_bridge

# Monitor loop - every 5 seconds
while true; do
  ensure_watchdog
  ensure_keepalive
  ensure_bridge
  sleep 5
done
