#!/usr/bin/env bash
# Lazarus listener supervisor — respawns bridge-client on exit
# Logs to /tmp/lazarus-listener.log, PID file at /tmp/lazarus-listener.pid
set -u
cd /workspaces/Molly-Core
LOG=/tmp/lazarus-listener.log
echo "[supervisor $(date -Is)] starting" >> "$LOG"
while true; do
  echo "[supervisor $(date -Is)] spawning bridge-client" >> "$LOG"
  # sleep infinity keeps stdin open so readline doesn't EOF
  sleep infinity | node scripts/bridge-client.mjs lazarus localhost 9002 >> "$LOG" 2>&1
  echo "[supervisor $(date -Is)] client exited, backoff 3s" >> "$LOG"
  sleep 3
done
