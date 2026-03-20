#!/bin/bash
# Reset a misbehaving Codespace by clearing caches and reinstalling deps.
# Safe to run multiple times; skips when directories are already clean.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
TS_CACHE="${HOME}/.cache/typescript"

echo "== Molly Codespace Reset =="
echo "Working dir: $ROOT"

if [ ! -d "$ROOT" ]; then
  echo "Error: expected repo at $ROOT"
  exit 1
fi

cd "$ROOT"

echo "--> Stopping Next.js dev servers (if any)"
PIDS=$(pgrep -f "next dev" || true)
if [ -n "$PIDS" ]; then
  echo "$PIDS" | xargs kill -15 2>/dev/null || true
  sleep 1
  # Force kill any survivors
  PID_LIST=$(echo "$PIDS" | tr '\n' ' ' | xargs)
  SURVIVORS=$(ps -p "$PID_LIST" -o pid= 2>/dev/null | tr -s ' ' | tr '\n' ' ')
  if [ -n "$SURVIVORS" ]; then
    echo "Force-killing remaining Next.js PIDs: $SURVIVORS"
    echo "$SURVIVORS" | xargs kill -9 2>/dev/null || true
  fi
fi

echo "--> Removing build caches"
rm -rf .next || true
rm -rf node_modules/.cache || true

echo "--> Clearing TypeScript cache"
if [ -d "$TS_CACHE" ]; then
  rm -rf "${TS_CACHE}" || true
fi

echo "--> Reinstalling dependencies (npm ci)"
npm ci

echo "--> Done. You can now run: npm run dev"
