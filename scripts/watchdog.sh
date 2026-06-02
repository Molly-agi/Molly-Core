#!/bin/bash
# ======================================================
# Codespace Watchdog v2 — Rebuilt from scratch 2026-03-10
# ======================================================
# ⚠️  CRITICAL INFRASTRUCTURE — DO NOT DELETE OR "CLEAN UP"
#
# Built by Lazarus with full knowledge of every failure mode:
#
# PROBLEM 1 (old bug): SIGHUP trap killed the watchdog when
#   Android tab-out closed the terminal. The guard dog died
#   every time it was needed most.
#   FIX: Ignore SIGHUP completely. This process must survive
#   terminal disconnects — that's its entire purpose.
#
# PROBLEM 2 (old bug): Only killed parent extension host PIDs.
#   Children (Pylance, JSON server, etc.) got reparented to
#   PID 1 and held ports open forever.
#   FIX: Use pkill -P for recursive child kill. No pstree dependency.
#
# PROBLEM 3 (old bug): File watchers treated as ghosts. VS Code
#   spawns ~7 legitimately and respawns them when killed.
#   FIX: Leave file watchers alone entirely.
#
# PROBLEM 4 (old bug): PID lock got stale when process died
#   mid-sleep, blocking the next instance.
#   FIX: Validate PID lock against actual running process name,
#   not just kill -0 (which can match recycled PIDs).
#
# TWO JOBS:
#   1. Keep-alive: Prevent codespace idle timeout (pulse every 2 min)
#   2. Ghost hunter: Kill duplicate extension hosts + orphan
#      language servers (check every 30 sec)
#
# STARTUP:
#   postAttachCommand in devcontainer.json runs this on every reconnect.
#   Single-instance enforced via PID lock.
# ======================================================

set -uo pipefail

# ---- SIGHUP IMMUNITY ----
# This is the critical fix. When Android kills the WebSocket,
# the terminal sends SIGHUP to all its children. The old watchdog
# caught SIGHUP in its trap and shut itself down. Never again.
trap '' SIGHUP

# ---- Config ----
ROOT="/workspaces/Molly-Core"
PIDFILE="$ROOT/.watchdog.pid"
HEARTBEAT="$ROOT/.codespace-heartbeat"
LOG="$ROOT/.watchdog.log"
BRIDGE_PIDFILE="$ROOT/.bridge-daemon.pid"
IMMORTAL_PIDFILE="$ROOT/.immortal.pid"

# ---- Logging (auto-rotates at 200 lines) ----
log() {
  local TS
  TS=$(date +"%H:%M:%S")
  local CLEAN
  CLEAN=$(echo -e "$1" | sed 's/\x1b\[[0-9;]*m//g')
  echo "$TS $CLEAN" >> "$LOG" 2>/dev/null
  # Rotate
  if [[ -f "$LOG" ]] && (( $(wc -l < "$LOG") > 200 )); then
    tail -100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
  fi
}

# ---- PID Lock ----
# Validates that the PID file points to an actual watchdog.sh process,
# not a recycled PID running something else.
acquire_lock() {
  if [[ -f "$PIDFILE" ]]; then
    local OLD_PID
    OLD_PID=$(cat "$PIDFILE" 2>/dev/null)
    if [[ -n "$OLD_PID" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
      # PID exists — but is it actually a watchdog?
      local CMDLINE
      CMDLINE=$(cat "/proc/$OLD_PID/cmdline" 2>/dev/null | tr '\0' ' ')
      if echo "$CMDLINE" | grep -q "watchdog.sh"; then
        echo "[watchdog] Already running (PID $OLD_PID). Exiting."
        exit 0
      fi
      # PID recycled — stale lock
    fi
    rm -f "$PIDFILE"
  fi
  echo $$ > "$PIDFILE"
}

# ---- Job 1: Keep-Alive Pulse ----
# Generates the activity types GitHub checks for idle detection.
pulse() {
  cd "$ROOT" || return
  date +"%Y-%m-%dT%H:%M:%S" > "$HEARTBEAT"
  git status --short > /dev/null 2>&1
  git rev-parse HEAD > /dev/null 2>&1
  ls "$ROOT/src" > /dev/null 2>&1
  touch "$ROOT/.watchdog-pulse" 2>/dev/null
  # Ping dev server if it's up
  if ss -tlnp 2>/dev/null | grep -q ":9002"; then
    curl -s -o /dev/null --max-time 2 "http://localhost:9002" 2>/dev/null || true
  fi
}

# ---- Job 2: Ghost Hunter ----
# Kills duplicate extension hosts and their orphaned children.
# This is the entire reason the watchdog was rebuilt.
hunt_ghosts() {
  # Count extension hosts
  local EH_PIDS
  EH_PIDS=$(ps -eo pid,etimes,args | grep "type=extensionHost" | grep -v grep | sort -k2 -n | awk '{print $1}') || true
  local EH_COUNT=0
  if [[ -n "$EH_PIDS" ]]; then
    EH_COUNT=$(echo "$EH_PIDS" | wc -l)
  fi

  if (( EH_COUNT > 1 )); then
    # Keep the newest (smallest etimes = most recently started)
    local NEWEST
    NEWEST=$(echo "$EH_PIDS" | head -1)
    
    for PID in $EH_PIDS; do
      if [[ "$PID" != "$NEWEST" ]]; then
        # Kill all children first (recursive via pkill -P), then parent
        pkill -TERM -P "$PID" 2>/dev/null || true
        sleep 0.5
        # Any grandchildren that survived
        pkill -KILL -P "$PID" 2>/dev/null || true
        kill -TERM "$PID" 2>/dev/null || true
        sleep 0.5
        kill -KILL "$PID" 2>/dev/null || true
        log "[GHOST] Killed extension host PID $PID (kept $NEWEST)"
      fi
    done
  fi

  # Find orphaned language servers not parented to the active extension host
  local ACTIVE_HOST
  ACTIVE_HOST=$(ps -eo pid,etimes,args | grep "type=extensionHost" | grep -v grep | sort -k2 -n | awk '{print $1}' | head -1)
  
  if [[ -n "$ACTIVE_HOST" ]]; then
    local SERVER_PATTERN="pylance|tsserver|jsonServerMain|serverWorkerMain"
    while IFS= read -r LINE; do
      [[ -z "$LINE" ]] && continue
      local SPID SPPID
      SPID=$(echo "$LINE" | awk '{print $1}')
      SPPID=$(echo "$LINE" | awk '{print $2}')
      # If parent is not the active extension host and not the VS Code server
      if [[ "$SPPID" != "$ACTIVE_HOST" ]]; then
        # Verify it's truly orphaned — check if active host is an ancestor
        local IS_DESCENDANT=false
        local WALK="$SPPID"
        local STEPS=0
        while [[ "$WALK" != "1" ]] && [[ "$WALK" != "0" ]] && (( STEPS < 10 )); do
          if [[ "$WALK" == "$ACTIVE_HOST" ]]; then
            IS_DESCENDANT=true
            break
          fi
          WALK=$(ps -o ppid= -p "$WALK" 2>/dev/null | tr -d ' ')
          [[ -z "$WALK" ]] && break
          STEPS=$((STEPS + 1))
        done
        
        if [[ "$IS_DESCENDANT" == false ]]; then
          kill "$SPID" 2>/dev/null || true
          log "[GHOST] Killed orphan server PID $SPID (parent=$SPPID, not under host $ACTIVE_HOST)"
        fi
      fi
    done < <(ps -eo pid,ppid,args | grep -E "$SERVER_PATTERN" | grep -v grep | awk '{print $1, $2}')
  fi

  # Memory pressure — emergency cleanup if below 1500MB available
  local AVAIL
  AVAIL=$(free -m 2>/dev/null | awk '/^Mem:/{print $7}')
  if (( AVAIL < 1500 )); then
    log "[CRITICAL] RAM: ${AVAIL}MB available. Running emergency health check."
    bash "$ROOT/scripts/codespace-health.sh" > /dev/null 2>&1
  fi
}

# ---- Job 3: Bridge Daemon Guardian ----
# Ensures the Family Bridge Daemon is always running on port 9099.
ensure_bridge() {
  # Check if bridge is already running via port
  if ss -tlnp 2>/dev/null | grep -q ":9099"; then
    return
  fi

  # Check if PID file exists and process is alive
  if [[ -f "$BRIDGE_PIDFILE" ]]; then
    local BPID
    BPID=$(cat "$BRIDGE_PIDFILE" 2>/dev/null)
    if [[ -n "$BPID" ]] && kill -0 "$BPID" 2>/dev/null; then
      return
    fi
    rm -f "$BRIDGE_PIDFILE"
  fi

  # Start the bridge daemon
  log "[BRIDGE] Starting Family Bridge Daemon on port 9099"
  nohup node "$ROOT/scripts/bridge-daemon.mjs" > "$ROOT/.bridge-daemon.log" 2>&1 &
  local NEW_PID=$!
  echo "$NEW_PID" > "$BRIDGE_PIDFILE"
  disown "$NEW_PID" 2>/dev/null || true
  log "[BRIDGE] Started (PID $NEW_PID)"
}

# ---- Job 4: Immortal Daemon Guardian ----
# Ensures the Immortal Daemon (heartbeat API on 9100) is always running.
# PROBLEM THIS FIXES: After OOM/crash, .immortal.pid goes stale and blocks restart.
# The immortal daemon has stale-lock detection built in — we just need to launch it.
ensure_immortal() {
  # Check if heartbeat API is already running via port
  if ss -tlnp 2>/dev/null | grep -q ":9100"; then
    return
  fi

  # Clear stale PID lock if present (process dead but file remains)
  if [[ -f "$IMMORTAL_PIDFILE" ]]; then
    local IPID
    IPID=$(cat "$IMMORTAL_PIDFILE" 2>/dev/null)
    if [[ -n "$IPID" ]] && kill -0 "$IPID" 2>/dev/null; then
      # Validate it's actually immortal-daemon, not a recycled PID
      local CMDLINE
      CMDLINE=$(cat "/proc/$IPID/cmdline" 2>/dev/null | tr '\0' ' ')
      if echo "$CMDLINE" | grep -q "immortal-daemon"; then
        return  # Legitimately running
      fi
    fi
    # Stale lock — clear it so immortal-daemon can acquire on launch
    rm -f "$IMMORTAL_PIDFILE"
    log "[IMMORTAL] Cleared stale lock (PID $IPID)"
  fi

  # Start the immortal daemon
  log "[IMMORTAL] Starting Immortal Daemon (heartbeat API on port 9100)"
  nohup node "$ROOT/scripts/immortal-daemon.mjs" > "$ROOT/.immortal.log" 2>&1 &
  local NEW_PID=$!
  disown "$NEW_PID" 2>/dev/null || true
  log "[IMMORTAL] Started (PID $NEW_PID)"
}

# ---- Cleanup on intentional stop (SIGTERM/SIGINT only, NOT SIGHUP) ----
on_exit() {
  log "[WATCHDOG] Stopped (PID $$)"
  # Only delete the PID file if it's ours — don't clobber a replacement instance
  if [[ -f "$PIDFILE" ]] && [[ "$(cat "$PIDFILE" 2>/dev/null)" == "$$" ]]; then
    rm -f "$PIDFILE"
  fi
  exit 0
}
trap on_exit SIGTERM SIGINT

# ---- Main ----
acquire_lock

log "[WATCHDOG] v2 started | PID $$ | SIGHUP immune | Ghost check 30s | Pulse 120s"

# Start bridge and immortal daemons immediately on watchdog boot
ensure_bridge
ensure_immortal

TICK=0

while true; do
  TICK=$((TICK + 1))

  # Ghost hunt every 30 seconds
  hunt_ghosts

  # Bridge + immortal guardian every 2 ticks (1 minute)
  if (( TICK % 2 == 0 )); then
    ensure_bridge
    ensure_immortal
  fi

  # Keep-alive pulse every 4 ticks (2 minutes)
  if (( TICK % 4 == 0 )); then
    pulse

    # Status log every 30 minutes (15 pulses × 2 min)
    if (( TICK % 60 == 0 )); then
      STATUS_AVAIL=$(free -m 2>/dev/null | awk '/^Mem:/{print $7}')
      STATUS_PORTS=$(ss -tlnp 2>/dev/null | grep LISTEN | wc -l)
      STATUS_EH=$(ps aux | grep "type=extensionHost" | grep -v grep | wc -l)
      log "[STATUS] RAM: ${STATUS_AVAIL}MB | Ports: ${STATUS_PORTS} | ExtHosts: ${STATUS_EH} | Uptime: $((TICK * 30))s"
      TICK=0  # Reset to prevent overflow
    fi
  fi

  sleep 30
done
