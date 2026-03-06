#!/bin/bash
# keep-alive.sh — Prevents Codespace idle timeout + auto-saves session state.
# ⚠️  CRITICAL INFRASTRUCTURE — DO NOT DELETE OR "CLEAN UP"
# Called by: postAttachCommand in devcontainer.json, npm run keep-alive
# Run in background: nohup bash scripts/keep-alive.sh &
# Or start via: npm run keep-alive
#
# GitHub Codespaces shut down after 30min (default) of "inactivity".
# This script creates minimal filesystem activity every 5 minutes so
# the Codespace never sees idle.
#
# ALSO: Every 10 minutes, saves session state and auto-commits/pushes
# the state files to git so they survive codespace destruction.
# On SIGTERM (codespace shutdown), does one final save+commit.

HEARTBEAT_INTERVAL=300   # 5 minutes — idle prevention
SAVE_INTERVAL=600        # 10 minutes — session save + git commit
HEARTBEAT_FILE="/workspaces/Molly-Core/.codespace-heartbeat"
ROOT="/workspaces/Molly-Core"

# Track time since last save
LAST_SAVE=0

save_and_commit() {
  local reason="${1:-periodic}"
  cd "$ROOT" || return

  # Save session state to disk
  node scripts/save-session.mjs --status active --note "Auto-save ($reason)" 2>/dev/null

  # Check if state files have changes worth committing
  if git diff --quiet COPILOT_SESSION_STATE.json COPILOT_SESSION_STATE.md .github/copilot-instructions.md 2>/dev/null; then
    return  # No changes, skip commit
  fi

  # Stage and commit only the session state files
  git add COPILOT_SESSION_STATE.json COPILOT_SESSION_STATE.md .github/copilot-instructions.md 2>/dev/null
  git commit -m "chore: auto-save session state ($reason)" --no-verify 2>/dev/null

  # Push in background so it doesn't block the heartbeat loop
  git push origin HEAD 2>/dev/null &
  echo "[keep-alive] 🧊 Session state saved and committed ($reason)"
}

# Trap SIGTERM/SIGHUP — codespace shutdown or container stop
cleanup() {
  echo "[keep-alive] ⚡ Shutdown signal received — saving session state..."
  save_and_commit "shutdown"
  exit 0
}
trap cleanup SIGTERM SIGHUP SIGINT

echo "[keep-alive] Starting heartbeat (every ${HEARTBEAT_INTERVAL}s, save every ${SAVE_INTERVAL}s)..."

while true; do
  NOW=$(date +%s)
  date +"%Y-%m-%dT%H:%M:%S" > "$HEARTBEAT_FILE"

  # Check if it's time for a session save
  ELAPSED=$(( NOW - LAST_SAVE ))
  if [[ $ELAPSED -ge $SAVE_INTERVAL ]]; then
    save_and_commit "periodic"
    LAST_SAVE=$NOW
  fi

  sleep $HEARTBEAT_INTERVAL
done
