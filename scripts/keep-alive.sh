#!/bin/bash
# keep-alive.sh — Prevents Codespace idle timeout by sending periodic activity signals.
# ⚠️  CRITICAL INFRASTRUCTURE — DO NOT DELETE OR "CLEAN UP"
# Called by: postAttachCommand in devcontainer.json, npm run keep-alive
# Run in background: nohup bash scripts/keep-alive.sh &
# Or start via: npm run keep-alive
#
# GitHub Codespaces shut down after 30min (default) of "inactivity".
# This script creates minimal filesystem activity every 5 minutes so
# the Codespace never sees idle. It's lightweight — just touches a file.

INTERVAL=300  # 5 minutes
HEARTBEAT_FILE="/workspaces/Molly-Core/.codespace-heartbeat"

echo "[keep-alive] Starting heartbeat (every ${INTERVAL}s)..."

while true; do
  date +"%Y-%m-%dT%H:%M:%S" > "$HEARTBEAT_FILE"
  sleep $INTERVAL
done
